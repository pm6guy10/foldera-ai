# Foldera North Star Lock

## Authority status

`CURRENT_CONTROL`.

This file is the controlling Foldera North Star artifact for product, business, UX, runtime, source-truth, and issue-order direction. It is subordinate to explicit GitHub issue scope for one active seam at a time, but any product/business/UX/runtime PR must cite this lock when it changes or claims direction.

## Executive verdict

Foldera is a Workday Presence Layer, not a dashboard, task manager, inbox summary, chatbot, surveillance product, or broad workflow suite.

The locked path is: read source truth, preserve workday state, choose at most one safe intervention, let the user respond with one click, update state, and stay quiet otherwise.

The product is not pilot-ready until Brandon is no longer the router.

## Product identity

Foldera checks work sources so the user does not keep reopening Slack, email, calendar, docs, files, tasks, and notes to reconstruct context.

The product promise is one timely, grounded re-entry move from real sources, with safe silence when no move is justified.

Doctrine:

- state
- connectors
- triggers
- one intervention

The user-facing product must produce finished value, safely self-prepare or self-recover, or ask for one irreducible blocker in plain language.

## Explicit rejections

Foldera must not become:

- dashboard triage
- task lists
- inbox summaries
- chatbot-first UI
- surveillance or screen-reading framing
- fake enterprise proof
- generic workflow automation
- connector expansion theater
- broad admin panels as the core value loop
- a product that requires Brandon to route every finding, issue, proof gap, or next step

## First buyer/user

The first buyer and user is a cognitively overloaded professional who loses work context across real sources and needs the next safe re-entry move without rebuilding the whole day manually.

The wedge can start with Brandon as owner-user, but the buyer definition is not Brandon-specific. Pilot proof must work for a non-owner or be explicitly classified as owner-only proof.

## Revenue/pricing lock

Foldera revenue is justified by reliably saving cognition and preventing missed re-entry moments, not by selling dashboards or generic automation breadth.

Pricing direction stays pilot-honest until proof exists:

- free or trial entry before paywall pressure
- paid plan only after a user receives credible first value
- premium price justified by repeated source-backed re-entry value
- no unsupported enterprise, Teams, email, calendar, or automation claims before those rails are proven

`REVENUE_PROOF.md` remains reference for older GTM proof. Future pricing or revenue PRs must cite this lock and the current proof gate they advance.

## Public-site lock

The public site must sell the Workday Presence Layer promise: Foldera keeps place across work sources and gives one grounded next move.

Public-site direction:

- no fake enterprise readiness
- no unsupported connector claims
- no broad productivity dashboard framing
- no screenshots or copy that imply Teams/email/calendar/live Slack behavior beyond current proof
- `/start` remains the pilot CTA unless GitHub source truth changes it

Landing implementation remains out of scope for issue #156.

## Day-one app experience lock

Day one is not a dashboard tour.

The first usable experience should make the user feel:

1. Foldera knows the current workday state.
2. Foldera found one source-backed re-entry move or stayed quiet safely.
3. The user can answer with one click.
4. State updates without needing manual routing.

The app may expose trust controls and fallback diagnostics, but those are not the core product loop.

## Holy-crap moment

The holy-crap moment is:

Foldera notices the exact thread, commitment, blocker, or timing shift the user would otherwise have had to rediscover, and gives one next move that feels immediately usable.

It is not a summary. It is not a list. It is not "open the dashboard and decide."

## Runtime brain path

The runtime brain path is:

1. ingest or read source-shaped evidence
2. normalize into safe state candidates
3. preserve source trail without raw private content
4. select at most one intervention
5. generate a Right Now payload
6. accept one user response
7. mutate workday state
8. remain quiet until a new justified trigger exists

Paid/model-backed proof is not default. Free deterministic proof, fixtures, and source-backed selectors are the first proof layer.

## Source-backed Right Now path

PR #153 / issue #151 landed the source-backed selector path.

That path is the current repo-backed bridge from existing `tkg_signals`, `tkg_commitments`, and optional `tkg_actions.evidence` shaped rows into `WorkdayPresenceState` with `state_source: "source_backed"` and safe `source_trail[]`.

Future Right Now changes must preserve:

- at most one intervention
- redacted source trail
- no raw private content
- no inline full state recompute
- no mutation of `tkg_*` source tables unless a future issue explicitly authorizes it

## Slack/live rail boundary

Issue #140 / PR #142 remains parked rail-only and externally blocked.

It must not be widened into product brain, source-backed selector, connector platform, dashboard, landing, Teams, email, calendar, or Supabase work.

The live Slack boundary is only:

- prove whether a real signed Slack button callback POST reaches `/api/slack/interaction`
- if no POST reaches Vercel, keep the blocker external unless logs prove a code-owned failure
- do not patch Slack code, app settings, Vercel settings, or rail behavior from a North Star Lock PR

## Intake / command rail

Messy input from Brandon, GPT, Codex, Figma, Lovable, business plans, audits, screenshots, or runtime logs must enter a command rail instead of becoming ad hoc implementation.

The rail is:

1. classify the input
2. bind it to an existing GitHub issue/PR when possible
3. create one new issue only when no existing target fits and the finding is actionable
4. update source truth only when command state changes
5. execute one issue only
6. post receipt
7. stop

Brandon must not be the router between tools, stale docs, half-proofs, and next moves.

## Source-truth authority order

Current authority order:

1. GitHub source truth plus `ACTIVE_HANDOFF.md`
2. `FOLDERA_BUILD_ORDER.yaml`
3. active GitHub issue
4. issue #48 and `FOLDERA_OPERATING_SYSTEM.md`
5. `FOLDERA_NORTH_STAR_LOCK.md`
6. `FOLDERA_LAUNCH_ROADMAP.md`
7. `docs/SOURCE_OF_TRUTH_MAP.md`
8. execution contracts such as `AGENTS.md`, `CODEX_START.md`, `GPT.md`, and `.github/pull_request_template.md`
9. proof gates such as `ACCEPTANCE_GATE.md`
10. reference or historical docs

When sources conflict, do not guess. Update or comment on GitHub source truth before coding.

## Stale-doc containment

Older docs that mention command-center framing, daily brief framing, older issue order, old landing claims, or broad connector aspirations are reference only unless the current active issue explicitly revives them.

Stale docs may inform context, but they must not:

- select the active seam
- override #48 or this lock
- authorize product implementation
- claim pilot readiness
- reopen closed or superseded issues

## Issue order after this lock

After issue #156, the next issue order is blocked until GitHub source truth names exactly one next seam.

The parked facts are:

- issue #140 / PR #142 remains live Slack rail only and externally blocked
- issue #136 remains ledger-only
- issue #151 source-backed selector is complete
- issue #154 selection seam is complete/blocked and must not implement the lock

The next authorized seam must be named in `ACTIVE_HANDOFF.md` and `FOLDERA_BUILD_ORDER.yaml` before implementation.

## Required gates

For issue #156:

- `npm run gate:command`
- `npm run gate:continuity`
- `npm run lint`
- `git diff --check`
- focused config/source-truth tests if gate files change

For future product/runtime seams, proof must match the affected path and CI lane. Local docs, screenshots, and passing build are not product proof by themselves.

## PR traceability requirement

Every future PR that changes or claims product, business, UX, public-site, runtime brain, Right Now, Slack/live rail, intake/command rail, source-truth authority, issue order, pricing, or pilot-readiness direction must cite `FOLDERA_NORTH_STAR_LOCK.md`.

If the lock is unchanged, the PR must say `unchanged - reason`.

If the PR contradicts this lock, it must update this lock or stop as a source-truth conflict.

## Pilot-ready definition

Foldera is pilot-ready only when:

- the Workday Presence Layer promise is truthful on the public site
- a user can experience one source-backed Right Now move or safe silence
- one-click response updates state
- proof does not require Brandon as narrator, tester, router, or project manager
- forbidden dashboard/task-list/inbox-summary/chatbot drift is absent
- any live rail claim has the right runtime proof
- source truth names the next seam or explicit blocker

Pilot-ready does not mean enterprise-ready.

## Brandon cognitive-load / household-peace constraint

Foldera is failing operationally if Brandon must keep:

- reconciling stale docs
- deciding which agent is right
- pasting proof between tools
- remembering issue order
- routing audit findings manually
- testing rails that the repo can classify
- explaining the product doctrine every session

This lock exists to reduce cognitive load and protect household peace. The repo must carry the direction, issue order, proof standard, and stop condition.

## Stop condition

Stop when:

- this lock exists as `CURRENT_CONTROL`
- `docs/SOURCE_OF_TRUTH_MAP.md` classifies it
- future PR traceability requires it when direction is implicated
- stale docs are contained as reference or archive
- issue #140 / PR #142 remains parked rail-only
- issue #136 remains ledger-only
- the next issue order is named or blocked with reason
- required gates pass or exact dependency blocker is reported
- GitHub PR and ledger receipts are posted
- no product implementation was touched
