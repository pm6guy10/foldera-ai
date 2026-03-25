# AUTOMATION BACKLOG

### DONE (March 25)
- Acceptance gate TOKENS check filters expiring rows with missing refresh_token in the DB query

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
- Sentry error tracking
- .env.example for contributors
- GitHub Actions CI
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
- Production `/login?error=OAuthCallback` banner is missing in `npm run test:prod` (`17 passed, 1 failed`)
