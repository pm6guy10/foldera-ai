# Foldera Capability Map

Status: `DRAFT_ONLY_NOT_ACTIVE`

## Purpose

This file maps the planning capability stack to the source documents that control it.

It is a planning artifact, not an execution authority.

## Capability Map

| Capability | Source | Use | Must Not Control |
| --- | --- | --- | --- |
| Master bible | `FOLDERA_MASTER_BIBLE.md` | Canonical product truth and stop conditions | Live execution or queue activation by itself |
| Product spec next | `FOLDERA_PRODUCT_SPEC_NEXT.md` | Convert the bible into executable acceptance criteria | Live queue mutation by itself |
| Issue / PR plan | `FOLDERA_GITHUB_ISSUE_PR_PLAN.md` | Order the next executable GitHub issues and branches | Marking any task active |
| Next draft queue | `FOLDERA_EXECUTION_QUEUE_NEXT_DRAFT.yaml` | Hold the next non-active draft queue shape | Live queue mutation |
| Product doctrine | `issue #48`, `FOLDERA_NORTH_STAR_LOCK.md` | Define what Foldera is and is not | Queue activation or runtime implementation by itself |
| Roadmap / phase order | `FOLDERA_PRODUCT_OPERATING_SYSTEM.md` | Define the business and phase ladder | Product runtime implementation by itself |
| Active execution routing | `FOLDERA_EXECUTION_QUEUE.yaml` | Select the live queue task | Planning-only draft changes |
| Planning bridge | `FOLDERA_BUILD_SPEC.md` | Connect the bible, spec, plan, and next draft | Active queue execution |

## Source-of-Truth Priority

1. GitHub issue truth
2. `ACTIVE_HANDOFF.md`
3. `FOLDERA_BUILD_ORDER.yaml`
4. `FOLDERA_MASTER_BIBLE.md`
5. `FOLDERA_PRODUCT_SPEC_NEXT.md`
6. `FOLDERA_GITHUB_ISSUE_PR_PLAN.md`
7. `FOLDERA_EXECUTION_QUEUE_NEXT_DRAFT.yaml`
8. `FOLDERA_EXECUTION_QUEUE.yaml`
9. `FOLDERA_LAUNCH_ROADMAP.md`

## PR #189 Handling

PR #189 is recorded here as:

- `UNMERGED_DRAFT_CONTEXT_ONLY`

Meaning:

- it may inform draft structure
- it does not authorize execution
- it does not replace `main`
- it does not mutate the live queue

## Draft-Only Guardrails

Any capability map entry in this planning set must follow these rules:

- no draft task becomes active
- no live queue file is rewritten
- no product/runtime surface is implied
- no dependency or package changes are required