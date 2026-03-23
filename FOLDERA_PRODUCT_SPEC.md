# FOLDERA PRODUCT SPEC — MASTER AUDIT

Last Updated: March 22, 2026 (evening audit) by Claude Code
Next Review: Monday March 24, 2026

## HOW TO USE THIS FILE

Brandon opens a chat. Drags this file in. Claude reads it, diffs against what CC shipped since last update, writes the next prompt. Brandon pastes to CC. Claude updates this file. That's the loop.

## PHASE 1: SYSTEM INTEGRITY (ship-blocking)

Everything here must be PROVEN before any user sees the product.

### 1.1 Morning Email Delivery

| Item | Status | Evidence | Blocks |
|---|---|---|---|
| Email sends every morning | PROVEN | Cron fires daily at 11:00 UTC. Actions generated every day March 21-22. Multiple Resend IDs confirmed. wait_rationale fallback works. | — |
| Slim wait_rationale (one line) | PROVEN | Resend 9f8ed15d, commit 9033644 | — |
| Real directive email (not just wait_rationale) | YELLOW | Directives generate and send (schedule, write_document types seen). But all 76 actions in last 7 days were skipped. Quality not yet approvable. AB2 tracks. | Identity context may be starved (AB16) |
| Cron fires at 4am PT (11:00 UTC) | PROVEN | vercel.json `0 11 * * *`. Actions generated at 09:12 UTC on March 22 (cron run). Daily generation confirmed. | — |
| Approve/skip buttons in email | FIXED | DB mechanics verified (skip a9d165df, approve 78333ac2). Dashboard had silent error swallowing + auth redirect dropped params. Fixed in this session. | Deploy needed to verify live |

**NEXT MOVE:** Delivery proven. Quality is the blocker. Fix AB16 (goal current_priority flags) to give generator real identity context. Then approve one good directive to seed the behavioral rate.

### 1.2 Self-Healing (immune system)

| Defense | Status | Evidence | What It Prevents |
|---|---|---|---|
| Token watchdog | BUILT | self-heal.ts, commit 8b3e0fc | Silent sync failure from expired tokens |
| Commitment ceiling (150) | BUILT | self-heal.ts, commit 8b3e0fc | Commitment explosion poisoning scorer |
| Signal backlog drain + dead_key | BUILT | self-heal.ts, commit 8b3e0fc | Undecryptable signals clogging queue forever |
| Queue hygiene (24h auto-skip) | BUILT | self-heal.ts, commit 8b3e0fc | Stale approvals blocking fresh generation |
| Health alert email | BUILT | self-heal.ts, commit 8b3e0fc | Silent failures with no notification |

**NEXT MOVE:** All defenses run for first time at tonight's 4am cron. Check Vercel logs for structured JSON from each defense. Update each to PROVEN with log evidence.

### 1.3 Multi-User

| Item | Status | Evidence | Blocks |
|---|---|---|---|
| Test user gets own directive | PROVEN | Action rows for user 22222222 (multiple runs). Latest: `fb02af62` do_nothing on 2026-03-22 | — |
| Test user gets email | NOT PROVEN | `no_verified_email` — test user has fake email `gate2-test@foldera.ai` | Need real OAuth signup with deliverable address |
| Stranger onboarding flow (code paths) | VERIFIED | Code audit: empty goals→graceful, empty signals→null/wait_rationale, 90d first-sync, no hardcoded user IDs, trial banner only for past_due | — |
| Stranger onboarding flow (live) | NOT TESTED | Requires real OAuth sign-up with a real email address. Cannot be automated without browser. | Manual test needed |

**NEXT MOVE:** Brandon or a real test user signs up via /start → Google OAuth → connects email → waits for next nightly-ops cron → verifies email arrives.

### 1.4 Stripe Payment

| Item | Status | Evidence | Blocks |
|---|---|---|---|
| Stripe keys configured | CANNOT VERIFY | `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` checked at runtime in checkout/webhook routes. Cannot read Vercel env vars from CI. Brandon must verify in Vercel dashboard. | — |
| API version | NOTE | Routes use `apiVersion: '2025-08-27.basil'` cast as `any`. This is a future-dated API version string. Verify it matches the Stripe dashboard. | — |
| Checkout session creation | NOT TESTED | Code exists (commit 650eba5). Route: `/api/stripe/checkout` | — |
| Webhook handler | NOT TESTED | Route: `/api/stripe/webhook`. Handles `checkout.session.completed`, `invoice.payment_succeeded`, `invoice.payment_failed`, `customer.subscription.deleted` | — |
| Subscription written to DB | NOT TESTED | — | — |
| Pro tier unlocked after payment | NOT TESTED | — | — |
| End-to-end test payment | NOT STARTED | — | Revenue |

**STATUS:** Stripe is Gate 3, not blocking Phase 1. Stripe keys cannot be verified from CI (Vercel env vars not readable). Checkout and webhook routes exist but are untested. `apiVersion: '2025-08-27.basil'` is cast as `any` — Brandon must verify it matches the Stripe dashboard API version. Brandon must verify `STRIPE_SECRET_KEY`, `STRIPE_PRO_PRICE_ID`, and `STRIPE_WEBHOOK_SECRET` are set in Vercel env vars.

### 1.5 Acceptance Gate

| Item | Status | Evidence | Blocks |
|---|---|---|---|
| acceptance-gate.ts script | BUILT | `lib/cron/acceptance-gate.ts`, 7 checks: AUTH, TOKENS, SIGNALS, COMMITMENTS, GENERATION, DELIVERY, SESSION | — |
| Wired into nightly-ops | BUILT | Stage 6 in `app/api/cron/nightly-ops/route.ts` | First live fire unproven |
| Alert on failure | BUILT | Sends to b.kapp1010@gmail.com via Resend on any FAIL | — |
| CLAUDE.md/AGENTS.md updated | DONE | Session log appended | — |

**NEXT MOVE:** Wait for next nightly-ops cron (11:00 UTC). Check Vercel logs for acceptance_gate_result event. If all 7 checks PASS, mark items PROVEN.

## PHASE 2: PRODUCT INTELLIGENCE (post-integrity)

Only start after Phase 1 is fully PROVEN.

### 2.1 Self-Learning

| Item | Status | Evidence |
|---|---|---|
| Auto-suppress after 3 skips on same entity | BUILT | `checkAndCreateAutoSuppressions` in scorer.ts, source=auto_suppression |
| Auto-lift suppression on approval | BUILT | Same function, deletes auto_suppression goals on matching executed action within 7d |
| Feedback loop into scorer | PROVEN | commit 3da2129 |
| Goal priority promotion from signal frequency | BUILT | conversation-extractor: confidence >= 80 promotes priority by 1, resets to 60 |
| Goal consolidation (fuzzy dedup) | BUILT | conversation-extractor: Jaccard similarity > 0.5 merges into existing goal |

**PROMPT READY:** Self-learn prompt written, locked in LESSONS_LEARNED.md.

### 2.2 Self-Optimizing

| Item | Status | Blocks |
|---|---|---|
| Dynamic threshold from approval rates | NOT STARTED | Self-learn deployed |
| Per-user threshold in DB | NOT STARTED | Self-learn deployed |
| Weekly adjustment (Sun nightly-ops) | NOT STARTED | Self-learn deployed |

**PROMPT READY:** Self-optimize prompt written, locked in LESSONS_LEARNED.md.

### 2.3 Scorer Quality

| Item | Status | Evidence |
|---|---|---|
| Goals seeded (ESD, MA4, MAS3 onboard) | UPDATED | 3 key goals enriched with entity names (Yadira Clapper, Mike George, Teo Bicchieri, Ricky Luna, Claim 2MFDBB-007, RCW 50.20.190). All 9 priority>=3 goals set current_priority=true. March 23. |
| Keri Nopens suppression working | PROVEN | Correctly blocked |
| FPA3 suppression working | PROVEN | Correctly blocked |
| Suppression goals loaded and enforced | BUILT | Scorer now queries `current_priority=true, priority<3` and zeroes matching candidates before scoring |
| Generator identity context from goals | BUILT | Dynamic user context block prepended to LLM prompt from top tkg_goals (not hardcoded). System prompt rewritten to insight/avoidance framing — rejects routine maintenance, calendar holds, generic productivity |
| Consecutive duplicate suppression | BUILT | >50% word-overlap similarity against last 3 tkg_actions rejects and falls through to wait_rationale |
| Gmail sync in nightly-ops | BUILT | `stageSyncGoogle()` added as Stage 1b, mirrors Microsoft pattern, uses `getAllUsersWithProvider('google')` |
| 90-day first-sync lookback | BUILT | Both Microsoft and Google sync already use 90-day lookback on first connect (`!last_synced_at`) |
| Extraction noise filter (C) | BUILT | 8 new NON_COMMITMENT_PATTERNS: security alerts, newsletters, billing, promotions, credit monitoring, tool mgmt, self-referential, mass registrations. Commit `91e3e76` |
| Scorer noise pre-filter (A) | BUILT | NOISE_CANDIDATE_PATTERNS removes housekeeping/tool/notification candidates before scoring loop. Commit `91e3e76` |
| Generator quality examples (B) | BUILT | Concrete good/bad examples in SYSTEM_PROMPT, schedule_block housekeeping rejection gate. Commit `91e3e76` |
| Directive quality: housekeeping eliminated | REGRESSED | March 22 audit: "Schedule a 30-minute block to review Google account security settings" and "check your credit score" directives still generated and emailed. Noise filter catches some but not all housekeeping. Needs filter expansion. |

**Threshold note:** There are two independent scales. The scorer EV (0–5 continuous) ranks candidates — there is no production EV threshold; the "2.0" only exists in the test benchmark. The generator confidence (0–100, LLM self-rated) has two gates: `DIRECTIVE_CONFIDENCE_THRESHOLD = 45` at generation time and `CONFIDENCE_THRESHOLD = 70` for queue reconciliation. Structured logs now include both `scorer_ev` and `generator_confidence` so debugging is unambiguous.

**NEXT MOVE:** Self-optimize will dynamically adjust thresholds based on approval rates. Manual option: lower CONFIDENCE_THRESHOLD.

## PHASE 3: GROWTH READY (post-intelligence)

Only start after Phase 2 deployed.

### 3.1 Onboarding

| Item | Status |
|---|---|
| Stranger signup to first email | CODE VERIFIED | Code paths verified: CTA→/start, OAuth (Google+Microsoft), redirect→/dashboard, 90d first-sync, empty state handling. Live test requires real signup. |
| Under 2 minutes, no instructions | CODE VERIFIED | /start page: OAuth buttons + copy "Your first read arrives tomorrow at 7am". No manual steps between OAuth consent and dashboard. |
| Connect email, see "first brief tomorrow" | CODE VERIFIED | /start copy at line 23: "Your first read arrives tomorrow at 7am". Auto-sync triggers after OAuth connect. |
| Session persists across tab close/reopen | FIXED | March 23: removed `prompt:'consent'` from Google OAuth (forced re-consent on every visit). Added middleware auth guard for /dashboard/* (edge redirect to /login if no session cookie). Changed NextAuth signIn page from /start to /login. Deploy needed to verify live. |
| Middleware auth guard for /dashboard | BUILT | middleware.ts checks for NextAuth session cookie on /dashboard/* routes. Redirects to /login with callbackUrl preserving original URL. |
| Pricing copy consistent | FIXED | "14 days free. Cancel anytime." → "No credit card required." across landing, /pricing, /try, /login. $29/month consistent. |

### 3.2 Landing Page

| Item | Status |
|---|---|
| Hero with mechanism visualization | BUILT (72a36f3) |
| $29 pricing | BUILT |
| "Finished work, every morning" copy | BUILT |

### 3.3 Distribution

| Item | Status |
|---|---|
| 5 strangers using the product | NOT STARTED |
| First paid subscriber | NOT STARTED |
| 3 consecutive days all users get email | NOT STARTED |

## PRIORITY QUEUE (what to do next, in order)

1. **WAIT** — Tomorrow 4am cron is the test. Check inbox + Vercel logs.
2. **IF CRON WORKS** — Mark Phase 1.1 and 1.2 items PROVEN. Write Gate 3 (Stripe) prompt.
3. **IF CRON FAILS** — Read Vercel logs, write fix prompt, re-run.
4. **After Stripe proven** — Gate 5 (onboarding walkthrough) prompt.
5. **After Gates 3-5** — Gate 6 (acceptance-gate.ts) prompt.
6. **After Phase 1 complete** — Self-learn prompt.
7. **After self-learn** — Self-optimize prompt.
8. **After Phase 2 complete** — Put it in front of 5 strangers.

## LOCKED DECISIONS (never relitigate)

- Free tier, no credit card. Pro $29/mo for artifacts.
- Keri Nopens outreach: post-MAS3 only.
- FPA3: suppressed.
- Nicole Vreeland: never an active reference.
- One-page resume. No methodology name-dropping.
- Brandon is never the training mechanism.
- Morning email always arrives. Silence is a bug.
- Codex/CC primary builder. Claude is PM. Brandon is vision.
