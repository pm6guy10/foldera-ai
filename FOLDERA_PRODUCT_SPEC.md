# FOLDERA PRODUCT SPEC — MASTER AUDIT

Last Updated: March 21, 2026 by Claude Code
Next Review: Monday March 24, 2026

## HOW TO USE THIS FILE

Brandon opens a chat. Drags this file in. Claude reads it, diffs against what CC shipped since last update, writes the next prompt. Brandon pastes to CC. Claude updates this file. That's the loop.

## PHASE 1: SYSTEM INTEGRITY (ship-blocking)

Everything here must be PROVEN before any user sees the product.

### 1.1 Morning Email Delivery

| Item | Status | Evidence | Blocks |
|---|---|---|---|
| Email sends every morning | BUILT | self-heal defense 5, wait_rationale fallback | 3 consecutive mornings unproven |
| Slim wait_rationale (one line) | PROVEN | Resend 9f8ed15d, commit 9033644 | — |
| Real directive email (not just wait_rationale) | BLOCKED | Scorer top candidate 1.05, blocked by constraint | Needs unblocked candidate or more urgent goals |
| Cron fires at 4am PT (11:00 UTC) | BUILT | vercel.json 0 11, commit 791a186 | First live fire unproven |
| Approve/skip buttons in email | FIXED | DB mechanics verified (skip a9d165df, approve 78333ac2). Dashboard had silent error swallowing + auth redirect dropped params. Fixed in this session. | Deploy needed to verify live |

**NEXT MOVE:** Wait for tomorrow 4am cron. Check inbox + Vercel logs. If email arrives, mark 1.1 rows PROVEN. Click Approve in email to verify full round-trip.

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
| Test user gets own directive | PROVEN | Action row 8537c9f5 for user 22222222 | — |
| Test user gets email | NOT PROVEN | no_verified_email (fake email) | Need real test with deliverable address |
| Stranger onboarding flow | NOT STARTED | Never walked as stranger | Gate 5 |

**NEXT MOVE:** Gate 5 prompt after immune system is proven.

### 1.4 Stripe Payment

| Item | Status | Evidence | Blocks |
|---|---|---|---|
| Checkout session creation | NOT TESTED | Code exists (commit 650eba5) | — |
| Webhook handler | NOT TESTED | — | — |
| Subscription written to DB | NOT TESTED | — | — |
| Pro tier unlocked after payment | NOT TESTED | — | — |
| End-to-end test payment | NOT STARTED | — | Revenue |

**NEXT MOVE:** Gate 3 prompt. Stripe test mode, full cycle. After immune system proven.

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
| Goals seeded (ESD, MA4, MAS3 onboard) | PROVEN | 3 rows, top at 1.05 |
| Keri Nopens suppression working | PROVEN | Correctly blocked |
| FPA3 suppression working | PROVEN | Correctly blocked |
| Suppression goals loaded and enforced | BUILT | Scorer now queries `current_priority=true, priority<3` and zeroes matching candidates before scoring |
| Generator identity context from goals | BUILT | Dynamic user context block prepended to LLM prompt from top tkg_goals (not hardcoded). System prompt rewritten to insight/avoidance framing — rejects routine maintenance, calendar holds, generic productivity |
| Consecutive duplicate suppression | BUILT | >50% word-overlap similarity against last 3 tkg_actions rejects and falls through to wait_rationale |
| Gmail sync in nightly-ops | BUILT | `stageSyncGoogle()` added as Stage 1b, mirrors Microsoft pattern, uses `getAllUsersWithProvider('google')` |
| 90-day first-sync lookback | BUILT | Both Microsoft and Google sync already use 90-day lookback on first connect (`!last_synced_at`) |

**Threshold note:** There are two independent scales. The scorer EV (0–5 continuous) ranks candidates — there is no production EV threshold; the "2.0" only exists in the test benchmark. The generator confidence (0–100, LLM self-rated) has two gates: `DIRECTIVE_CONFIDENCE_THRESHOLD = 45` at generation time and `CONFIDENCE_THRESHOLD = 70` for queue reconciliation. Structured logs now include both `scorer_ev` and `generator_confidence` so debugging is unambiguous.

**NEXT MOVE:** Self-optimize will dynamically adjust thresholds based on approval rates. Manual option: lower CONFIDENCE_THRESHOLD.

## PHASE 3: GROWTH READY (post-intelligence)

Only start after Phase 2 deployed.

### 3.1 Onboarding

| Item | Status |
|---|---|
| Stranger signup to first email | NOT TESTED |
| Under 2 minutes, no instructions | NOT TESTED |
| Connect email, see "first brief tomorrow" | NOT TESTED |

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
