# Foldera Queue Generation Rules

Status: `DRAFT_ONLY_NOT_ACTIVE`

## Purpose

These rules define how to generate the next draft queue from the Master Bible, product spec, and GitHub issue/PR plan without touching the live execution queue.

## Inputs

Use only:

- `FOLDERA_MASTER_BIBLE.md`
- `FOLDERA_PRODUCT_SPEC_NEXT.md`
- `FOLDERA_GITHUB_ISSUE_PR_PLAN.md`
- `FOLDERA_BUILD_SPEC.md`
- `ACTIVE_HANDOFF.md`
- `FOLDERA_BUILD_ORDER.yaml`
- `FOLDERA_LAUNCH_ROADMAP.md`
- issue #48
- `FOLDERA_EXECUTION_QUEUE.yaml` as read-only context
- PR #189 as `UNMERGED_DRAFT_CONTEXT_ONLY`

## Hard Rules

1. Do not modify `FOLDERA_EXECUTION_QUEUE.yaml`.
2. Do not mark any draft task `ACTIVE`.
3. Do not reuse draft status as live execution status.
4. Do not inherit PR #189 as branch authority.
5. Do not introduce package/runtime/backend changes while drafting queue shape.
6. Do not widen scope into product implementation.
7. Do not create a draft queue item that cannot be tied to the GitHub issue/PR plan.

## Draft Status Vocabulary

Use only these statuses in draft outputs:

- `QUEUED`
- `BLOCKED_BY_CURRENT_QUEUE_DEPENDENCY`

Never use:

- `ACTIVE`
- `COMPLETED`
- `DRAFT`
- `QUEUED_DRAFT`
- `BLOCKED_DRAFT`

## Generation Procedure

1. Read the Master Bible and product spec next.
2. Read the GitHub issue/PR plan and preserve the issue order.
3. Read the current live queue and treat it as read-only.
4. Record PR #189 as unmerged draft context only.
5. Generate the next draft queue as a separate non-active file.
6. Keep every task draft-bound until a future source-truth update authorizes promotion.

## Promotion Rule

A draft queue may only become active if all of the following are true:

- the owning source-truth file explicitly authorizes it
- the current live queue has been updated through normal source truth
- the change is reviewed as an active-seam change, not as planning-only work

## Output Requirements

Any generated draft queue must include:

- `id`
- `issue_title`
- `branch_name`
- `task`
- `status`
- `allowed_files`
- `forbidden_files_or_surfaces`
- `dependency`
- `proof_gate`
- `receipt_required`
- `stop_condition`
- `money_relevance`
- a note that no task is active
- a note that PR #189 is context only