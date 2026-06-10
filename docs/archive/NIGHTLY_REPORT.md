# NIGHTLY REPORT — 2026-03-24

## MORNING_ACTION
1. **Check first (in order):** inbox (latest Foldera email) -> Supabase (signal decrypt health and unprocessed count) -> Vercel (nightly-ops + env var history/logs).
2. **Single most important action today:** restore signal decryption for AB21 so the pipeline can generate a real directive instead of fallback `wait_rationale`.
3. **Paste-ready Codex prompts (priority order):**
   1. **AB21 decrypt guard + diagnostics**
      ```text
      Task: Fix AB21 by adding deterministic decryption diagnostics and dead-key handling so nightly ops can classify and drain undecryptable signals without stalling generation.

      MODE: AUDIT

      Read first:
      - AGENTS.md
      - CLAUDE.md
      - LESSONS_LEARNED.md
      - FOLDERA_PRODUCT_SPEC.md

      Files to modify:
      - lib/encryption.ts
      - lib/signals/signal-processor.ts
      - app/api/cron/nightly-ops/route.ts
      - lib/signals/__tests__/signal-processor.test.ts
      - app/api/cron/nightly-ops/__tests__/route.test.ts
      - AUTOMATION_BACKLOG.md
      - FOLDERA_MASTER_AUDIT.md (only if a verification issue cannot be fixed in-session; mark NEEDS_REVIEW)

      Exact fix:
      - Ensure decrypt failures are explicitly classified as dead_key/invalid_ciphertext and never silently treated as plaintext.
      - In signal processing, quarantine or mark truly undecryptable rows so they do not block processing retries.
      - Keep processing moving for decryptable rows in the same run.
      - Add structured nightly logs with counts for decrypt_success, decrypt_dead_key, decrypt_parse_error, and deferred rows.
      - Keep behavior scoped to existing pipeline flow (no feature expansion).

      Verification steps:
      1. Run `npm run build` and confirm pass.
      2. Run `npx playwright test` and confirm no new regressions versus baseline.
      3. Run focused tests:
         - `npx vitest run lib/signals/__tests__/signal-processor.test.ts`
         - `npx vitest run app/api/cron/nightly-ops/__tests__/route.test.ts`
      4. Re-run nightly path locally and confirm undecryptable signals are isolated while other signals still process.
      5. If any required test cannot be fixed in-session, add a NEEDS_REVIEW entry in FOLDERA_MASTER_AUDIT.md with exact failure details.

      Multi-user check:
      - Verify behavior is user-scoped (session user and non-owner path), with no owner-only fallback or hardcoded user IDs.
      - Confirm dead-key handling and backlog drain logic works for both owner and non-owner test coverage.

      Push directly to main. Do not create a branch.
      ```

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
   - **Classification**: AUTO_FIXABLE
   - **Status**: OPEN
   - **Evidence**: Nightly run processed 0/601 signals and repeatedly hit decrypt fallback, resulting in no ranked candidate.
   - **Human Action**: Confirm env key integrity, then run the CODEX_PROMPT listed in `MORNING_ACTION`.
   - **CODEX_PROMPT**: See `MORNING_ACTION` item 3.1 (paste-ready, complete prompt)

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
