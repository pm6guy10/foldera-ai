# NIGHTLY REPORT — 2026-03-23

**Run time:** ~09:30 UTC (orchestrator-triggered, not cron)
**Overall status:** GREEN — directive generated, artifact valid, email sent

---

## Data Sync (Phase 1)
- **Microsoft sync:** SUCCESS — 543 outlook + 130 calendar signals
- **Sources covered:** outlook, outlook_calendar
- **Classification:** HEALTHY

## Signal Processing (Phase 2)
- **Processed:** 500 signals across 10 batches (50 each), steady decrease, no stalls
- **Daily-brief additional:** 15 more signals processed inline
- **Remaining unprocessed:** 358 (budget exhaustion, not errors)
- **New commitments:** 146 extracted in last hour (879 total, 297 active)
- **Classification:** HEALTHY (but see AB18 for backlog growth)

## Queue Cleanup (Phase 3)
- **Stale pending_approval (>24h):** 0
- **Cleared:** 0 (queue was already clean)

## Daily Brief (Phase 4)
- **Brandon (e40b7cd8):** `schedule` / `calendar_event`
  - Title: "Call ESD claims center - waiver follow-up"
  - Artifact: calendar_event with title, start, end, description — all non-empty
  - Confidence: 77 (above 70 threshold)
  - Scorer EV: 2.55 (above 2.0 benchmark — FIRST TIME)
  - Candidates evaluated: 96, top 3 scored
  - **VALID — real, actionable, entity-specific directive**
- **Test user (22222222):** `do_nothing` / `wait_rationale`
  - Context and evidence non-empty
  - **VALID — correct no-send**
- **Classification:** PASS

## Daily Send (Phase 5)
- **Brandon:** SENT — Resend ID `f328ffab-290b-4b60-9c34-fdaef8f35898`
- **Test user:** Correctly skipped (no verified email)
- **Classification:** PASS

## Health Snapshot (Phase 6)
- **Build:** PASS (all routes compile, no errors)
- **Recent commits:** 28 in last 24h (heavy development day)
- **Active commitments:** 297 (ABOVE 150 ceiling — AB17)
- **Self-referential commitments:** 26 (up from 15 — AB15)
- **Unprocessed signals:** 358 remaining (AB18)
- **7-day action breakdown:** 87 skipped, 1 executed, 2 pending_approval
- **7-day approval rate:** ~1.1% (1/90) — slight improvement from 0% (AB2)
- **Action type mix (Brandon, 7d):** make_decision 37, do_nothing 22, send_message 8, research 4, schedule 4, write_document 2

---

## Failure Classes

| Classification | Items | Severity |
|---|---|---|
| INFO_ZERO_APPROVAL_RATE | AB2 | CRITICAL — but today's directive is the best quality yet |
| WARN_SELF_REFERENTIAL_LEAK | AB15 | MEDIUM — 26 Foldera commitments polluting extraction |
| WARN_COMMITMENT_CEILING_BREACH | AB17 (NEW) | MEDIUM — 297 active vs 150 ceiling |
| WARN_SIGNAL_BACKLOG_GROWTH | AB18 (NEW) | LOW — processing budget can't keep pace with sync volume |
| BLOCKER_TOKEN_DECRYPT | AB3 | LOW — non-blocking, fresh sync healthy |
| WARN_MAKE_DECISION_DOMINANCE | AB4 | LOW — declining trend (48%), close candidate |

## Blockers Requiring Human Action

1. **AB2 (CRITICAL):** Today's directive — "Call ESD claims center for hardship waiver follow-up" — is the highest quality directive seen. Confidence 77, EV 2.55. If relevant, approve it to seed the behavioral learning loop. One approval unblocks self-learning.
2. **AB3 (LOW):** Set `ENCRYPTION_KEY_LEGACY` in Vercel or re-authorize Microsoft OAuth to decrypt legacy data.
3. **AB13 (LOW):** Re-authorize Google OAuth with calendar+drive scopes via /dashboard/settings.

## Morning Recommendation

The pipeline is healthy and generating the best directives to date. Today's ESD claims follow-up is specific, actionable, and entity-referenced — exactly the product promise. The single most impactful thing Brandon can do this morning is **approve or skip today's directive** to give the self-learning loop its first real signal.

Auto-fixable items (AB15 commitment suppression, AB17 commitment ceiling) will be addressed in Job 2 of this nightly run.

## Build/Test Status
- **npm run build:** PASS
- **Production E2E:** Not run (scheduled task context, no browser available)

---
