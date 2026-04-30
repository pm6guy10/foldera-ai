# Supabase migrations discipline

**Maps to:** `AUTOMATION_BACKLOG` AZ-20, `FOLDERA_PRODUCT_SPEC` data integrity.

## Who applies production DDL

**The agent (Codex / Cursor) always applies migrations to production.** This is never Brandon’s or an “operator” follow-up task. In the same session as pushing migration files to `main`, use Supabase MCP **`apply_migration`** (Foldera **`project_id` / ref: `neydszeamsflpghtrhue`**) or `npx supabase db push` with the repo linked. Confirm via MCP **`list_migrations`** or hosted migration history. Do not close the session with “user should run db push.”

## Rules

1. **Every DDL change is a versioned file** under [`supabase/migrations/`](../supabase/migrations/). No “just run this in the SQL editor” without a matching migration file in the repo (except emergency hotfix — follow up with a migration that matches prod within one session).

2. **Apply after push:** Prefer MCP `apply_migration` with the exact SQL from the committed file (name in snake_case). **`npx supabase db push`** when the CLI is linked and the database password is available. Dashboard SQL editor **only** as fallback — paste the **exact** file contents.

3. **Never drift:** If production was altered manually, capture the final state in a new migration (or revert prod to match repo) so `migration list` and the database stay aligned.

4. **Review before push:** Read the migration for destructive operations (`DROP`, wide `UPDATE` without `WHERE`), RLS changes, and lock time on large tables.

5. **Check constraints:** Goal/signal inserts must match Postgres CHECK constraints (see `CLAUDE.md` — `tkg_goals` enums, etc.). Invalid values fail silently via Supabase client.

## CI

GitHub Actions does not run `supabase db push` today (no DB secret in Actions). **The agent still applies to production** after merging schema work — CI not wiring `db push` does not transfer the obligation to a human.

## Production apply log

- **2026-04-04:** `apply_commitment_ceiling` applied to production (`apply_commitment_ceiling` / version `20260403144654` in hosted migration history). SQL matches [`supabase/migrations/20260404000001_apply_commitment_ceiling.sql`](../supabase/migrations/20260404000001_apply_commitment_ceiling.sql).

- **2026-04-08:** **OAuth re-auth + dashboard visit** — columns `user_tokens.oauth_reauth_required_at`, `user_subscriptions.last_dashboard_visit_at`. Hosted migration name **`oauth_reauth_dashboard_visit`** (version **`20260408140704`** via MCP). Repo file [`supabase/migrations/20260408180000_oauth_reauth_dashboard_visit.sql`](../supabase/migrations/20260408180000_oauth_reauth_dashboard_visit.sql) is the canonical SQL (same `ALTER`s; **2026-04-08** follow-up: `COMMENT ON COLUMN` added in file and applied live). If CLI history shows a version mismatch vs filename, use `supabase migration repair` or align via dashboard history — do not ask Brandon to fix.

- **2026-04-09:** **`fkey_indexes_ml_snapshots_and_goals`** — **`idx_tkg_directive_ml_snapshots_action_id`** (covers **`tkg_directive_ml_snapshots_action_id_fkey`**), **`idx_tkg_goals_entity_id`** partial on **`tkg_goals.entity_id`** (covers **`tkg_goals_entity_id_fkey`**). Addresses Supabase **unindexed_foreign_keys** (lint 0001). Repo [`supabase/migrations/20260410110000_fkey_indexes_ml_snapshots_and_goals.sql`](../supabase/migrations/20260410110000_fkey_indexes_ml_snapshots_and_goals.sql); applied production via MCP **`apply_migration`**. **unused_index** INFO rows left unchanged (pg stats / low traffic; dropping risks regressions).

- **2026-04-09:** **`security_invoker_api_budget_status_and_rls_internal`** — **security_definer_view:** recreated **`api_budget_status`** with **`WITH (security_invoker = true)`** (PG `reloptions`). **rls_disabled_in_public:** **`ENABLE ROW LEVEL SECURITY`** on **`system_health`**, **`api_budget`**, **`session_state`**, **`tkg_directive_ml_snapshots`**, **`tkg_directive_ml_global_priors`** plus **`RESTRICTIVE ... TO public USING (false)`** policies ( **`service_role`** retains **`BYPASSRLS`**). Repo [`supabase/migrations/20260410100000_security_invoker_api_budget_status_and_rls_internal.sql`](../supabase/migrations/20260410100000_security_invoker_api_budget_status_and_rls_internal.sql); applied production via MCP **`apply_migration`**.

- **2026-04-09:** **`rls_initplan_and_dedupe_policies`** — RLS perf linter (**auth_rls_initplan**): recreated **`users_read_own_tokens`**, **`users_manage_own_goals`**, **`users_manage_own_summaries`**, **`users_manage_own_pattern_metrics`** using **`(select auth.uid())`** in `USING` / `WITH CHECK`. **multiple_permissive_policies:** dropped **`Users can access own signal summaries`** (if present) and **`tkg_pattern_metrics_owner`** so each table has a single authenticated `FOR ALL` owner policy plus **`service_role_*`**. Repo [`supabase/migrations/20260409210000_rls_initplan_and_dedupe_policies.sql`](../supabase/migrations/20260409210000_rls_initplan_and_dedupe_policies.sql); applied production via MCP **`apply_migration`**.

- **2026-04-09:** **`api_budget_functions_search_path`** — `ALTER FUNCTION` **`api_budget_check_and_reserve(integer)`** and **`api_budget_record_actual(integer)`** with **`SET search_path = public`** (Supabase linter **function_search_path_mutable** / lint 0011). Repo file [`supabase/migrations/20260409200000_api_budget_functions_search_path.sql`](../supabase/migrations/20260409200000_api_budget_functions_search_path.sql); applied production via MCP **`apply_migration`** (`api_budget_functions_search_path`). Skips no-op on DBs without those functions (`to_regprocedure` guard).

- **2026-04-30:** **`restrict_internal_security_definer_rpcs`** — applied repo migration [`supabase/migrations/20260427000000_restrict_internal_security_definer_rpcs.sql`](../supabase/migrations/20260427000000_restrict_internal_security_definer_rpcs.sql) to production and repaired hosted migration history for version **`20260427000000`**. This revokes `EXECUTE` from `PUBLIC`, `anon`, and `authenticated` and preserves `service_role` execute for `get_auth_user_id_by_email(text)`, `replace_onboarding_goals(uuid,jsonb)`, `replace_current_priorities(uuid,jsonb)`, `apply_commitment_ceiling(integer)`, `api_budget_check_and_reserve(integer)`, and `api_budget_record_actual(integer)`. Proof: anon REST RPC calls now return `401` / Postgres `42501 permission denied` for all six functions, and production `GET /api/health?depth=full` with the cron secret returns `200`, `status: ok`, `schema: ok` on build `82fd079`.

- **2026-04-09:** **Re-verified production DDL** — MCP `execute_sql` on **`neydszeamsflpghtrhue`**: `information_schema` confirms `user_tokens.oauth_reauth_required_at` (timestamptz) and `user_subscriptions.last_dashboard_visit_at`; `list_migrations` includes **`oauth_reauth_dashboard_visit`** / **`20260408140704`**. If Sentry still showed “column does not exist” before this date, cause was likely stale deploy, transient replica, or a non-prod project — not missing migration on this database.

- **2026-04-08:** **`pipeline_runs`** — hosted version **`20260408030300`** (`pipeline_runs`); aligns with repo [`supabase/migrations/20260407120000_pipeline_runs.sql`](../supabase/migrations/20260407120000_pipeline_runs.sql) (timestamp in filename may differ from hosted row — verify with `list_migrations`).

## References

- [Supabase CLI migrations](https://supabase.com/docs/guides/cli/local-development#database-migrations)
- Repo constraints test: [`lib/db/__tests__/check-constraints.test.ts`](../lib/db/__tests__/check-constraints.test.ts)
