-- Supabase linter: function_search_path_mutable (lint 0011).
-- Pin search_path so function bodies cannot be tricked via session search_path.
-- api_budget* objects may exist only in production; skip cleanly on fresh local DBs.
DO $body$
BEGIN
  IF to_regprocedure('public.api_budget_check_and_reserve(integer)') IS NOT NULL THEN
    ALTER FUNCTION public.api_budget_check_and_reserve(integer) SET search_path = public;
  END IF;
  IF to_regprocedure('public.api_budget_record_actual(integer)') IS NOT NULL THEN
    ALTER FUNCTION public.api_budget_record_actual(integer) SET search_path = public;
  END IF;
END;
$body$;
