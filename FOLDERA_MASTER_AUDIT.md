# FOLDERA MASTER AUDIT — Single Source of Truth
**Created:** March 16, 2026
**Sources:** Codex production audit (39 findings), codebase audit (18 findings), GTM audit (10 perspectives)
**Rule:** Nothing gets added to the build queue unless it's on this list. Nothing gets marked done unless it's pushed to main and verified.

---

## CRITICAL — Fix before any user touches the product

| # | Issue | Source | Status |
|---|-------|--------|--------|
| C1 | INGEST_USER_ID routing all user data to owner account (google callback, ms sync-now, priorities) | Codex | DONE — Session 1, commit 47e2c17 |
| C2 | Unencrypted webhook signal content in resend webhook | Codex | DONE — Session 1, commit 47e2c17 |
| C3 | Dual token storage: integrations vs user_tokens tables don't communicate. Sync reads user_tokens, refresh reads integrations. Token expires hourly, sync breaks silently. | Codebase audit #1 | DONE — March 16, commit ffc5f28 |
| C4 | Dual encryption: lib/encryption.ts uses 12-byte IV, lib/crypto/token-encryption.ts uses 16-byte IV. Same key, incompatible output. | Codebase audit #2 | DONE — March 16, commit c3ff5db |

## HIGH — Fix before inviting waitlist

| # | Issue | Source | Status |
|---|-------|--------|--------|
| H1 | Generation failures persist directives with null artifacts | Codex | DONE — Session 2, commit b8a1406 |
| H2 | __GENERATION_FAILED__ sentinel not caught in onboard routes | Codex | DONE — Session 2, commit b8a1406 |
| H3 | executeAction() unwrapped in execute and drafts/decide routes | Codex | DONE — Session 2, commit b8a1406 |
| H4 | Briefing cached even on generation failure | Codex | DONE — Session 2, commit b8a1406 |
| H5 | Unauthenticated spend endpoint | Codex | DONE — March 16, commit e228ee9 |
| H6 | Unauthenticated stripe checkout | Codex | DONE — March 16, commit e228ee9 |
| H7 | Unvalidated/unrated onboard goals and ingest endpoints | Codex | DONE — March 16, commit e228ee9 |
| H8 | daily-send emails all directives to single DAILY_BRIEF_TO_EMAIL address | Codex | DONE — Session 1, commit 47e2c17 |
| H9 | daily-generate runs for temp onboarding users, expanding cost | Codex | DONE — Session 1, commit 47e2c17 |
| H10 | Decrypt failures crash scorer (lines 369, 379, 476, 628, 1537, 1554) | Codex | OPEN — Session 4 |
| H11 | Production logs contain directive titles, scores, behavioral content | Codex | OPEN — Session 4 |
| H12 | Hardcoded user-specific blacklist in generator prompt | Codex | OPEN — Session 4 |
| H13 | Google OAuth can't connect alongside Microsoft (swaps provider instead of adding) | Codebase audit #3 | DONE — March 16, commit 3a8e107 |
| H14 | 5,254 lines dead agent/acquisition/growth code | Codebase audit #5 | DONE — March 16, commit 27d8665 |
| H15 | Onboarding flow doesn't use new sync pipeline, tries to generate from nothing | Codebase audit #6, GTM audit | DONE — March 16, commit 1d0df69 |
| H16 | Resend sending from onboarding@resend.dev (shared domain, spam risk) | Codebase audit #8, GTM audit | OPEN — manual task |
| H17 | Relationships page expects briefing.cooling_relationships that API never returns | Codex | OPEN |
| H18 | Pricing mismatch: LP says $19, Stripe says $29/$99 | GTM audit | OPEN — manual task |
| H19 | Messaging fragmented: three different taglines across LP, /start, login | GTM audit | OPEN |

## MEDIUM — Fix before measuring retention

| # | Issue | Source | Status |
|---|-------|--------|--------|
| M1 | briefing/latest ignores errors on four parallel Supabase reads | Codex | OPEN |
| M2 | graph/stats ignores errors on four parallel reads | Codex bug scan | OPEN |
| M3 | Generator caches briefing on __GENERATION_FAILED__ | Codex | DONE — Session 2 |
| M4 | conviction/latest route contract doesn't match implementation | Codex | OPEN |
| M5 | integrations/status returns 200 on query failure | Codex | OPEN |
| M6 | subscription/status has no error handling | Codex | OPEN |
| M7 | Google and Microsoft disconnect routes ignore update result | Codex | OPEN |
| M8 | Waitlist capture shows success on network failure (LP and /try) | Codex | OPEN |
| M9 | Pricing page hardcodes Stripe price ID, loading state never clears on error | Codex | OPEN |
| M10 | Dashboard conviction loading has no skeleton state | Codex | OPEN |
| M11 | Email deep-link approve/skip doesn't check response status | Codex | OPEN |
| M12 | Signals dashboard shows hardcoded data instead of real API values | Codex | OPEN |
| M13 | growth-scanner cron still active in vercel.json | Codebase audit #7 | DONE — March 16, commit 27d8665 |
| M14 | Dashboard doesn't show Microsoft data freshness | Codebase audit #9 | DONE — March 16, commit f1f09aa |
| M15 | Signal summaries not being generated (no long-term memory) | Codebase audit #10 | DONE — March 16, commit f1f09aa |
| M16 | Goals not seeded from current real data | Codebase audit #11 | OPEN |
| M17 | Encryption verification needed after C4 fix | Codebase audit #12 | BLOCKED by C4 |
| M18 | No rate limiting on sync-now endpoints | Codebase audit #18 | OPEN |
| M19 | Onboarding funnel backwards: OAuth before value delivery | GTM audit | OPEN |
| M20 | Zero social proof, testimonials, or distribution | GTM audit | OPEN — post-launch |

## LOW — Cleanup when stable

| # | Issue | Source | Status |
|---|-------|--------|--------|
| L1 | LP and /try demo swallow all errors into generic message | Codex | OPEN |
| L2 | Draft queue returns null while loading (no skeleton) | Codex | OPEN |
| L3 | Trial banner checkout failure goes to console.error only | Codex | OPEN |
| L4 | Settings fetch failures logged with console.error in production | Codex | OPEN |
| L5 | Stale Supabase edge functions in supabase/functions/ | Codebase audit #13 | DONE — March 16, commit b062a28 |
| L6 | Orphaned migration scripts in scripts/ | Codebase audit #14 | DONE — March 16, commit b062a28 |
| L7 | Duplicate PostCSS configs | Codebase audit #15 | DONE — March 16, commit b062a28 |
| L8 | Dead dashboard/briefing redirect page | Codebase audit #16 | DONE — March 16, commit b062a28 |
| L9 | Test infrastructure incomplete, not in CI | Codebase audit #17 | OPEN |

---

## SESSION LOG

| Session | Date | Scope | Commit | Files |
|---------|------|-------|--------|-------|
| 1 | March 16 | Data isolation (C1, C2, H8, H9) | 47e2c17 | 8 files, +261/-155 |
| 2 | March 16 | Error boundaries (H1, H2, H3, H4) | b8a1406 | 6 files, +235/-169 |
| 3 | March 16 | Auth gates (H5, H6, H7) | IN PROGRESS | — |
| 4 | Queued | Decrypt resilience + logging (H10, H11, H12) | — | — |
| 5 | Queued | Token unification (C3) | — | — |
| 6 | Queued | Encryption standardization (C4) | — | — |
| 7 | Queued | Dead code removal (H14) | — | — |
| 8 | Queued | Google standalone OAuth (H13) | — | — |
| 9 | Queued | Onboarding flow fix (H15, M19) | — | — |

---

## MANUAL TASKS (no code)

| Task | Status |
|------|--------|
| Verify Resend custom domain (mail.foldera.ai), add DKIM/SPF/DMARC, update RESEND_FROM_EMAIL env var | OPEN |
| Match LP price to Stripe ($29 not $19) or strip pricing section | OPEN |
| Check waitlist size in Supabase | OPEN |
| Walk full OAuth flow as stranger, screenshot every step | OPEN — do after Session 9 |
| Invite 5 real humans manually | OPEN — do after all critical/high fixes |
| Add one-click unsubscribe header to email template | OPEN |

---

## RULES

1. This file is the single source of truth. If it's not on this list, it's not a priority.
2. Sessions work top to bottom. No skipping ahead to fun stuff.
3. Nothing gets marked DONE without a commit hash and verified build.
4. New issues found by daily bug scan get added here with source "Codex automation" and triaged into the right severity.
5. GTM/product decisions are made in the Claude planning project and reflected here as manual tasks or session prompts.
