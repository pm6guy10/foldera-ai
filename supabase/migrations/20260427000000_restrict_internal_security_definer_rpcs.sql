-- Supabase linter 0028 / 0029:
-- Internal SECURITY DEFINER RPCs must not be callable by anon/authenticated roles.
-- Foldera server code uses the service-role client for these paths.

DO $body$
BEGIN
  IF to_regprocedure('public.get_auth_user_id_by_email(text)') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.get_auth_user_id_by_email(text) FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_auth_user_id_by_email(text) TO service_role';
  END IF;

  IF to_regprocedure('public.replace_onboarding_goals(uuid,jsonb)') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.replace_onboarding_goals(uuid, jsonb) FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.replace_onboarding_goals(uuid, jsonb) TO service_role';
  END IF;

  IF to_regprocedure('public.replace_current_priorities(uuid,jsonb)') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.replace_current_priorities(uuid, jsonb) FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.replace_current_priorities(uuid, jsonb) TO service_role';
  END IF;

  IF to_regprocedure('public.apply_commitment_ceiling(integer)') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.apply_commitment_ceiling(integer) FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.apply_commitment_ceiling(integer) TO service_role';
  END IF;

  IF to_regprocedure('public.api_budget_check_and_reserve(integer)') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.api_budget_check_and_reserve(integer) FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.api_budget_check_and_reserve(integer) TO service_role';
  END IF;

  IF to_regprocedure('public.api_budget_record_actual(integer)') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.api_budget_record_actual(integer) FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.api_budget_record_actual(integer) TO service_role';
  END IF;
END;
$body$;
