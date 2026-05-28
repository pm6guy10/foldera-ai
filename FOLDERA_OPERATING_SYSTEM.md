# Foldera Operating System

## Purpose

This is Foldera's canonical product doctrine.

It exists so future Codex sessions inherit the same worldview from the repo instead of from Brandon re-explaining it in chat.

If another file conflicts with this file on product philosophy, this file wins. `CODEX_START.md` and `AGENTS.md` control session execution mechanics. `ACCEPTANCE_GATE.md` controls proof. `CURRENT_STATE.md` controls current runtime truth.

## Canonical Boot Sequence

For any Foldera task, use this order:

1. Read `ACTIVE_HANDOFF.md`.
2. Read `FOLDERA_LAUNCH_ROADMAP.md`.
3. Read the active issue named by `ACTIVE_HANDOFF.md`.
4. Read issue #48 for product doctrine.
5. Read relevant execution/proof docs only for the active seam.
6. Check latest open PRs and recent merged PRs when repo/deploy truth matters.
7. Use Vercel/Supabase only when the seam requires live/runtime truth.

## Core Product Truth

Foldera is not a dashboard.
Foldera is an operator.

The user should not need to:
- diagnose failures
- manage sync state
- interpret internal status
- coordinate tools manually
- understand system architecture
- babysit workflows

If the user must think about Foldera's internals, the product has failed.

## Standing Doctrine

Every surface, route, connector, artifact path, dashboard state, and source-of-truth doc must do one of three things:

1. Produce finished value.
2. Safely self-prepare or self-recover.
3. Ask for one irreducible blocker in plain language.

Nothing else.

## Engineering Doctrine

- Prefer autonomous recovery over user actions.
- Prefer useful output over empty states.
- Prefer production truth over local success.
- Prefer global rules over one-off fixes.
- Prefer truthful restraint over fake certainty.
- Prefer fewer canonical docs over sprawling doctrine.

Manual buttons, settings links, admin panels, and diagnostics are trust controls and fallback paths. They are not the core value loop.

## Execution Doctrine

The system owns the loop.

Do not stop at:
- build passes
- tests pass
- connected
- technically works
- status is visible
- docs are updated

Stop only when the product feels proactive, trustworthy, useful, and low-friction, or when one real external blocker remains.

## Repo Doctrine

Canonical operating files:
- `ACTIVE_HANDOFF.md` - current command state and single active seam
- `FOLDERA_LAUNCH_ROADMAP.md` - launch roadmap and execution order
- `FOLDERA_OPERATING_SYSTEM.md` - product doctrine and worldview
- `CODEX_START.md` - session boot contract
- `CURRENT_STATE.md` - current blockers and runtime truth
- `ACCEPTANCE_GATE.md` - product proof and done criteria
- `SYSTEM_RUNBOOK.md` - operating plan, tool boundaries, and runbook rules
- `SESSION_HISTORY.md` - append-only receipts

How-to-think file:
- `BRANDON.md` - product taste, judgment, and feel

Execution shims:
- `AGENTS.md` - Codex behavioral contract
- `CLAUDE.md` - compatibility runbook for older/operator tooling

Everything else is secondary, mergeable, archivable, or disposable unless the active seam explicitly touches it.

## Session Start Rule

At the beginning of every session:

1. Follow the canonical boot sequence above.
2. Reconstruct current product truth from the active seam.
3. Execute one assigned issue only.
4. Report only truth, action, proof, blocker, and next move.

## Product Alignment Rule

Foldera should behave like a proactive chief of staff:
- anticipates
- prepares
- recovers
- prioritizes
- explains only what matters

Never like a passive SaaS admin panel.

## Irreducible Blocker Rule

When Foldera cannot safely proceed, it must ask for exactly one blocker:
- one missing credential
- one missing permission
- one payment approval
- one external provider reauth
- one safety/product decision
- one missing fact that cannot be derived

Do not expose blocker codes, candidate IDs, gate names, stack traces, raw diagnostics, or internal taxonomy as the product.

## Money Loop Rule

The highest-value path is always:

connect sources -> keep them fresh -> derive the next useful move -> produce finished work -> let the user approve or skip -> learn from that outcome

Any surface that does not advance, protect, or explain that loop is secondary.

