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
- [ ] Outcome confirmation UI — one tap to mark a directive as worked or didn't work
- [x] Email delivery — 7am daily directive via email, no dashboard required
- [ ] Signal ingestion — Outlook is primary. Azure AD auth and lib/plugins/outlook/ already
      exist from prior build. Audit what's functional vs graveyard before writing anything new.
      Point working auth at tkg_signals. Also check Gmail OAuth status. Run both nightly via
      existing cron infrastructure.
- [ ] Draft actions layer — stage proposed actions for user approval before executing. User sees
      "Foldera wants to send this email. Approve?" One tap yes or no. Nothing executes without approval.
- [ ] User acquisition agent — monitor Twitter and Reddit for pain signal keywords matching
      Foldera's core problem. Draft outreach messages for Brandon's approval before anything sends.
