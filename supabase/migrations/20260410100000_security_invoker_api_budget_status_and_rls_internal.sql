-- Supabase linter:
--   security_definer_view (0010): api_budget_status must not be SECURITY DEFINER — use security_invoker.
--   rls_disabled_in_public (0013): enable RLS on internal tables (service_role has BYPASSRLS; anon/auth blocked).

-- ── system_health ────────────────────────────────────────────────────────────
ALTER TABLE public.system_health ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deny_all_public_system_health ON public.system_health;
CREATE POLICY deny_all_public_system_health ON public.system_health
  AS RESTRICTIVE FOR ALL TO public USING (false);

-- ── directive ML tables (prod may have missed RLS from earlier migration) ───
ALTER TABLE public.tkg_directive_ml_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deny_all_public_ml_snapshots ON public.tkg_directive_ml_snapshots;
CREATE POLICY deny_all_public_ml_snapshots ON public.tkg_directive_ml_snapshots
  AS RESTRICTIVE FOR ALL TO public USING (false);

ALTER TABLE public.tkg_directive_ml_global_priors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deny_all_public_ml_global_priors ON public.tkg_directive_ml_global_priors;
CREATE POLICY deny_all_public_ml_global_priors ON public.tkg_directive_ml_global_priors
  AS RESTRICTIVE FOR ALL TO public USING (false);

-- ── api_budget + view (objects created by hosted migration create_api_budget_enforcement) ──
DO $body$
BEGIN
  IF to_regclass('public.api_budget') IS NOT NULL THEN
    ALTER TABLE public.api_budget ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS deny_all_public_api_budget ON public.api_budget;
    CREATE POLICY deny_all_public_api_budget ON public.api_budget
      AS RESTRICTIVE FOR ALL TO public USING (false);

    DROP VIEW IF EXISTS public.api_budget_status;

    EXECUTE $v$
      CREATE VIEW public.api_budget_status
        WITH (security_invoker = true) AS
        SELECT period_start,
          period_end,
          hard_cap_cents,
          spent_cents,
          hard_cap_cents - spent_cents AS remaining_cents,
          round(spent_cents::numeric / hard_cap_cents::numeric * 100::numeric, 1) AS pct_used,
          last_updated_at
        FROM public.api_budget
        WHERE period_start = (date_trunc('month'::text, now()))::date
    $v$;

    GRANT SELECT ON public.api_budget_status TO anon;
    GRANT SELECT ON public.api_budget_status TO authenticated;
    GRANT SELECT ON public.api_budget_status TO service_role;
  END IF;
END;
$body$;

-- ── session_state (hosted migration create_session_state; may be absent locally) ──
DO $body$
BEGIN
  IF to_regclass('public.session_state') IS NOT NULL THEN
    ALTER TABLE public.session_state ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS deny_all_public_session_state ON public.session_state;
    CREATE POLICY deny_all_public_session_state ON public.session_state
      AS RESTRICTIVE FOR ALL TO public USING (false);
  END IF;
END;
$body$;
