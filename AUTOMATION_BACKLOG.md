# AUTOMATION BACKLOG
**Updated:** 2026-03-23 UTC (AB10 fix session)

---

## OPEN Items

| # | Issue | Status | Classification | Failure Class | Scope | Evidence | Allowed For Auto-Fix | Reason | Human Action |
|---|-------|--------|----------------|---------------|-------|----------|---------------------|--------|--------------|
| AB1 | Generator produces placeholder text in document artifacts when `make_decision` candidates are redirected to concrete deliverable types. Validation correctly catches and blocks. | OPEN | MANUAL_REVIEW | BLOCKER_GENERATOR_VALIDATION | `lib/briefing/generator.ts` (prompt + validation) | March 22: Today's winner was redirected from `make_decision` to `schedule`/`calendar_event` and passed validation with a concrete artifact. Placeholder blocking is working. However, `make_decision` still produces 52% of 7-day actions (37/71), down from 66% on March 23. Pre-rewrite actions are aging out. | no | Generator prompt engineering is excluded from auto-fix scope per task rules. | Monitor. Today's successful calendar_event generation from a make_decision candidate suggests the redirect path is now working. Close if no placeholder failures in next 3 days. |
| AB2 | Zero user approvals in 11+ days (71 actions, 0 approved). The product end-to-end loop is not completing. | OPEN | VISION_REQUIRED | INFO_ZERO_APPROVAL_RATE | Product-wide | March 22: 71 actions in 7 days, 0 approved. BUT today produced a valid `calendar_event` directive (conf 71) and email was delivered (Resend ID `9e7dbe77`). This is the first concrete artifact email in days. Approval of today's directive would break the 0% streak. | no | This is a product/quality problem requiring human judgment about directive relevance and email delivery. | 1. Check email for today's directive. 2. Approve or skip it — either feeds the behavioral rate. 3. If directive quality is good, the approval rate problem may self-resolve as better artifacts are generated. |
| AB3 | Legacy-encrypted Microsoft data remains unreadable. Pre-rotation `ENCRYPTION_KEY` needed via `ENCRYPTION_KEY_LEGACY` env var or fresh Microsoft re-auth. | OPEN | BLOCKED | BLOCKER_TOKEN_DECRYPT | `lib/encryption.ts`, Vercel env config | March 22: Fresh sync healthy (43 mail + 15 calendar). Non-blocking for generation but reduces historical context. | no | Requires the old encryption key or manual re-authorization. | Set `ENCRYPTION_KEY_LEGACY` in Vercel env vars, OR re-authorize Microsoft OAuth. |
| AB4 | `make_decision` action type dominates scorer output but has ~0% artifact success rate. | OPEN | MANUAL_REVIEW | WARN_MAKE_DECISION_DOMINANCE | `lib/briefing/scorer.ts` | March 22: 37 of 71 actions (52%) are `make_decision` in 7 days, down from 66% on March 23. Today's `make_decision` winner was successfully redirected to `calendar_event` with a valid artifact. Pre-rewrite actions are aging out of the 7-day window. | no | Scorer is excluded from auto-fix scope per task rules. | Monitor over next 3-5 days. If make_decision share drops below 40% and redirected artifacts continue to pass validation, close this item. |
| AB7 | Top candidate score (1.57) below benchmark threshold (2.0). However, pipeline does NOT gate on scorer EV — it gates on generator confidence (>=70). Today's directive passed with confidence 71. | OPEN | MANUAL_REVIEW | INFO_SCORE_BELOW_THRESHOLD | `lib/briefing/scorer.ts` (benchmark only) | March 22: Top candidate scored 1.57 (down from 1.91 on March 23). Generator confidence 71 — above 70 threshold. Directive was persisted and emailed. The 2.0 threshold is a test benchmark, not a production gate. | no | Threshold tuning is a product decision requiring human judgment. | Clarify whether the 2.0 benchmark should be lowered to match actual successful generation (1.57 passed today). Or accept that scorer EV is informational and generator confidence is the real gate. |

---

## CLOSED Items

| # | Issue | Status | Resolution |
|---|-------|--------|------------|
| AB5 | `.next` cache on local dev machine produces stale type errors requiring manual `rm -rf .next` before build. | CLOSED | Not a code issue. `.next` already in `.gitignore`. Standard Next.js caching behavior. |
| AB6 | Signal processing JSON parse error stalls batch processing. | DONE | Fixed in `ec50ccb`. Verified March 22 nightly: 70 signals processed to 0 remaining. Confirmed working March 23: 80 processed to 0 remaining across 2 batches. |
| AB8 | Test user `22222222` causes HTTP 500 on daily-brief send because no verified email. | DONE | Fixed in nightly-ops run. `getTriggerResponseStatus` now accepts `partial` status as HTTP 200. When some users succeed and some fail, response is 200 (not 500). |
| AB9 | `tkg_actions.artifact` column NULL; artifact only in `execution_result.artifact`. | DONE | Fixed in nightly-ops run. Both insert paths (normal directive + no-send wait_rationale) now populate the `artifact` column alongside `execution_result.artifact`. |
| AB10 | `resolveSupabaseAuthUserId` fails in production — `session.user.id` empty, all API routes 401. | DONE | Root cause: test user `22222222` had NULL `confirmation_token`/`recovery_token`/`email_change_token_new` in `auth.users`. GoTrue's Go scanner cannot convert NULL to string, so `admin.listUsers()` returned HTTP 500. Three-layer fix in `f1ffe65`: (1) Data: set NULL columns to empty string, (2) Code: replaced `listUsers()` with `get_auth_user_id_by_email` RPC (direct SQL, avoids GoTrue bug), (3) JWT catch-block fallback queries `user_tokens` by email. |
| AB11 | Self-referential commitment loop. | DONE | Fixed in `a094130`. Filter on `source_context`. |
| AB12 | `foldera_primary_conflict` false positive. | DONE | Fixed in `a094130`. Negative lookahead. |
| AB13 | Google Calendar + Drive return 0 signals. `scopes:null` in user_tokens. | OPEN | Blocked by AB10 — now unblocked. Re-auth Google with all scopes. |
| AB14 | Homework directive artifacts. | DONE | Fixed in `8b2e92d`. BAD DIRECTIVE rules expanded. |

---
