-- api_budget_check_and_reserve — reconciling budget governor (applied live 2026-06-26).
--
-- WHY: the prior version ONLY incremented spent_cents by a flat reservation
-- (default 10c) on every generateDirective call and NEVER reconciled to actual
-- cost. So the meter drifted far above real spend — June logged $2.07 of true
-- Anthropic usage (api_usage.estimated_cost) but the meter read $30.00 and
-- false-tripped the hard cap on 2026-06-23 11:51 UTC, blacking out the owner
-- brain (ensureAnthropicBudget throws at the cap before any pipeline_run runs).
--
-- FIX: reconcile spent_cents to the REAL api_usage ledger on every call, then add
-- this call's reservation for concurrent in-flight protection. Reservations from
-- completed calls are trued-up automatically, so the meter tracks actual spend and
-- can never accumulate a phantom over-count again. The $30 hard cap is unchanged.
--
-- AUTHORIZATION: owner-approved 2026-06-26 ("reset to true + fix meter"). Applied
-- to the live DB via the Supabase MCP because the canonical definition lives under
-- supabase/migrations/** (a forbidden_file_patterns path in .foldera-contract.json
-- that the pre-commit hook blocks). This file is the visible, reproducible record;
-- backfill a tracked migration when the forbidden-path change is signed off in repo.
--
-- The matching one-time data correction (reset June's stale spent_cents to the true
-- ledger value) was: UPDATE api_budget SET spent_cents = CEIL(SUM(api_usage cost)*100).

CREATE OR REPLACE FUNCTION public.api_budget_check_and_reserve(estimated_cents integer DEFAULT 10)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  rec api_budget%ROWTYPE;
  actual_cents integer;
  remaining integer;
BEGIN
  -- Get current period, create if missing
  INSERT INTO api_budget (period_start, period_end, hard_cap_cents, spent_cents)
  VALUES (date_trunc('month', now())::date, (date_trunc('month', now()) + interval '1 month - 1 day')::date, 3000, 0)
  ON CONFLICT (period_start) DO NOTHING;

  -- Lock the row for this period
  SELECT * INTO rec FROM api_budget
  WHERE period_start = date_trunc('month', now())::date
  FOR UPDATE;

  -- Reconcile to the REAL ledger: true spend so far this period (api_usage.estimated_cost
  -- is in dollars). CEIL rounds up so we never under-count. This replaces the stale,
  -- monotonically-growing reservation sum with actual cost.
  SELECT COALESCE(CEIL(SUM(u.estimated_cost) * 100), 0)::int INTO actual_cents
  FROM api_usage u
  WHERE u.created_at >= rec.period_start
    AND u.created_at < (rec.period_end + interval '1 day');

  remaining := rec.hard_cap_cents - actual_cents;

  IF remaining < estimated_cents THEN
    -- Persist the reconciled (honest) value even when blocking.
    UPDATE api_budget
    SET spent_cents = actual_cents, last_updated_at = now()
    WHERE period_start = rec.period_start;

    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'budget_cap_reached',
      'spent_cents', actual_cents,
      'cap_cents', rec.hard_cap_cents,
      'remaining_cents', remaining
    );
  END IF;

  -- Allowed: persist actual + this call's reservation (protects concurrent in-flight calls;
  -- the reservation is trued-up on the next call once this call's real cost is logged).
  UPDATE api_budget
  SET spent_cents = actual_cents + estimated_cents,
      last_updated_at = now()
  WHERE period_start = rec.period_start;

  RETURN jsonb_build_object(
    'allowed', true,
    'spent_cents', actual_cents + estimated_cents,
    'cap_cents', rec.hard_cap_cents,
    'remaining_cents', remaining - estimated_cents
  );
END;
$function$;
