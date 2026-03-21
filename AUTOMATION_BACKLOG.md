# AUTOMATION BACKLOG
**Updated:** 2026-03-23 09:12 UTC (nightly orchestrator)

---

## OPEN Items

| # | Issue | Status | Classification | Failure Class | Scope | Evidence | Allowed For Auto-Fix | Reason | Human Action |
|---|-------|--------|----------------|---------------|-------|----------|---------------------|--------|--------------|
| AB1 | Generator produces placeholder text in document artifacts when `make_decision` candidates are redirected to concrete deliverable types. Validation correctly catches and blocks. | OPEN | MANUAL_REVIEW | BLOCKER_GENERATOR_VALIDATION | `lib/briefing/generator.ts` (prompt + validation) | March 23: `make_decision` still dominates (56/85 = 66% of 7-day actions). However, today's top candidate was `send_message` (score 1.91), not `make_decision`. The `make_decision` candidates (#2 and #3) were suppressed by entity penalty (-30). Generator rewrite (`e4406d7`) and rate floor fix (`4d88228`) have shifted the winner away from `make_decision` for today's run. | no | Generator prompt engineering is excluded from auto-fix scope per task rules. | Monitor whether `send_message` candidates continue winning over `make_decision`. If `make_decision` re-emerges as winner, revisit. |
| AB2 | Zero user approvals in 10+ days (85 actions, 0 approved). The product end-to-end loop is not completing. | OPEN | VISION_REQUIRED | INFO_ZERO_APPROVAL_RATE | Product-wide | 7-day query: 84 skipped, 1 executed, 0 approved. Mar 20: two valid `send_message` directives (conf 73 and 62) were generated but skipped. Mar 21-23: no-send due to score below threshold. | no | This is a product/quality problem requiring human judgment about directive relevance and email delivery. | 1. Check Resend dashboard for delivery status. 2. Test approve/skip deep-links. 3. Consider lowering threshold from 2.0 to 1.8. |
| AB3 | Legacy-encrypted Microsoft data remains unreadable. Pre-rotation `ENCRYPTION_KEY` needed via `ENCRYPTION_KEY_LEGACY` env var or fresh Microsoft re-auth. | OPEN | BLOCKED | BLOCKER_TOKEN_DECRYPT | `lib/encryption.ts`, Vercel env config | Fresh sync healthy (32 mail + 14 calendar on Mar 23). Non-blocking for generation but reduces historical context. | no | Requires the old encryption key or manual re-authorization. | Set `ENCRYPTION_KEY_LEGACY` in Vercel env vars, OR re-authorize Microsoft OAuth. |
| AB4 | `make_decision` action type dominates scorer output (66% of 7-day actions) but has ~0% artifact success rate. | OPEN | MANUAL_REVIEW | WARN_MAKE_DECISION_DOMINANCE | `lib/briefing/scorer.ts` | March 23: 56 of 85 actions (66%) are `make_decision` in 7 days. However, today's run selected `send_message` as winner (score 1.91) — the entity penalty (-30) on `make_decision` candidates is working. As pre-rewrite actions age out of the 7-day window, this percentage should naturally decline. | no | Scorer is excluded from auto-fix scope per task rules. | Monitor over next 3-5 days. If `make_decision` dominance declines as old actions age out, this item can be closed. |
| AB7 | Top candidate score (1.91) just below threshold (2.0). Low urgency (0.3) on commitment-type candidates is the bottleneck. No directive can be sent until a candidate scores >= 2.0. | OPEN | MANUAL_REVIEW | INFO_SCORE_BELOW_THRESHOLD | `lib/briefing/scorer.ts` (threshold) | March 23: send_message candidate scored 1.91. Breakdown: stakes^0.6=2.627, HM(0.47,0.5)=0.485, rate=0.5, novelty=1.0, suppression=1.0, scale=3.0. Urgency_raw=0.3 for a 4-day-old commitment with no hard deadline. | no | Threshold tuning is a product decision requiring human judgment. | Options: (a) lower threshold from 2.0 to 1.8, (b) adjust urgency calculation for commitments, (c) wait for naturally higher-urgency signals. |

---

## CLOSED Items

| # | Issue | Status | Resolution |
|---|-------|--------|------------|
| AB5 | `.next` cache on local dev machine produces stale type errors requiring manual `rm -rf .next` before build. | CLOSED | Not a code issue. `.next` already in `.gitignore`. Standard Next.js caching behavior. |
| AB6 | Signal processing JSON parse error stalls batch processing. | DONE | Fixed in `ec50ccb`. Verified March 22 nightly: 284 signals processed to 0 remaining. Confirmed working March 23: 80 processed to 0 remaining across 2 batches. |

---
