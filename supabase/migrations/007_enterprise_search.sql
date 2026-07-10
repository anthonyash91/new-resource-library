-- Enterprise search hardening: full-text search, bounded RPC params, tier totals in RPC.

ALTER TABLE resources
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
    setweight(
      to_tsvector('english', coalesce(city, '') || ' ' || coalesce(county, '')),
      'C'
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_resources_search_vector
  ON resources USING GIN (search_vector)
  WHERE status = 'active';

CREATE OR REPLACE FUNCTION public.escape_like_pattern(p_input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT replace(replace(replace(coalesce(p_input, ''), '\', '\\'), '%', '\%'), '_', '\_');
$$;

CREATE OR REPLACE FUNCTION public.search_resources(
  p_q text DEFAULT NULL,
  p_state text DEFAULT NULL,
  p_county text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_category_slug text DEFAULT NULL,
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
      GREATEST(LEAST(GREATEST(COALESCE(p_page, 1), 1), 500), 1) AS v_page,
      LEAST(GREATEST(COALESCE(p_page_size, 24), 1), 100) AS v_page_size,
      CASE WHEN p_sort = 'newest' THEN 'newest' ELSE 'name' END AS v_sort
  ),
  filtered AS (
    SELECT r.*
    FROM resources r
    LEFT JOIN categories c ON c.id = r.category_id AND c.is_active = true
    CROSS JOIN params p
    WHERE r.status = 'active'
      AND (p.v_state IS NULL OR r.state = p.v_state)
      AND (
        p.v_city IS NULL
        OR r.city ILIKE public.escape_like_pattern(p.v_city) ESCAPE '\'
      )
      AND (p.v_category_slug IS NULL OR c.slug = p.v_category_slug)
      AND (
        p.v_q IS NULL
        OR r.search_vector @@ plainto_tsquery('english', p.v_q)
      )
      AND (
        p.v_county IS NULL
        OR public.resource_is_statewide(r.coverage::text, r.tags)
        OR p.v_county = ANY(r.served_counties)
        OR (
          (r.served_counties IS NULL OR cardinality(r.served_counties) = 0)
          AND r.county = p.v_county
        )
      )
  ),
  tier_totals AS (
    SELECT
      COUNT(*) FILTER (
        WHERE NOT public.resource_is_statewide(f.coverage::text, f.tags)
          AND trim(f.county) = p.v_county
      )::int AS local,
      COUNT(*) FILTER (
        WHERE NOT public.resource_is_statewide(f.coverage::text, f.tags)
          AND trim(f.county) <> p.v_county
      )::int AS regional,
      COUNT(*) FILTER (
        WHERE public.resource_is_statewide(f.coverage::text, f.tags)
      )::int AS statewide
    FROM filtered f
    CROSS JOIN params p
    WHERE p.v_county IS NOT NULL
  ),
  paged AS (
    SELECT f.*
    FROM filtered f
    CROSS JOIN params p
    ORDER BY
      CASE
        WHEN p.v_county IS NULL THEN 0
        WHEN public.resource_is_statewide(f.coverage::text, f.tags) THEN 2
        WHEN trim(f.county) = p.v_county THEN 0
        ELSE 1
      END,
      CASE WHEN p.v_sort = 'newest' THEN f.created_at END DESC NULLS LAST,
      f.name ASC
    LIMIT (SELECT v_page_size FROM params)
    OFFSET (SELECT (v_page - 1) * v_page_size FROM params)
  )
  SELECT jsonb_build_object(
    'total', (SELECT COUNT(*)::bigint FROM filtered),
    'page', (SELECT v_page FROM params),
    'page_size', (SELECT v_page_size FROM params),
    'tier_totals',
      CASE
        WHEN (SELECT v_county FROM params) IS NULL THEN NULL
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
          WHEN (SELECT v_county FROM params) IS NULL THEN 0
          WHEN public.resource_is_statewide(p.coverage::text, p.tags) THEN 2
          WHEN trim(p.county) = (SELECT v_county FROM params) THEN 0
          ELSE 1
        END,
        CASE WHEN (SELECT v_sort FROM params) = 'newest' THEN p.created_at END DESC NULLS LAST,
        p.name ASC
      ) FROM paged p),
      '[]'::jsonb
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.escape_like_pattern TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_resources TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMENT ON FUNCTION public.search_resources IS
  'Enterprise public resource search: bounded params, FTS keyword match, true offset pagination, county tier totals.';
