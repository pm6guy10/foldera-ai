# Foldera Master Bible

Authority status: `REFERENCE_AUTHORITY_AFTER_MERGE`
Historical promotion issue: #181 / PR #191

## Purpose

This is Foldera's canonical plain-English source of truth.

It is the document Brandon should be able to hand to Codex and say:

> run until you get stuck

and expect Codex to understand what Foldera is, what it is not, what the money path is, what must stay forbidden, and how to stop when the seam is blocked.

This bible is reference authority, not live execution authority.
It does not activate queue tasks.
It does not mutate `FOLDERA_EXECUTION_QUEUE.yaml`.

## Foldera In One Sentence

Foldera is a Workday Presence Layer that finds the workday re-entry point before the user reopens five tools, then gives one grounded next move or stays quiet safely.

## North Star

Foldera's north star is:

> find the workday re-entry point before I reopen five tools

That means:

- preserve the user's current workday state
- reconstruct context from real sources
- show one safe next move
- avoid unnecessary noise
- stay quiet when no move is justified

## What Foldera Is

Foldera is:

- a Workday Presence Layer
- a context conduit across work sources
- a state system for current focus, blocker, waiting-on, and next move
- one intervention at a time
- a receipt-producing loop for durable workday actions

Foldera exists to stop the user from having to rebuild the day every time they reopen tools.

## What Foldera Is Not

Foldera is not:

- a dashboard-first product
- a task manager
- an inbox summary tool
- a chatbot-first UI
- a surveillance product
- a screen-reading product
- a broad workflow automation suite
- connector theater
- a fake enterprise proof machine

Foldera must not drift into:

- generic productivity scoring
- meeting notes as the core product
- task list replacement
- inbox triage as the center of value
- a product that requires Brandon to narrate every next step

## User Pain

The pain Foldera solves is not "I lack information."

The pain is:

- I know the answer is somewhere in my tools.
- I do not want to reopen five tools to rebuild context.
- I do not trust an answer unless it is grounded in something real.
- I need one safe move, not another summary.
- I need Foldera to stay quiet when nothing should happen.

## Workday Presence Layer Doctrine

Workday Presence Layer means:

- state
- connectors
- triggers
- one intervention

The product should remember:

- current focus
- next move
- blocker
- do-not-touch
- waiting-on
- last completed step
- source trail
- freshness / last updated time
- safe silence reason

The product should not become a generic knowledge graph or a permanent dump of private content.

## How Sources Become Signals

Foldera should ingest source-shaped evidence only.

Sources may be:

- consented connectors
- controlled fixtures
- explicit user state
- known work artifacts
- safe state transitions

Each source should be represented with:

- source id
- source type
- timestamp
- ownership or workspace boundary
- freshness
- redacted or hashed content where needed

Source-shaped evidence becomes signals when the system extracts safe facts:

- blocker
- waiting-on
- reply-needed
- timing shift
- completed step
- no-safe-state condition
- source freshness
- source readiness

Raw private content should not leak into receipts or logs unless a future issue explicitly requires a safe, bounded form.

## How Signals Become Context

Signals become context when they are merged into the current workday state.

Workday context should hold:

- current focus
- next move
- blocker
- do-not-touch
- waiting-on
- last completed step
- source trail
- safe silence reason
- last user response
- receipt id or audit pointer when applicable

Context is not a task list.
Context is not a historical archive.
Context is the current operating state of the user's workday.

## How Context Becomes One Next Move

Foldera should infer at most one of these:

- Do this next
- Fix this first
- You are clear right now

Inference rules:

- if the source trail supports a safe move, pick it
- if the blocker is more important than the next move, fix that first
- if no action is justified, stay quiet
- if the evidence is weak, do not manufacture confidence

No verdict is better than a fake verdict.

## First Money-Moving User Journey

The first money-moving user journey is:

1. user understands the Workday Presence Layer promise
2. user enters a controlled account path
3. user consents to one source/evidence lane
4. source-shaped evidence enters the system
5. Foldera normalizes evidence into workday state
6. Foldera decides whether a move is justified
7. Foldera shows one trusted verdict
8. user responds with one click
9. Foldera writes a durable receipt
10. the product stays quiet until the next justified trigger

This journey is money-moving only if the user reaches one grounded verdict without Brandon manually operating the product.

## Done / View / Snooze / Dismiss

The user response loop should support bounded actions:

- Done
- View
- Snooze
- Dismiss

Each action must have a deterministic meaning:

- Done: mark the move completed or acknowledged
- View: open the supporting context without changing the core workday state
- Snooze: defer the move but keep the context
- Dismiss: suppress the current intervention and record why

The user should never be forced into a noisy multi-step workflow just to answer one prompt.

## Durable Receipts

Every meaningful state change should create a durable receipt.

A receipt should record:

- what Foldera showed
- what source trail supported it
- what the user clicked
- what changed in state
- what did not change
- whether anything was sent externally
- timestamp and traceability markers

Receipts are durable truth.
Chat is not durable truth.
Screenshots are not durable truth.

## Proof Model

Proof must match the claim.

Required proof shape:

- deterministic tests for deterministic behavior
- focused tests for source-truth and state behavior
- browser proof for user-facing flow changes
- runtime or deployed proof for live-path claims

Proof ladder:

1. unit / fixture tests
2. focused gate checks
3. browser proof when a user path changes
4. runtime or deployed proof when the seam is live
5. GitHub receipt

Passing build alone is not product proof.

## Privacy and Safety Rails

Safety rules:

- no screen reading for MVP
- no hidden monitoring
- no surveillance framing
- no raw private content in receipts unless explicitly required and safe
- no external send without explicit permission and the right proof for that rail
- no fake compliance claims
- no fake enterprise claims
- no fake customer claims

Foldera should be honest about what it can see, what it stores, and what it cannot prove.

## Forbidden Product Drift

Foldera must not drift into:

- dashboard triage
- inbox summary
- task list product
- chatbot product
- broad workflow automation
- connector theater
- admin-panel-first product
- surveillance
- fake enterprise proof
- manual founder-operated service delivery as the default business model

If a proposed change pushes toward those outcomes, it is drift unless a future issue explicitly authorizes it.

## Forbidden Claims

These claims are forbidden until proven by the right issue and proof gate:

- pilot-ready
- enterprise-ready
- SOC2-ready
- HIPAA-ready
- procurement-ready
- broad Slack / Teams / email / calendar breadth
- live Slack rail proof
- non-owner proof
- paid-pilot readiness
- $29/month readiness
- customer proof without a real customer receipt

Claims must lag proof.

## What Must Be True Before Paid Pilot

Foldera may ask for money only when the product can prove:

- the offer is understandable
- the account path exists
- one source/evidence lane is real or honestly controlled
- one trusted verdict can be produced
- one-click response mutates state
- the product can stay quiet safely
- a receipt proves before state, verdict, response, after state, and source trail
- payment or early-access capture does not require Brandon to manually operate the workflow

The first paid offer should be narrow and honest.
The first paid offer should not require enterprise posture.

## What Must Be True Before Slack Live Rail

Foldera may claim Slack live rail only when the repo has proven:

- the live send boundary is explicitly assigned
- the callback or interaction path reaches the app
- the interaction updates durable state
- the source trail is safe to show
- the no-send / send boundary is explicit and tested
- the live rail is not conflated with test-mode proof

Until that proof exists, Slack live rail remains forbidden claim territory.

## What Must Be True Before Billing, Auth, or Customer-Facing Claims

Foldera may claim billing, auth, or customer-facing readiness only when:

- the user can complete the intended path without Brandon operating it by hand
- the account boundary is real and bounded
- the proof gate matches the claim
- no unsupported enterprise/compliance language is present
- the repository can explain the behavior without relying on marketing optimism

## Queue Execution Law

Queue execution is a routing rule, not product doctrine.

Rules:

- if the repo explicitly declares queue-controlled execution, the live queue file controls task routing
- planning drafts are not active work
- a draft queue is not a live queue
- no task becomes active just because a draft doc exists
- no queue file may be mutated in this issue
- no queue promotion may happen without the relevant source-truth change

## Execution Layer Bridge

This bible is the source.

The next executable layer is:

1. the product spec that turns the bible into acceptance criteria
2. the GitHub issue/PR plan that turns the spec into ordered branches
3. the next-draft queue that maps those branches into non-active draft tasks

When Brandon says "run until you get stuck", Codex should:

- take the next authorized issue from the plan
- work only inside that issue's allowed files
- stop at the first real blocker, proof failure, or permission boundary
- write a durable receipt before stopping

## Exact Stop Conditions

Stop when all of the following are true:

- `FOLDERA_MASTER_BIBLE.md` exists and answers the product, money, proof, and forbidden-work questions clearly
- the bible is usable as the source for the next product spec and execution plan
- the repo can explain what Foldera is and is not without Brandon re-explaining it
- no app/runtime/Slack/Supabase/Stripe/auth/dashboard/package/schema/Vercel files were touched in this planning run
- `FOLDERA_EXECUTION_QUEUE.yaml` was not mutated in this planning run
- PR #189 was treated only as `UNMERGED_DRAFT_CONTEXT_ONLY`

## What Brandon No Longer Has To Re-Explain

After this bible exists, Brandon should not have to re-explain:

- what Foldera is
- what Foldera is not
- why the product exists
- what pain it solves
- how sources become signals
- how signals become context
- how context becomes one next move
- how receipts prove what happened
- why silence is sometimes the correct answer
- why raw private content must not leak
- why the queue is not the same thing as the product
- what work is forbidden until later
- how the next issue should be chosen

---

# PART II — NORTH STAR LOCK (merged verbatim from FOLDERA_NORTH_STAR_LOCK.md on 2026-06-10, issue #240)

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

Hybrid Poster Landing doctrine: when a future active issue explicitly authorizes public-site work, preserve the Hybrid Poster Landing direction as a dark cinematic premium poster sequence with six disciplined sections and a cyan/violet glow system. Do not replace it with screenshot-only mimicry, generic SaaS card grids, or beige dashboard marketing. Enforcement lives in issue-scoped PR review plus the forbidden-claim grep: landing work must stay visually aligned with this direction and must not claim product, connector, trust, automation, Slack, Teams, email, calendar, security, or enterprise behavior beyond source-truth proof.

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

---

# PART II-B — GUARDIAN VISION LOCK (added 2026-06-13 by owner mandate — DO NOT REGRESS)

## The Guardian, Not the Chatbot

This section exists so no future session has to hear Brandon re-explain the product soul. If you are reading this and the session has drifted toward building another scoring module, another classifier, another dashboard, or another chatbox — **stop. Read this. Then ask: am I wiring one real act, or building another brain?**

### The Facebook Pixel, Inverted

The Facebook pixel is the world's most proven total-context machine. It ingests everything about a person from their digital exhaust — every signal, every site, every behavior — builds a model, and hits them at exactly the right moment with exactly the right thing. It works. At planetary scale. Every second.

Foldera is the same machine with the direction of the arrow flipped.

The pixel uses total-context → **sell you something**.
Foldera uses total-context → **look out for you**.

That is not a harder problem. It is the same problem with the sign changed. The technology is proven. The guardian is not science fiction.

Brandon's words: *"I just want a guy that's like watching out for you."*

### Why It Always Feels Like "Reads My Calendar and Pretends to Be Smart"

Because we keep building the **brain** — scoring, detection, classification — and stubbing the **hands** (real action across the user's actual accounts). A brain with no hands can only read the data it was given and describe what it found. That is exactly what it feels like: a summary engine with a thesaurus.

The failure mode, concrete: `relatedEmails: [], relatedDocuments: []` — the easy shell ships, the one valuable part is stubbed, we call it progress. We do this because the brain part is safe (compiles, tests pass, green checkmarks) and the hands part touches the real world and can fail in front of you.

**The law: never ship a detection or scoring component without wiring it to one real runtime consumer in the same PR.** A module with no downstream caller is invisible work. The proof bar is not "tests green." It is: **did it do something the user didn't have to do?**

### The Signal That Makes It "Can't Live Without It"

Brandon named the bar precisely: *"3 days of a week even be like this thing's awesome, I can't live without it."*

That bar is not earned by breadth. It is not earned by a better score. It is earned by **acting for him once**, in a way that he would have had to do himself, at the exact right moment, without him asking.

The Slack loop already fired end-to-end for real. That is the seed. It is one quiet act that landed. Everything from here is widening that one thread — one real act at a time — not adding another detector.

### The Drift to Fight

The product started as an "executive CEO assistant" — a guardian with agency that does things for you. It keeps sliding toward a chatbox in Slack or a summarizer in a browser tab.

That slide happens because a chat interface is easy and acting is hard. Resist it every time. The way to resist it is the law above: **one real act before any new brain component.**

---

# PART II-C — DATA MOAT AND CROWD PREDICTION (added 2026-06-13)

## How Foldera Gets Smarter and Builds a Moat

Foldera starts with one user. But every signal → act → outcome tuple it records is a training row. At scale, those rows become something no competitor can easily replicate: **a crowd-sourced map of what buried signals actually matter to what kind of person, and when, and how.**

### Average Person vs. Professional Signals

A knowledge worker's signal stream looks different from an average person's:
- A knowledge worker has GitHub noise, Slack loops, project-management artifacts, calendar density — 95%+ automated noise by volume.
- An average person has more family/household signals, financial triggers, health events, community obligations.

The hidden-op detector's domain weights (work_transition, medical, money, family_baby, legal_gov…) are the same math for both. But the **calibration** of what actually lands as a "holy-crap moment" is different for each persona.

The crowd data teaches Foldera when the weights are wrong for a specific user class. Example: for a parent of a newborn, `family_baby` events are even higher-consequence than the default weights give them. For a freelancer, `legal_gov` (contracts, tax deadlines) fires more often. For a college-town professional (like CWU), `work_transition` events are frequent *and* pivotal.

### The Prediction Moat

As users accumulate, Foldera can answer questions no one can answer from a single user's data:
- **When** does the buried signal become urgent for this persona? (timing calibration)
- **What** is the best next act to surface? (act ranking over outcomes)
- **How** should it land? (channel + timing + framing)
- **What does "handled" look like?** — when do users close the loop vs. ignore it?

The crowd makes every individual user's experience better. The moat is not the connector count. It is not the scoring formula. It is the outcome data — the feedback loop between "Foldera surfaced X" and "user acted / ignored / came back later." That feedback loop, at scale, is what makes the prediction magical.

### What "Magical" Means

*"How did it know?"*

That is the moment. Not "here are your top 5 items." The moment is: Foldera surfaced the one thing the user had half-forgotten, at the exact moment they needed it, in the place they already were, and they did not have to ask.

That requires: (1) the right signal, (2) at the right time, (3) delivered in the right channel, (4) with one clear act. All four. Not three.

The scoring is (1). The imminence multiplier is (2). The Slack loop is (3). The "one click = done" response is (4). We have all four components. The job is to wire them end-to-end for real users, not keep tuning them in isolation.

---

# PART III — PRODUCT OPERATING SYSTEM (merged verbatim from FOLDERA_PRODUCT_OPERATING_SYSTEM.md on 2026-06-10, issue #240)

# Foldera Product Operating System

## Authority status

`CURRENT_CONTROL`.

This file controls Foldera's product roadmap, phase order, backlog lanes, business path, enterprise-readiness path, proof gates, owner-burden protection, and next-seam recommendation.

It does not replace `FOLDERA_NORTH_STAR_LOCK.md`. The North Star Lock remains product doctrine control. This file translates that doctrine into executable repo sequencing.

Enforcement:

- Required file: `FOLDERA_PRODUCT_OPERATING_SYSTEM.md`.
- Source-truth gate: `npm run gate:command` verifies this artifact exists and contains the required roadmap/phase/backlog/enterprise sections.
- Continuity gate: `npm run gate:continuity` verifies source-truth files agree on the active issue and authority map.
- PR receipt: any product, business, UX, runtime, roadmap, or source-truth direction PR must cite this file when direction or phase order is implicated.

## 1. Executive verdict

Foldera is a Workday Presence Layer.

Core model:

- state
- connectors
- triggers
- one intervention

Core promise:

- one trusted next move, or safe silence

Foldera is not pilot-ready until Brandon is no longer the router. A path that needs Brandon to repeatedly decide which stale doc, issue, agent output, mock, runtime log, or proof gap matters has failed operationally.

Foldera becomes enterprise-ready only after proof, trust, auditability, admin controls, connector reliability, support posture, and safe claims exist. Enterprise-ready is not a 1-3 week claim. The near-term goal is repo-directed execution plus demo/proof loop, not enterprise posture.

The purpose of this artifact is to make the repo carry the vision. Future Codex sessions should not need Brandon to restate what Foldera is, what it is not, what phase the product is in, or what should happen next.

Enforcement:

- `FOLDERA_NORTH_STAR_LOCK.md` controls product doctrine.
- This file controls phase and backlog sequencing.
- `ACTIVE_HANDOFF.md` and `FOLDERA_BUILD_ORDER.yaml` control the current active seam.
- PR receipt must state the phase advanced and whether this file was updated, cited, or unchanged with reason.

## 2. The holy-crap moment

Foldera notices the thread, commitment, blocker, timing shift, or workday state change the user would otherwise have had to rediscover manually, then gives one grounded next move or stays silent safely.

The payoff is not "you have a dashboard." The payoff is "Foldera found the re-entry point before I reopened five tools and rebuilt the context myself."

Foldera is not:

- a dashboard
- an inbox summary
- a chatbot
- a task list
- a generic productivity assistant
- surveillance
- connector theater

Enforcement:

- Product non-goals in this file are checked by PR scope review.
- Public claim expansion requires a future issue that cites this file and names the proof gate advanced.
- Dashboard, chatbot-first, task-list, inbox-summary, or surveillance drift is forbidden unless this file and the active issue are explicitly changed.

## 3. Core product loop

1. Read source-shaped evidence.
2. Preserve workday state.
3. Detect a meaningful discrepancy, trigger, blocker, timing shift, or next-action gap.
4. Select at most one intervention.
5. Generate the Right Now payload.
6. Show one trusted next move or safe silence.
7. Let the user respond with one click.
8. Mutate state.
9. Preserve source trail and audit trail.
10. Stay quiet until a justified trigger exists.

Enforcement:

- Right Now and workday-state changes must preserve `state + connectors + triggers + one intervention`.
- Source-backed state work must preserve safe `source_trail[]`.
- Product/runtime PR proof must match the affected path; build or docs alone are not product proof.

## 4. Current repo state

Completed work:

- PR #153 / issue #151 source-backed selector is complete.
- PR #158 / issue #156 North Star Lock is complete and `FOLDERA_NORTH_STAR_LOCK.md` is current product doctrine control.
- PR #161 / issue #159 first-10 evidence tracker exists.
- PR #162 post-#159 source-truth realignment is complete.

Parked work:

- Issue #140 / PR #142 remains parked rail-only and externally blocked.
- PR #142 must not become source-truth selection, product brain, connector platform, dashboard, landing, growth, or roadmap work.

Ledger-only work:

- Issue #136 remains the standing Codex Run Ledger only.

Owner-rejected work:

- Manual first-10 evidence remains proof doctrine but is owner-rejected as the primary executable path.
- Placeholder tracker rows are not evidence.
- Repo source truth must not remain blocked on a path Brandon will not execute as the operating system.

Stale/reference docs:

- Older command-center, daily-brief, artifact-wedge, launch, GTM, backlog, and enterprise audit docs may inform context, but they cannot select active work.
- `FOLDERA_LAUNCH_ROADMAP.md` is historical/reference for launch continuity unless a future issue reconciles it.

Unsafe claims:

- No enterprise readiness claim.
- No SOC2, HIPAA, compliance, or procurement-readiness claim.
- No unsupported Slack, Teams, email, calendar, connector breadth, automation, pricing, scale, or non-owner proof claim.

Source-truth contradiction reconciled:

- The first-10 tracker still protects against fake proof.
- Manual first-10 collection is no longer the only executable next move.
- The next executable seam is Repo Intake Governor v0 because it reduces Brandon as router while preserving proof discipline.

Enforcement:

- `ACTIVE_HANDOFF.md` names issue #163 as the active source-truth seam.
- `FOLDERA_BUILD_ORDER.yaml active_issue` is issue #163 during this seam.
- `.foldera-contract.json` limits allowed files to docs/source-truth/gate surfaces.
- `npm run gate:command` rejects stale active issue or missing Product Operating System sections.

## 5. Product non-goals

Foldera must not become:

- dashboard/task-manager drift
- generic AI assistant
- chatbot-first UI
- inbox summary
- fake enterprise readiness
- fake SOC2, HIPAA, or compliance claims
- connector expansion theater
- broad workflow automation suite
- manual Brandon routing
- public claim expansion without proof
- pricing or billing before payment intent
- enterprise posture before trust, admin, audit, support, connector reliability, and safe claims exist

Enforcement:

- PR changed-file review and `.foldera-contract.json` block forbidden surfaces for this issue.
- Future claims require a named phase, proof gate, and active GitHub issue.
- `docs/growth/FIRST_10_ICP_EVIDENCE_TRACKER.md` placeholders cannot unlock product, pricing, channel, scale, or enterprise claims.

## 6. Phase ladder from today to enterprise-ready

| Phase | Purpose | Entry condition | Allowed work | Forbidden work | Proof required | Exit condition | Likely GitHub issue class | Must not claim yet | False advance | Owner-burden impact |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Phase 0: Product Operating System / source-truth reconciliation | Make repo truth carry the product vision and next-seam logic. | PR #162 merged and source truth is blocked on manual first-10 evidence. | This artifact, source-truth files, authority map, gates/tests if needed. | Product/runtime implementation, Slack, landing, Supabase, Stripe, connectors, outreach, customer data. | `npm run gate:command`, `npm run gate:continuity`, `npm run lint`, `git diff --check`. | One Product Operating System PR is open, contradiction reconciled, one next seam named. | SOURCE_TRUTH_ROADMAP_RECONCILIATION. | Pilot-ready, enterprise-ready, customer proof, product shipped. | Treating docs as product proof. | Repo selects next seam instead of Brandon re-explaining it. |
| Phase 1: Repo Intake Governor / command rail | Convert messy inputs into one bounded GitHub issue or a no-action receipt. | Phase 0 merged or accepted. | Issue/PR intake classifier, command rail docs/gates, issue templates if needed. | Runtime product build, Slack rail, frontend, connector expansion, outreach automation. | Deterministic fixtures: pasted input -> classification -> existing issue/new issue/no-action -> source-truth result. | Repo can route GPT/Codex/Figma/Lovable/business-plan findings without Brandon as relay. | REPO_INTAKE_GOVERNOR. | Product feature success, customer demand, live integration proof. | A human still deciding every input by hand. | Reduces Brandon routing load directly. |
| Phase 2: Deterministic owner-safe demo loop | Prove one owner-safe Right Now loop without paid/model/live-rail risk. | Repo Intake Governor exists and points to one demo seam. | Fixture-driven Right Now proof, source trail, one-click response, state mutation, safe silence. | Fake customer proof, live Slack claims, broad dashboard, paid generation by default. | Fixture signals -> workday state -> Right Now card -> response -> mutated state and audit trail. | A demo loop can be replayed without Brandon narrating internals. | DETERMINISTIC_DEMO_LOOP. | Non-owner proof, pilot-ready, enterprise-ready. | A mock-only loop counted as market proof. | Gives Brandon a bounded demo path instead of ad hoc demos. |
| Phase 3: Non-owner proof loop | Prove value with someone who is not Brandon or a reserved test/canary user. | Deterministic demo loop works and proof path is safe. | One real non-owner flow, source-status truth, waiting/no-safe state or source-backed move, feedback. | Synthetic users as beta proof, owner canary as proof, outbound email by default, paid runs without approval. | Real non-owner connects source and reaches clear state or source-backed move with source trail and safe controls. | Non-owner value is proved, rejected, or narrowed. | FIRST_NON_OWNER_PROOF_LOOP. | Repeatable channel, pricing, enterprise readiness. | Owner-only proof classified as customer proof. | Moves proof burden out of Brandon-only narration. |
| Phase 4: First paid or pilot-intent proof | Test willingness to pay only after first value is credible. | Non-owner proof or explicit payment-intent evidence exists. | Manual payment intent, pilot-honest pricing notes, narrow pricing proof. | Stripe buildout by default, public revenue claims, enterprise claims, paid ads. | Receipt for paid-pilot interest, first paid customer, or rejected payment intent. | Pricing/pilot direction is proved, rejected, or blocked. | PRICING_PROOF or PAID_PILOT_INTENT. | Scaled revenue, enterprise procurement readiness. | Building billing before payment intent. | Stops pricing work from becoming founder vibes. |
| Phase 5: Connector/source-trail reliability | Make source-backed moves reliable across allowed connected sources. | Proof shows source-backed value matters and a connector/source gap blocks repeatability. | Narrow connector freshness, source trail, readback, reliability gates. | Connector breadth theater, Teams/email/calendar expansion without proof, raw private content leaks. | Freshness/readback/source-trail tests plus live/runtime proof where the seam requires it. | Connector/source trail reliability is repeatable enough for next proof stage. | CONNECTOR_SOURCE_TRAIL_RELIABILITY. | Broad connector support, enterprise-ready integrations. | Adding connectors because they sound impressive. | Reduces manual source checking. |
| Phase 6: Trust, privacy, auditability, admin controls | Build the controls required before serious pilots or organizations. | Non-owner proof and reliability identify trust/admin requirements. | Audit log, privacy controls, source trails, org/account model, roles/permissions if needed, support/incident posture docs. | Fake SOC2/HIPAA, legal claims without evidence, broad admin panels as core value. | Deterministic trust/admin tests, audit trail proof, support/incident runbook proof. | Trust/admin posture is truthful enough for controlled pilots. | TRUST_ADMIN_AUDITABILITY. | Enterprise-ready, certified compliance. | Compliance theater. | Reduces Brandon as support and trust explainer. |
| Phase 7: Enterprise readiness | Prepare for enterprise only after repeatable proof and trust foundation exist. | Repeatable non-owner/pilot proof, source reliability, trust/admin/audit/support posture. | Enterprise-readiness audit, procurement-safe claims, support SLAs if true, legal/compliance posture appropriate to actual claims. | Enterprise claims before controls, fake certifications, unsupported connector breadth. | Full readiness checklist with evidence, not aspiration. | Foldera may claim enterprise readiness only for proved surfaces. | ENTERPRISE_READINESS. | Anything not proven by the checklist. | Time-boxed docs called readiness. | Brandon no longer hand-waves trust posture. |

## 7. Product backlog lanes

| Lane | Why it matters | Earliest phase | Forbidden premature work | Proof gate | Related docs/issues/PRs | Eventually unlocks | Claim still forbidden until then |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Source truth / command rail | Keeps agents on one seam and makes repo truth executable. | Phase 0 | Product/runtime work before source truth is aligned. | `gate:command`, `gate:continuity`, PR receipt. | ACTIVE_HANDOFF, FOLDERA_BUILD_ORDER, #136, #156, #159, #163. | Repo-directed execution. | Product success. |
| Repo Intake Governor | Routes messy inputs into one issue, existing surface, or no-action state. | Phase 1 | Implementing every pasted idea, broad cleanup, dashboard work. | Intake fixtures plus source-truth gate. | North Star Lock intake/command rail, #163. | Brandon no longer router. | Customer proof. |
| Ingestion / connectors | Supplies source-shaped evidence. | Phase 5 unless a narrower proof seam requires earlier fixture work. | New connector breadth, Teams/email/calendar expansion, scraping. | Connector freshness/readback proof. | #140 rail boundary, source-backed selector #151. | More reliable source evidence. | Broad connector support. |
| Source-backed state | Turns source-shaped rows into safe workday state. | Phase 2 | Raw private content, full inline recompute, mutation of source tables. | Focused selector/state tests and source-trail proof. | #151 / PR #153. | Source-backed Right Now moves. | Live connector breadth. |
| Discrepancy / trigger engine | Decides when interruption is justified. | Phase 2 | Notification noise, task-list generation, surveillance framing. | Trigger fixtures and safe-silence tests. | North Star runtime path. | Timely interventions. | Proactive automation claims. |
| Right Now card | Shows one trusted next move. | Phase 2 | Dashboard summary, multiple-task slate unless a future phase proves it. | Payload/card fixture and UI proof if user-facing. | #131, #151, #140 boundary. | Demoable intervention. | Live Slack proof. |
| One-click response loop | Lets user answer without opening another workflow. | Phase 2 | Broad workflow automation, hidden sends. | Done/Stuck/Break smaller/Snooze state proof. | #131 completed deterministic loop. | Low-friction state update. | External send claims. |
| State mutation | Preserves the user's answer and next state. | Phase 2 | Mutating unrelated source tables, raw private state. | Before/after state receipt and audit trail. | Workday Presence state models. | Durable workday continuity. | Enterprise auditability. |
| Evidence/source trail | Makes each move grounded and inspectable. | Phase 2 | Raw private content in receipts/public surfaces. | Source-trail preservation tests. | #151 source_trail. | Trustworthy explanation. | Compliance readiness. |
| Audit log | Makes decisions reviewable. | Phase 6 | Compliance theater before use-case proof. | Audit entry readback and retention proof. | Acceptance/quality gates. | Trust/admin posture. | SOC2/HIPAA. |
| Trust/privacy controls | Keeps the product safe and truthful. | Phase 6 | Fake privacy/compliance claims, broad settings panels. | Privacy/control tests and user-safe copy review. | North Star privacy doctrine. | Pilot trust. | Enterprise readiness. |
| Admin/org readiness | Needed only when more than one real organization/user path exists. | Phase 6 | Org model before proof, broad admin dashboards. | Roles/permissions/org tests if implemented. | Enterprise audit docs. | Team/account pilots. | Enterprise procurement. |
| Billing/pricing only after proof | Prevents Stripe and pricing from outrunning value. | Phase 4 | Stripe before payment intent, pricing claims before first value. | Payment-intent or paid-pilot receipt. | REVENUE_PROOF reference. | Paid pilot direction. | Repeatable revenue. |
| Public site / positioning only after safe claims | Public copy must lag proof. | Phase 3 or later depending on claim. | Unsupported enterprise, connector, Slack, Teams, email, calendar, automation claims. | Claim-control review and user-facing proof. | North Star public-site lock, first-10 tracker. | Safer acquisition copy. | Claims not proved by phase. |

## 8. Business roadmap

Business direction:

1. Pilot-honest positioning first.
2. First value before paywall pressure.
3. First non-owner proof before scale.
4. First payment intent before Stripe/buildout.
5. Repeatable channel only after repeated proof.
6. Enterprise only after trust, auditability, admin, support, repeatable proof, connector reliability, and safe claims exist.
7. Public copy must lag proof, not lead proof.

Forbidden business claims:

- unsupported enterprise readiness
- unsupported SOC2, HIPAA, compliance, or procurement readiness
- unsupported Teams/email/calendar/Slack/live connector breadth
- unsupported automation
- unsupported repeatable channel
- unsupported scale narrative
- pricing pressure before payment intent

Enforcement:

- `docs/growth/FIRST_10_ICP_EVIDENCE_TRACKER.md` remains proof doctrine/reference.
- Placeholder tracker rows are not demand.
- Future pricing, GTM, public-site, connector, or enterprise PRs must cite this file and name the phase and proof gate advanced.

## 9. Enterprise-ready definition

Enterprise-ready is a future phase requiring all of the following:

- repeatable non-owner proof
- source-trail reliability
- privacy controls
- audit log
- admin controls
- org/account model
- permissions/roles if needed
- support posture
- incident/recovery posture
- safe public claims
- legal/compliance posture appropriate to claims
- no fake SOC2/HIPAA claims
- no unsupported connector claims

Enterprise-ready is not a 1-3 week claim.

The near-term goal is repo-directed execution plus demo/proof loop, not enterprise posture.

Enforcement:

- Enterprise claims are forbidden until Phase 7 entry conditions and proof exist.
- Any enterprise-readiness PR must cite this section and include checklist evidence.
- Docs-only enterprise language without proof must be classified as reference, audit, or future posture, not readiness.

## 10. Owner-burden rule

Brandon may provide vision, constraints, rejection, and taste.

The repo must convert those into source-truth state.

Future work must not require Brandon to repeatedly route stale docs, Codex outputs, Figma/Lovable outputs, issue states, runtime logs, proof gaps, or next seams.

If Brandon is the only person who can decide the next move, the repo has failed.

Any path that requires Brandon to manually sustain the system must be classified as owner-burden unless it is a bounded proof loop.

Enforcement:

- Repo Intake Governor v0 is the next seam because it directly reduces Brandon routing load.
- Future no-action or blocked states must be recorded in GitHub issue/PR/ledger receipts.
- Source-truth closeout must name the next seam or blocked reason.

## 11. Manual first-10 evidence status

The tracker remains reference/proof doctrine.

Manual first-10 evidence is owner-rejected as the primary operating path.

Do not delete the tracker.

Do not count placeholders as evidence.

Do not let the repo remain blocked on manual first-10 evidence as the only executable next move.

Customer proof is still required before scale, pricing buildout, paid ads, automation, connector claims, or enterprise claims.

Future customer proof must be routed through the phase ladder.

Enforcement:

- `docs/growth/FIRST_10_ICP_EVIDENCE_TRACKER.md` remains the proof doctrine/reference artifact.
- `ACTIVE_HANDOFF.md` and `FOLDERA_BUILD_ORDER.yaml` must not say manual first-10 evidence is the only safe next move after issue #163.
- The next seam is Repo Intake Governor v0, not product implementation or growth automation.

## 12. Source-truth authority

Authority order:

1. GitHub source truth plus `ACTIVE_HANDOFF.md`.
2. `FOLDERA_BUILD_ORDER.yaml`.
3. Active GitHub issue.
4. Issue #48 and `FOLDERA_OPERATING_SYSTEM.md` for carried product doctrine.
5. `FOLDERA_NORTH_STAR_LOCK.md` for product doctrine control.
6. `FOLDERA_PRODUCT_OPERATING_SYSTEM.md` for roadmap, phase order, backlog lanes, business roadmap, and enterprise path.
7. `docs/growth/FIRST_10_ICP_EVIDENCE_TRACKER.md` for first-10 proof doctrine/reference.
8. `docs/SOURCE_OF_TRUTH_MAP.md` for authority classification.
9. `FOLDERA_LAUNCH_ROADMAP.md` as historical/reference unless reconciled by a future issue.
10. Historical specs, audits, backlog, and archives as reference only.

Rules:

- Historical docs cannot select active work.
- Future PRs that change product, business, UX, runtime, roadmap, pricing, enterprise, or issue direction must cite this artifact and name the phase advanced.
- If this artifact conflicts with the active issue, stop and reconcile GitHub source truth before coding.

Enforcement:

- `docs/SOURCE_OF_TRUTH_MAP.md` classifies this file as `CURRENT_CONTROL`.
- `npm run gate:command` verifies the required markers.
- PR receipt must report source-truth closeout values.

## 13. Next-seam recommendation

Recommended next GitHub issue after this PR:

Repo Intake Governor v0.

Phase advanced:

- Phase 1: Repo Intake Governor / command rail.

Why this next:

- It reduces Brandon's routing load directly.
- It turns messy inputs from GPT, Codex, Figma, Lovable, business docs, audits, screenshots, runtime logs, and user objections into one bounded GitHub issue, existing issue/PR routing, or no-action receipt.
- It preserves first-10 evidence as proof doctrine without making manual evidence collection the only executable path.
- It beats Slack/frontend/evidence/connector/pricing/enterprise work right now because those lanes still require stronger command routing and proof discipline before implementation.

Allowed files/work for the next seam:

- command/intake rail docs or controller files if the issue scopes them
- issue template or receipt template updates if needed
- focused deterministic fixtures/tests for classification
- source-truth files if active seam or next-seam state changes

Forbidden files/work for the next seam:

- product runtime implementation unless the issue explicitly scopes a deterministic intake controller
- Slack / PR #142
- landing/frontend/dashboard
- Supabase schema/data
- Stripe
- connectors
- Teams/email/calendar
- outreach, scraping, paid ads, or customer data
- fake enterprise/compliance claims

Proof required:

- deterministic fixture: pasted input -> classify -> existing issue, new issue draft, no-action, or blocked state
- source-truth closeout proof
- `npm run gate:command`
- `npm run gate:continuity`
- `npm run lint`
- `git diff --check`

Stop condition:

- one Repo Intake Governor v0 PR is open with proof and receipts
- repo can route a messy input without Brandon manually deciding the target
- no next implementation seam is started automatically

Enforcement:

- This file names exactly one next seam.
- `ACTIVE_HANDOFF.md` and `FOLDERA_BUILD_ORDER.yaml` carry this next-seam recommendation after issue #163.
- Repo Intake Governor implementation must wait for its own controlling GitHub issue.
