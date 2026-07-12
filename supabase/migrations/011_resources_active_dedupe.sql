-- Prevent duplicate active resources (same name + state + city + address + phone).
-- Run scripts/dedupe-resources.ts --apply before this if the index create fails on existing dupes.

CREATE OR REPLACE FUNCTION public.resource_dedupe_key(
  p_name text,
  p_state text,
  p_city text,
  p_address text,
  p_phone text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT
    lower(trim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')))
    || E'\x1f'
    || lower(trim(regexp_replace(coalesce(p_state, ''), '\s+', ' ', 'g')))
    || E'\x1f'
    || lower(trim(regexp_replace(coalesce(p_city, ''), '\s+', ' ', 'g')))
    || E'\x1f'
    || lower(trim(regexp_replace(coalesce(p_address, ''), '\s+', ' ', 'g')))
    || E'\x1f'
    || regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_resources_active_dedupe
  ON public.resources (public.resource_dedupe_key(name, state, city, address, phone))
  WHERE status = 'active';

GRANT EXECUTE ON FUNCTION public.resource_dedupe_key(text, text, text, text, text)
  TO anon, authenticated;

COMMENT ON FUNCTION public.resource_dedupe_key(text, text, text, text, text) IS
  'Normalized fingerprint for active resource uniqueness (name|state|city|address|phone digits).';

COMMENT ON INDEX public.idx_resources_active_dedupe IS
  'One active resource per name + location + phone fingerprint.';
