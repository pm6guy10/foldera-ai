# AUTOMATION BACKLOG
**Updated:** 2026-03-20 07:00 UTC (nightly orchestrator, second pass)

---

## OPEN Items

| # | Issue | Status | Classification | Failure Class | Scope | Evidence | Allowed For Auto-Fix | Reason | Human Action |
|---|-------|--------|----------------|---------------|-------|----------|---------------------|--------|--------------|
| AB1 | Generator produces placeholder text in document artifacts when `make_decision` candidates are redirected to concrete deliverable types. Validation correctly catches and blocks, but the LLM consistently fails to produce clean document content for redirected action types. | OPEN | MANUAL_REVIEW | BLOCKER_GENERATOR_VALIDATION | `lib/briefing/generator.ts` (prompt + validation) | March 20 cron (01:58 UTC): 102 candidates, top compound `make_decision` (score 0.55) selected, generator redirected to document, output contained placeholder text, validation blocked. Pattern repeats across 6/8 recent runs where `make_decision` wins. 27 commits in 24h iterated on this without resolution. | no | Generator prompt engineering is excluded from auto-fix scope per task rules (`lib/briefing/generator.ts` is in the never-touch list). | Review generator prompt for `make_decision` → document redirect path. Consider redirecting to `drafted_email` instead (higher LLM success rate — the one `send_message` winner on Mar 19 produced a valid artifact). |
| AB2 | Zero user approvals in 7 days (92 actions, 0 approved). The product end-to-end loop is not completing. Even valid directives with confidence 72-81 are being skipped. | OPEN | VISION_REQUIRED | INFO_ZERO_APPROVAL_RATE | Product-wide | `tkg_actions` 7-day query: Mar 13-20, 92 total actions, 0 approved, 90 skipped, 2 executed. On Mar 19 a valid `send_message` (conf 74) was produced but skipped. | no | This is a product/quality problem requiring human judgment about directive relevance and email delivery. | 1. Check Resend dashboard for delivery status of sent directives. 2. Test approve/skip deep-links in a real email. 3. Evaluate whether directive content matches user needs. |
| AB3 | Legacy-encrypted Microsoft data remains unreadable. Pre-rotation `ENCRYPTION_KEY` needed via `ENCRYPTION_KEY_LEGACY` env var or fresh Microsoft re-auth. | OPEN | BLOCKED | BLOCKER_TOKEN_DECRYPT | `lib/encryption.ts`, Vercel env config | NR2 in FOLDERA_MASTER_AUDIT.md. Fresh sync is healthy (76 mail + 16 calendar tonight), so this is non-blocking for generation but reduces historical context quality. | no | Requires the old encryption key or manual re-authorization. | Set `ENCRYPTION_KEY_LEGACY` in Vercel env vars, OR re-authorize Microsoft OAuth. |
| AB4 | `make_decision` action type dominates scorer output (6/8 recent winners) but has lowest artifact success rate. Scorer favors high-stakes career signals even when tractability is low (0.50). | OPEN | MANUAL_REVIEW | WARN_MAKE_DECISION_DOMINANCE | `lib/briefing/scorer.ts` | March 20: all 3 top candidates were `make_decision` (scores 0.55, 0.50, 0.38). All career domain. The one non-`make_decision` winner (send_message, Mar 19 15:01, score 0.75) produced a valid artifact. | no | Scorer is excluded from auto-fix scope per task rules (`lib/briefing/scorer.ts` is in the never-touch list). | Consider adding a validation-failure-rate penalty so the scorer deprioritizes action types that consistently fail artifact generation. |

---

## CLOSED Items

| # | Issue | Status | Resolution |
|---|-------|--------|------------|
| AB5 | `.next` cache on local dev machine produces stale type errors requiring manual `rm -rf .next` before build. | CLOSED | Not a code issue. `.next` already in `.gitignore`. Standard Next.js caching behavior. |

---
