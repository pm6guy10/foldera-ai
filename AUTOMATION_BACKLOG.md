# AUTOMATION BACKLOG
**Updated:** 2026-03-22 07:00 UTC (nightly orchestrator)

---

## OPEN Items

| # | Issue | Status | Classification | Failure Class | Scope | Evidence | Allowed For Auto-Fix | Reason | Human Action |
|---|-------|--------|----------------|---------------|-------|----------|---------------------|--------|--------------|
| AB1 | Generator produces placeholder text in document artifacts when `make_decision` candidates are redirected to concrete deliverable types. Validation correctly catches and blocks, but the LLM consistently fails to produce clean document content for redirected action types. | OPEN | MANUAL_REVIEW | BLOCKER_GENERATOR_VALIDATION | `lib/briefing/generator.ts` (prompt + validation) | March 22 cron: reused pre-fix no-send result. `92dbbfc` fix (signal evidence enrichment + bracket rejection) deployed 02:36 UTC, after today's 01:58 UTC generation. Fix has NOT been exercised yet. `make_decision` dominates scorer output (57/89 = 64% in 7 days). Pattern repeats across 9+ consecutive runs where `make_decision` wins. | no | Generator prompt engineering is excluded from auto-fix scope per task rules (`lib/briefing/generator.ts` is in the never-touch list). `92dbbfc` may resolve this — wait for next cron cycle. | Wait for March 23 cron to test `92dbbfc`. If still failing: allow `decision_frame` as valid artifact type, or redirect `make_decision` winners to `drafted_email`, or add scorer penalty for validation-failing action types. |
| AB2 | Zero user approvals in 9+ days (89 actions, 0 approved). The product end-to-end loop is not completing. Most recent days produce only `do_nothing` (conf 0) because generation validation fails. | OPEN | VISION_REQUIRED | INFO_ZERO_APPROVAL_RATE | Product-wide | `tkg_actions` 7-day query: 88 skipped, 1 executed, 0 approved. On Mar 19 a valid `send_message` (conf 74, email to Keri Nopens about MAS3 timeline) was produced but skipped. Mar 20-22 produce only no-send due to AB1. | no | This is a product/quality problem requiring human judgment about directive relevance and email delivery. | 1. Check Resend dashboard for delivery status. 2. Test approve/skip deep-links. 3. Evaluate directive relevance. 4. Consider whether generation validation is too strict. |
| AB3 | Legacy-encrypted Microsoft data remains unreadable. Pre-rotation `ENCRYPTION_KEY` needed via `ENCRYPTION_KEY_LEGACY` env var or fresh Microsoft re-auth. | OPEN | BLOCKED | BLOCKER_TOKEN_DECRYPT | `lib/encryption.ts`, Vercel env config | Fresh sync healthy (12 mail + 15 calendar on Mar 22). Non-blocking for generation but reduces historical context. | no | Requires the old encryption key or manual re-authorization. | Set `ENCRYPTION_KEY_LEGACY` in Vercel env vars, OR re-authorize Microsoft OAuth. |
| AB4 | `make_decision` action type dominates scorer output (9+ consecutive winners) but has ~0% artifact success rate. Scorer favors high-stakes career signals even when tractability is low. | OPEN | MANUAL_REVIEW | WARN_MAKE_DECISION_DOMINANCE | `lib/briefing/scorer.ts` | March 22: 57 of 89 actions (64%) are `make_decision` in 7 days. All career domain. The one non-`make_decision` winner (send_message, Mar 19, conf 74) produced a valid artifact but was skipped. | no | Scorer is excluded from auto-fix scope per task rules (`lib/briefing/scorer.ts` is in the never-touch list). | Add validation-failure-rate penalty to scorer, or allow `decision_frame` artifacts for `make_decision` winners. |

---

## CLOSED Items

| # | Issue | Status | Resolution |
|---|-------|--------|------------|
| AB5 | `.next` cache on local dev machine produces stale type errors requiring manual `rm -rf .next` before build. | CLOSED | Not a code issue. `.next` already in `.gitignore`. Standard Next.js caching behavior. |
| AB6 | Signal processing JSON parse error stalls batch processing. | DONE | Fixed in `ec50ccb`. Verified March 22 nightly: 284 signals processed to 0 remaining across 6 batches. No stalls. |

---
