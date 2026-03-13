# Foldera — Claude context

Next.js 14 App Router · Supabase · Claude API
Single-user production app. Auth via NextAuth. Ingest user: `INGEST_USER_ID` env var.

---

## Decided — never relitigate
- **Accent color:** cyan/emerald. Not violet. Done.
- **Brain prompt:** chief of staff model, not summarizer. Artifact required on every directive. Done.
- **Cost model:** haiku for artifact assembly, sonnet for final directive generation. Daily cap $1.50. Done.
- **Empty drafts:** validation gate required before staging — missing to/subject/body logs error and skips. Done.
- **Dashboard stats:** remove vanity cards, replace with single signal line. Done.
- **Post-skip state:** terminal message, not empty card. Done.
- **Email is the primary product**, dashboard is secondary. Done.
- **All pushes go to main.** No feature branches.
- **Session logs** appended to CLAUDE.md after every session.

## Build Status
- Phase 1: done
- Phase 2: done
- Phase 3: done
- Phase 4: done

---

## Product Spec — the whole thing

Foldera has one user flow that matters:

1. **Nightly:** cron runs, ingests signals from connected sources, updates identity graph
2. **Morning:** generator runs, queries goals + patterns + action history, produces single directive with artifact via chief-of-staff prompt
3. **Email:** directive + full artifact delivered to user inbox at 7am. **This is the primary product surface.**
4. **Dashboard:** user opens only if they want to approve/skip, review history, or teach Foldera something new. Secondary surface.
5. **Approve:** artifact executes (send email, create doc, log decision). Logged as positive signal.
6. **Skip:** logged as negative signal. Terminal message shown. No regeneration until tomorrow.
7. **Learn:** approval and skip history feed back into next generation cycle. Engine gets smarter.

Every feature must serve this loop. If it doesn't, cut it.

Every CC session starts by reading this spec. If a task contradicts the spec, flag it and ask.

---

## Stack notes
- App Router only — no Pages Router
- All DB access via `createServerClient()` from `lib/db/client.ts` (centralized factory)
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

## Current state (accurate as of March 12, 2026)

### Working
- Identity graph: 315 patterns, 207 commitments, 122 signals from 127 ingested conversations
- Conviction engine: generates directives with confidence scores, feedback loop weighted by action_type history
- Artifact generation: all 6 types live (email, document, calendar_event, research_brief, decision_frame, affirmation) via lib/conviction/artifact-generator.ts with web search integration
- Self-feeding loop: approvals/skips write back to tkg_signals as behavioral signals; next cycle is informed
- DraftQueue: approve/dismiss UI with email deep-links
- Daily email: action cards with approve/skip buttons, progressive subject lines days 1-7
- Dashboard: current priorities (3 slots), quick capture, full artifact preview in conviction card
- Relationship tracker: lib/relationships/tracker.ts — analyzeRelationships + getCoolingRelationships
- Extraction pipeline: lib/extraction/conversation-extractor.ts — full extractFromConversation (not a stub)
- Email sync cron: /api/cron/sync-email — inbox + sent mail + drafts + relationship updates
- Zero-auth demo at /try
- 14-day free trial, $99/month after
- Landing page rewritten for strangers
- Waitlist with email capture
- Health monitoring: stale graph alert if no ingest in 48+ hours
- Security: cron auth, svix webhook verification, token encryption, 30-day data deletion, sanitized error responses
- Retry logic on daily cron
- Email send on approval via Gmail/Outlook (outlook-client.ts and gmail-client.ts)
- Stripe Pro $99/month with webhook endpoint
- Six specialist agents on scheduled crons (disabled until first public user)
- Continuous ingest pipeline: /api/ingest/conversation + scripts/ingest-recent.mjs
- Proactive scanner: lib/acquisition/briefing-scanner.ts, briefing-scorer.ts, reply-drafter.ts
- Skip feedback: skip_reason captured and used for suppression in next generation cycle

### NOT working — must be built
- Calendar sync execution: cron route exists but calendar API clients are not wired to create events on approval
- Outlook OAuth: Azure AD env vars configured, code complete, but not verified end-to-end by current user
- Agent crons: code complete but disabled in vercel.json until first public user

### Dead code — cleaned
All previously identified dead code directories have been deleted (scan-inbox, generate-draft, meeting-prep, plugins). Unused npm dependencies (pdf-parse, react-dropzone, @vitest/ui) removed.

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
11. ML/AI generation checks:
    - [ ] If any generation call fails, the system recovers gracefully. No infinite loops, no crashed dashboard, no raw stack traces to the user.

---

## Build priority (in order)
1. Wire calendar event creation on artifact approval (Google Calendar + Outlook Calendar API clients)
2. Verify Outlook OAuth flow end-to-end with a real user
3. Enable agent crons in vercel.json when first public user arrives

## Env vars required in Vercel
ANTHROPIC_API_KEY, AZURE_AD_CLIENT_ID, AZURE_AD_CLIENT_SECRET,
CRON_SECRET, DAILY_BRIEF_TO_EMAIL,
ENCRYPTION_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, INGEST_USER_ID,
NEXTAUTH_SECRET, NEXTAUTH_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
NEXT_PUBLIC_SUPABASE_URL, RESEND_API_KEY, RESEND_FROM_EMAIL,
RESEND_WEBHOOK_SECRET, STRIPE_PRO_PRICE_ID,
STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
SUPABASE_SERVICE_ROLE_KEY

### ENCRYPTION_KEY
Required in production. 32-byte AES-256 key, base64-encoded.
Encrypts OAuth tokens before storage in the `integrations` table.
App throws at startup if absent in `NODE_ENV=production`.

Generate:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

---

## Session Log — 2026-03-13

### Files changed
- `lib/briefing/generator.ts` — Brain rewrite: new chief-of-staff system prompt, claude-sonnet-4-20250514 model, pre-call queries for approved/skipped (7d), active goals, confirmed patterns (3+). Output format now includes artifact_type + inline artifact + evidence (string) + domain + why_now. API spend cap check before generation.
- `lib/conviction/artifact-generator.ts` — Model changed to claude-haiku-4-5-20251001. Skips generation if directive contains embedded artifact. API usage tracked.
- `lib/utils/api-tracker.ts` — NEW. trackApiCall(), getDailySpend(), isOverDailyLimit(), getSpendSummary(). $1.50/day cap.
- `supabase/migrations/20260313000002_api_usage.sql` — NEW. api_usage table: model, input_tokens, output_tokens, estimated_cost, call_type.
- `app/api/cron/daily-brief/route.ts` — Fix 1: email artifact validation before staging. Missing to/subject/body → log generation_error, skip staging.
- `app/api/settings/spend/route.ts` — NEW. GET /api/settings/spend returns daily/monthly spend summary.
- `app/dashboard/settings/SettingsClient.tsx` — Added AI usage section: daily spend bar vs cap, monthly total.
- `components/landing/chaos-to-clarity.tsx` — 9 violet references → cyan (bg-cyan-500/80, text-cyan-400, from-cyan-400, border-cyan-500/40, bg-cyan-600/15, etc.)
- `lib/agents/uiux-critic.ts` — System prompt updated: "violet" → "cyan/emerald accent colors"
- `scripts/generate-briefing.mjs` — Updated system prompt, model (claude-sonnet-4-20250514), output parsing (artifact_type, artifact, evidence string, domain, why_now), delta display fix, loadEnv() quote stripping.

### Verified working
- `npm run build` passed locally: 0 errors, 0 warnings
- `generate-briefing.mjs` produced a real directive:
  - Type: `drafted_email` / domain: `relationships`
  - Confidence: 87/100
  - Artifact: complete email with real to/subject/body (not empty)
  - Evidence: single sentence, specific and grounded
  - why_now: clear temporal reason
- Vercel deploy: `foldera-l2vdlmd5m-brandons-projects-5552f226.vercel.app` — **Ready**, 1-minute build
- Commit: `d90f8a4`
- Violet grep: 0 matches across all .ts/.tsx/.css files

### NOT verified or incomplete
- `api_usage` table: migration written but NOT applied in Supabase yet. Must run via Supabase dashboard SQL editor before spend tracking is live.
- Settings spend bar: will show $0.00 until migration is applied and generation runs.
- Email artifact validation (Fix 1): logic is in place but cannot be integration-tested without running the full daily-brief cron. Unit behavior confirmed by code review.
- `claude-sonnet-4-20250514` model ID: used as instructed. If this model ID is invalid in Anthropic API, generation will fall back to an error state. Should be verified on first cron run.
- generate-briefing.mjs delta section: minor TypeError for `newType.toUpperCase()` was fixed after the run shown — the fix is in the commit.

### API spend today
- api_usage table not yet created in Supabase. Estimate: ~$0.015 for one generate-briefing.mjs test run (2000 input + 500 output tokens on claude-sonnet-4-20250514).

### Commits
- `d90f8a4` — Brain rewrite, API cost control, empty draft validation, violet cleanup

---

## Session Log — 2026-03-13 (continued)

### Phase 2 — Stress test + rate limit fix
- Pattern cap added: top 20 patterns by activation_count to avoid 30K TPM rate limit on sonnet-4-20250514
- 5 stress-test runs completed; root cause (605 patterns → rate limit) identified and fixed
- Commit: `7d93d18`

### Phase 3 — Dashboard cleanup
- Removed 3 vanity MetricCard components (Activity/Commitments/Noticed)
- Replaced with single signal line: `{N} signals · {N} commitments · {N} patterns detected`
- Fixed post-skip DoneState: `terminal=true` prop suppresses "Generate new read →" link
  - Skip → terminal message: "Next read generates tomorrow morning."
  - Approve → outcome flow → DoneState with regenerate link (unchanged)
- Added QA Standard item #11: ML/AI generation check (graceful failure, no raw stack traces)

### Verified working
- `npm run build` — 0 errors, 0 warnings
- Vercel deploy `foldera-51f33nfg0` — Ready, 1-minute build

### Phase 4 — UX audit (first-time visitor)
- Audited: landing page (390px + 1280px), /try, /start, /start/processing, /start/result, dashboard placeholder pages
- Fixes:
  - Migrated `slate-*` → `zinc-*` in /start/processing and /start/result (design consistency)
  - Updated uiux-critic APP_DESCRIPTION: removed stale `/onboard` route, updated to current /start flow
  - Fixed signals page: "Sources connected" no longer hardcoded to 1 when no sources active

### NOT verified
- api_usage migration still needs applying in Supabase dashboard (run in Supabase SQL editor)

### Final Vercel deploy
- `foldera-72jpqizy2` — Ready, 1-minute build
