# ACTIVE HANDOFF - FOLDERA

Last updated: 2026-05-20 12:25 PT
Current slice: issue #52 Slack test-mode Right Now interaction loop is merged; production verified.
Current `origin/main` SHA at update time: `95533cb90f808df160a2fabdf121ccf54ebc0ee0`.
Latest verified Vercel production deployment: `dpl_GTvYt7FH3CEF49tK1qYJ5QgiSZzP` READY.
Production `/api/health` git SHA: `95533cb90f808df160a2fabdf121ccf54ebc0ee0`.

## Product doctrine

Foldera is a Workday Presence Layer / context conduit.
State + connectors + triggers + one intervention. Stay quiet otherwise.
No task lists, inbox summaries, dashboard dumps, or `do_nothing` directives as the core value.

## Current truth

- PR #47 merged: Morning Anchor workday presence state exists.
- PR #54 merged: Right Now message payload + Done/Stuck/Break smaller/Snooze simulated actions exist.
- PR #57 merged: proactive re-entry trigger evaluation (manual/test mode) exists.
- PR #58 merged: Slack test-mode Right Now surface exists (no real Slack send).
- Issue #48 is the roadmap/product contract.

## Proof (PR #58)

- Local: focused unit/API tests + `npm run lint` + `npm run build` + `npm run gate:quality`.
- Visual: committed screenshots in `docs/pr-58-screens/*`.
- Production: `/api/health` reports `95533cb90f808df160a2fabdf121ccf54ebc0ee0` on deployment `dpl_GTvYt7FH3CEF49tK1qYJ5QgiSZzP`.

## Parked / forbidden unless explicitly assigned

- PR #44, PR #46, Dependabot
- live Slack/Teams/email send, connector intelligence, durable thread ledger
- billing, auth, dashboard redesign
- `scorer.ts`, `conviction-engine.ts`

## Next exact move

Select the next assigned issue; do not self-select.

## In-progress branch (unmerged)

- Issue #48 Phase 4 (test-mode connector evidence adapters): `codex/issue-48-phase4-connector-evidence-adapters`

