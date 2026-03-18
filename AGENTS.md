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
app/api/cron/           # Cron jobs: daily-brief, sync-google, sync-microsoft
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

- `daily-brief`: `0 14 * * *` (7:00am Pacific) — unified generate + send flow
- `sync-google`: daily
- `sync-microsoft`: daily

---

## CRITICAL RULES — PRODUCTION AUDIT (March 18, 2026)

These rules override any pattern you observe in the existing code. If the code violates these rules, the code is wrong.

### User data isolation

`INGEST_USER_ID` is for cron jobs and owner-only background flows ONLY. It must NEVER appear in any route that receives a user session. Every session-backed API route must use `session.user.id` exclusively.

Affected routes that currently violate this (fix on contact):
- `app/api/google/callback/route.ts` — uses `INGEST_USER_ID ?? session.user.id`
- `app/api/microsoft/sync-now/route.ts` — same pattern
- `app/api/priorities/update/route.ts` — same pattern on both POST and GET

The rule: if the route has `getServerSession()` or checks auth, it uses `session.user.id`. Period. No fallback to env vars.

### Encryption consistency

Every write to `tkg_signals.content` must use `encrypt()` from `lib/encryption.ts`. No exceptions. No plain text signal content in production.

Known violation: `app/api/resend/webhook/route.ts` inserts plain text signal content.

### Decrypt failure resilience

Any code path that calls `decrypt()` must wrap it in try/catch. On failure: skip that row, log a bounded warning, continue processing. Never crash a scoring run, generation run, or sync job because one row has malformed encrypted content.

Known violations: `lib/briefing/scorer.ts` at lines 369, 379, 476, 628, 1537, 1554 — all call decrypt without guards.

### Generation failure handling

If `generateDirective()` returns the `__GENERATION_FAILED__` sentinel or if artifact generation returns null:
- Do NOT insert the directive into `tkg_actions`
- Do NOT cache the briefing in `tkg_briefings`  
- Do NOT send an email
- Return a structured error to the caller

Every route that persists a directive must validate: (1) directive text is not the failure sentinel, (2) artifact is not null. If either check fails, abort the insert.

Known violations:
- `app/api/conviction/generate/route.ts` — persists directive with null artifact
- `app/api/onboard/directive/route.ts` — no sentinel check, allows null artifact
- `app/api/onboard/free-directive/route.ts` — same
- `lib/briefing/generator.ts` — caches briefing even on generation failure

### Authentication requirements

These routes MUST require a valid session before processing:
- `app/api/settings/spend/route.ts` — currently no auth check
- `app/api/stripe/checkout/route.ts` — currently allows unauthenticated checkout

These public onboarding routes MUST have rate limiting (10 req/IP/hour) and input validation:
- `app/api/onboard/goals/route.ts`
- `app/api/onboard/ingest/route.ts`

### Error handling contract

Every API route that calls an async operation must wrap it in try/catch and return structured JSON errors. Never let an unhandled throw produce an unstructured 500.

Known violations:
- `app/api/conviction/execute/route.ts` — `executeAction()` call is unwrapped
- `app/api/drafts/decide/route.ts` — same

Pattern to follow:
```typescript
try {
  const result = await executeAction(action);
  return NextResponse.json({ ok: true, result });
} catch (error) {
  console.error('Execute failed:', error instanceof Error ? error.message : error);
  return NextResponse.json({ error: 'Execution failed' }, { status: 500 });
}
```

### Daily cron scoping

- `daily-brief` must only generate/send directives for users with active subscriptions or the owner account (`e40b7cd8`). Do not run it for temp onboarding users or unsubscribed accounts.
- `daily-brief` must resolve recipient email per user from their profile or auth record. Do not route all directives through a single fallback inbox.

### Logging in production

Do not log directive titles, conviction scores, anti-pattern labels, behavioral content, or any user-specific data to stdout. Replace with structured logging that redacts user content, or remove entirely. Production logs must not contain private behavioral data.

Known violations:
- `lib/briefing/generator.ts` line 146
- `lib/briefing/scorer.ts` line 1450

### Supabase query validation

Every Supabase query must check the `error` field on the response before using `.data` or `.count`. Do not silently proceed with null/partial data.

Known violation: `app/api/briefing/latest/route.ts` ignores errors on four parallel reads.

### Disconnect route validation

`app/api/google/disconnect/route.ts` and `app/api/microsoft/disconnect/route.ts` must check the Supabase update result and return an error if the write failed. Do not return `{ ok: true }` when the row was not updated.

---

## Standing rules

- One directive per email. Nothing below 70% confidence.
- Artifact required on every directive. If the user has to do work after approving, the feature is broken.
- Email is the primary product surface. Dashboard is secondary.
- All pushes to main. No feature branches.
- Owner account `e40b7cd8` is always pro. Never show trial banners.
- Self-referential signals (content starting with "[Foldera Directive" or "[Foldera ·") must be filtered from all generator queries.
- Signal content must be decrypted before extraction. If decrypt fails, skip the signal (don't mark processed).
- Signal processor: max 5 signals per invocation (Vercel Hobby 10s timeout).

## Before making changes

1. Read this entire file first
2. Read every file you plan to modify
3. Run `git log --oneline -10` to check recent changes
4. Trace the data path: where does data come from, what transforms it, what reads it
5. If a rule in the CRITICAL RULES section conflicts with existing code, the rule wins. Fix the code.
6. If you find conflicts with recent changes, say so before writing code

## Testing

- `npm run build` must pass with 0 errors before any commit
- No test suite in CI yet. Verify manually or via build.

## Environment variables required

ANTHROPIC_API_KEY, ENCRYPTION_KEY, ENCRYPTION_KEY_LEGACY, CRON_SECRET,
NEXTAUTH_SECRET, NEXTAUTH_URL, NEXT_PUBLIC_BASE_URL,
NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY,
RESEND_FROM_EMAIL,
AZURE_AD_CLIENT_ID, AZURE_AD_CLIENT_SECRET, AZURE_AD_TENANT_ID,
GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
STRIPE_SECRET_KEY, STRIPE_PRO_PRICE_ID,
STRIPE_WEBHOOK_SECRET, RESEND_WEBHOOK_SECRET,
INGEST_USER_ID

## Mandatory QA Gate

Every Codex session that changes user-facing code must end with this verification before pushing to main:

1. Check every user-facing route: `/`, `/start`, `/login`, `/pricing`, `/dashboard`, `/dashboard/settings`
2. For each route verify:
   - Build passes
   - No hydration mismatches
   - Loading, empty, and error states exist
   - No hardcoded user data
   - All buttons have working handlers
   - No CSS overflow or truncation
   - Copy is consistent across pages
3. Run `npx playwright test`
4. Fix any failures before pushing
5. If any issue cannot be fixed, note it in `FOLDERA_MASTER_AUDIT.md` as `NEEDS_REVIEW`

This is not optional. No push happens without this gate passing.
