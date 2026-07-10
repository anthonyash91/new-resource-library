-- County-aware search RPC + supporting indexes
-- Run after 001_mvp_schema.sql

-- Composite indexes for common filter paths
CREATE INDEX IF NOT EXISTS idx_resources_status_state
  ON resources(status, state)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_resources_status_state_county
  ON resources(status, state, county)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_resources_status_state_city
  ON resources(status, state, city)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_resources_served_counties
  ON resources USING GIN(served_counties);

-- Paginated search with county / served_counties / statewide logic in SQL
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
  WITH filtered AS (
    SELECT r.*
    FROM resources r
    LEFT JOIN categories c ON c.id = r.category_id AND c.is_active = true
    WHERE r.status = 'active'
      AND (NULLIF(trim(p_state), '') IS NULL OR r.state = trim(p_state))
      AND (NULLIF(trim(p_city), '') IS NULL OR r.city ILIKE trim(p_city))
      AND (
        NULLIF(trim(p_category_slug), '') IS NULL
        OR c.slug = trim(p_category_slug)
      )
      AND (
        NULLIF(trim(p_q), '') IS NULL
        OR r.name ILIKE '%' || trim(p_q) || '%'
        OR r.description ILIKE '%' || trim(p_q) || '%'
        OR r.city ILIKE '%' || trim(p_q) || '%'
        OR r.county ILIKE '%' || trim(p_q) || '%'
      )
      AND (
        NULLIF(trim(p_county), '') IS NULL
        OR r.coverage = 'statewide'
        OR trim(p_county) = ANY(r.served_counties)
        OR (
          (r.served_counties IS NULL OR cardinality(r.served_counties) = 0)
          AND r.county = trim(p_county)
        )
      )
  ),
  paged AS (
    SELECT f.*
    FROM filtered f
    ORDER BY
      CASE
        WHEN NULLIF(trim(p_county), '') IS NULL THEN 0
        WHEN lower(trim(COALESCE(f.coverage, ''))) = 'statewide' THEN 2
        WHEN trim(f.county) = trim(p_county) THEN 0
        ELSE 1
      END,
      CASE WHEN p_sort = 'newest' THEN f.created_at END DESC NULLS LAST,
      f.name ASC
    LIMIT GREATEST(p_page_size, 1)
    OFFSET GREATEST(p_page - 1, 0) * GREATEST(p_page_size, 1)
  )
  SELECT jsonb_build_object(
    'total', (SELECT COUNT(*)::bigint FROM filtered),
    'page', GREATEST(p_page, 1),
    'page_size', GREATEST(p_page_size, 1),
    'resources', COALESCE(
      (SELECT jsonb_agg(to_jsonb(p) ORDER BY
        CASE
          WHEN NULLIF(trim(p_county), '') IS NULL THEN 0
          WHEN lower(trim(COALESCE(p.coverage, ''))) = 'statewide' THEN 2
          WHEN trim(p.county) = trim(p_county) THEN 0
          ELSE 1
        END,
        CASE WHEN p_sort = 'newest' THEN p.created_at END DESC NULLS LAST,
        p.name ASC
      ) FROM paged p),
      '[]'::jsonb
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.search_resources TO anon, authenticated;

-- Refresh PostgREST schema cache so the RPC is callable immediately
NOTIFY pgrst, 'reload schema';

COMMENT ON FUNCTION public.search_resources IS
  'Paginated public resource search. County searches sort local → regional → statewide before pagination.';
