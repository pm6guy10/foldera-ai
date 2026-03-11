# Foldera — Claude context

Next.js 14 App Router · Supabase · Claude API
Single-user production app. Auth via NextAuth. Ingest user: `INGEST_USER_ID` env var.

---

## Stack notes
- App Router only — no Pages Router
- All DB access via `lib/supabase.ts` (server-side client)
- Directives live in `tkg_actions`, signals in `tkg_signals`, patterns in `tkg_patterns`, goals in `tkg_goals`
- `/api/conviction/latest` and `/api/graph/stats` are the two dashboard data routes
- Public onboard routes under `/api/onboard/*` use `tempUserId` (UUID), no session required

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

---

## Completed (March 10-11, 2026)
- Identity graph: 315 patterns, 207 commitments, 122 signals from 127 ingested conversations
- Conviction engine: daily reads at 91% confidence with feedback loop weighted by action_type history
- Artifact generation: 2-4 finished work items daily
- DraftQueue: approve/dismiss UI with email deep-links
- Daily email: action cards with approve/skip buttons, progressive subject lines days 1-7
- Zero-auth demo at /try
- 14-day free trial, $99/month after, no $29 tier
- Onboarding walkthrough on /start/result
- Vocabulary scrub across all user-facing UI
- Landing page rewritten for strangers
- Distribution system: daily Reddit/Twitter scan, top 5 in DraftQueue, creator watchlist
- Waitlist nurture: Tuesday emails, open tracking, auto-status lifecycle
- Health monitoring: 6:50am daily, Sunday graph quality
- Security: cron auth, svix webhook verification, Gmail token cleanup, 30-day data deletion
- Retry logic on daily cron
- Real email send on artifact approval via Gmail/Outlook
- Stripe Pro $99/month with webhook endpoint
- Six specialist agents on scheduled crons
- Continuous ingest pipeline: /api/ingest/conversation + scripts/ingest-recent.mjs

## Graph feeding — required for accurate reads
The identity graph requires regular feeding to stay useful. The initial 127-conversation
batch is the baseline; every week of new work should be added.

**Mechanism**: Export Claude project conversations as text files → drop in a folder → run the script.

```bash
CRON_SECRET=<secret> node scripts/ingest-recent.mjs ./conversations/
```

- The script reads `.txt` and `.md` files from the directory
- Tracks processed files in `.ingested.json` (safe to re-run)
- POSTs each new file to `/api/ingest/conversation` (Bearer CRON_SECRET auth)
- Daily-brief cron surfaces a DraftQueue warning if graph hasn't been fed in 48+ hours

## Agent Layer
Six specialist agents run on schedule, think like domain experts, and stage all findings
in DraftQueue for Brandon's one-tap approval. Nothing executes without approval. Skipped
items train the agent to find better signals next time.

| Agent | Persona | Schedule | Route |
|-------|---------|----------|-------|
| UI/UX Critic | Senior Apple product designer | Daily | `/api/cron/agents/uiux-critic` |
| Pricing Analyst | SaaS pricing expert | Weekly | `/api/cron/agents/pricing-analyst` |
| GTM Strategist | Growth hacker | Daily | `/api/cron/agents/gtm-strategist` |
| Retention Analyst | Churn analyst | Weekly | `/api/cron/agents/retention-analyst` |
| Trust Auditor | Skeptical first-time user | Daily | `/api/cron/agents/trust-auditor` |
| Distribution Finder | Connector | Daily | `/api/cron/agents/distribution-finder` |

All agents write to `tkg_actions` with `status='draft'` via `lib/agents/base-agent.ts`.
Brandon approves or skips in DraftQueue. Approved → execute. Skipped → feedback weight -0.5.

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

Brandon should never discover a bug. You should find it first.

---

## Next horizons
- Anthropic API cost monitoring
- Calendar integration (Google Calendar / Outlook)
- Notion signal ingestion
- Supabase Pro upgrade before 30 users
- Landing page real screenshots once artifacts impressive
- First stranger test of onboarding flow

## Env vars required in Vercel
ANTHROPIC_API_KEY, CRON_SECRET, DAILY_BRIEF_TO_EMAIL,
GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, INGEST_USER_ID,
NEXTAUTH_SECRET, NEXTAUTH_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
NEXT_PUBLIC_SUPABASE_URL, RESEND_API_KEY, RESEND_FROM_EMAIL,
RESEND_WEBHOOK_SECRET, STRIPE_PRO_PRICE_ID,
STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
SUPABASE_SERVICE_ROLE_KEY
