# AUTOMATION BACKLOG
**Updated:** 2026-03-22 20:30 UTC (full system health audit)

---

## OPEN Items

| # | Issue | Status | Classification | Failure Class | Scope | Evidence | Allowed For Auto-Fix | Reason | Human Action |
|---|-------|--------|----------------|---------------|-------|----------|---------------------|--------|--------------|
| AB1 | Generator produces placeholder text in document artifacts when `make_decision` candidates are redirected to concrete deliverable types. | OPEN (CLOSE-CANDIDATE) | MANUAL_REVIEW | BLOCKER_GENERATOR_VALIDATION | `lib/briefing/generator.ts` | March 22 audit: `make_decision` at 49% of 7-day actions (down from 52% last report, 66% on March 23). Pre-rewrite actions aging out of 7-day window. Last 3 days show schedule/write_document/do_nothing — no placeholder failures. | no | Generator prompt engineering excluded from auto-fix. | Close if no placeholder failures by March 25. |
| AB2 | Zero user approvals in 12+ days (76 actions, 0 approved). The product end-to-end loop is not completing. | OPEN (CRITICAL) | VISION_REQUIRED | INFO_ZERO_APPROVAL_RATE | Product-wide | March 22 audit: 76 actions in 7 days, ALL skipped. Credit score, Google security, and "nothing cleared the bar" dominate. Quality improving (housekeeping down) but not yet producing approvable directives. Self-learning loop cannot activate without at least one approval. | no | Product/quality problem requiring human judgment. | 1. Fix `current_priority` on real goals (AB16). 2. Approve one relevant directive to seed behavioral rate. |
| AB3 | Legacy-encrypted Microsoft data remains unreadable. | OPEN (LOW) | BLOCKED | BLOCKER_TOKEN_DECRYPT | `lib/encryption.ts`, Vercel env config | March 22 audit: Fresh sync healthy (630 outlook + 541 calendar signals). Non-blocking for generation. | no | Requires old encryption key or manual re-auth. | Set `ENCRYPTION_KEY_LEGACY` in Vercel env vars, OR re-authorize Microsoft OAuth. |
| AB4 | `make_decision` action type dominates scorer output. | OPEN (CLOSE-CANDIDATE) | MANUAL_REVIEW | WARN_MAKE_DECISION_DOMINANCE | `lib/briefing/scorer.ts` | March 22 audit: 37/76 = 49% (down from 52%). Same aging-out trajectory as AB1. | no | Scorer excluded from auto-fix. | Close alongside AB1 if share drops below 40% by March 25. |
| AB7 | Top candidate scores below 2.0 benchmark threshold. Pipeline gates on generator confidence (>=70), not scorer EV. | OPEN | MANUAL_REVIEW | INFO_SCORE_BELOW_THRESHOLD | `lib/briefing/scorer.ts` (benchmark only) | March 22 audit: Same status. Generator confidence gates work (71+ passes). The 2.0 is test-only. | no | Threshold tuning is a product decision. | Accept scorer EV as informational. |
| AB15 | 15 self-referential commitments active (Foldera deployment/infra). Vercel notification emails ingested as signals, extracted as commitments. | NEW | AUTO_FIXABLE | WARN_SELF_REFERENTIAL_LEAK | `tkg_commitments`, `lib/signals/signal-processor.ts` | March 22 audit: 15 active commitments with "foldera" in description or source_context. All are deployment failure / security review items from Vercel email notifications. | yes | Can suppress via SQL + add extraction filter. | Suppress existing 15 rows. Add "foldera" to NON_COMMITMENT_PATTERNS in signal-processor.ts. |
| AB16 | All real goals have `current_priority=false`. Only 3 suppression goals (priority 1) have `current_priority=true`. Generator `buildUserIdentityContext()` may produce empty identity context. | CLOSED (INVALID) | — | — | — | Scorer main query and generator identity context query both use `.gte('priority', 3)` without filtering on `current_priority`. The `current_priority` column only affects the suppression goal query (priority < 3). Setting `current_priority=true` on priority >= 3 goals would have no effect on directive quality. Fixed anyway via SQL update on March 23 as part of goal enrichment. | — | — | — |

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
| AB13 | Google Calendar + Drive return 0 signals. `scopes:null` in user_tokens. | OPEN | Unblocked (AB10 fixed). Gmail syncing (144 signals). Calendar/Drive still 0 — scopes not stored on re-auth. Brandon must re-authorize Google with calendar+drive scopes via /dashboard/settings. |
| AB14 | Homework directive artifacts. | DONE | Fixed in `8b2e92d`. BAD DIRECTIVE rules expanded. |

---
