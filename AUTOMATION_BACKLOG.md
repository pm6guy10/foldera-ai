# AUTOMATION BACKLOG
**Updated:** 2026-03-21 07:00 UTC (nightly orchestrator)

---

## OPEN Items

| # | Issue | Status | Classification | Failure Class | Scope | Evidence | Allowed For Auto-Fix | Reason | Human Action |
|---|-------|--------|----------------|---------------|-------|----------|---------------------|--------|--------------|
| AB1 | Generator produces placeholder text in document artifacts when `make_decision` candidates are redirected to concrete deliverable types. Validation correctly catches and blocks, but the LLM consistently fails to produce clean document content for redirected action types. | OPEN | MANUAL_REVIEW | BLOCKER_GENERATOR_VALIDATION | `lib/briefing/generator.ts` (prompt + validation) | March 21 cron: 102 candidates, top compound `make_decision` (score 0.55) selected, generator redirected to document, output contained placeholder text, validation blocked. Pattern repeats across 8+ consecutive runs where `make_decision` wins. | no | Generator prompt engineering is excluded from auto-fix scope per task rules (`lib/briefing/generator.ts` is in the never-touch list). | Review generator prompt for `make_decision` → document redirect path. Consider allowing `decision_frame` as a valid concrete artifact type, or redirecting `make_decision` winners to `drafted_email` (higher LLM success rate). |
| AB2 | Zero user approvals in 8 days (92 actions, 0 approved). The product end-to-end loop is not completing. Most recent days produce only `do_nothing` (conf 0) because generation validation fails. | OPEN | VISION_REQUIRED | INFO_ZERO_APPROVAL_RATE | Product-wide | `tkg_actions` 7-day query: 90 skipped, 2 executed, 0 approved. On Mar 19 a valid `send_message` (conf 74) was produced but skipped. Mar 20-21 produce only no-send due to AB1. | no | This is a product/quality problem requiring human judgment about directive relevance and email delivery. | 1. Check Resend dashboard for delivery status. 2. Test approve/skip deep-links. 3. Evaluate directive relevance. 4. Consider whether generation validation is too strict. |
| AB3 | Legacy-encrypted Microsoft data remains unreadable. Pre-rotation `ENCRYPTION_KEY` needed via `ENCRYPTION_KEY_LEGACY` env var or fresh Microsoft re-auth. | OPEN | BLOCKED | BLOCKER_TOKEN_DECRYPT | `lib/encryption.ts`, Vercel env config | Fresh sync healthy (76 mail + 17 calendar on Mar 21). Non-blocking for generation but reduces historical context. | no | Requires the old encryption key or manual re-authorization. | Set `ENCRYPTION_KEY_LEGACY` in Vercel env vars, OR re-authorize Microsoft OAuth. |
| AB4 | `make_decision` action type dominates scorer output (8+ consecutive winners) but has ~0% artifact success rate. Scorer favors high-stakes career signals even when tractability is low (0.50). | OPEN | MANUAL_REVIEW | WARN_MAKE_DECISION_DOMINANCE | `lib/briefing/scorer.ts` | March 21: all 3 top candidates were `make_decision` (scores 0.55, 0.50, 0.38). All career domain. The one non-`make_decision` winner (send_message, Mar 19) produced a valid artifact. | no | Scorer is excluded from auto-fix scope per task rules (`lib/briefing/scorer.ts` is in the never-touch list). | Add validation-failure-rate penalty to scorer, or allow `decision_frame` artifacts for `make_decision` winners. |
| AB6 | Signal processing JSON parse error stalls batch processing. | DONE | AUTO_FIXABLE | WARN_SIGNAL_PROCESSING_STALL | `lib/signals/signal-processor.ts` | Fixed in `ec50ccb`. Two changes: (1) try extracting JSON array from LLM response when full parse fails (handles trailing text), (2) if parse still fails, mark signals as processed with empty extractions instead of leaving them stuck. | yes | Fixed. | None. |

---

## CLOSED Items

| # | Issue | Status | Resolution |
|---|-------|--------|------------|
| AB5 | `.next` cache on local dev machine produces stale type errors requiring manual `rm -rf .next` before build. | CLOSED | Not a code issue. `.next` already in `.gitignore`. Standard Next.js caching behavior. |

---
