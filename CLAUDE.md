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

## Backlog
- [x] Dynamic onboarding directive — pull from real tkg_patterns instead of hardcoded text
- [x] Outcome confirmation UI — phase state machine on ConvictionCard; ThumbsUp/Down → /api/conviction/outcome;
      feedback_weight +2.0 worked / -1.5 didn't work (edc2d8b... wait, 2e41901)
- [x] Email delivery — 7am daily directive via email, no dashboard required
- [x] Signal ingestion — token-encryption fail-safe; jwt callback persists OAuth tokens to integrations table;
      lib/integrations/outlook-client + gmail-client; /api/cron/sync-email nightly 2 AM (edc2d8b)
- [x] Draft actions layer — tkg_actions status='draft'; /api/drafts/{propose,pending,decide};
      DraftQueue component on dashboard; approve/reject with optimistic UI (64d841b)
- [x] User acquisition agent — lib/acquisition/{keywords,reddit-scanner,twitter-scanner};
      /api/cron/scan-social daily 8 AM; deduplicates via tkg_signals.content_hash;
      outreach drafts appear in DraftQueue for Brandon's one-tap approval (16c233c)

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

## Next horizons (post-backlog)
- Wire real email send on draft approval (Resend for Gmail; Graph API /sendMail for Outlook)
- Calendar integration — Google Calendar / Outlook Calendar event creation from schedule directives
- Add ENCRYPTION_KEY + TWITTER_BEARER_TOKEN to Vercel env vars for production
- Notion signal ingestion — lib/integrations/notion-client, NOTION_API_KEY already set
