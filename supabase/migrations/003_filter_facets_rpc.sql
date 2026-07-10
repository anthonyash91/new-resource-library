-- Cascading filter facets RPC (replaces loading full state into Node.js)
-- Compatible with Resource Library schema (coverage TEXT) and MVP enum schema.

CREATE OR REPLACE FUNCTION public.resource_is_statewide(
  p_coverage text,
  p_tags text[]
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    lower(trim(COALESCE(p_coverage, ''))) = 'statewide'
    OR (
      NULLIF(trim(COALESCE(p_coverage, '')), '') IS NULL
      AND EXISTS (
        SELECT 1
        FROM unnest(COALESCE(p_tags, '{}'::text[])) AS t(tag)
        WHERE lower(trim(t.tag)) = 'statewide'
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.resource_serves_county(
  p_coverage text,
  p_tags text[],
  p_primary_county text,
  p_served_counties text[],
  p_filter_county text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    NULLIF(trim(p_filter_county), '') IS NULL
    OR public.resource_is_statewide(p_coverage, p_tags)
    OR trim(p_filter_county) = ANY(COALESCE(p_served_counties, '{}'::text[]))
    OR (
      (p_served_counties IS NULL OR cardinality(p_served_counties) = 0)
      AND trim(p_primary_county) = trim(p_filter_county)
    );
$$;

CREATE OR REPLACE FUNCTION public.get_filter_facets(
  p_state text DEFAULT NULL,
  p_county text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_category_slug text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH base AS (
    SELECT
      r.state,
      r.county,
      r.city,
      r.served_counties,
      r.coverage,
      r.tags,
      r.category_id,
      c.slug AS category_slug
    FROM resources r
    LEFT JOIN categories c ON c.id = r.category_id AND c.is_active = true
    WHERE r.status = 'active'
  ),
  for_states AS (
    SELECT b.*
    FROM base b
    WHERE (
        NULLIF(trim(p_county), '') IS NULL
        OR public.resource_serves_county(
          b.coverage, b.tags, b.county, b.served_counties, p_county
        )
      )
      AND (
        NULLIF(trim(p_city), '') IS NULL
        OR lower(trim(b.city)) = lower(trim(p_city))
      )
      AND (
        NULLIF(trim(p_category_slug), '') IS NULL
        OR b.category_slug = trim(p_category_slug)
      )
  ),
  for_counties AS (
    SELECT b.*
    FROM base b
    WHERE (
        NULLIF(trim(p_state), '') IS NULL
        OR b.state = trim(p_state)
      )
      AND (
        NULLIF(trim(p_city), '') IS NULL
        OR lower(trim(b.city)) = lower(trim(p_city))
      )
      AND (
        NULLIF(trim(p_category_slug), '') IS NULL
        OR b.category_slug = trim(p_category_slug)
      )
  ),
  for_cities AS (
    SELECT b.*
    FROM base b
    WHERE (
        NULLIF(trim(p_state), '') IS NULL
        OR b.state = trim(p_state)
      )
      AND (
        NULLIF(trim(p_county), '') IS NULL
        OR public.resource_serves_county(
          b.coverage, b.tags, b.county, b.served_counties, p_county
        )
      )
      AND (
        NULLIF(trim(p_category_slug), '') IS NULL
        OR b.category_slug = trim(p_category_slug)
      )
  ),
  for_categories AS (
    SELECT b.*
    FROM base b
    WHERE (
        NULLIF(trim(p_state), '') IS NULL
        OR b.state = trim(p_state)
      )
      AND (
        NULLIF(trim(p_county), '') IS NULL
        OR public.resource_serves_county(
          b.coverage, b.tags, b.county, b.served_counties, p_county
        )
      )
      AND (
        NULLIF(trim(p_city), '') IS NULL
        OR lower(trim(b.city)) = lower(trim(p_city))
      )
  ),
  state_values AS (
    SELECT DISTINCT trim(b.state) AS state
    FROM for_states b
    WHERE b.state IS NOT NULL AND trim(b.state) <> ''
  ),
  county_names AS (
    SELECT DISTINCT trim(v.val) AS county
    FROM for_counties fc
    CROSS JOIN LATERAL unnest(
      CASE
        WHEN public.resource_is_statewide(fc.coverage, fc.tags) THEN ARRAY[]::text[]
        ELSE array_cat(
          COALESCE(fc.served_counties, ARRAY[]::text[]),
          CASE
            WHEN fc.county IS NOT NULL AND trim(fc.county) <> ''
            THEN ARRAY[trim(fc.county)]
            ELSE ARRAY[]::text[]
          END
        )
      END
    ) AS v(val)
    WHERE trim(v.val) <> ''
  ),
  city_values AS (
    SELECT
      CASE
        WHEN NULLIF(trim(p_county), '') IS NULL THEN (
          SELECT COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'city', x.city,
                'locatedInCounty', NULL,
                'isLocal', true
              )
              ORDER BY x.city
            ),
            '[]'::jsonb
          )
          FROM (
            SELECT DISTINCT trim(fc.city) AS city
            FROM for_cities fc
            WHERE fc.city IS NOT NULL
              AND trim(fc.city) <> ''
              AND NOT public.resource_is_statewide(fc.coverage, fc.tags)
          ) x
        )
        ELSE (
          SELECT COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'city', d.city,
                'locatedInCounty', d.located_in_county,
                'isLocal', d.is_local
              )
              ORDER BY d.is_local DESC, d.city
            ),
            '[]'::jsonb
          )
          FROM (
            SELECT DISTINCT ON (trim(fc.city))
              trim(fc.city) AS city,
              NULLIF(trim(fc.county), '') AS located_in_county,
              (trim(fc.county) = trim(p_county)) AS is_local
            FROM for_cities fc
            WHERE fc.city IS NOT NULL
              AND trim(fc.city) <> ''
              AND NOT public.resource_is_statewide(fc.coverage, fc.tags)
              AND public.resource_serves_county(
                fc.coverage, fc.tags, fc.county, fc.served_counties, p_county
              )
            ORDER BY trim(fc.city), (trim(fc.county) = trim(p_county)) DESC
          ) d
        )
      END AS cities
  ),
  category_tier_counts AS (
    SELECT
      fc.category_id,
      COUNT(*) FILTER (
        WHERE public.resource_is_statewide(fc.coverage, fc.tags)
      )::int AS statewide,
      COUNT(*) FILTER (
        WHERE NOT public.resource_is_statewide(fc.coverage, fc.tags)
          AND trim(fc.county) = trim(p_county)
      )::int AS local,
      COUNT(*) FILTER (
        WHERE NOT public.resource_is_statewide(fc.coverage, fc.tags)
          AND trim(fc.county) <> trim(p_county)
      )::int AS regional
    FROM for_categories fc
    WHERE NULLIF(trim(p_state), '') IS NOT NULL
      AND NULLIF(trim(p_county), '') IS NOT NULL
    GROUP BY fc.category_id
  ),
  category_values AS (
    SELECT
      cat.id,
      cat.name,
      cat.slug,
      cat.sort_order,
      CASE
        WHEN NULLIF(trim(p_state), '') IS NOT NULL
          AND NULLIF(trim(p_county), '') IS NOT NULL
        THEN jsonb_build_object(
          'local', COALESCE(ctc.local, 0),
          'regional', COALESCE(ctc.regional, 0),
          'statewide', COALESCE(ctc.statewide, 0)
        )
        ELSE NULL
      END AS counts
    FROM categories cat
    LEFT JOIN category_tier_counts ctc ON ctc.category_id = cat.id
    WHERE cat.is_active
      AND EXISTS (
        SELECT 1 FROM for_categories fc WHERE fc.category_id = cat.id
      )
  )
  SELECT jsonb_build_object(
    'states',
      COALESCE(
        (SELECT jsonb_agg(s.state ORDER BY s.state) FROM state_values s),
        '[]'::jsonb
      ),
    'counties',
      COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object('county', cn.county)
            ORDER BY cn.county
          )
          FROM county_names cn
        ),
        '[]'::jsonb
      ),
    'cities',
      (SELECT cities FROM city_values),
    'categories',
      COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', cv.id,
              'name', cv.name,
              'slug', cv.slug,
              'sort_order', cv.sort_order,
              'counts', cv.counts
            )
            ORDER BY cv.sort_order, cv.name
          )
          FROM category_values cv
        ),
        '[]'::jsonb
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.resource_is_statewide TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resource_serves_county TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_filter_facets TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMENT ON FUNCTION public.get_filter_facets IS
  'Cascading filter facet options. Each dimension excludes its own filter when computing available values. State list always includes all states.';
