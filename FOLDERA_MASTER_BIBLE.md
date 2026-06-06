# Foldera Master Bible

Authority status: `REFERENCE_AUTHORITY_AFTER_MERGE`
Controlling issue: #181

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