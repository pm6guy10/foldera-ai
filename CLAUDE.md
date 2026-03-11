# Foldera — Claude context

Next.js 14 App Router · Supabase · Claude API
Single-user production app. Auth via NextAuth. Ingest user: `INGEST_USER_ID` env var.

---

## Stack notes
- App Router only — no Pages Router
- All DB access via `lib/supabase.ts` (server-side client)
- Directives live in `tkg_actions`, signals in `tkg_signals`, patterns in `tkg_entities.patterns`, goals in `tkg_goals`
- `/api/conviction/latest` and `/api/graph/stats` are the two dashboard data routes
- Public onboard routes under `/api/onboard/*` use `tempUserId` (UUID), no session required
- Auth providers: Google OAuth + Azure AD (Outlook). Both configured in `lib/auth/auth-options.ts`
- OAuth tokens persist to `integrations` table via `lib/auth/token-store.ts` for background cron use

## Product logic — don't violate these
- Email is captured on the landing page. Never ask for it again inside the app.
- Never ask the user a question Foldera should be able to answer itself.
- Never add a step that requires user effort when the engine can generate instead.
- The product promise is zero lift. If a user has to think hard to get value, the feature is broken.
- Friction is a bug, not a design choice.

---

## Vision
Foldera is not a dashboard. It's an agent that acts on your behalf with your approval.

End state: Foldera wakes up, reads your emails, calendar, and conversations overnight,
identifies what needs to happen, drafts the actions, and presents them for one-tap approval.
You approve or skip. It learns. It gets more accurate.

## Core Product Loop — DO NOT VIOLATE

Foldera is not a recommendation engine. It is a worker.

The loop:
1. Ingest behavior (email, conversations, calendar, approvals)
2. Extract patterns, decisions, relationships, goals
3. Generate the single highest-leverage action (directive)
4. Generate the finished work product (artifact)
5. Present both to user for one-tap approval
6. Execute on approval. Learn from approval/skip.
7. Next cycle is smarter.

The directive without an artifact is a to-do list.
The artifact is the product.

### What "artifact" means by action type:
- send_message: drafted email with to/subject/body,
  pulled from relationship history and recent threads
- write_document: complete document, not an outline
- schedule: calendar event with proposed time found
  from open slots
- research: specific questions with sources identified
- make_decision: decision frame with options weighted
  by user's own historical outcomes
- do_nothing: explanation citing specific prior outcomes
  where waiting resolved favorably

### Approval behavior:
- Email artifact + approve = send via Outlook/Gmail
- Document artifact + approve = save to tkg_documents
- Calendar artifact + approve = create event via API
- Skip on any artifact = feedback_weight -0.5, learn

### The test for every feature:
Does the user have to do work after approving?
If yes, the feature is broken. Foldera does the work.
The user only decides yes or no.

### The conversion event (demo/onboarding):
Three accurate inferences in a row about things the
system was never explicitly told. One hit is luck.
Two is interesting. Three is "take my money."

---

## Current state (accurate as of March 11, 2026)

### Working
- Identity graph: 315 patterns, 207 commitments, 122 signals from 127 ingested conversations
- Conviction engine: generates directives with confidence scores, feedback loop weighted by action_type history
- DraftQueue: approve/dismiss UI with email deep-links
- Daily email: action cards with approve/skip buttons, progressive subject lines days 1-7
- Zero-auth demo at /try
- 14-day free trial, $99/month after
- Landing page rewritten for strangers
- Waitlist with email capture
- Health monitoring: stale graph alert if no ingest in 48+ hours
- Security: cron auth, svix webhook verification, token encryption, 30-day data deletion
- Retry logic on daily cron
- Email send on approval via Gmail/Outlook (outlook-client.ts and gmail-client.ts)
- Stripe Pro $99/month with webhook endpoint
- Six specialist agents on scheduled crons (disabled until first public user)
- Continuous ingest pipeline: /api/ingest/conversation + scripts/ingest-recent.mjs

### NOT working — must be built
- Artifact generation: execution layer is ALL STUBS. runStub() returns { stub: true } for every
  action type except email send. Directives exist but no finished work products are generated.
  This is the #1 build priority. See "Core Product Loop" above.
- Calendar sync: no cron, no route, no client. Auth scopes request calendar access but nothing reads it.
- Self-feeding loop: engine outputs and agent outputs do not feed back through extractFromConversation().
  Graph is static unless manually ingested.
- Outlook connection: Azure AD env vars are configured. Code is complete. Whether the OAuth flow
  actually works end-to-end has not been verified by the current user. Test it.
- Unified onboarding: three competing paths exist (/onboard, /start, /try). Should be one.
- /start page only shows Google sign-in. No Microsoft button.

### Dead code — delete on next cleanup
- app/api/scan-inbox/ (meeting-prep era)
- app/api/generate-draft/ (entire directory)
- lib/meeting-prep/ (entire directory)
- lib/plugins/ (entire directory)
- Legacy stubs at bottom of lib/auth/auth-options.ts
- 15+ unused npm dependencies (see audit notes)

---

## Graph feeding — required for accurate reads
The identity graph requires regular feeding to stay useful. The initial 127-conversation
batch is the baseline; every week of new work should be added.

**Mechanism**: Export Claude project conversations as text files, drop in a folder, run the script.

```bash
CRON_SECRET=<secret> node scripts/ingest-recent.mjs ./conversations/
```

- The script reads `.txt` and `.md` files from the directory
- Tracks processed files in `.ingested.json` (safe to re-run)
- POSTs each new file to `/api/ingest/conversation` (Bearer CRON_SECRET auth)
- Daily-brief cron surfaces a DraftQueue warning if graph hasn't been fed in 48+ hours

## Agent Layer
Six specialist agents run on schedule, think like domain experts, and stage all findings
in DraftQueue for one-tap approval. Nothing executes without approval. Skipped
items train the agent to find better signals next time.

**STATUS: Crons disabled until first public user to save API costs.**

| Agent | Persona | Schedule | Route |
|-------|---------|----------|-------|
| UI/UX Critic | Senior Apple product designer | Daily | `/api/cron/agents/uiux-critic` |
| Pricing Analyst | SaaS pricing expert | Weekly | `/api/cron/agents/pricing-analyst` |
| GTM Strategist | Growth hacker | Daily | `/api/cron/agents/gtm-strategist` |
| Retention Analyst | Churn analyst | Weekly | `/api/cron/agents/retention-analyst` |
| Trust Auditor | Skeptical first-time user | Daily | `/api/cron/agents/trust-auditor` |
| Distribution Finder | Connector | Daily | `/api/cron/agents/distribution-finder` |

All agents write to `tkg_actions` with `status='draft'` via `lib/agents/base-agent.ts`.
User approves or skips in DraftQueue. Approved = execute. Skipped = feedback weight -0.5.

---

## QA Standard — run this automatically
After EVERY commit, before marking anything done:
1. Screenshot every affected screen at 390px and 1280px
2. Hit every affected API endpoint and confirm real data returns
3. Walk the full user journey touching the changed code as a first-time user
4. Fix anything that looks broken, confusing, or unpolished before reporting back
5. Never say "done" until you've verified it yourself
6. After every push to main, fetch the Vercel build logs and fix any build failures
   before stopping. Do not mark anything done until foldera.ai shows a successful
   deployment. Never stop at a broken Vercel build.
7. After merging any branch, run `npm run build` locally before pushing to main.
   A broken local build means a broken Vercel deploy. Never push a build that fails locally.
8. When creating new lib/ modules that are imported by existing routes, always create
   the file in the same session. Never leave an import pointing to a file that doesn't exist.
9. After all changes are complete and local build passes, merge your branch to main,
   push main to origin, and verify the Vercel deployment succeeds. Never stop or report
   done on a branch. Always finish on main with a successful Vercel deploy.
10. Before pushing any code, review all changes through these professional lenses and fix
    issues proactively. Do not wait for Brandon to find them:
    - UX: Is the user journey clear? Can a stranger use this without instructions?
    - Visual: Does every screen look like a $99/month product? No raw errors, no broken
      animations, no dev artifacts visible.
    - Copy: Does any user-facing text use internal jargon? Fix it.
    - Consistency: Do all pages use the same design language, spacing, and component styles?
    - Error handling: Does every user action have a graceful failure state? No raw error
      messages ever reach the user.
    - Dead UI: Is there any button, link, or feature that doesn't work? Remove it or fix it.
    Brandon should never discover a visual bug, a broken button, or an inconsistency.
    Find them yourself before reporting done.

---

## Build priority (in order)
1. Delete dead code and unused dependencies (see "Dead code" section above)
2. Unify onboarding into one path at /start with both Google and Microsoft buttons
3. Build artifact generation layer (lib/conviction/artifact-generator.ts)
4. Build calendar sync cron for Outlook and Google Calendar
5. Deploy self-feeding loop (engine + agent outputs piped through extractFromConversation)
6. Verify Outlook OAuth flow end-to-end
7. Disable agent crons in vercel.json until first public user

## Env vars required in Vercel
ANTHROPIC_API_KEY, AZURE_AD_CLIENT_ID, AZURE_AD_CLIENT_SECRET,
CRON_SECRET, DAILY_BRIEF_TO_EMAIL,
GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, INGEST_USER_ID,
NEXTAUTH_SECRET, NEXTAUTH_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
NEXT_PUBLIC_SUPABASE_URL, RESEND_API_KEY, RESEND_FROM_EMAIL,
RESEND_WEBHOOK_SECRET, STRIPE_PRO_PRICE_ID,
STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
SUPABASE_SERVICE_ROLE_KEY
