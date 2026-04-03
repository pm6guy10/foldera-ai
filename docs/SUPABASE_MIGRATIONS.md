# Supabase migrations discipline

**Maps to:** `AUTOMATION_BACKLOG` AZ-20, `FOLDERA_PRODUCT_SPEC` data integrity.

## Rules

1. **Every DDL change is a versioned file** under [`supabase/migrations/`](../supabase/migrations/). No “just run this in the SQL editor” without a matching migration file in the repo (except emergency hotfix — follow up with a migration that matches prod within one session).

2. **Apply via CLI linked to the project:** from repo root, with the project linked and credentials available:

   ```bash
   npx supabase db push
   ```

   Or use the Supabase Dashboard SQL editor **only** to run the exact contents of a migration file you are also committing.

3. **Never drift:** If production was altered manually, capture the final state in a new migration (or revert prod to match repo) so `migration list` and the database stay aligned.

4. **Review before push:** Read the migration for destructive operations (`DROP`, wide `UPDATE` without `WHERE`), RLS changes, and lock time on large tables.

5. **Check constraints:** Goal/signal inserts must match Postgres CHECK constraints (see `CLAUDE.md` — `tkg_goals` enums, etc.). Invalid values fail silently via Supabase client.

## CI

There is no automated `supabase db push` in GitHub Actions today (secrets / linked project). The gate is human: migrations committed + applied at deploy or maintenance window.

## Production apply log (operator / MCP)

- **2026-04-04:** `apply_commitment_ceiling` applied to production (`apply_commitment_ceiling` / version `20260403144654` in hosted migration history). SQL matches [`supabase/migrations/20260404000001_apply_commitment_ceiling.sql`](../supabase/migrations/20260404000001_apply_commitment_ceiling.sql).

## References

- [Supabase CLI migrations](https://supabase.com/docs/guides/cli/local-development#database-migrations)
- Repo constraints test: [`lib/db/__tests__/check-constraints.test.ts`](../lib/db/__tests__/check-constraints.test.ts)
