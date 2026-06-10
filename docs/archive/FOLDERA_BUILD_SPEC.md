# Foldera Build Spec

Status: `DRAFT_ONLY_NOT_ACTIVE`

## Purpose

This build spec turns the Master Bible into a planning scaffold that can produce an executable product spec, a GitHub issue/PR plan, and a non-active next-draft queue.

It is a draft bridge, not live execution authority.

## Source Chain

The planning chain is:

1. `FOLDERA_MASTER_BIBLE.md`
2. `FOLDERA_PRODUCT_SPEC_NEXT.md`
3. `FOLDERA_GITHUB_ISSUE_PR_PLAN.md`
4. `FOLDERA_EXECUTION_QUEUE_NEXT_DRAFT.yaml`

The live execution queue remains separate and untouched.

## Planning Scope

This planning seam covers:

- build-spec articulation
- capability mapping
- queue-generation rules
- a next-draft queue file that remains non-active
- the issue/PR plan that Brandon can hand to Codex

It does not authorize:

- edits to `FOLDERA_EXECUTION_QUEUE.yaml`
- marking any draft task active
- product runtime changes
- backend/auth/Supabase/schema/Stripe work
- live Slack or connector work
- package or dependency changes

## Product Frame

Foldera is a Workday Presence Layer / context conduit.

The build spec must preserve the bible's core doctrine:

- state
- connectors
- triggers
- one intervention
- one trusted next move or safe silence

## Draft Inputs

Use these as draft inputs:

- `FOLDERA_MASTER_BIBLE.md`
- `FOLDERA_PRODUCT_SPEC_NEXT.md`
- `FOLDERA_GITHUB_ISSUE_PR_PLAN.md`
- `FOLDERA_EXECUTION_QUEUE_NEXT_DRAFT.yaml`
- `ACTIVE_HANDOFF.md`
- `FOLDERA_BUILD_ORDER.yaml`
- `FOLDERA_LAUNCH_ROADMAP.md`
- issue #48 product doctrine
- PR #189 as `UNMERGED_DRAFT_CONTEXT_ONLY`

## Required Output Standard

Any future draft generated from this build spec must:

- stay clearly marked as draft-only
- preserve the separation between planning and execution
- map to named GitHub issues and branches
- avoid activating tasks implicitly
- reference the live queue file as the sole live queue authority
- stop when the first real blocker is encountered

## Execution Layer

The missing execution layer is:

1. a canonical bible
2. an executable product spec
3. a GitHub issue/PR plan
4. a non-active queue draft that mirrors the plan

This build spec is the bridge between those layers.

## Exit Criteria

This planning seam is complete when:

- `FOLDERA_MASTER_BIBLE.md` exists as canonical reference authority
- `FOLDERA_PRODUCT_SPEC_NEXT.md` exists as a DRAFT product spec
- `FOLDERA_GITHUB_ISSUE_PR_PLAN.md` exists as an executable issue/PR plan
- `FOLDERA_EXECUTION_QUEUE_NEXT_DRAFT.yaml` maps to that plan
- no task in the draft queue is active
- the live execution queue remains untouched