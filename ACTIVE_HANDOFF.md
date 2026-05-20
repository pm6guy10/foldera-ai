# ACTIVE HANDOFF - FOLDERA

Last updated: 2026-05-20
Source of truth purpose: this file is the live command board for Foldera. Read this first in any new chat, Codex session, or repo handoff.

## Product doctrine

Foldera is a Workday Presence Layer / context conduit.

It is not a dashboard, task manager, inbox summary, daily brief, or generic chatbot.

Core doctrine:
- state + connectors + triggers + one intervention
- remember where the user was
- detect when re-entry is needed
- surface one next move where the user already works
- let the user respond with Done / Stuck / Break smaller / Snooze
- update state
- stay quiet otherwise

Privacy doctrine:
- no screen-reading
- no hidden activity monitoring
- no surveillance framing
- use only consented connectors and explicit user/workday state

## Current truth

PR #47 is merged.
- Issue #45 shipped the Morning Anchor / persistent workday state foundation.
- Workday presence state exists.
- Dashboard can act as the control room.

PR #54 is merged.
- Issue #53 shipped portable Right Now message payloads and simulated actions.
- The Right Now card can be represented as a message payload.
- Done / Stuck / Break smaller / Snooze action semantics exist in code.
- No live Slack/Teams/email send exists yet.

Issue #48 is the roadmap control tower.
- It locks the Workday Presence Layer doctrine.
- Use it to understand product direction.

Issue #55 is the active rung.
- Title: Add proactive re-entry trigger loop.
- Goal: run morning, pre-meeting, end-of-day, and waiting-on/thread-changed trigger checks in manual/test mode.
- Output must be either one Right Now intervention or quiet/no-intervention.
- Quiet state must not create fake work, task lists, inbox summaries, dashboard dumps, or do_nothing directives.

## Active roadmap order

1. Issue #55 — proactive re-entry trigger loop. ACTIVE NOW.
2. Durable thread ledger for multi-day work.
3. Connector intelligence for Slack/Teams/email/calendar/files.
4. Real delivery surfaces: Slack, Teams, email, mobile.
5. Beta proof with non-owner users.

## Parked / forbidden unless explicitly assigned

Do not work:
- PR #44
- PR #46
- Dependabot PRs
- live Slack/Teams/email send
- connector intelligence
- durable thread ledger
- Stripe / billing / auth rewrite
- broad dashboard redesign
- deleting scorer.ts
- deleting conviction-engine.ts
- homepage polish unless directly tied to product proof

## Execution rule

One active rung at a time.

One issue = one clean branch/worktree = one PR = proof = merge or reject = next rung.

Codex must read issue #48 and this file before product work.

Codex may not self-select the next issue or continue across roadmap rungs after a PR is opened/updated.

## Controllers and gates are mandatory

The handoff is not enough by itself. Every product PR must run the relevant repo controllers/gates and report results.

Baseline gates for every product PR:
- npm run lint
- npm run build
- npm run health when environment allows it
- npm run gate:status when environment allows it
- npm run gate:quality when product quality is affected
- npm run gate:visual or npm run gate:frontend when UI/dashboard/frontend truth is affected
- focused unit/API tests for the assigned issue

Controller scripts are truth selectors, not optional suggestions:
- npm run controller:autopilot may identify the next failing condition, but it may not authorize multi-issue work.
- npm run gate:status, gate:quality, gate:visual, gate:frontend, and gate:decision-trace should be used when their surface is relevant.
- Red CI or red gate means fix only the exact failing job/gate for the assigned issue.
- Green local proof is not enough if GitHub/Vercel/prod gates are red or pending.

Product PR receipt must include:
- exact issue implemented
- branch/PR
- files changed
- focused tests run
- npm gates run
- GitHub Actions status
- Vercel status when deployed
- production /api/health SHA when deployed
- remaining blocker
- next human decision

## Required proof standard

For issue #55:
- unit tests for morning_anchor
- unit tests for pre_meeting
- unit tests for end_of_day
- unit tests for waiting_on_changed
- unit/API tests for quiet/no-intervention
- regression proof that no task list, inbox summary, dashboard dump, or do_nothing directive is created
- npm run lint
- npm run build
- npm run gate:status when environment allows it
- npm run gate:quality when environment allows it

If frontend or visible surface changes, add screenshots to the PR and run npm run gate:frontend.

If deployed to production, verify production /api/health SHA equals latest main before calling it live.

## Human-only decisions

Ask Brandon only for:
- product direction changes
- paid/model-backed generation approval
- outbound send approval
- payment/Stripe action
- destructive database action
- schema migration approval
- privacy or safety judgment
- beta/customer positioning judgment

Everything else should be handled by the operator layer.

## Exact next Codex prompt

Before coding, read GitHub issue #48 and ACTIVE_HANDOFF.md and treat them as the product contract.

Implement GitHub issue #55 only.

Start from clean origin/main.

PR #47 and PR #54 are already merged.

Product truth:
Foldera is a Workday Presence Layer / context conduit. It should not wait for the user to open the dashboard. It should run proactive re-entry checks and return either one useful Right Now intervention or stay quiet.

Goal:
Add the proactive re-entry trigger loop in test/manual mode using existing workday presence state and existing Right Now message/action payloads.

Required trigger types:
- morning_anchor
- pre_meeting
- end_of_day
- waiting_on_changed

Required behavior:
- Each trigger returns either one Right Now intervention or quiet/no-intervention.
- Morning anchor uses saved state to produce the first re-entry move.
- Pre-meeting produces one prep move only if event context requires prep.
- End-of-day carries forward one restart point.
- Waiting-on changed surfaces one intervention only if it affects active state/thread.
- Quiet state must not create do_nothing, fake work, task list, inbox summary, or dashboard artifact.
- Keep Done / Stuck / Break smaller / Snooze compatible with the existing message-action path.

Also update ACTIVE_HANDOFF.md if the active rung, merged SHA, next rung, forbidden work, stop condition, or mandatory gate status changes.

Forbidden:
Do not touch PR #44, PR #46, Dependabot, live Slack/Teams/email send, connector intelligence, durable thread ledger, billing, auth, dashboard redesign, scorer.ts, or conviction-engine.ts.

Proof:
- Unit tests for all four trigger types.
- Unit/API tests for quiet/no-intervention.
- Regression test proving no task list, inbox summary, dashboard dump, or do_nothing directive is created.
- npm run lint.
- npm run build.
- npm run gate:status when environment allows it.
- npm run gate:quality when environment allows it.

Open one PR, include proof, and stop.

Stop when #55 has one PR proving proactive trigger checks work in manual/test mode, or report the exact blocker.

## Stop condition

Current stop condition:
Issue #55 has one PR with proof, including mandatory relevant gates, or the exact blocker is reported.

Do not begin durable thread ledger, connector intelligence, live Slack/Teams/email send, or beta proof until #55 is merged and verified.
