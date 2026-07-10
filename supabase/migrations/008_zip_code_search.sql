-- ZIP code search: lookup table, resource zip_code column, and search integration.

CREATE TABLE IF NOT EXISTS public.zip_codes (
  zip_code CHAR(5) PRIMARY KEY,
  state TEXT NOT NULL,
  county TEXT,
  city TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_zip_codes_state_county
  ON public.zip_codes (state, county);

ALTER TABLE public.resources
  ADD COLUMN IF NOT EXISTS zip_code CHAR(5);

CREATE INDEX IF NOT EXISTS idx_resources_zip_code
  ON public.resources (zip_code)
  WHERE status = 'active' AND zip_code IS NOT NULL;

CREATE OR REPLACE FUNCTION public.normalize_us_zip_code(p_input text)
RETURNS char(5)
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN regexp_replace(coalesce(p_input, ''), '[^0-9]', '', 'g') ~ '^\d{5}'
    THEN substring(regexp_replace(coalesce(p_input, ''), '[^0-9]', '', 'g') from 1 for 5)::char(5)
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.normalize_county_name(p_county text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT NULLIF(
    trim(regexp_replace(coalesce(p_county, ''), '\s+County$', '', 'i')),
    ''
  );
$$;

-- Backfill office ZIP codes from address text where present.
UPDATE public.resources
SET zip_code = public.normalize_us_zip_code(
  substring(address from '(\d{5})(?:-\d{4})?\s*$')
)
WHERE zip_code IS NULL
  AND address IS NOT NULL
  AND address ~ '\d{5}(?:-\d{4})?\s*$';

ALTER TABLE public.resources DROP COLUMN IF EXISTS search_vector;

ALTER TABLE public.resources
  ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
    setweight(
      to_tsvector(
        'english',
        coalesce(city, '') || ' ' || coalesce(county, '') || ' ' || coalesce(zip_code, '')
      ),
      'C'
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_resources_search_vector
  ON public.resources USING GIN (search_vector)
  WHERE status = 'active';

CREATE OR REPLACE FUNCTION public.resource_matches_zip_search(
  p_resource_zip char(5),
  p_resource_state text,
  p_resource_city text,
  p_resource_county text,
  p_resource_coverage text,
  p_resource_tags text[],
  p_resource_served_counties text[],
  p_zip char(5),
  p_zip_state text,
  p_zip_county text,
  p_zip_city text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    p_zip IS NOT NULL
    AND p_zip_state IS NOT NULL
    AND trim(coalesce(p_resource_state, '')) = trim(p_zip_state)
    AND (
      p_resource_zip IS NOT NULL AND p_resource_zip = p_zip
      OR (
        p_zip_county IS NOT NULL
        AND public.resource_serves_county(
          p_resource_coverage,
          p_resource_tags,
          p_resource_county,
          p_resource_served_counties,
          p_zip_county
        )
      )
      OR (
        p_zip_county IS NULL
        AND p_zip_city IS NOT NULL
        AND lower(trim(coalesce(p_resource_city, ''))) = lower(trim(p_zip_city))
      )
      OR public.resource_is_statewide(p_resource_coverage, p_resource_tags)
    );
$$;

-- Drop every prior search_resources overload (007 = 8 args, 008 = 9 args with p_zip).
DROP FUNCTION IF EXISTS public.search_resources(
  text, text, text, text, text, text, integer, integer
);
DROP FUNCTION IF EXISTS public.search_resources(
  text, text, text, text, text, text, text, integer, integer
);

CREATE OR REPLACE FUNCTION public.search_resources(
  p_q text DEFAULT NULL,
  p_state text DEFAULT NULL,
  p_county text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_category_slug text DEFAULT NULL,
  p_zip text DEFAULT NULL,
  p_sort text DEFAULT 'name',
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 24
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH params AS (
    SELECT
      NULLIF(LEFT(trim(COALESCE(p_q, '')), 200), '') AS v_q,
      NULLIF(LEFT(trim(COALESCE(p_state, '')), 64), '') AS v_state,
      NULLIF(LEFT(trim(COALESCE(p_county, '')), 128), '') AS v_county,
      NULLIF(LEFT(trim(COALESCE(p_city, '')), 128), '') AS v_city,
      NULLIF(LEFT(trim(COALESCE(p_category_slug, '')), 64), '') AS v_category_slug,
      public.normalize_us_zip_code(p_zip) AS v_zip,
      GREATEST(LEAST(GREATEST(COALESCE(p_page, 1), 1), 500), 1) AS v_page,
      LEAST(GREATEST(COALESCE(p_page_size, 24), 1), 100) AS v_page_size,
      CASE WHEN p_sort = 'newest' THEN 'newest' ELSE 'name' END AS v_sort
  ),
  zip_ctx AS (
    SELECT
      z.zip_code,
      z.state,
      public.normalize_county_name(z.county) AS county,
      z.city
    FROM public.zip_codes z
    CROSS JOIN params p
    WHERE p.v_zip IS NOT NULL
      AND z.zip_code = p.v_zip
  ),
  effective AS (
    SELECT
      p.v_q,
      p.v_category_slug,
      p.v_zip,
      p.v_page,
      p.v_page_size,
      p.v_sort,
      COALESCE(p.v_state, z.state) AS eff_state,
      COALESCE(public.normalize_county_name(p.v_county), z.county) AS eff_county,
      COALESCE(p.v_city, z.city) AS eff_city,
      (z.zip_code IS NOT NULL) AS zip_resolved
    FROM params p
    LEFT JOIN zip_ctx z ON true
  ),
  filtered AS (
    SELECT r.*
    FROM resources r
    LEFT JOIN categories c ON c.id = r.category_id AND c.is_active = true
    CROSS JOIN effective e
    WHERE r.status = 'active'
      AND (e.v_zip IS NULL OR e.zip_resolved)
      AND (e.eff_state IS NULL OR r.state = e.eff_state)
      AND (
        e.v_category_slug IS NULL
        OR c.slug = e.v_category_slug
      )
      AND (
        e.v_q IS NULL
        OR r.search_vector @@ plainto_tsquery('english', e.v_q)
      )
      AND (
        e.v_zip IS NULL
        OR public.resource_matches_zip_search(
          r.zip_code,
          r.state,
          r.city,
          r.county,
          r.coverage::text,
          r.tags,
          r.served_counties,
          e.v_zip,
          e.eff_state,
          e.eff_county,
          e.eff_city
        )
      )
      AND (
        e.v_zip IS NOT NULL
        OR e.eff_city IS NULL
        OR r.city ILIKE public.escape_like_pattern(e.eff_city) ESCAPE '\'
      )
      AND (
        e.v_zip IS NOT NULL
        OR e.eff_county IS NULL
        OR public.resource_serves_county(
          r.coverage::text,
          r.tags,
          r.county,
          r.served_counties,
          e.eff_county
        )
      )
  ),
  tier_totals AS (
    SELECT
      COUNT(*) FILTER (
        WHERE NOT public.resource_is_statewide(f.coverage::text, f.tags)
          AND public.normalize_county_name(f.county) = e.eff_county
      )::int AS local,
      COUNT(*) FILTER (
        WHERE NOT public.resource_is_statewide(f.coverage::text, f.tags)
          AND public.normalize_county_name(f.county) <> e.eff_county
      )::int AS regional,
      COUNT(*) FILTER (
        WHERE public.resource_is_statewide(f.coverage::text, f.tags)
      )::int AS statewide
    FROM filtered f
    CROSS JOIN effective e
    WHERE e.eff_county IS NOT NULL
  ),
  paged AS (
    SELECT f.*
    FROM filtered f
    CROSS JOIN effective e
    ORDER BY
      CASE
        WHEN e.eff_county IS NULL THEN 0
        WHEN public.resource_is_statewide(f.coverage::text, f.tags) THEN 2
        WHEN public.normalize_county_name(f.county) = e.eff_county THEN 0
        ELSE 1
      END,
      CASE WHEN e.v_sort = 'newest' THEN f.created_at END DESC NULLS LAST,
      f.name ASC
    LIMIT (SELECT v_page_size FROM effective)
    OFFSET (SELECT (v_page - 1) * v_page_size FROM effective)
  )
  SELECT jsonb_build_object(
    'total', (SELECT COUNT(*)::bigint FROM filtered),
    'page', (SELECT v_page FROM effective),
    'page_size', (SELECT v_page_size FROM effective),
    'zip_not_found',
      CASE
        WHEN (SELECT v_zip FROM effective) IS NULL THEN false
        ELSE NOT (SELECT zip_resolved FROM effective)
      END,
    'resolved_location',
      CASE
        WHEN (SELECT v_zip FROM effective) IS NULL THEN NULL
        WHEN NOT (SELECT zip_resolved FROM effective) THEN NULL
        ELSE (
          SELECT jsonb_build_object(
            'zip', e.v_zip,
            'state', e.eff_state,
            'county', e.eff_county,
            'city', e.eff_city
          )
          FROM effective e
        )
      END,
    'tier_totals',
      CASE
        WHEN (SELECT eff_county FROM effective) IS NULL THEN NULL
        ELSE (
          SELECT jsonb_build_object(
            'local', COALESCE(tt.local, 0),
            'regional', COALESCE(tt.regional, 0),
            'statewide', COALESCE(tt.statewide, 0)
          )
          FROM tier_totals tt
        )
      END,
    'resources', COALESCE(
      (SELECT jsonb_agg(to_jsonb(p) ORDER BY
        CASE
          WHEN (SELECT eff_county FROM effective) IS NULL THEN 0
          WHEN public.resource_is_statewide(p.coverage::text, p.tags) THEN 2
          WHEN public.normalize_county_name(p.county) = (SELECT eff_county FROM effective) THEN 0
          ELSE 1
        END,
        CASE WHEN (SELECT v_sort FROM effective) = 'newest' THEN p.created_at END DESC NULLS LAST,
        p.name ASC
      ) FROM paged p),
      '[]'::jsonb
    )
  );
$$;

ALTER TABLE public.zip_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read zip codes" ON public.zip_codes;

CREATE POLICY "Public read zip codes"
  ON public.zip_codes FOR SELECT
  USING (true);

GRANT SELECT ON public.zip_codes TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_us_zip_code TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_county_name TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resource_matches_zip_search TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_resources(
  text, text, text, text, text, text, text, integer, integer
) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMENT ON TABLE public.zip_codes IS
  'US ZIP lookup for resolving zip searches to state/county/city. Seed via npm run seed:zip-codes.';

COMMENT ON FUNCTION public.search_resources(
  text, text, text, text, text, text, text, integer, integer
) IS
  'Enterprise public resource search with ZIP resolution, FTS, bounded params, and true offset pagination.';
