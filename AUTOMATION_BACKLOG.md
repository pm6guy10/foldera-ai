# AUTOMATION BACKLOG
**Updated:** 2026-03-24 (nightly orchestrator run)

---

## OPEN Items

| # | Issue | Status | Classification | Failure Class | Scope | Evidence | Allowed For Auto-Fix | Reason | Human Action |
|---|-------|--------|----------------|---------------|-------|----------|---------------------|--------|--------------|
| AB1 | Generator produces placeholder text in document artifacts when `make_decision` candidates are redirected to concrete deliverable types. | CLOSED | MANUAL_REVIEW | BLOCKER_GENERATOR_VALIDATION | `lib/briefing/generator.ts` | March 24 nightly: No placeholder failures observed in 4+ days. `make_decision` share down to 26% (from 48%). Close deadline met (March 25). | no | Generator prompt engineering excluded from auto-fix. | — |
| AB2 | Near-zero user approvals. The product end-to-end loop is barely completing. | OPEN (CRITICAL) | VISION_REQUIRED | INFO_ZERO_APPROVAL_RATE | Product-wide | March 24 nightly: 69 actions in 7 days — 66 skipped, 1 executed, 2 pending. Approval rate ~1.4%. `do_nothing` now dominates (37/66 skips = 56%). Generation failed internally today (0 candidates) due to signal processing stall. | no | Product/quality problem requiring human judgment. | Signal processing must be unblocked before quality can improve. |
| AB3 | Legacy-encrypted Microsoft data remains unreadable. | OPEN (LOW) | BLOCKED | BLOCKER_TOKEN_DECRYPT | `lib/encryption.ts`, Vercel env config | March 24 nightly: Fresh sync healthy (35 outlook + 14 calendar). Non-blocking when processing works. | no | Requires old encryption key or manual re-auth. | Set `ENCRYPTION_KEY_LEGACY` in Vercel env vars, OR re-authorize Microsoft OAuth. |
| AB4 | `make_decision` action type dominates scorer output. | CLOSED | AUTO_FIXABLE | WARN_MAKE_DECISION_DOMINANCE | `lib/briefing/scorer.ts` | March 24 nightly: `make_decision` share dropped from 48% (March 23) to 26% (17/66 skips). Fix from AB4 (default fallback changed to `send_message`) confirmed working in production. | yes | Production evidence confirms fix. | — |
| AB7 | Top candidate scores below 2.0 benchmark threshold. | CLOSED | MANUAL_REVIEW | INFO_SCORE_BELOW_THRESHOLD | `lib/briefing/scorer.ts` (benchmark only) | March 24: Last measured EV was 2.55 (above 2.0 benchmark). No regression. Informational only. | no | — | — |
| AB13 | Google Calendar + Drive return 0 signals. `scopes:null` in user_tokens. | OPEN | BLOCKED | WARN_MISSING_SCOPES | `user_tokens`, Google OAuth | Gmail syncing (outlook working as proxy). Calendar/Drive still 0 — scopes not stored on re-auth. | no | Requires browser OAuth re-auth. | Brandon must re-authorize Google with calendar+drive scopes via /dashboard/settings. |
| AB18 | Unprocessed signal backlog growing faster than processing budget allows. | OPEN (CRITICAL) | MANUAL_REVIEW | WARN_SIGNAL_BACKLOG_GROWTH | `app/api/cron/nightly-ops/route.ts`, `lib/signals/signal-processor.ts` | March 24 nightly: 601 unprocessed (up from 358). 0 processed in 2 orchestrator attempts + daily-brief. All signal content is ciphertext; `decryptWithStatus` returning `usedFallback: true` for every signal. Processing completely stalled. See AB21. | no | Root cause is encryption/decryption mismatch, not budget. | Investigate ENCRYPTION_KEY in Vercel env vars. See AB21. |
| AB20 | Production smoke suite still treats `/login` and `/start` as public pages even when the stored session is authenticated. | OPEN (NEEDS_REVIEW) | MANUAL_REVIEW | WARN_PROD_SMOKE_EXPECTATION_DRIFT | `tests/production/smoke.spec.ts` | March 23: `npm run test:prod` failed 2 tests because authenticated storage-state was redirected away from `/login` and `/start`. | no | Test expectation mismatch. | Update the production smoke suite to account for authenticated redirects on `/login` and `/start`, then rerun after deploy. |
| AB21 | Signal processing completely stalled — 0 signals processed, all returning ciphertext. | NEW (CRITICAL) | MANUAL_REVIEW | BLOCKER_ALL_SIGNALS_DEAD_KEY | `lib/encryption.ts`, `lib/signals/signal-processor.ts` | March 24 nightly: 601 unprocessed signals. Called `process-unprocessed-signals?maxSignals=50` twice — both returned `processed: 0, remaining: 601`. All signal `content` values are base64 ciphertext. `decryptWithStatus()` fails to decrypt with current ENCRYPTION_KEY. Sync-microsoft encrypts new signals successfully (35 outlook + 14 calendar tonight), but decryption of ALL signals (new and old) fails. No code changes since March 23 when 500 signals were successfully processed. Vercel logs show a single warning per call, no errors. Daily spend is $0 — not a cap issue. | no | Encryption key mismatch between encrypt and decrypt paths, or Vercel env var corruption. Cannot auto-fix — touching encryption.ts is excluded. | (1) Check ENCRYPTION_KEY in Vercel env vars dashboard — compare to .env.local. (2) Check if key was rotated or modified since March 23. (3) Test decryption locally against a signal content sample. |
| AB22 | Commitment count appeared 2x above ceiling — false alarm. | CLOSED (INVALID) | AUTO_FIXABLE | WARN_COMMITMENT_CEILING_BREACH | `tkg_commitments` | March 24 nightly: Initial query used `status = 'active'` (297), but self-heal uses `suppressed_at IS NULL` (150). Ceiling is correctly maintained at 150. Self-heal defense2CommitmentCeiling is working. | yes | False alarm — wrong metric used. | — |

---

## CLOSED Items

| # | Issue | Status | Resolution |
|---|-------|--------|------------|
| AB1 | Generator produces placeholder text in document artifacts. | CLOSED | March 24: No placeholder failures in 4+ days. `make_decision` share dropped to 26%. Close deadline (March 25) met early. |
| AB4 | `make_decision` action type dominates scorer output. | CLOSED | March 24 nightly confirmed: `make_decision` dropped from 48% to 26% of 7-day actions after default fallback fix. |
| AB5 | `.next` cache on local dev machine produces stale type errors requiring manual `rm -rf .next` before build. | CLOSED | Not a code issue. `.next` already in `.gitignore`. Standard Next.js caching behavior. |
| AB6 | Signal processing JSON parse error stalls batch processing. | DONE | Fixed in `ec50ccb`. Verified March 22 nightly: 70 signals processed to 0 remaining. Confirmed working March 23: 500 processed across 10 batches, no errors. |
| AB7 | Top candidate scores below 2.0 benchmark threshold. | CLOSED | March 24: Last measured EV was 2.55 (above 2.0). Informational only. |
| AB8 | Test user `22222222` causes HTTP 500 on daily-brief send because no verified email. | DONE | Fixed in nightly-ops run. `getTriggerResponseStatus` now accepts `partial` status as HTTP 200. |
| AB9 | `tkg_actions.artifact` column NULL; artifact only in `execution_result.artifact`. | DONE | Fixed in nightly-ops run. Both insert paths now populate the `artifact` column. |
| AB10 | `resolveSupabaseAuthUserId` fails in production — `session.user.id` empty, all API routes 401. | DONE | Three-layer fix in `f1ffe65`. |
| AB11 | Self-referential commitment loop. | DONE | Fixed in `a094130`. Filter on `source_context`. |
| AB12 | `foldera_primary_conflict` false positive. | DONE | Fixed in `a094130`. Negative lookahead. |
| AB14 | Homework directive artifacts. | DONE | Fixed in `8b2e92d`. BAD DIRECTIVE rules expanded. |
| AB15 | 26 self-referential commitments active. | DONE | March 23 fix: Suppressed + added extraction filter + prompt exclusion. |
| AB16 | All real goals have `current_priority=false`. | CLOSED (INVALID) | Column only affects suppression query. Fixed via SQL. |
| AB17 | Commitment count 845 unsuppressed — 5.6x ceiling. | DONE | March 23: Enforced via SQL, 150 remaining. Self-heal code verified. |
| AB19 | Playwright verification suite pricing/auth failures. | DONE | March 23: Updated tests, 27/27 e2e + 18/18 prod passed. |
| AB22 | Commitment count appeared 2x above ceiling — false alarm. | CLOSED (INVALID) | Initial query used `status = 'active'` (297), but self-heal uses `suppressed_at IS NULL` (150). Ceiling correctly maintained. |

---
