# Foldera GitHub Issue / PR Plan

Authority status: `DRAFT_EXECUTION_PLAN_NOT_ACTIVE`

This is the execution plan Brandon can hand to Codex with:

> Run the next authorized issue until you get stuck.

The plan starts from the Master Bible and turns it into ordered GitHub work.

## Operating Rules

- One issue at a time.
- One branch per issue.
- One PR per issue.
- Stop at the first real blocker.
- Do not promote the planning draft queue.
- Do not mutate `FOLDERA_EXECUTION_QUEUE.yaml`.
- Do not mark any draft task active.
- Do not use PR #189 as authority; it is context only.

## Locked Revenue Ladder

This file is executable planning material for the revenue ladder, not a second authority tower.

The ladder is:

1. `#194` verdict loop proof
2. durable response/state/receipt loop
3. first user journey shell
4. trust/privacy/no-send rail
5. bounded self-serve paid path
6. money-ready MVP proof
7. first non-owner validation

Every rung should specify:

- exact user outcome
- allowed files/surfaces
- forbidden work
- proof commands
- stop condition
- next authorized move

## Issue Order

### 1. Issue title

`Convert the Master Bible into an executable Foldera product spec`

Branch:

`codex/issue-182-product-spec-next`

Issue body:

- Use `FOLDERA_MASTER_BIBLE.md` to write `FOLDERA_PRODUCT_SPEC_NEXT.md`.
- The spec must define the MVP loop, user journey, surfaces, states, required inputs/outputs, blocked states, safety rails, acceptance criteria, proof model, and paid-pilot GO/NO-GO.
- Do not touch app/runtime/product implementation files.
- Do not mutate the live queue.

Allowed files:

- `FOLDERA_PRODUCT_SPEC_NEXT.md`
- `FOLDERA_MASTER_BIBLE.md`
- `FOLDERA_BUILD_SPEC.md`
- `FOLDERA_CAPABILITY_MAP.md`

Forbidden files/surfaces:

- `FOLDERA_EXECUTION_QUEUE.yaml`
- app/runtime/Slack/Supabase/Stripe/auth/dashboard/package/schema/Vercel files
- PR #189

Proof commands:

- `npm run health`
- `npx tsx scripts/source-truth-check.ts`
- `npm run gate:continuity`
- `git diff --check`

Receipt requirements:

- branch name
- issue title implemented
- files changed
- confirmation no product/runtime files touched
- confirmation PR #189 untouched and context-only
- confirmation `FOLDERA_EXECUTION_QUEUE.yaml` untouched
- proof results
- stop condition

Stop condition:

- Product spec exists and can be turned into later executable issues.

When Codex must stop and ask Brandon:

- the spec requires a new product claim
- the spec needs live Slack or billing truth
- the spec demands a queue mutation

When Codex may continue autonomously:

- the issue can be completed with the allowed files and the proof fails locally in a fixable way.

### 2. Issue title

`Select the first honest source/evidence lane for Foldera`

Branch:

`codex/issue-183-source-lane-audit`

Issue body:

- choose the minimum source/evidence lane that can support one trusted verdict
- identify what is ingested, what is redacted, and what is stored
- name the first safe context path
- do not implement connector breadth

Allowed files:

- audit docs
- source-truth docs
- focused tests for the audit

Forbidden files/surfaces:

- app/runtime/Slack/Supabase/Stripe/auth/dashboard/package/schema/Vercel files
- live connector fetch
- PR #189

Proof commands:

- `npm run health`
- `npx tsx scripts/source-truth-check.ts`
- `npm run gate:continuity`
- `git diff --check`

Receipt requirements:

- exact lane selected or exact blocker
- files changed
- proof results
- stop condition

Stop condition:

- one source lane is selected or blocked with exact missing truth.

### 3. Issue title

`Prove sources become signals, signals become context, and context becomes one next move`

Branch:

`codex/issue-194-verdict-loop`

Issue body:

- prove evidence -> signals -> context -> one verdict
- one verdict only
- safe silence when justified
- no multiple competing moves
- durable receipt required

Allowed files:

- runtime brain modules only if directly required for the evidence -> signals -> context -> verdict loop
- fixtures
- focused tests
- source-truth/gate files if required

Forbidden files/surfaces:

- live Slack
- Supabase migrations or data mutation
- Vercel settings
- Stripe/auth/dashboard
- package/dependency changes
- queue activation
- Dependabot
- PR #189

Proof commands:

- focused unit/fixture tests
- `npm run health`
- `npx tsx scripts/source-truth-check.ts`
- `npm run gate:continuity`
- `git diff --check`

Receipt requirements:

- before/after evidence
- selected verdict
- rejected unsafe candidates
- durable receipt
- proof results

Stop condition:

- one deterministic verdict loop is proven or exactly blocked.

### 4. Issue title

`Prove Done / View / Snooze / Dismiss durable state and receipts`

Branch:

`codex/issue-185-receipts`

Issue body:

- prove user actions mutate durable state
- prove receipts show what happened
- prove the product can stay quiet after response

Allowed files:

- action/state modules if explicitly scoped
- receipt modules
- focused tests

Forbidden files/surfaces:

- live sends
- Slack live rail
- schema work unless explicitly authorized
- PR #189

Proof commands:

- focused mutation/receipt tests
- `npm run health`
- `npx tsx scripts/source-truth-check.ts`
- `npm run gate:continuity`
- `git diff --check`

Receipt requirements:

- before state
- verdict
- response
- after state
- source trail

Stop condition:

- all action paths have safe durable receipts.

### 5. Issue title

`Build the first user journey shell for one source lane`

Branch:

`codex/issue-186-first-journey-shell`

Issue body:

- expose one honest path from promise to verdict to receipt
- keep the surface truthful
- avoid dashboard/task-list/inbox-summary drift

Allowed files:

- scoped frontend/app route files if explicitly authorized
- the corresponding browser test

Forbidden files/surfaces:

- broad redesign
- product/runtime breadth
- Slack live claims
- PR #189

Proof commands:

- Playwright/browser proof if the issue reaches a UI surface
- `npm run health`
- `npx tsx scripts/source-truth-check.ts`
- `npm run gate:continuity`
- `git diff --check`

Receipt requirements:

- route or surface proven
- unsupported claims grep
- screenshots or browser proof if required

Stop condition:

- one honest user journey shell is proven.

### 6. Issue title

`Persist one source-backed workday state path`

Branch:

`codex/issue-187-state-persistence`

Issue body:

- make the workday state survive refresh/session change
- preserve the source trail
- keep user/workspace isolation explicit

Allowed files:

- state persistence modules if explicitly authorized
- tests for persistence and isolation

Forbidden files/surfaces:

- broad schema cleanup
- package/dependency changes
- PR #189

Proof commands:

- focused persistence tests
- `npm run health`
- `npx tsx scripts/source-truth-check.ts`
- `npm run gate:continuity`
- `git diff --check`

Receipt requirements:

- before/after readback
- isolation proof
- stop condition

Stop condition:

- one source-backed workday state path persists cleanly.

### 7. Issue title

`Prove privacy, no-send, and live-rail prerequisites`

Branch:

`codex/issue-188-privacy-no-send-rail`

Issue body:

- prove raw private content does not leak
- prove no-send boundaries are explicit
- define what must be true before Slack live rail

Allowed files:

- privacy/no-send modules and tests if explicitly authorized
- claim-control docs if needed

Forbidden files/surfaces:

- live Slack implementation
- connector expansion
- PR #189

Proof commands:

- privacy/no-send tests
- `npm run health`
- `npx tsx scripts/source-truth-check.ts`
- `npm run gate:continuity`
- `git diff --check`

Receipt requirements:

- forbidden fields blocked
- no-send proof
- live-rail prerequisites named

Stop condition:

- privacy/no-send rails are proven and the live rail requirements are explicit.

### 8. Issue title

`Decide paid-pilot GO / NO-GO for Foldera`

Branch:

`codex/issue-191-paid-pilot-gate`

Issue body:

- decide whether Foldera can ask for money
- prove or disprove the $29/month threshold
- do not fake customer proof

Allowed files:

- proof docs
- focused tests
- small fixes only if a prior issue proves they are necessary

Forbidden files/surfaces:

- fake revenue claims
- enterprise claims
- PR #189

Proof commands:

- end-to-end proof command(s) required by the issue
- `npm run health`
- `npx tsx scripts/source-truth-check.ts`
- `npm run gate:continuity`
- `git diff --check`

Receipt requirements:

- GO or NO-GO verdict
- blocker if NO-GO
- next human decision

Stop condition:

- paid-pilot threshold is proven or blocked with exact reason.

### 9. Future issue title

`Prove money-ready MVP end to end`

Branch:

`codex/money-ready-mvp-proof`

Issue body:

- prove the end-to-end paid-ready path from source-backed verdict to durable receipt
- ensure the offer can be understood and reached without unsupported claims
- keep the paid path bounded and testable

Allowed files:

- user-facing proof surfaces if explicitly authorized
- focused tests
- source-truth docs if required

Forbidden files/surfaces:

- live Slack
- Supabase migrations or data mutation
- Vercel settings
- Stripe/auth/dashboard
- package/dependency changes
- queue activation
- Dependabot
- PR #189

Proof commands:

- end-to-end proof command(s) required by the issue
- `npm run health`
- `npx tsx scripts/source-truth-check.ts`
- `npm run gate:continuity`
- `git diff --check`

Receipt requirements:

- money-ready verdict
- blocker if not ready
- next human decision

Stop condition:

- the paid-ready path is proven or blocked with an exact reason.

### 10. Future issue title

`Prove first non-owner validation`

Branch:

`codex/non-owner-validation-proof`

Issue body:

- capture the first non-owner validation signal for the paid-ready path
- keep the feedback minimal and honest
- do not seed fake customer evidence

Allowed files:

- validation capture surfaces if explicitly authorized
- focused tests
- source-truth docs if required

Forbidden files/surfaces:

- live Slack
- Supabase migrations or data mutation
- Vercel settings
- Stripe/auth/dashboard
- package/dependency changes
- queue activation
- Dependabot
- PR #189

Proof commands:

- validation capture proof commands required by the issue
- `npm run health`
- `npx tsx scripts/source-truth-check.ts`
- `npm run gate:continuity`
- `git diff --check`

Receipt requirements:

- non-owner validation captured or exact blocker
- next human decision

Stop condition:

- the first non-owner validation path is proven or blocked with exact reason.

## When Codex Must Stop and Ask Brandon

Codex must stop and ask Brandon when:

- a future issue requires new provider scopes or permissions
- a future issue requires live Slack rail truth not yet proven
- a future issue requires billing/auth/customer-facing claims without proof
- a future issue requires queue mutation
- a future issue requires product scope outside the current allowed files

## When Codex May Continue Autonomously

Codex may continue autonomously when:

- the current issue is still inside its allowed files
- the proof gate is failing for a fixable reason
- the fix stays inside the same issue scope
- no platform permission boundary is crossed

## Paste-Ready Command

`Run the next authorized issue until you get stuck.`
