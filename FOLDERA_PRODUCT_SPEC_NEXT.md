# Foldera Product Spec Next

Authority status: `DRAFT_PRODUCT_SPEC_NOT_ACTIVE`

## Purpose

This file turns the Master Bible into an executable product spec.

It is draft-only.
It is not active.
It does not authorize product implementation by itself.

## Spec Goal

Prove a narrow, honest Foldera loop where:

- source-shaped evidence arrives
- evidence is normalized into workday context
- one next move is selected or silence is chosen
- the user responds with one click
- durable state and receipts update

## Locked Revenue Ladder

This file is executable planning material for the revenue ladder, not a second authority tower.

The repo should move through these rungs in order:

1. `#194` verdict loop proof
2. durable response/state/receipt loop
3. first user journey shell
4. trust/privacy/no-send rail
5. bounded self-serve paid path
6. money-ready MVP proof
7. first non-owner validation

Each rung must be written so a future issue can answer:

- exact user outcome
- allowed files/surfaces
- forbidden work
- proof commands
- stop condition
- next authorized move

## MVP Loop

1. user enters or connects one honest source/evidence lane
2. Foldera receives source-shaped evidence
3. Foldera normalizes the evidence into signals
4. signals become workday context
5. workday context becomes one verdict
6. the verdict is rendered as one next move or safe silence
7. the user responds with Done, View, Snooze, or Dismiss
8. Foldera mutates durable state
9. Foldera writes a receipt
10. Foldera stays quiet until a new justified trigger exists

## User Journey

### Step 1: Understand the promise

The user sees the Workday Presence Layer promise:

- Foldera keeps place
- Foldera finds the re-entry point
- Foldera gives one grounded move or safe silence

### Step 2: Enter the lane

The user enters one source/evidence lane or a controlled proof lane.

The product must explain:

- what is read
- what is not read
- what is stored
- what is never sent externally without permission

### Step 3: Receive a verdict

Foldera presents one of:

- Do this next
- Fix this first
- You are clear right now

### Step 4: Respond

The user chooses:

- Done
- View
- Snooze
- Dismiss

### Step 5: Persist the result

Foldera updates durable state and writes a receipt.

## System Surfaces

The product should be understandable as these surfaces:

- public promise surface
- source/evidence intake surface
- workday state surface
- verdict surface
- response surface
- receipt surface
- ops/proof surface

These are concept surfaces, not a mandate for a broad dashboard.

## States

The spec should support these states:

- no source connected
- source connected but stale
- source connected and ready
- evidence received
- evidence normalized
- context built
- verdict selected
- user responded
- state mutated
- receipt written
- safe silence
- blocked by missing proof

## Required Inputs

The product must be able to consume:

- source id
- source type
- timestamp
- safe metadata
- workspace/user boundary
- redacted or hashed content where needed
- freshness data
- explicit user action

## Required Outputs

The product must be able to emit:

- a single verdict
- a safe source trail
- one action path
- a state mutation
- a durable receipt
- a safe-silence reason when no action is justified

## Blocked States

The product must explicitly handle:

- no source lane yet
- source stale or unavailable
- evidence too weak
- multiple competing moves with no safe choice
- missing privacy boundary
- missing send boundary proof
- live rail not yet proven
- payment path not yet proven

Blocked states are real product outputs, not failures to be hidden.

## Safety Rails

The product must enforce:

- no screen reading for MVP
- no hidden monitoring
- no raw private content in receipts unless explicitly required and safe
- no external send without explicit permission
- no fake customer proof
- no fake enterprise proof
- no fake compliance claims
- no dashboard/task-list drift as the core value loop

## Acceptance Criteria

The product spec is executable only when it can be turned into issues that prove:

1. one source/evidence lane can be selected honestly
2. source-shaped evidence can become normalized signals
3. signals can become workday context
4. context can become exactly one next move or safe silence
5. Done / View / Snooze / Dismiss mutate durable state
6. receipts show what happened
7. the product can stay quiet when no move is justified

## Proof Model

Proof must match the claim:

- deterministic tests for signal/context/verdict logic
- focused tests for action/state mutation
- browser proof for user-facing flow
- runtime or deployed proof for any live rail claim
- GitHub receipt for the final record

Build success is not enough by itself.

## Paid-Pilot GO / NO-GO

### GO only when all are true

- the user can understand the offer without a sales call
- the user can reach one trusted verdict
- the verdict has a safe source trail
- one-click response mutates durable state
- the product stays quiet safely when no move is justified
- the receipt proves before state, verdict, response, after state, and source trail
- payment or early-access capture does not require Brandon to manually operate the workflow

### NO-GO if any are true

- the product relies on unsupported claims
- the source trail is not safe to show
- state mutation is not durable
- external send boundaries are unclear
- the product cannot stay quiet safely
- the path requires Brandon as the operator

## Exact Stop Conditions

Stop when:

- the product spec is written in executable issue language
- the spec can be broken into a GitHub issue/PR plan
- the next-draft queue can be generated from the plan
- no product/runtime files are touched in the planning run
- the current live queue remains untouched
