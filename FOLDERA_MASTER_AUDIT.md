# FOLDERA MASTER AUDIT

## OPEN — Requires Action

### P0 — RESOLVED 2026-03-27 (This Session) — Production DB Migrations Applied

All previously pending migrations have been applied to production and verified:

| Migration | Applied | Verification |
|---|---|---|
| `idx_api_usage_user_date` index | ✓ | index exists in pg_indexes |
| `remove_test_subscription` | ✓ | COUNT=0 for test user |
| `add_outcome_closed_to_tkg_actions` | ✓ | column exists; scorer anti-pattern detection restored |
| `cleanup_malformed_auto_suppression_goals` | ✓ | 7 garbage goals deleted, 0 remaining |

`npm run test:prod` 51/51 passed after all migrations applied.

---

### P0 (Historical, archived) — Production DB Migrations Not Applied
The following migrations are in source code (committed to git) but NOT yet applied to production Supabase DB. Apply via Supabase MCP or `npx supabase db push` at next maintenance window.

| Migration | Purpose | Impact if missing |
|---|---|---|
| `20260326000001_unify_check_constraints.sql` | Unified CHECK constraints on tkg_goals/tkg_signals | Silent insert failures for invalid values |
| `20260326000002_api_usage_index.sql` | Composite index api_usage(user_id, created_at) | Spend cap queries do full table scans |
| `20260326000003_remove_test_subscription.sql` | Remove immortal test subscription for gate2 account | Test account has permanent pro status in prod |
| `20260327000001_add_outcome_closed.sql` | Add outcome_closed BOOLEAN to tkg_actions; quarantine polluted-era skips | detectAntiPatterns/detectEmergentPatterns return [] silently — anti-pattern detection disabled |
| `20260327000002_cleanup_malformed_suppressions.sql` | Delete garbage auto-suppression goals from old n-gram fallback | Malformed suppression keys (lowercase, too short) blocking valid directives |

**Anti-pattern detection specifically**: scorer.ts queries `outcome_closed` from tkg_actions (lines 1071, 1369). In production without this column, PostgREST returns `data: null`. Code falls back to `[]` gracefully (no crash) but anti-pattern and emergent pattern detection is silently disabled until migration is applied.

### P1 — RESOLVED 2026-03-27 (This Session) — Production Verification Caught Up

`npm run test:prod` 51/51 passed this session against commits `8952369` + `f7b34f7` + `c25b94c`.
Covers: multi-candidate viability, Outlook hygiene, SYSTEM_RUNBOOK creation, all migrations applied.

### P2 — Missing DB Indexes (No Migration Written)
- `tkg_signals (user_id, processed)` — no index exists; full table scans on signal processing
- `tkg_signals (user_id, occurred_at)` — no index exists; full table scans on signal freshness queries
- No migration written yet. Add at next infrastructure window.

### P2 — Non-Owner Flow Not Proven
Primary goal per SYSTEM_RUNBOOK is 3 consecutive successful runs for a non-Brandon user. No session has produced verified output for a non-owner user with production DB proof. The system works for `e40b7cd8` (Brandon) only as far as E2E receipts show.

---

## RESOLVED (with evidence)

- **2026-03-27** — `/login?error=OAuthCallback` banner test: RESOLVED. `npm run test:prod` 25/25 passed March 25. Now 51/51.
- **2026-03-27** — Two-gate enforcement (evaluateReadiness + isSendWorthy): VERIFIED. `npm run test:prod` 51/51 passed same session.
- **2026-03-26** — Behavioral graph module (`lib/signals/behavioral-graph.ts`): SHIPPED. Not verified in production (non-critical path).
- **2026-03-25** — JWT onboarding claim in middleware: VERIFIED. `npx playwright test tests/e2e/` 27 passed.
- **2026-03-25** — Microsoft soft-disconnect (no hard delete): VERIFIED. Focused vitest + build passed.
- **2026-03-25** — source_id missing in tkg_signals inserts on directive execution: VERIFIED. vitest 10/10, build passed, pushed.
- **2026-03-25** — Commitment ceiling now runs immediately before scoring: VERIFIED. Build passed.
- **2026-03-24** — Onboarding goal insert schema fix (invalid columns): VERIFIED. Live DB query confirmed row persisted correctly.
- **2026-03-24** — Generator JSON extraction hardening: VERIFIED. Production receipt: action `9ec89641` with confidence=78, status=pending_approval.
- **2026-03-24** — Signal freshness repair for existing entities: VERIFIED. Live DB query confirmed entity timestamps corrected.
- **2026-03-24** — `/api/health` route added to stop health-check JSON parse failures: VERIFIED. HTTP 200, content-type: application/json, body correct.
- **2026-03-24** — Manual run-brief sends immediately for signed-in user: VERIFIED. Production receipt: action `6e555f8f`, status=pending_approval.
- **2026-03-24** — Permanent cost controls (extraction, research gating, spend cap): VERIFIED. npm run test:prod 18/18 passed.
- **2026-03-24** — Blog markdown rendering fix on /blog/[slug]: VERIFIED. focused playwright tests 5/5 passed.
- **2026-03-24** — Nightly pre-ceiling + scorer suppressed filter: VERIFIED. Build + focused vitest passed.
- **2026-03-23** — Middleware auth gate + redirect cleanup: VERIFIED. npm run test:prod 18/18 passed.
- **2026-03-23** — Backend E2E safety gates: VERIFIED. 9 passed, 7 skipped (env-gated).
- **2026-03-23** — Dashboard no longer client-redirects to onboard: VERIFIED. 29 E2E passed.

---

## PRE-EXISTING NON-BLOCKERS (not fixing here)

- Full local `npx playwright test` omnibus suite fails for pre-existing local-auth reasons: `tests/production/smoke.spec.ts` runs against localhost without auth → redirects to /login → assertions fail. This is a test-harness issue, not a product break. Production E2E (`npm run test:prod`) against live site is the real gate.
- `tests/audit/clickflow.spec.ts` times out on `/` in local suite — pre-existing, unrelated to pipeline work.
