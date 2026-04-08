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

- **2026-04-08:** **`pipeline_runs`** — hosted version **`20260408030300`** (`pipeline_runs`); aligns with repo [`supabase/migrations/20260407120000_pipeline_runs.sql`](../supabase/migrations/20260407120000_pipeline_runs.sql) (timestamp in filename may differ from hosted row — verify with `list_migrations`).

## References

- [Supabase CLI migrations](https://supabase.com/docs/guides/cli/local-development#database-migrations)
- Repo constraints test: [`lib/db/__tests__/check-constraints.test.ts`](../lib/db/__tests__/check-constraints.test.ts)
