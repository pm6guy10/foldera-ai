# FOLDERA PRODUCT SPEC — MASTER AUDIT

Last Updated: March 30, 2026 (trigger→action lock: deterministic mapping for all 9 discrepancy classes)
Next Review: Monday March 31, 2026

## HOW TO USE THIS FILE

Brandon opens a chat. Drags this file in. Claude reads it, diffs against what CC shipped since last update, writes the next prompt. Brandon pastes to CC. Claude updates this file. That's the loop.

## PHASE 1: SYSTEM INTEGRITY (ship-blocking)

Everything here must be PROVEN before any user sees the product.

### 1.1 Morning Email Delivery

| Item | Status | Evidence | Blocks |
|---|---|---|---|
| Email sends every morning | PROVEN | Cron fires daily at 11:00 UTC. Actions generated every day March 21-22. Multiple Resend IDs confirmed. wait_rationale fallback works. | — |
| Slim wait_rationale (one line) | PROVEN | Resend 9f8ed15d, commit 9033644 | — |
| Real directive email (not just wait_rationale) | YELLOW | Directives generate and send. March 24: generator rewritten to behavioral-analyst mode. March 28: discrepancy detection live — scorer_ev 4.37, all top 3 candidates are discrepancies. Generator freshness gate blocks them (stale evidence rejection). Fix in progress. | Generator freshness exemption for discrepancy type |
| Discrepancy detection | PROVEN | commit `fab67f4` (2026-03-28). 9 extractors (5 absence + 4 delta). 59 unit tests. March 30: trust_class decontamination deployed (commit `ef3a4c5`) — personal entities (krista, emmett) eliminated from candidate pool. Fresh receipt: sam devore (trusted, #1), financial runway (#2). Action `4d5188bf`: `send_message`, confidence=77, `pending_approval`. March 30: Trigger→Action Lock deployed (commit `17ce0b6`) — all 9 classes have deterministic action mapping, TRIGGER_CONTEXT prompt injection, post-gen validation. 62 enforcement tests. | — |
| Cron fires at 4am PT (11:00 UTC) | PROVEN | vercel.json `0 11 * * *`. Actions generated at 09:12 UTC on March 22 (cron run). Daily generation confirmed. | — |
| Approve/skip buttons in email | FIXED | DB mechanics verified (skip a9d165df, approve 78333ac2). Dashboard had silent error swallowing + auth redirect dropped params. Fixed in this session. | Deploy needed to verify live |

**NEXT MOVE:** Discrepancy detector live and winning the scorer. Two generator gates block candidates from reaching the LLM: (1) freshness gate — add `|| winner.type === 'discrepancy'` bypass, (2) entity suppression — add `&& winner.type !== 'discrepancy'` guard. Fix both, trigger nightly-ops, confirm `generator_confidence > 45`, read artifact text to verify genuine discrepancy observation (not a renamed task).

Production E2E coverage note (March 26): added Path B "Generate Now" smoke coverage in `tests/production/smoke.spec.ts` to assert the settings-page run-brief flow yields a visible action card after the POST completes. Test is pending full verification because local `npm run build` currently fails on a duplicate `isNewAccount` definition (see `FOLDERA_MASTER_AUDIT.md`).

March 24 production hotfix evidence:
- `tkg_actions.id = 504c171f-50dc-473f-afdc-cdfc53f15894` from a live `POST https://www.foldera.ai/api/cron/nightly-ops` run now preserves `execution_result.generation_log.stage = "generation"` and the real Anthropic billing error in `generation_log.reason` instead of collapsing to `stage = "system"`.
- `api_usage` helper/schema alignment verified live with rows `be76ef5c-40af-4543-9cb3-37db0cf27d16` and `80aaeaaa-c6bb-4458-bf9e-78fe72d5fdd6`, both written with the `endpoint` column on March 24.
- Manual `POST https://www.foldera.ai/api/settings/run-brief` for the signed-in owner now stays on the session user path, created `tkg_actions.id = 6e555f8f-d28c-4400-b3bd-c77c9d3c9715` with `status = pending_approval`, and returned `send.results[0].code = "email_already_sent"` because the owner had already been sent today’s brief on `tkg_actions.id = a2481a04-9097-4546-b782-6437c2688c8d` at `2026-03-24T02:26:26.519Z`.

### 1.2 Self-Healing (immune system)

| Defense | Status | Evidence | What It Prevents |
|---|---|---|---|
| Token watchdog | BUILT | self-heal.ts, commit 8b3e0fc | Silent sync failure from expired tokens |
| Commitment ceiling (150) | BUILT | self-heal.ts, commit 8b3e0fc | Commitment explosion poisoning scorer |
| Commitment ceiling now runs at pipeline start | BUILT | March 24 cleanup pass: `/api/cron/nightly-ops` now runs `runCommitmentCeilingDefense()` before sync/signal processing so daytime commitment growth cannot poison scoring until the end-of-run self-heal phase. |
| Commitment ceiling batching/count fix | BUILT | March 24 cleanup pass: `defense2CommitmentCeiling()` now uses exact per-user counts and chunked updates (`UPDATE_BATCH_SIZE = 200`) so large suppressions do not fail with PostgREST `Bad Request` on oversized `in(...)` payloads. |
| 180-day extracted signal retention cleanup | BUILT | March 24 cleanup pass: `/api/cron/nightly-ops` now deletes `tkg_signals` rows older than 180 days with non-null `extracted_entities` at pipeline start, per user, before signal processing. |
| Signal backlog drain + dead_key | BUILT | self-heal.ts, commit 8b3e0fc | Undecryptable signals clogging queue forever |
| Nightly backlog auto-throttle | BUILT | March 24 follow-up: `/api/cron/nightly-ops` now counts all `tkg_signals` rows with `processed = false` before Stage 2 (not just extractable sources), stays at 50x3 below 100 queued signals, and automatically expands to 100x10 when backlog reaches 100+; structured logs now emit `nightly_ops_signal_mode = "low"|"high"` with the chosen batch/round values. |
| Queue hygiene (24h auto-skip) | BUILT | self-heal.ts, commit 8b3e0fc | Stale approvals blocking fresh generation |
| Health alert email | BUILT | March 24 production hardening sweep: `lib/cron/connector-health.ts` now checks 7-day signal coverage per connected provider/source (`google_calendar`, `google_drive`, `onedrive`), sends one Resend alert per flagged source, and rate-limits with `user_tokens.last_health_alert_at`. | Silent failures with no notification |
| `/api/health` JSON contract for cron checker | BUILT | March 24 follow-up: added `app/api/health/route.ts` returning JSON `{ status, ts, db, env }` with `status = "ok" | "degraded"` so `/api/cron/health-check` can parse `healthRes.json()` instead of receiving an HTML 404 and sending false alert emails. Local verification returned HTTP 200 `application/json` with `{\"status\":\"ok\",...}`. | False-positive health alert spam from JSON parse failures |
| Feedback signal source constraint restored | BUILT | March 24 data-fix pass: `tkg_signals_source_check` migration restored `user_feedback`, matching the approve/skip insert path in `executeAction()`. |
| Test-token persistence guard | BUILT | March 24 data-fix pass: `saveUserToken()` now rejects any access/refresh token starting with `test_` and logs a warning before any DB write. |
| Microsoft token soft-disconnect + reconnect restore | BUILT | March 24 follow-up: `/api/microsoft/disconnect` now preserves the `user_tokens` row and clears secrets (`access_token = null`, `refresh_token = null`, `disconnected_at` set) instead of deleting; sign-in token persistence still upserts through `saveUserToken()` and clears `disconnected_at`, so reconnect restores the same row in place; Microsoft sync now skips users with `access_token IS NULL` the same way it skips missing rows. |
| Cron excludes test user | BUILT | March 24 production hardening sweep: `/api/cron/nightly-ops` now filters `22222222-2222-2222-2222-222222222222` out of Microsoft sync, Google sync, signal processing, and daily brief stages via `TEST_USER_ID`. | Fake directives and wasted LLM calls from non-real accounts |
| Stale signal reprocessing | BUILT | March 24 production hardening sweep: nightly-ops resets up to 500 `tkg_signals` rows where `processed = true` and `extracted_entities IS NULL` back to `processed = false`, but the March 24 follow-up now skips that reset entirely whenever the all-source unprocessed backlog is already `>= 200`, logging `nightly_ops_stale_reset_skipped` instead. | Signals stuck in a half-processed state forever |
| Suppressed commitment cleanup | BUILT | March 24 production hardening sweep: nightly-ops now marks `tkg_commitments` with `suppressed_at IS NOT NULL` and `status = 'active'` as `completed` after processing, logging the number updated. | Suppressed commitments continuing to look active |

**NEXT MOVE:** All defenses run for first time at tonight's 4am cron. Check Vercel logs for structured JSON from each defense. Update each to PROVEN with log evidence.

### 1.3 Multi-User

| Item | Status | Evidence | Blocks |
|---|---|---|---|
| Test user gets own directive | PARTIAL | Action rows exist for user `22222222`, but this is a synthetic cron-excluded user with no auth row and no deliverable email. It does not satisfy real non-owner production proof depth. | Not a valid real-user proof path |
| Real connected non-owner reaches generate/persist/send in production | NOT PROVEN | 2026-03-29 production receipt: connected users were owner + synthetic `22222222` only; `real_non_owner_connected_user_ids=[]`; `non_owner_actions_today=[]`; acceptance gate `NON_OWNER_DEPTH` failed with `"No connected non-owner users (owner-only run)."`. | Need at least one real connected non-owner account with active subscription |
| Test user gets email | NOT PROVEN | `no_verified_email` — test user has fake email `gate2-test@foldera.ai` | Need real OAuth signup with deliverable address |
| Stranger onboarding flow (code paths) | VERIFIED | Code audit: empty goals→graceful, empty signals→null/wait_rationale, 90d first-sync, no hardcoded user IDs, trial banner only for past_due. March 23 follow-up: middleware now routes authenticated `/login` and `/start` to `/dashboard` or `/onboard` via the JWT `hasOnboarded` claim instead of a per-request `/api/onboard/check` fetch; dashboard/onboard pages no longer do client-side auth redirects. Local `npm run build` + `npx playwright test tests/e2e/` passed. | — |
| Stranger onboarding flow (live) | NOT TESTED | Requires real OAuth sign-up with a real email address. Cannot be automated without browser. | Manual test needed |

**NEXT MOVE:** Brandon or a real test user signs up via /start → Google OAuth → connects email → waits for next nightly-ops cron → verifies email arrives.

### 1.4 Stripe Payment

| Item | Status | Evidence | Blocks |
|---|---|---|---|
| Stripe keys configured | CANNOT VERIFY | `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` checked at runtime in checkout/webhook routes. Cannot read Vercel env vars from CI. Brandon must verify in Vercel dashboard. `STRIPE_PRO_PRICE_ID` should be `price_1TF00IRrgMYs6VrdugNcEC9z` (live). | — |
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
| acceptance-gate.ts script | BUILT (strengthened) | `lib/cron/acceptance-gate.ts` now enforces 9 checks: AUTH, TOKENS, API_CREDIT_CANARY, SIGNALS, COMMITMENTS, GENERATION, DELIVERY, SESSION, NON_OWNER_DEPTH. `NON_OWNER_DEPTH` requires a real non-owner (not owner, not synthetic test user) to reach persisted send/no-send evidence the same day. `AUTH`/`TOKENS`/`SESSION` now exclude `TEST_USER_ID` to prevent synthetic-token false failures. | Real non-owner account currently absent in prod |
| Wired into nightly-ops | BUILT | Stage 6 in `app/api/cron/nightly-ops/route.ts` | First live fire unproven |
| Alert on failure | BUILT | Sends to b.kapp1010@gmail.com via Resend on any FAIL | — |
| CLAUDE.md/AGENTS.md updated | DONE | Session log appended | — |

**NEXT MOVE:** Provision or connect at least one real non-owner production account, then rerun nightly-ops and confirm `NON_OWNER_DEPTH` flips to PASS with non-owner action/send receipts.

### 1.6 Error Monitoring

| Item | Status | Evidence | Blocks |
|---|---|---|---|
| Sentry error tracking | BUILT | `@sentry/nextjs` installed, `next.config.mjs` wrapped with `withSentryConfig`, `sentry.client.config.ts`/`sentry.server.config.ts`/`sentry.edge.config.ts` added, `SENTRY_DSN` placeholder documented in `.env.example`. Sentry wizard could not run in this non-TTY environment (`ERR_TTY_INIT_FAILED`), so setup was applied manually. | Needs real DSN + live error confirmation |

### 1.7 CI Integrity

| Item | Status | Evidence | Blocks |
|---|---|---|---|
| ENCRYPTION_KEY workflow fallback removed | BUILT | `.github/workflows/ci.yml` now requires `secrets.ENCRYPTION_KEY` without a hardcoded default. | — |

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
| Commitment fallback action type | BUILT | March 23 late session: `inferActionType()` default changed from `make_decision` to `send_message` so unclassified commitments now land on a generator-supported artifact path. Local search confirms `make_decision` is no longer the fallback return. |
| Specificity floor for vague candidates | BUILT | March 23 late session: scorer now penalizes short/no-detail candidates and boosts claim/email/phone/date-rich candidates before `computeCandidateScore()`. Structured log event `specificity_adjustment` added for auditability. |
| Recent raw signal context in context builder | BUILT | March 23 late session: `buildContextBlock()` now queries the last 5 processed `tkg_signals` from 7 days, decrypts them, skips fallback/self-referential rows, and appends concrete signal snippets only when valid rows remain. |
| Research phase gated below weak scores | BUILT | March 24 cost-control pass: `generateDirective()` now skips `researchWinner()` when `winner.score < 2.0`, logs `researcher_skipped_low_score`, and passes `insight = null` into prompt building for low-conviction candidates. |
| Consecutive duplicate suppression | BUILT | >50% word-overlap similarity against last 3 tkg_actions rejects and falls through to wait_rationale |
| Gmail sync in nightly-ops | BUILT | `stageSyncGoogle()` added as Stage 1b, mirrors Microsoft pattern, uses `getAllUsersWithProvider('google')` |
| 90-day first-sync lookback | BUILT | Both Microsoft and Google sync already use 90-day lookback on first connect (`!last_synced_at`) |
| Extraction noise filter (C) | BUILT | 8 new NON_COMMITMENT_PATTERNS: security alerts, newsletters, billing, promotions, credit monitoring, tool mgmt, self-referential, mass registrations. Commit `91e3e76` |
| Scorer noise pre-filter (A) | BUILT | NOISE_CANDIDATE_PATTERNS removes housekeeping/tool/notification candidates before scoring loop. Commit `91e3e76` |
| Paid-transaction commitment suppression | BUILT | March 28 follow-up: `signal-processor.ts` now blocks past-tense paid transaction logs (`Paid $7.00...`, `Paid Name $20...`) at extraction time; `scorer.ts` adds the same class to `NOISE_CANDIDATE_PATTERNS` and exports `isNoiseCandidateText()` for deterministic tests. Regression proof: `signal-hygiene.test.ts` + `scorer-noise-filter.test.ts`. |
| Generator quality examples (B) | BUILT | Concrete good/bad examples in SYSTEM_PROMPT, schedule_block housekeeping rejection gate. Commit `91e3e76` |
| Generator JSON extraction + raw-response logging | BUILT | March 24 generator hardening: `generatePayload()` now logs `[generator] Raw LLM response (attempt N):` before parsing, `SYSTEM_PROMPT` now ends with an explicit JSON-only contract, `extractJsonFromResponse()` strips non-`json` fenced code blocks plus preamble text, and `normalizeArtifactType()` now accepts direct `send_message|write_document|schedule_block|wait_rationale|do_nothing` values. Post-deploy owner `POST /api/settings/run-brief` created `tkg_actions.id = 9ec89641-e099-4138-82cb-3b6fe0e83773` with `status = pending_approval`, `action_type = send_message`, `confidence = 78`. |
| Approved `send_message` executes real email delivery | BUILT | March 24 production hardening sweep: `executeAction()` now extracts `to`/`recipient`, `subject`, and `body` from `execution_result.artifact`, sends the approved message through Resend, persists the returned `resend_id`, and writes `status = failed` instead of `executed` when delivery fails. |
| Pipeline receipt test covers extraction -> score -> generate -> send | BUILT | March 24 follow-up: `lib/briefing/__tests__/pipeline-receipt.test.ts` inserts a real encrypted signal via `encrypt()`, runs `processUnextractedSignals()`, verifies `scoreOpenLoops()` returns a winner with score `> 0`, verifies `generateDirective()` yields an executable directive, persists the artifact through `runDailyGenerate({ userIds })`, and confirms `runDailySend({ userIds })` records a non-null mocked Resend ID. |
| Google granted-scope diagnostics | BUILT | March 24 production hardening sweep: `syncGoogle()` now logs `[google-sync] Granted scopes:` from `user_tokens.scopes` and emits explicit warnings when `calendar.readonly` or `drive.readonly` are missing. |
| Signal extraction preserves entity freshness on existing matches | BUILT | March 24 signal freshness pass: `lib/signals/signal-processor.ts` now writes `tkg_entities.last_interaction` from `signal.occurred_at` instead of `now`, never moves an entity backward on older signals, and refreshes duplicate same-email aliases together. Focused regression tests cover newer-signal updates, older-signal no-regressions, and duplicate-email alias refresh. Live owner verification: both `Yadira Clapper` rows now show `last_interaction = 2026-03-23T09:18:07.943+00:00`, `scoreOpenLoops()` no longer surfaces a Yadira relationship candidate, and a local `generateDirective()` run now returns a low-urgency `do_nothing` directive instead of selecting Yadira. |
| Generator suppresses recent contact repeats (7d) before prompt generation | BUILT | March 24 follow-up: `lib/briefing/generator.ts` now extracts entity/contact names from candidate evidence and blocks `send_message` / `schedule` winners when `tkg_actions` already has `approved`, `executed`, or `pending_approval` actions for the same entity within 7 days. Runtime tests cover both action types and non-owner user IDs. |
| Scorer commitment input explicitly excludes suppressed commitments | VERIFIED | March 24 cleanup verification: scorer commitment fetches already had explicit `suppressed_at IS NULL` filters in anti-pattern, emergent-pattern, and `scoreOpenLoops()` loaders; no code patch required for this item. |
| Directive quality: housekeeping eliminated | YELLOW | Housekeeping/noise classes remain partially reduced (paid-transaction + zero-agency classes blocked). **March 29 update:** write-document analysis-dump leakage is now structurally blocked in `lib/conviction/artifact-generator.ts` + `lib/cron/daily-brief-generate.ts` (expanded scaffold detection, write-document structural checks, persistence-time artifact gate). Remaining work is broader non-housekeeping genericity tuning, not analysis scaffolding leakage. |
| Goal-gap analysis in generator | BUILT | March 24 architectural rewrite: `buildGoalGapAnalysis()` queries all active non-placeholder goals, counts 14-day signals and completed actions per goal, computes gap level (HIGH/MEDIUM/LOW), and injects `GOAL_GAP_ANALYSIS` section into the LLM prompt BEFORE candidate context. System prompt now leads with "which goal has the biggest gap between stated priority and actual behavior?" Directives must reference the specific goal by name and name the behavioral gap explicitly. |
| Goal-gap scorer multiplier | BUILT | March 24 architectural rewrite: scorer now computes a lightweight gap map from goals+signals, identifies the highest-gap goal (highest priority / lowest signal count), and applies a 1.5x score boost to candidates matching that goal. Structured log `goal_gap_boost` emitted for auditability. |
| Ranking invariants (weak-winner prevention) | BUILT | March 29 ranking pass: scorer now runs `applyRankingInvariants()` before winner selection to hard-reject obvious/known/low-evidence/non-send-write candidates, collapse duplicate-like candidates, and enforce discrepancy priority over generic tasks when both are present. Generator `selectRankedCandidates()` now disqualifies schedule/obvious-first-layer candidates and applies discrepancy-priority weighting with forced-over-task protection. Multi-run proof now added: `holy-crap-multi-run-proof.fixtures.ts` + `holy-crap-multi-run-proof.test.ts` run 10 deterministic pipeline scenarios and enforce `PASS >= 8/10`, `SOFT_FAIL <= 2`, `HARD_FAIL = 0`; latest run receipt is `10/10 PASS`, `0 SOFT_FAIL`, `0 HARD_FAIL`, no repeated weak class. Verification: ranking tests + multi-run test passed (18/18), full briefing suite 178/178 passed, build passed, `npm run test:prod` 51/51 passed. |
| Onboarding placeholder goal filtering | BUILT | March 24 architectural rewrite: goals with `source IN ('onboarding_bucket', 'onboarding_marker')` are now excluded from scorer goal matching (`scoreOpenLoops`, `inferRevealedGoals`, `detectAntiPatterns`), generator identity context, context-builder, and goal-gap analysis. Only `extracted`, `manual`, and `onboarding_stated` goals feed the system. |
| Behavioral goal inference from signals | BUILT | March 24 architectural rewrite: `inferGoalsFromBehavior()` in `lib/cron/goal-refresh.ts` scans 14 days of signals per user, extracts proper noun phrases and recurring theme keywords, creates new `tkg_goals` rows with `source = 'extracted'` when a theme appears in 5+ signals with no matching existing goal. Priority derived from signal frequency (5=p2, 10=p3, 15=p4) plus recency boost. Max 3 inferred goals per user per cycle, with keyword dedup against existing goals. |

**Threshold note:** There are two independent scales. The scorer EV (0–5 continuous) ranks candidates. As of March 24, research enrichment is skipped below `2.0` EV as a permanent cost control, but the generator still uses the existing confidence gates unchanged: `DIRECTIVE_CONFIDENCE_THRESHOLD = 45` at generation time and `CONFIDENCE_THRESHOLD = 70` for queue reconciliation. Structured logs now include both `scorer_ev` and `generator_confidence` so debugging is unambiguous.

### 2.5 Cost Controls

| Item | Status | Evidence |
|---|---|---|
| Conversation extraction uses Haiku | BUILT | March 24 cost-control pass: `lib/extraction/conversation-extractor.ts` now uses `claude-haiku-4-5-20251001`. |
| Goal refresh uses Haiku | BUILT | March 24 cost-control pass: `lib/cron/goal-refresh.ts` now uses `claude-haiku-4-5-20251001`. |
| Demo analyze route uses Haiku | BUILT | March 24 cost-control pass: `app/api/try/analyze/route.ts` now uses `claude-haiku-4-5-20251001`. |
| Daily spend cap raised to $1.00 | BUILT | March 24 follow-up: `lib/utils/api-tracker.ts` now enforces `DAILY_SPEND_CAP_USD = 1.00` so manual Generate Now usage does not block the same-day nightly cron run. |
| Extraction daily cap raised to $2.00 | BUILT | March 24 follow-up: extraction calls (`extraction`, `signal_extraction`) are exempt from the global $0.25 cap and now use `EXTRACTION_DAILY_CAP = 2.00` so backlog backfills are not blocked mid-run. |

**NEXT MOVE:** Self-optimize will dynamically adjust thresholds based on approval rates. Manual option: lower CONFIDENCE_THRESHOLD.

### 2.4 User-State Readiness

| Item | Status | Evidence |
|---|---|---|
| `computeUserState()` helper export | BUILT | March 23 late session: exported from `lib/briefing/scorer.ts` without wiring it into nightly-ops. Local runtime check returned valid JSON for owner `e40b7cd8-4925-42f7-bc99-5022969f1d22` and test user `22222222-2222-2222-2222-222222222222`. |
| Two-gate send enforcement (`evaluateReadiness`) | BUILT | March 27: `ReadinessDecision = 'SEND' \| 'NO_SEND' \| 'INSUFFICIENT_SIGNAL'` + `ReadinessCheckResult` added to `daily-brief-types.ts`. Pure `evaluateReadiness()` exported from `daily-brief-generate.ts` — replaces scattered cooldown and signal-failure early-returns with a single named gate. SEND → proceed to generation. NO_SEND → cooldown active, return `no_send_reused` silently. INSUFFICIENT_SIGNAL → processing failed, persist `skipped` action. 27 unit tests cover all branches. Commits `ac9e16a`, `cca65e4`. |
| Post-generation quality gate (`isSendWorthy`) | BUILT | March 27: Pure `isSendWorthy(directive, artifact)` kill switch with 7 checks: `do_nothing_directive`, `below_send_threshold` (< 70), `no_evidence`, `placeholder_content` (`[NAME]`, `[INSERT ...]` etc.), `invalid_recipient` (no `@`), `body_too_short` (< 30 chars), `vague_subject` (generic openers), `generic_language` ("I hope this finds you well", "just wanted to reach out"). Worthy directives proceed; blocked directives persist as `skipped`. |
| Decision-enforcement artifact gate (ask + deadline + consequence + ownership) | BUILT | March 29 artifact conversion pass: `lib/briefing/generator.ts` now enforces `getDecisionEnforcementIssues(...)` during generation and persistence validation, blocking artifacts that are informational/ignorable (`missing_explicit_ask`, `missing_time_constraint`, `missing_pressure_or_consequence`, passive tone, obvious first-layer advice, and write-document missing owner assignment). `lib/cron/daily-brief-generate.ts` now applies the same enforcement inside `isSendWorthy(...)` before persistence/send. Proof: full relevant suites passed (`lib/briefing/__tests__` + `lib/cron/__tests__`), `npm run build` passed, `npm run test:prod` passed (`51/51`), and 5-case discrepancy conversion proof passed (`artifact-conversion-proof.test.ts`). |
| Causal diagnosis layer (winner → mechanism → artifact) | BUILT (hardened) | March 29 grounding-authority pass: `buildPromptFromStructuredContext` now uses non-authoritative `MECHANISM_HINT` instead of authoritative `REQUIRED_CAUSAL_DIAGNOSIS`; `generatePayload` accepts model diagnosis only when deterministic grounding passes (>=2 concrete signal anchors + explicit time reference + non-restatement + non-meta mechanism), otherwise falls back to template diagnosis with source tagging (`llm_grounded`, `llm_ungrounded_fallback`, `template_fallback`). `validateGeneratedArtifact` now validates against the accepted diagnosis actually used. Regression coverage expanded in `causal-diagnosis.test.ts`; runtime regressions still pass. Verification: targeted causal + runtime tests passed, full `lib/briefing` + `lib/cron` suites passed, `npm run build` passed, `npm run test:prod` passed (51/51). |
| Silence enforcement | BUILT | March 27: `persistNoSendOutcome` now writes `status='skipped'`. `runDailySend` queries `status=pending_approval` — no-send outcomes never reach the send queue. No email, no UI card, no wait_rationale surfaced on NO_SEND or INSUFFICIENT_SIGNAL paths. |
| Approve feedback signal slot | BUILT | March 27: Main `tkg_actions` insert includes `approve: null` in `execution_result`. Updated by approve/skip actions. Feedback signal for future quality calibration. |
| Gate decision logging | BUILT | March 27: `brief_gate_decision` log event emitted per-user per-run with `decision`, `reason`, `signal_code`, `fresh_signals`. `daily_generate_complete` enhanced with `evidence_count`, `body_chars`, `to_domain`, `subject_length` (no PII). |
| Dev send-quality review endpoint | BUILT | March 27: `GET /api/dev/send-log` — `ALLOW_DEV_ROUTES=true` + valid session required. Returns last 10 `pending_approval` actions: `id`, `action_type`, `confidence`, `artifact_type`, `to_domain`, `subject`, `body_chars`, `evidence_count`, `approve`. 404 in production. |
| Owner-only real-data brain receipt endpoint | BUILT (owner-debug) | March 29: `POST /api/dev/brain-receipt` (owner-only session check via `OWNER_USER_ID`) forces fresh generation (`forceFreshRun=true`) and returns structured receipt: top-5 candidates, winner trace, accepted causal diagnosis/source (if present), full artifact, decision-enforcement result, send-worthiness, and stale-action non-reuse proof against `2e3a92ac-f93e-42b4-a978-bedd3dcee4d6`. |

| Generation prompt tightening | BUILT | March 27: SYSTEM_PROMPT now includes ARTIFACT VOICE RULES (no assistant-tone filler), BANNED PHRASES block (blocks "just checking in", "touching base", "wanted to reach out", "following up" without specifics, generic openers). `send_message` schema requires first sentence to anchor to a specific signal fact, explicit ask, ≤150 words, no filler. `write_document` must be one decisive next move — no option lists, no brainstorm sections. `isSendWorthy` generic_language check enforces this post-generation. |
| Multi-candidate viability competition | BUILT | March 27: `ScorerResult.topCandidates` (top 3 raw scored loops) added to scorer output. `selectFinalWinner()` exported pure function in `generator.ts` — applies viability multipliers to top 3 candidates before any hydration fires: commitment/compound +12%, send_message without email in signals -20%, signal ≤2d +8%, signal >10d -12%, already-acted-recently → disqualify. Injects `CANDIDATE_COMPETITION` context string into generation prompt explaining why winner beat alternatives. Collapse point moved from `scored.winner` (unconditional) to `finalWinner` (competition-selected). 9 unit tests in `winner-selection.test.ts`. Build ✓, 172/172 tests ✓. |

**NEXT MOVE:** Wire `computeUserState()` into the caller/orchestrator in a separate prompt once nightly data confirms the scorer quality changes improve approval odds. Monitor `brief_gate_decision` logs to calibrate the 4-hour cooldown threshold and SEND ratio over time.

## PHASE 3: GROWTH READY (post-intelligence)

Only start after Phase 2 deployed.

### 3.1 Onboarding

| Item | Status |
|---|---|
| Stranger signup to first email | CODE VERIFIED | Code paths verified: CTA→/start, OAuth (Google+Microsoft), redirect→/dashboard, 90d first-sync, new-account empty state handling, and post-goals welcome email if at least one provider is connected. Live test requires real signup. |
| Under 2 minutes, no instructions | CODE VERIFIED | /start page: OAuth buttons + copy "Your first read arrives tomorrow at 7am". No manual steps between OAuth consent and dashboard. |
| Connect email, see "first brief tomorrow" | CODE VERIFIED | /start copy at line 23: "Your first read arrives tomorrow at 7am". Auto-sync triggers after OAuth connect. March 23 follow-up: settings now re-fetches `/api/integrations/status` after connect-return sync and disconnect success so provider state updates without a full reload. |
| Session persists across tab close/reopen | FIXED | March 23: removed `prompt:'consent'` from Google OAuth (forced re-consent on every visit). Added middleware auth guard for /dashboard/* (edge redirect to /login if no session cookie). Changed NextAuth signIn page from /start to /login. March 23 follow-up: middleware now handles authenticated `/login` and `/start` routing from the JWT `hasOnboarded` claim, and `/dashboard` layout remains a pass-through with no duplicate auth gate. Local `npm run build` + `npx playwright test tests/e2e/` passed. Deploy needed to verify live. |
| Middleware auth guard for /dashboard | CODE VERIFIED | `middleware.ts` checks for a NextAuth token on `/dashboard/*` and `/onboard`, redirects unauthenticated users to `/login`, and routes authenticated `/login` + `/start` requests to `/dashboard` or `/onboard` from the JWT `hasOnboarded` claim populated in `lib/auth/auth-options.ts`. Local `npm run build` + `npx playwright test tests/e2e/` passed. |
| Pricing copy consistent | PROVEN | March 24 production hardening sweep: pricing CTAs now say "Get started free" and no source copy still advertises `$19`. Locked pricing remains free tier with no card and Pro at `$29/mo`. |
| Onboarding goal_category DB constraint | FIXED | March 23: 'work'→'other', 'personal'→'health', 'learning'→'other' to match `tkg_goals` CHECK constraint. March 24 follow-up: `app/api/onboard/set-goals/route.ts` now inserts only the real `tkg_goals` columns (`user_id`, `goal_text`, `goal_category`, `priority`, `source`, `current_priority`) instead of sending removed fields (`goal_type`, `status`, `confidence`, `updated_at`). |
| User-facing copy polish | FIXED | March 23: "Next sync at 7am" → "Your next read arrives at 7am Pacific". Skip button now shows "Foldera learns from this" in email + dashboard. Settings SourceLine shows "awaiting sync" when provider connected but 0 signals. |
| Authenticated dashboard/settings structural polish | BUILT | March 28 follow-up: presentation-only cleanup in `app/dashboard/page.tsx` and `app/dashboard/settings/SettingsClient.tsx` tightened spacing rhythm, normalized `max-w-3xl` container alignment, and re-tiered settings sections (Connected accounts primary, Focus areas secondary, Subscription tertiary, Account low-noise, Daily brief moved to quiet Tools section) without backend or data-flow changes. Dashboard empty state reframed from failure-feeling copy to deliberate state: "Nothing queued at high confidence." QA: `npm run build` passed; `npx playwright test tests/e2e/authenticated-routes.spec.ts tests/e2e/flow-routes.spec.ts` passed (13/13). |
| Welcome email after onboarding | BUILT | March 24 production hardening sweep: `app/api/onboard/set-goals/route.ts` now sends a one-time Resend welcome email after goals save succeeds and at least one provider is connected, then records `welcome_email_sent` in auth user metadata. |
| New user dashboard empty state | BUILT | March 24 production hardening sweep: when `/api/conviction/latest` returns no directives and the account is under 24 hours old, `/dashboard` shows "Your first read arrives tomorrow at 7am Pacific. Foldera is syncing your email and calendar now." |
| OAuth error visible on login | BUILT | March 24 production hardening sweep: `/login` now reads `?error=` and shows a red warning banner above the OAuth buttons with "Sign-in failed. Please try again or use a different account." |

### 3.2 Landing Page

| Item | Status |
|---|---|
| Hero with mechanism visualization | BUILT (72a36f3) | March 28 follow-up: `app/page.tsx` text-only clarity pass aligned hero/section messaging to the one-move positioning ("You missed it. Foldera didn’t.", "One move changes the outcome.", "One decision. Done.") without layout or visual changes. March 28 second follow-up: mobile-first carousel clarity pass in `ScenarioDemos` added swipe + tap discoverability and stronger finished-work emphasis without adding sections or changing overall visual language. QA gate attempt was blocked by pre-existing compile errors outside homepage scope (`lib/briefing/scorer.ts` duplicate key; `.next/types` missing blog slug type), logged in `FOLDERA_MASTER_AUDIT.md` as `NEEDS_REVIEW`. |
| $29 pricing | BUILT |
| "Finished work, every morning" copy | BUILT |
| Static blog with 5 posts | BUILT | March 24 follow-up: `/blog` index and `/blog/[slug]` post pages now render five markdown-backed posts with frontmatter metadata and responsive layouts. March 24 blog-rendering fix: `lib/blog.ts` now uses `remark-gfm` so markdown tables render as HTML, `app/(marketing)/blog/[slug]/page.tsx` keeps `dangerouslySetInnerHTML` inside a typography-enabled prose container, and focused blog Playwright checks now verify rendered `h2`/`p`/`li` content plus the busy-professionals comparison table at desktop and 390px mobile. |

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
