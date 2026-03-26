# AUTOMATION BACKLOG

### CONVICTION ENGINE — next build (locked 2026-03-26)
Core insight: Foldera is not a mirror and not a task manager. It is a conviction engine.
The user should never have to state their burn rate, outcome probability, or hard deadline.
We infer all three from signals. We run the math. We hand them one answer.

Architecture is in `lib/briefing/conviction-engine.ts`. What needs to be built:

**CE-1: Wire conviction-engine into nightly-ops and generator**
- `runConvictionEngine(userId, topGoalText)` should run alongside `scoreOpenLoops`
- If model confidence >= 0.6 AND `stopSecondGuessing = true`, the conviction output
  becomes the directive instead of a scored loop candidate
- The artifact is the math itself — shown plainly, not hidden

**CE-2: Improve `inferMonthlyBurn`**
- Current: regex scan over signal content for dollar amounts near burn keywords
- Needed: extract recurring payment patterns from bank/financial email signals
  (look for "payment of $X" same amount 2+ months in a row)
- Target: confidence >= 0.7 for users with 60d of financial signals

**CE-3: Improve `inferHardDeadline`**
- Current: keyword pattern matching for baby/lease/due date in signals
- Needed: calendar event extraction (look for "due", "delivery", "last day")
  + cross-reference goal text for named deadlines
- The baby due date is the most important deadline in the system right now and
  it's not being read from signals at all

**CE-4: Improve `inferPrimaryOutcomeProbability`**
- Current: signal keyword scan for positive stage signals
- Needed: model the hiring funnel stage explicitly:
  - Applied (base 20%)
  - Interviewed (+15%)
  - Reference check initiated (+20%)
  - Reference check complete (+20%)
  - Start date discussed (+15%)
  = ceiling 90%
- The Yadira/MAS3 thread should score ~85% given reference complete + April/May start confirmed

**CE-5: Goal decay — auto-demote dead goals**
- MA4/DSHS is still P5 despite Ricky Luna being dead and rejection received
- Add weekly check: if goal has zero new signals for 21d AND no active thread,
  auto-demote priority by 1 and log reason
- If goal has a rejection signal in thread (e.g., "position will be filled with another"),
  auto-set to abandoned

**CE-6: DVA reference risk pattern**
- The Keri Nopens thread revealed: WA state HR policy requires current supervisor reference.
  DVA (April 2024-April 2025) ended badly. This is a recurring blocker for WA state applications.
- The system should flag any new WA state job application candidate with:
  "REFERENCE_RISK: DVA supervisor reference may be required. Resolve before HR stage."
- Surfaced as a blindspot note, not a task

### DONE (March 26) — House-Cleaning Audit + Sentry Wiring
- **Sentry fully wired**: `captureException` added to all 6 critical locations (api-error.ts central handler, generator.ts outer catch, all 16 nightly-ops stage catches, conviction/execute, React error boundary). First real Sentry alert confirmed received within minutes of deploy.
- **Sentry config migrated**: `sentry.server/edge.config.ts` replaced with `instrumentation.ts` per Next.js v10 SDK requirement. `global-error.tsx` added for root React render errors. `onRouterTransitionStart` hook added to `instrumentation-client.ts`. Zero Sentry warnings on build.
- **Sentry DSN added to `.env.local`**: Was missing from local environment; now matches Vercel.
- **api-error.ts `[object Object]` fixed**: `getMessage()` now extracts `.message` from Supabase error objects (plain objects, not `instanceof Error`). Sentry now shows real error titles instead of `[object Object]`.
- **Approve/Skip double-submit fixed**: `executing` state added to dashboard buttons; both disabled during POST with `finally {}` cleanup.
- **Date.now() hydration mismatch fixed**: Moved out of render body into `load()` useEffect state — was computing `isNewAccount` at SSR time and client time diverging.
- **Email subject/recipient truncation**: Added `truncate` class to prevent mobile overflow on long addresses/subjects.
- **Account deletion atomic**: All 8 delete operations now check their error result; throws early with table names if any fail. Previously could leave orphaned `user_tokens`/`user_subscriptions` rows on partial failure.
- **Settings silent catch fixed**: `.catch(() => {})` replaced with logged error handler on initial settings data fetch.
- **Signal extraction batch size raised**: `BATCH_SIZE` and `DEFAULT_MAX_SIGNALS` 5 → 20. New users clear 100-signal backlog in 5 nights instead of 20.
- **api_usage composite index**: Migration `20260326000002_api_usage_index.sql` adds `idx_api_usage_user_date ON api_usage(user_id, created_at DESC)`. Eliminates full table scan on spend cap check at 100+ users.
- **pipeline-receipt test timeout extended**: Set explicit 30s `it()` timeout — was timing out at 5s in full suite due to module isolation overhead during real LLM call.
- **Idempotency guard confirmed existing**: `reconcilePendingApprovalQueue` already handles duplicate `pending_approval` rows via `preservedAction` — audit concern was already resolved.

### DONE (March 26)
- Signal snippet depth: 300→1400 chars, chronological mini-thread
- Behavioral mirrors: anti-patterns + divergences travel to generator even when they don't win
- Goal-primacy gate (3 gates): hard drop goalless candidates, RULE in prompt, suppress wait_rationale
- Convergent analysis prompt: non-obvious lever, already-tried check, domain crossing, hidden countdown
- Sent-mail awareness: email_sent signals in scorer (novelty kill) + ALREADY_SENT_14D in prompt
- Skip threshold: 2 consecutive skips = user already considered it = drop from pool

### DONE (March 25)
- GitHub Actions CI: remove hardcoded ENCRYPTION_KEY fallback in workflow
- Acceptance gate TOKENS check filters expiring rows with missing refresh_token in the DB query
- Sentry error tracking (Next.js SDK + config, DSN placeholder documented)
- CLAUDE pre-flight rule updated to prohibit rebases unless Brandon explicitly requests
- Production `/login?error=OAuthCallback` banner — 25/25 prod E2E now passing (login banner confirmed working March 25)
- Stripe price ID references updated to live `price_1TF00IRrgMYs6VrdugNcEC9z`

### DONE (March 24)
- Generator error visibility (real errors in DB)
- api_usage schema fix (endpoint column)
- Cost optimization (Haiku extraction, research gated, $0.25 cap)
- Feedback constraint (user_feedback + artifact in CHECK)
- Test token guard
- Entity last_interaction upsert from signals
- Manual Generate sends email
- Signal backfill expansion (100 batch, 10 rounds)
- Blog route + 5 SEO posts live at /blog
- JSON parser fix (normalizeArtifactType)
- Connector health monitor
- Credit canary in acceptance gate
- Test user excluded from cron
- Stale signal reprocessing
- Suppressed commitment cleanup
- Execute pipeline wired for send_message
- Pricing copy fix
- Welcome email after onboarding
- New user empty state
- OAuth error display
- Google sync scope logging
- Onboarding goal insert schema fix
- Nightly ops all-source backlog threshold + stale reset guard
- Pipeline receipt test for extraction -> score -> generate -> send
- Microsoft token soft-disconnect (preserve row, null tokens, reconnect restore)
- Nightly-ops pre-signal commitment ceiling execution
- Commitment ceiling batch-safe suppression (no oversized IN payload failures)
- Nightly-ops 180-day extracted-signal cleanup at pipeline start
- Scorer commitment loaders verified to explicitly enforce suppressed_at IS NULL
- /api/health route now returns JSON status for cron health-check

### OPEN (Priority order)
- Blog formatting fix (prose typography, Codex queued)
- Brandon reconnects Google with all scopes
- Brandon sets focus areas on settings page
- 3 consecutive days of useful cron directives
- Prove approve flow end-to-end (approve, email sends via Resend)
- Non-Brandon user connects and gets useful directive
- Stranger onboarding e2e test
- Landing page SEO copy rewrite (homepage, not blog)
- /try page conversion funnel
- Rate limiting on /api/try/analyze and all public routes
- Signal dedup across Outlook+Gmail (same email, two signals)
- .env.example for contributors
- UptimeRobot monitor for /api/health
- DB migrations in code (not manual)
- Correlation IDs in logs
- Supabase backups
- Dependabot
- Past directives view (/dashboard/briefings)
- Auth-state.json refresh (expires ~April 22)
- Duplicate entity cleanup (beyond Yadira)
- Email send idempotency (prevent double-send on cron double-fire)
- Local Playwright auth-state mismatch against `http://localhost:3000` still breaks the authenticated production-smoke subset
