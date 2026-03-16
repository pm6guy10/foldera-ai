# AGENTS.md — Foldera

Next.js 14 App Router · Supabase · Claude API (Anthropic)
Single-user production app. Auth via NextAuth.

## What this project is

Foldera is a conviction engine. It ingests email and calendar data, builds an identity graph, and generates one executable directive per day with a finished artifact attached. The user approves or skips. It learns. The product surface is email first, dashboard second.

## Stack

- Next.js 14 (App Router only, no Pages Router)
- Supabase (Postgres + auth + RLS)
- Claude API (Sonnet for generation, Haiku for extraction)
- Vercel (hosting, crons)
- Resend (email delivery)
- Stripe (billing)

## Key directories

```
app/                    # Next.js app router pages and API routes
app/api/cron/           # Cron jobs: daily-generate, daily-send, sync-google, sync-microsoft
app/api/conviction/     # Core engine: generate, execute, latest
app/api/google/         # Google OAuth connect/callback/disconnect
app/api/microsoft/      # Microsoft OAuth and sync-now
lib/briefing/           # Brain: generator.ts (system prompt + LLM call), scorer.ts (1200+ lines, conviction scoring)
lib/signals/            # Signal processor: decrypt, extract via Haiku, write to DB
lib/encryption.ts       # AES-256-GCM encryption (12-byte IV standard)
lib/crypto/             # Token encryption (also 12-byte IV after standardization)
lib/sync/               # Microsoft and Google sync jobs
lib/email/              # Resend email templates
components/dashboard/   # Dashboard UI components
scripts/                # generate-briefing.mjs (testing), seed-goals.mjs
```

## Database tables (Supabase)

- `tkg_signals` — Raw ingested data (emails, calendar, conversation imports). Content is AES-256-GCM encrypted.
- `tkg_commitments` — Extracted commitments from signals
- `tkg_entities` — People, orgs, patterns extracted from signals
- `tkg_actions` — Generated directives with artifacts. Status: pending_approval, approved, skipped
- `tkg_goals` — User goals with priority (1-5) driving scorer stakes calculation
- `tkg_pattern_metrics` — Bayesian confidence tracking per action_type:domain
- `signal_summaries` — Weekly signal digests for long-term memory
- `user_tokens` — OAuth tokens (encrypted). Single source of truth for all providers.

## How the brain works

1. Scorer (`lib/briefing/scorer.ts`) queries signals, commitments, goals, patterns
2. Scores candidates by: stakes * urgency * tractability * freshness
3. Bayesian confidence from tkg_pattern_metrics
4. Generator (`lib/briefing/generator.ts`) takes the winning candidate, generates directive + artifact via Claude Sonnet
5. Artifact types: send_message, write_document, schedule, research, make_decision, do_nothing
6. Result stored in tkg_actions with artifact JSONB column

## Encryption

All signal content and OAuth tokens are AES-256-GCM encrypted.
- `lib/encryption.ts` — encrypt()/decrypt() for signal content (12-byte IV)
- `lib/crypto/token-encryption.ts` — encryptToken()/decryptToken() for OAuth tokens (12-byte IV, with legacy 16-byte fallback)
- Environment variable: `ENCRYPTION_KEY`

## Cron schedule (vercel.json)

- `daily-generate`: 6:50am UTC (generates directive)
- `daily-send`: 7:00am UTC (sends email)
- `sync-google`: daily
- `sync-microsoft`: daily

## Rules

- One directive per email. Nothing below 70% confidence.
- Artifact required on every directive. If the user has to do work after approving, the feature is broken.
- Email is the primary product surface. Dashboard is secondary.
- All pushes to main. No feature branches.
- Owner account `e40b7cd8` is always pro. Never show trial banners.
- Self-referential signals (content starting with "[Foldera Directive" or "[Foldera ·") must be filtered from all generator queries.
- Signal content must be decrypted before extraction. If decrypt fails, skip the signal (don't mark processed).
- Signal processor: max 5 signals per invocation (Vercel Hobby 10s timeout).

## Before making changes

1. Read every file you plan to modify
2. Run `git log --oneline -10` to check recent changes
3. Trace the data path: where does data come from, what transforms it, what reads it
4. If you find conflicts with recent changes, say so before writing code

## Testing

- `npm run build` must pass with 0 errors before any commit
- No test suite in CI yet. Verify manually or via build.

## Environment variables required

ANTHROPIC_API_KEY, ENCRYPTION_KEY, CRON_SECRET, 
NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, 
SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, 
RESEND_FROM_EMAIL, DAILY_BRIEF_TO_EMAIL,
AZURE_AD_CLIENT_ID, AZURE_AD_CLIENT_SECRET,
GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
STRIPE_SECRET_KEY, STRIPE_PRO_PRICE_ID,
STRIPE_WEBHOOK_SECRET, RESEND_WEBHOOK_SECRET,
INGEST_USER_ID
