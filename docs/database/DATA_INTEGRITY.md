# Database & Data Integrity — Pass 2 (Master Audit #445)

> **Verdict: `PASS`** (one low-severity gap noted). Cross-checked read-only against
> the live Foldera Supabase project on 2026-06-19 (`information_schema` + `pg_indexes`).
> Ground truth committed at `tests/database/data-integrity-snapshot.json`; invariants
> guarded by `tests/database/__tests__/data-integrity.test.ts` (6 tests, green).

## What was proven

1. **Tenancy is correctly classified.** 21 of 26 tables are user-scoped (have a
   `user_id` column). The 5 without one are by design: `api_budget` (global guard),
   `tkg_directive_ml_global_priors` (global priors), `waitlist` (pre-auth signups),
   `referral_accounts` (email-keyed legacy, 0 rows), and `session_state` (an
   agent/ops session ledger — commit/deploy/pipeline status — **not** end-user data).
2. **Hot-path indexing is thorough.** Every user-scoped table leads an index with
   `user_id`, and the high-traffic tables carry composite indexes matching their query
   shapes: `tkg_signals(user_id, processed, occurred_at DESC)`,
   `tkg_commitments(user_id, status) WHERE active/at_risk`,
   `tkg_actions(user_id, generated_at DESC)` + `(user_id, status)`,
   `api_usage(user_id, created_at DESC)`, etc.
3. **Idempotency / reprocessing dedupe exists.** `tkg_signals` has
   **`UNIQUE(user_id, content_hash)`** — the guard that makes re-ingesting the same
   signal a no-op (can't double-fire). Plus natural-key uniques on
   `integrations(user_id, provider)`, `user_tokens(user_id, provider)`,
   `signal_summaries(user_id, week_start)`, `tkg_pattern_metrics(user_id, pattern_hash)`,
   `tkg_briefings(user_id, briefing_date)`.
4. **Receipts reconstruct the decision.** `tkg_actions` carries the full trail —
   `evidence`/`reason`/`directive_text` (before + source), `action_type`/`confidence`/
   `status` (verdict), `approved_at`/`executed_at`/`execution_result`/`outcome_closed`
   (after) — so before→verdict→after→source is reconstructable.
5. **Schema discipline.** All schema lives in committed migrations under
   `supabase/migrations/` (80+ timestamped files; confirmed in Pass 0). No ad-hoc DDL.

## Findings ledger

| # | Severity | Finding | Action |
|---|---|---|---|
| D-1 | PASS | `user_id` + leading index on every user-scoped table; composite hot-path indexes present | guarded by the contract test |
| D-2 | PASS | reprocessing dedupe via `UNIQUE(user_id, content_hash)` on `tkg_signals` | guarded by the contract test |
| D-3 | **Low** | `cost_events` has `user_id` but **no `user_id` index** (its twin `api_usage` does). Low impact — it's a low-traffic operator cost table queried by time window. | tracked as the sole `known_index_gaps` entry; add `idx_cost_events_user_created` in a future schema seam and remove from the list |
| D-4 | Doc note | `session_state` is an ops/session ledger, not workday-presence state (that lives in `auth.users.user_metadata`). `docs/SOURCE_OF_TRUTH_MAP.md`'s runtime-table map mislabels it. | correct the table map in a later doc pass (Pass 12) |
| D-5 | Note (by design) | `tkg_actions` receipts are lifecycle-stamped *mutable* rows, not an append-only event stream. Reconstructs the trail from the final row + timestamps + jsonb, but intermediate transitions aren't independently logged. | acceptable for MVP; an append-only event log is a future hardening option |

## Regenerating the snapshot (after any schema migration)

Read-only queries, then map into `tests/database/data-integrity-snapshot.json`:

```sql
-- user_id coverage
select table_name from information_schema.columns
where table_schema='public' and column_name='user_id';
-- indexes
select tablename, indexname, indexdef from pg_indexes where schemaname='public';
```

A new table forces a classification (user-scoped vs not) or the
"classifies exactly the expected 26 tables" assertion fails by design.

**Bottom line:** data integrity is sound — tenancy, indexing, idempotency, receipts,
and migration discipline all hold. The only open item is one missing index on a
low-traffic operator table (D-3), tracked so it can't be forgotten.
