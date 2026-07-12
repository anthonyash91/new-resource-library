-- Whitelist public resource fields in search_resources (exclude search_vector / internals).
-- Safe to re-run: CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION public.resource_to_public_jsonb(r public.resources)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', r.id,
    'name', r.name,
    'description', r.description,
    'description_es', r.description_es,
    'category_id', r.category_id,
    'state', r.state,
    'county', r.county,
    'city', r.city,
    'address', r.address,
    'zip_code', r.zip_code,
    'phone', r.phone,
    'email', r.email,
    'website', r.website,
    'hours', r.hours,
    'eligibility', r.eligibility,
    'eligibility_es', r.eligibility_es,
    'notes', r.notes,
    'notes_es', r.notes_es,
    'served_counties', r.served_counties,
    'coverage', r.coverage,
    'services', r.services,
    'tags', r.tags,
    'status', r.status,
    'created_at', r.created_at,
    'updated_at', r.updated_at
  );
$$;

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
      (
        SELECT jsonb_agg(
          public.resource_to_public_jsonb(p)
          ORDER BY
            CASE
              WHEN (SELECT eff_county FROM effective) IS NULL THEN 0
              WHEN public.resource_is_statewide(p.coverage::text, p.tags) THEN 2
              WHEN public.normalize_county_name(p.county) = (SELECT eff_county FROM effective) THEN 0
              ELSE 1
            END,
            CASE WHEN (SELECT v_sort FROM effective) = 'newest' THEN p.created_at END DESC NULLS LAST,
            p.name ASC
        )
        FROM paged p
      ),
      '[]'::jsonb
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.resource_to_public_jsonb(public.resources) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_resources(
  text, text, text, text, text, text, text, integer, integer
) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMENT ON FUNCTION public.resource_to_public_jsonb(public.resources) IS
  'Public search payload fields only — excludes search_vector and other internals.';

COMMENT ON FUNCTION public.search_resources(
  text, text, text, text, text, text, text, integer, integer
) IS
  'Enterprise public resource search with ZIP resolution, FTS, bounded params, allowlisted JSON, and true offset pagination.';
