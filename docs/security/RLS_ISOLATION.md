# RLS & Multi-Tenant Isolation — Pass 1 (Master Audit #445)

> **Verdict: `PASS`** (one `CONCERN` closed in this pass). Every user-data table
> enforces cross-tenant isolation at the database via Row-Level Security; the live
> policy state was proven read-only against production on 2026-06-19 and is now
> guarded by an automated contract test.

## What was proven (live, read-only, no paid calls)

Reconciled against the live Foldera Supabase project (`neydszeamsflpghtrhue`) via
`pg_policies` / `pg_tables`. The captured ground truth is committed at
`tests/security/rls-policy-snapshot.json`.

1. **RLS is enabled on all 26 public tables.**
2. **Every directly-readable user table** (`tkg_signals`, `tkg_commitments`,
   `tkg_entities`, `tkg_actions`, `tkg_briefings`, `tkg_conflicts`, `tkg_feedback`,
   `tkg_goals`, `tkg_pattern_metrics`, `signal_summaries`, `tkg_user_meta`,
   `api_usage`, `user_tokens`) has a per-user policy with the predicate
   `user_id = (SELECT auth.uid())` (the perf-optimized initplan form). For the
   `anon` role `auth.uid()` is `NULL`, so the predicate yields zero rows —
   unauthenticated reads return nothing.
3. **No PERMISSIVE `public`/`authenticated` policy grants rows without an
   `auth.uid()` predicate.** There is no `USING (true)` tenant read path anywhere.
4. **Internal/system tables are service-role only.** `api_budget`, `session_state`,
   `system_health`, `tkg_directive_ml_snapshots`, `tkg_directive_ml_global_priors`,
   and `waitlist` carry a **RESTRICTIVE `USING (false)`** deny for `public` — they are
   reachable only by the server (`service_role`). `cost_events`, `pipeline_runs`,
   `integrations`, `referral_accounts`, `tkg_constraints`, `user_subscriptions`,
   `user_brief_cycle_gates` have no tenant policy at all (default deny under RLS).
5. **Service-role key is server-only.** `lib/db/client.ts` resolves
   `SUPABASE_SERVICE_ROLE_KEY` *inside* the function (never at module top level) and
   is imported only by `app/api/**` route handlers, `lib/**`, and `scripts/**` —
   **never by a client component**. No `NEXT_PUBLIC_*` variable carries the service key.
6. **Connector tokens are encrypted at rest.** `lib/auth/user-tokens.ts` runs OAuth
   `access_token`/`refresh_token` through `encryptToken()` before persisting and
   `decryptToken()` only server-side. The `users_read_own_tokens` policy lets a user
   read *their own* row, but they receive ciphertext (the `ENCRYPTION_KEY` is
   server-only), so no usable token reaches the browser. Token **values** are never
   logged (only `user_id` and truncated error descriptions).

## The CONCERN that was closed

The acceptance criterion asked for "a cross-tenant leak test [that] exists and
passes." The pre-existing `lib/__tests__/multi-user-safety.test.ts` does **not** cover
RLS — it mocks the DB client and tests subscription/eligibility logic. This pass adds
the real guard: `tests/security/__tests__/rls-isolation.test.ts`, which asserts the
isolation invariants over the committed snapshot (6 tests, green). Because the
Supabase JS client cannot read `pg_catalog` and CI has no database, the snapshot is
the contract; the live read-only proof above establishes its correctness.

## Regenerating the snapshot (required after any RLS migration)

The snapshot is the source of truth for the test. After any migration that touches
RLS or adds a table, regenerate it (read-only) and commit the diff:

```sql
-- run read-only against the project, then map rows into rls-policy-snapshot.json
select tablename, policyname, permissive, roles::text, cmd, qual, with_check
from pg_policies where schemaname = 'public' order by tablename, policyname;
-- rls_enabled per table:
select relname, relrowsecurity from pg_class
where relnamespace = 'public'::regnamespace and relkind = 'r' order by relname;
```

A new table added to the snapshot must be classified as either a
`DIRECT_USER_READ_TABLES` or `SERVICE_ONLY_TABLES` entry in the test, or the
"snapshot covers exactly the expected table set" assertion fails by design — forcing a
human to decide its isolation posture rather than letting it ship un-reviewed.

## Findings ledger

| # | Severity | Finding | Action |
|---|---|---|---|
| S-1 | — (PASS) | All 26 tables RLS-enabled; every tenant policy scoped by `auth.uid()`; internal tables restrictive-deny | proven; guarded by contract test |
| S-2 | CONCERN → closed | No automated cross-tenant regression guard existed | added `rls-isolation.test.ts` (6 invariants, green) |
| S-3 | Owner-side | Supabase Auth: **leaked-password protection disabled** + **insufficient MFA options** (advisor WARN) | owner toggles in Supabase dashboard (also #420 Tier 3) — [leaked-password](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) · [MFA](https://supabase.com/docs/guides/auth/auth-mfa) |
| S-4 | Low | Tenant SELECT policies are granted `TO public` rather than `TO authenticated`; safe (anon's `auth.uid()` is NULL → 0 rows) but `authenticated` is tidier | note; optional cleanup in a future schema pass |
| S-5 | Low | `lib/auth/user-tokens.ts` logs `user_id` unconditionally on save/disconnect (token values never logged) | note; could fold under the `FOLDERA_DEBUG_AUTH` gate from #430 in a later pass |

S-3 is an owner action (dashboard toggle, not code). S-4/S-5 are low-severity notes
recorded so they are not re-derived. The isolation substance is sound.
