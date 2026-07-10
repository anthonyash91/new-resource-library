-- Retired: overload cleanup is built into 008_zip_code_search.sql (DROP before CREATE).
-- Do NOT drop search_resources here — that breaks fresh installs.
--
-- Manual recovery only (PostgREST error "function name search_resources is not unique"):
--   1. DROP FUNCTION IF EXISTS public.search_resources(text,text,text,text,text,text,integer,integer);
--   2. DROP FUNCTION IF EXISTS public.search_resources(text,text,text,text,text,text,text,integer,integer);
--   3. NOTIFY pgrst, 'reload schema';
--   4. Re-run 008 from CREATE OR REPLACE FUNCTION public.search_resources

SELECT 1;
