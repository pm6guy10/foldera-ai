# NIGHTLY REPORT — 2026-03-24

**Run time:** ~09:10 UTC (orchestrator-triggered)
**Overall status:** RED — Signal processing completely stalled. No directive generated.

---

## Data Sync (Phase 1)
- **Microsoft sync:** SUCCESS — 35 outlook + 14 calendar signals
- **Sources covered:** outlook, outlook_calendar
- **Classification:** HEALTHY

## Signal Processing (Phase 2)
- **Processed:** 0 signals in 2 attempts (maxSignals=50 each)
- **Remaining unprocessed:** 601 (up from 358 yesterday, +68%)
- **Stale signals (>24h occurred_at):** 514
- **Root cause:** `decryptWithStatus()` fails for ALL signals. Content remains ciphertext after decryption attempt. All signals deferred, none quarantined.
- **Daily API spend:** $0.00 (no Anthropic calls made)
- **Classification:** RED — BLOCKER_ALL_SIGNALS_DEAD_KEY

## Queue Cleanup (Phase 3)
- **Stale pending_approval (>24h):** 0
- **Cleared:** 0 (queue clean)

## Daily Brief (Phase 4)
- **Brandon (e40b7cd8):** `do_nothing` / `wait_rationale`
  - Evidence: "Generation failed internally" — 0 candidates, scorer EV null, confidence 0
  - No candidates because signal processing stalled
  - **VALID wait_rationale — but reflects pipeline failure, not lack of signal**
- **Test user (22222222):** `do_nothing` / `wait_rationale`
  - "No ranked daily brief candidate" — expected
  - **VALID — correct no-send**
- **Classification:** YELLOW — contract met (wait_rationale), but no real directive

## Daily Send (Phase 5)
- **Brandon:** Already sent earlier today (dedup=true, sent_count_today=1)
- **Test user:** Correctly skipped (no verified email)
- **Classification:** GREEN — email delivered (wait_rationale)

## Health Snapshot (Phase 6)
- **Build:** PASS (all routes compile, no errors)
- **Recent commits:** 32 in last 24h (heavy development day)
- **Active commitments (suppressed_at IS NULL):** 150 (at ceiling — self-heal working correctly)
- **Unprocessed signals:** 601 (ALL undecryptable)
- **7-day action breakdown:** 66 skipped, 1 executed, 2 pending_approval
- **7-day approval rate:** ~1.4% (1/69)
- **Action type mix (7d skips):** do_nothing 37 (56%), make_decision 17 (26%), send_message 5, schedule 4, write_document 2, research 1

---

## Failure Classes

| Classification | Items | Severity |
|---|---|---|
| BLOCKER_ALL_SIGNALS_DEAD_KEY | AB21 (NEW) | CRITICAL — entire pipeline dead |
| WARN_COMMITMENT_CEILING_BREACH | AB22 (CLOSED) | FALSE ALARM — suppressed_at IS NULL = 150 (at ceiling). Self-heal working. |
| INFO_ZERO_APPROVAL_RATE | AB2 | ONGOING — cannot improve while processing is stalled |
| WARN_SIGNAL_BACKLOG_GROWTH | AB18 | CRITICAL — 601 unprocessed and growing |
| BLOCKER_TOKEN_DECRYPT | AB3 | LOW — non-blocking for generation |
| WARN_MISSING_SCOPES | AB13 | LOW — Google calendar/drive |

## Items Closed This Run

| # | Issue | Reason |
|---|---|---|
| AB1 | Generator placeholder text | No failures in 4+ days, close deadline met |
| AB4 | `make_decision` dominance | Production confirmed: 48% → 26% after fallback fix |
| AB7 | Scorer EV below 2.0 | Last measured EV was 2.55, informational only |

## Blockers Requiring Human Action

1. **CRITICAL — AB21: Signal decryption failure.** Zero signals processed. All 601 fail decryption. The pipeline generates only `wait_rationale` until this is fixed. No code changed since March 23's successful run.
   - **Action**: Check `ENCRYPTION_KEY` in Vercel dashboard. Compare to `.env.local`. Look for trailing whitespace, quote characters, or accidental edit. Test decryption locally.

2. **CLOSED — AB22: Commitment ceiling false alarm.** `suppressed_at IS NULL` = 150, exactly at ceiling. Self-heal is working correctly.

3. **LOW — AB13: Google scopes.** Re-authorize Google OAuth via /dashboard/settings.

## Morning Recommendation

**The pipeline is broken. AB21 (signal decryption) is the only thing that matters.**

Yesterday: 500 signals processed, EV 2.55, confidence 77, a real directive delivered.
Today: 0 signals processed, 0 candidates, wait_rationale only.

No code changed between these two outcomes. The most likely cause is an `ENCRYPTION_KEY` environment variable change in Vercel (accidental edit, trailing character, encoding issue). Check the Vercel dashboard immediately.

Once decryption is restored, the 601-signal backlog will process and the pipeline should resume generating real directives.

## Build/Test Status
- **npm run build:** PASS
- **Production E2E:** Not run (nightly orchestrator mode)
- **Last known prod test result:** 18/18 passed (March 23)

---
