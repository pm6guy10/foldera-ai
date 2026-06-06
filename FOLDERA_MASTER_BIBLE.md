# Foldera Master Bible

Authority status: `REFERENCE_AUTHORITY`
Controlling issue: #181

## Purpose

This is Foldera's canonical plain-English operating bible.

It exists so Brandon and future Codex sessions do not have to re-explain what Foldera is, what it is not, what the first money path is, how the product works, what proof counts, and what must stay forbidden.

This document is reference authority for product understanding and build planning.
It is not runtime implementation authority.
It does not activate queue tasks.
It does not mutate `FOLDERA_EXECUTION_QUEUE.yaml`.

## Executive Verdict

Foldera is a Workday Presence Layer.

Foldera is a system that remembers where the user was in their workday, finds the next safe re-entry point, and gives one grounded move or safe silence.

The core loop is:

1. read source-shaped evidence
2. normalize it into safe workday state
3. decide whether interruption is justified
4. choose at most one intervention
5. show one next move or safe silence
6. let the user respond with one click
7. write a durable receipt
8. stay quiet until a new justified trigger exists

## North Star

Foldera's north star is:

> find the workday re-entry point before I reopen five tools

That means Foldera should do the hard part of re-entry:

- remember context
- surface the right thread, blocker, or follow-up
- avoid noisy summaries
- avoid forcing the user to rebuild the day from scratch
- stay quiet when there is no justified move

## What Foldera Is

Foldera is:

- a Workday Presence Layer
- a context conduit across work sources
- a state machine for current focus, blocker, next move, and waiting-on
- one intervention at a time
- a receipt-producing system for trusted workday moves

Foldera helps a user move from "I am lost in my tools" to "I know what to do next" without making them reopen everything.

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
- a model that requires Brandon to narrate every next step

## User Pain

The user pain is not "I have too little information."

The pain is:

- I know the answer is somewhere in my tools.
- I do not want to reopen five tools to rebuild context.
- I do not trust an answer unless it is grounded in something real.
- I need one safe move, not another summary.
- I need to know when I can stay quiet.

The product should reduce context loss, not increase cognition overhead.

## Workday Presence Layer Doctrine

Workday Presence Layer means:

- state
- connectors
- triggers
- one intervention

The product watches for meaningful workday changes and preserves the current work state so the user can re-enter without manual reconstruction.

The product should remember:

- current focus
- next move
- blocker
- do-not-touch
- waiting-on
- last completed step
- source trail
- freshness / last updated time

The product should not become a generic knowledge graph or a permanent dump of private content.

## Core Promise

Foldera promises one of three outcomes:

- Do this next
- Fix this first
- You are clear right now

If none of those can be justified, Foldera should stay quiet.

## First Money-Moving User Journey

The first money-moving journey is:

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

This journey is money-moving only if the user can get to one grounded verdict without Brandon manually operating the product.

## MVP Loop

The minimum viable product loop is:

1. evidence arrives
2. evidence is normalized
3. workday state updates
4. trigger logic runs
5. one verdict is selected
6. the user responds
7. state mutates
8. a receipt is written
9. silence resumes until the next justified trigger

The MVP loop is not complete if it only produces a pretty card or a build that passes.

## Source Ingestion Model

Foldera should ingest only source-shaped evidence that can be explained later.

Sources may be:

- consented connectors
- controlled fixtures
- explicit user state
- known work artifacts
- safe state transitions

Every source must have a safe representation:

- source id
- source type
- timestamp
- ownership / workspace boundary
- freshness
- redacted or hashed content where needed

Raw private content should not leak into public receipts or unnecessary logs.

## Signal Normalization

Normalization means converting messy evidence into safe facts.

Safe facts include:

- blocker
- waiting-on
- reply-needed
- timing shift
- completed step
- next move candidate
- no-safe-state condition
- source freshness / source readiness

Normalization must remove noise, preserve source trail, and avoid inventing extra meaning.

## Artifact / Context Retrieval

Foldera should retrieve:

- the current workday state
- the source trail that justifies it
- the related artifact or context marker
- the smallest useful explanation

It should not retrieve everything just because it can.

The product should help the user re-enter the work, not recreate the archive.

## Workday State Memory

Workday state is the durable memory of the current workday.

It should hold:

- current focus
- next move
- blocker
- do-not-touch
- waiting-on
- last completed step
- source trail
- safe silence reason
- last user response
- receipt id / audit pointer when applicable

This is not a task list.
This is not a historical archive.
This is the current operating state of the user's workday.

## Blocker / Next-Move Inference

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

## Slack / Review Interruption Doctrine

Slack, review, and message interruption must obey the same doctrine:

- one interruption
- one next move
- one click path
- safe silence otherwise

Review interruptions must be source-backed.
If the product cannot justify the interruption, it must not interrupt.

Live Slack rail claims are forbidden unless a future issue explicitly proves that rail.
Test-mode or fixture review paths can exist, but they must be labeled honestly.

## Done / View / Snooze / Dismiss Action Loop

The user response loop should support bounded actions such as:

- Done
- View
- Snooze
- Dismiss

Each action should have a deterministic meaning:

- Done: mark the move completed or acknowledged
- View: open the supporting context without changing the core workday state
- Snooze: defer the move but keep the context
- Dismiss: suppress the current intervention and record why

The user must never be forced into a noisy multi-step workflow just to answer one prompt.

## Durable Receipts

Every meaningful state change should produce a receipt.

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

Proof must match the thing being claimed.

Required proof shape:

- deterministic tests for deterministic behavior
- focused tests for source-truth and state behavior
- browser proof for user-facing flow changes
- runtime or deployed proof for live-path claims
- no build-only victory laps

Proof ladder:

1. unit / fixture tests
2. focused gate checks
3. browser proof when a user path changes
4. runtime or deployed proof when the seam is live
5. GitHub receipt

Passing build alone is not product proof.

## Privacy / Safety Rails

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

## Paid-Pilot Readiness

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

## Build Order from Now to Money-Ready MVP

1. lock source truth and the next seam
2. define the minimum source/evidence lane
3. prove deterministic verdict generation
4. prove one-click state mutation
5. prove durable receipts
6. build the first user journey shell
7. persist source-backed workday state
8. prove no-send, privacy, and source-trail safety
9. add bounded paid-intent capture
10. prove the end-to-end money-ready MVP
11. validate with a non-owner

That order exists to reduce Brandon burden and keep the product honest.

## Next Codex-Ready Issues

These are the next kinds of issues the repo should be able to express clearly.

1. Source-truth registration for the Master Bible
   - Purpose: make the bible discoverable in repo authority.
   - Likely files: `docs/SOURCE_OF_TRUTH_MAP.md`, possibly source-truth closeout docs.
   - Forbidden work: product/runtime changes.
   - Proof: source-truth and continuity gates.

2. Next executable seam selection
   - Purpose: name the next product seam from the bible.
   - Likely files: `ACTIVE_HANDOFF.md`, `FOLDERA_BUILD_ORDER.yaml`.
   - Forbidden work: implementation drift.
   - Proof: source-truth gates.

3. First source/evidence lane selection
   - Purpose: choose the smallest honest evidence lane.
   - Likely files: audit docs, source-truth docs, focused tests.
   - Forbidden work: migrations, connector expansion, fake evidence.
   - Proof: read-only audit plus gates.

4. Deterministic verdict loop
   - Purpose: prove evidence to verdict flow.
   - Likely files: runtime brain modules, fixtures, tests.
   - Forbidden work: live connectors, Slack live rail.
   - Proof: focused tests.

5. One-click response loop
   - Purpose: prove Done / View / Snooze / Dismiss state mutation.
   - Likely files: action/state modules and tests.
   - Forbidden work: broad UI or backend expansion.
   - Proof: before/after state tests.

6. Receipt generation
   - Purpose: make the state change durable.
   - Likely files: receipt modules and tests.
   - Forbidden work: raw private content leakage.
   - Proof: receipt tests.

7. First user journey shell
   - Purpose: expose one honest path to one verdict.
   - Likely files: route and component files for the scoped shell.
   - Forbidden work: dashboard drift, unsupported claims.
   - Proof: browser test.

8. Source-backed state persistence
   - Purpose: keep the user's workday state after refresh/session change.
   - Likely files: state persistence modules and tests.
   - Forbidden work: schema changes without explicit authorization.
   - Proof: persistence tests.

9. Privacy and no-send rail
   - Purpose: prove the product does not send or store unsafe data.
   - Likely files: privacy rails and tests.
   - Forbidden work: external send claims.
   - Proof: privacy gate tests.

10. Paid-intent capture
    - Purpose: let the user express willingness to pay without manual service.
    - Likely files: bounded pricing or payment surfaces if explicitly authorized.
    - Forbidden work: unsupported revenue claims.
    - Proof: payment-intent proof.

11. Money-ready MVP gate
    - Purpose: decide if Foldera may ask for $29/month.
    - Likely files: proof scripts, e2e tests, receipts.
    - Forbidden work: fake customer proof.
    - Proof: end-to-end path proof.

12. Non-owner validation
    - Purpose: verify value beyond Brandon.
    - Likely files: validation path and supporting tests/docs.
    - Forbidden work: owner-seeded fake evidence.
    - Proof: consented non-owner receipt.

13. Trust and auditability
    - Purpose: make the answer inspectable and safe.
    - Likely files: audit trail and privacy docs/modules.
    - Forbidden work: compliance theater.
    - Proof: audit/readback tests.

14. Public claim control
    - Purpose: keep marketing honest.
    - Likely files: source-truth and public-copy docs.
    - Forbidden work: unsupported enterprise claims.
    - Proof: claim-grep and gate checks.

15. Connector reliability
    - Purpose: make a narrow source lane dependable.
    - Likely files: connector-state or ingestion modules if explicitly authorized.
    - Forbidden work: connector breadth theater.
    - Proof: freshness/readback tests.

16. Trigger safety
    - Purpose: prevent noisy or unjustified interruptions.
    - Likely files: trigger logic and tests.
    - Forbidden work: surveillance behavior.
    - Proof: safe-silence tests.

17. Safe silence semantics
    - Purpose: make "You are clear right now" a real product output.
    - Likely files: verdict logic and tests.
    - Forbidden work: manufacturing a move when none exists.
    - Proof: no-safe-state tests.

18. Source-trail rendering
    - Purpose: show why the product believes the move is safe.
    - Likely files: receipt and UI rendering modules if the issue scopes them.
    - Forbidden work: raw private content leaks.
    - Proof: redaction tests and browser proof if UI changes.

19. External send boundary
    - Purpose: keep all external sends explicit and proven.
    - Likely files: send boundary modules and tests.
    - Forbidden work: hidden delivery, implied sends.
    - Proof: no-send tests plus live proof only when authorized.

20. Release/receipt closeout
    - Purpose: ensure every seam ends with GitHub truth.
    - Likely files: PR template, issue receipts, ledger comments, source-truth docs.
    - Forbidden work: stopping before durable receipts exist.
    - Proof: PR receipt and ledger receipt.

## Queue Execution Law

Queue execution is a routing rule, not a product doctrine.

Rules:

- if the repo explicitly declares queue-controlled execution, the live queue file controls task routing
- planning drafts are not active work
- a draft queue is not a live queue
- no task becomes active just because a draft doc exists
- no queue file may be mutated in this issue
- no queue promotion may happen without the relevant source-truth change

This Master Bible does not promote the planning draft queue.
It does not start a new active task.
It does not mutate the live queue file.

## Source-Truth Hierarchy

For this bible's scope, the working authority order is:

1. explicit GitHub issue scope for the active seam
2. `ACTIVE_HANDOFF.md`
3. `FOLDERA_BUILD_ORDER.yaml`
4. `FOLDERA_MASTER_BIBLE.md`
5. `FOLDERA_NORTH_STAR_LOCK.md`
6. `FOLDERA_PRODUCT_OPERATING_SYSTEM.md`
7. `docs/SOURCE_OF_TRUTH_MAP.md`
8. `FOLDERA_MASTER_SYNTHESIS_DRAFT.md` as reference material only
9. historical or archived docs

For live execution routing, `FOLDERA_EXECUTION_QUEUE.yaml` remains the routing authority only when the repo is already in queue-controlled mode.

## Exact Stop Conditions

Stop when all of the following are true:

- `FOLDERA_MASTER_BIBLE.md` exists and is readable in repo
- the bible answers the product, money, proof, and forbidden-work questions clearly
- the bible is registered in source truth
- no app/runtime/Slack/Supabase/Stripe/auth/dashboard/package/schema/Vercel files were touched
- `FOLDERA_EXECUTION_QUEUE.yaml` was not mutated
- issue #181 has a PR receipt
- the PR receipt says `FOLDERA_MASTER_BIBLE.md = REFERENCE_AUTHORITY`
- the PR receipt says PR #189 was untouched and treated only as `UNMERGED_DRAFT_CONTEXT_ONLY`
- proof commands pass
- GitHub receipts are posted

## What Brandon No Longer Has To Re-Explain

After this bible exists, Brandon should not have to re-explain:

- what Foldera is
- what Foldera is not
- why the product exists
- what pain it solves
- how the product should behave when it is healthy
- what counts as proof
- why silence is sometimes the correct answer
- why raw private content must not leak
- why the queue is not the same thing as the product
- what work is forbidden until later
- how the next issue should be chosen
