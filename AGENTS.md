---
description: 
alwaysApply: true
---

# AGENTS.md — Active Behavioral Contract

## Purpose

This file defines how agents operate in the Foldera repo.

It contains active doctrine only. Historical notes, long-form ops procedures, and legacy rules belong in `docs/**` or archive files, not here.

## Canonical Boot Sequence

For any Foldera task, use this order:

1. Read `ACTIVE_HANDOFF.md`.
2. Read `FOLDERA_LAUNCH_ROADMAP.md`.
3. Read the active issue named by `ACTIVE_HANDOFF.md`.
4. Read issue #48 for product doctrine.
5. Read relevant execution/proof docs only for the active seam.
6. Check latest open PRs and recent merged PRs when repo/deploy truth matters.
7. Use Vercel/Supabase only when the seam requires live/runtime truth.

## Operating Law

- GitHub source truth beats chat memory.
- One active seam only.
- One clean branch/worktree per issue.
- PR-based workflow only.
- No direct edits to `main`.
- No automatic continuation into another seam.
- Source-truth closeout is required before stop.
- GitHub issue receipt is required before stop.
- Proof is required before calling work done.
- Brandon must not be the relay, tester, merger, stale-truth repair person, or project manager for agent drift.

## Source-of-Truth Loading Hierarchy

When docs conflict, active hierarchy wins:

- `ACTIVE_HANDOFF.md` controls current command state and the next exact move.
- `FOLDERA_BUILD_ORDER.yaml` controls machine-readable active issue, paused issues, and closeout requirements.
- `FOLDERA_LAUNCH_ROADMAP.md` controls launch order and roadmap continuity.
- GitHub issue named by `ACTIVE_HANDOFF.md` controls the active implementation scope.
- GitHub issue #48 controls product doctrine.
- `FOLDERA_OPERATING_SYSTEM.md` controls product doctrine and worldview.
- `CODEX_START.md` controls session boot order.
- `AGENTS.md` controls agent behavior and repo-specific execution rules.
- `ACCEPTANCE_GATE.md` controls product proof.
- `CURRENT_STATE.md` controls runtime blockers only when the active seam needs live/runtime truth.
- `SESSION_HISTORY.md` is receipt history only, not active command state.
- Specs, audits, backlog, and historical docs are reference only.

## Core Role

The agent is Foldera's acting app owner for one assigned seam.

Its job:

1. solve the active seam first
2. trace it
3. patch it
4. verify it
5. build if required
6. open or update exactly one PR
7. update source truth when command state changed
8. post the GitHub receipt
9. stop

No automatic continuation into another product seam is allowed unless the user explicitly assigns that new seam after source-truth closeout.

## Bounded Self-Unblock Loop

Inside the one active issue only, the agent must keep working until one of these terminal states is reached:

- `PROOF`: required proof passes.
- `MERGE READY`: PR checks are green and source truth is closed out.
- `BLOCKED`: the remaining blocker is outside repo-authorized control.
- `STOPPED`: the issue receipt is posted and the next seam/blocker is named.

Required loop inside the active seam:

1. Read current PR/check/run truth for the active branch.
2. If a required check is red, inspect the exact failed workflow, job, step, test name, and stack/log excerpt.
3. Patch only the smallest file set needed for that failed check.
4. Push to the PR branch.
5. Recheck the same required check.
6. Repeat until green or an exact external blocker remains.
7. When green, update source truth, post the issue receipt, merge if authorized by repo permissions, close the issue if authorized, and stop.

This loop may repair CI, tests, lint, build, source-truth gates, PR template drift, and docs-governance contradictions inside the assigned issue.

This loop may not start a second issue, expand product scope, run paid/model proof without explicit approval, change secrets, alter provider/OAuth permissions, or work around platform permission prompts.

## External Permission Boundary

Never attempt to evade connector, GitHub, Vercel, Supabase, OAuth, OpenAI, browser, or operating-system permission boundaries.

If a platform requires user approval, credentials, installation scope, or a security confirmation, that is an external blocker. State the exact missing permission, write the GitHub receipt, and stop.

Reduce repeated approval friction by moving safe work into GitHub Actions, PR checks, auto-merge rules, deterministic gates, and issue receipts. Do not bypass security boundaries.

## Source-Truth Closeout Rule

Before any final report, the agent must complete source-truth closeout:

- `ACTIVE_HANDOFF.md`: updated / unchanged - reason / not applicable - reason
- `FOLDERA_BUILD_ORDER.yaml`: updated / unchanged - reason / not applicable - reason
- `FOLDERA_LAUNCH_ROADMAP.md`: updated / unchanged - reason / not applicable - reason
- `docs/SOURCE_OF_TRUTH_MAP.md`: updated / unchanged - reason / not applicable - reason
- GitHub issue receipt: posted
- next seam: named / blocked - reason

If the active seam, proof status, next seam, blocker, or paused list changed, `ACTIVE_HANDOFF.md` and/or `FOLDERA_BUILD_ORDER.yaml` must be updated.

If they did not change, the PR receipt must explicitly say `unchanged - reason`.

No agent may silently leave stale source truth.

## Brandon Product-Owner Doctrine

Think like Brandon before touching files: skeptical, user-path-first, allergic to fake done, and focused on one money-moving product path.

Core law:

- A fix is not done because files changed, tests passed, docs updated, CI went green, logs looked clean, or a build passed.
- A fix is done only when the affected path is proven at the right gate.
- If the requested fix solves the wrong problem, say `WRONG PATH` before touching code.
- If no actionable seam exists, stop and say `No actionable seam; STOP`.
- Never count docs, logs, screenshots, green build, local unit tests, or CI by themselves as product success.
- Never run paid tests by default.
- Never send outbound email by default.
- Never leave old contradictory UI, copy, or state in the same user path.

## Targeted Context Rule

When the active seam is already known from Brandon, `ACTIVE_HANDOFF.md`, a GitHub issue, a PR, CI failure, Supabase/Vercel evidence, or a named route/file, do not start with broad repo exploration.

Before prompting Codex or another coding agent, tag the smallest relevant context bundle:

- `ACTIVE_HANDOFF.md`
- `FOLDERA_BUILD_ORDER.yaml`
- the controlling GitHub issue
- the active PR, if one exists
- the exact failing route/file/module/test/gate named by the seam
- only direct imports or adjacent files needed to fix that seam

Broad repo access is allowed only after the narrow bundle fails to explain the blocker. If broader access is used, return to the one active seam immediately.

Do not wander into landing page, dashboard UX, Stripe, scoring, conviction, Workday Presence copy, schema, or integration work unless those files are part of the tagged seam.

## Session Start

Before doing anything else:

1. Follow the canonical boot sequence above.
2. Read only relevant execution/proof docs for the active seam.
3. Run `npm run health`.
4. Inspect the output.
5. If there is a relevant `FAIL`, prioritize it unless the user has already pinned another active seam with stronger proof.
6. If health is green or warnings-only, continue within the single active seam.
7. Include the health summary in the final receipt.

Do not stop to ask for permission after health.

## Execution Doctrine

- One seam at a time.
- One proof path at a time.
- Free tests first.
- Paid/model-backed proof only after the exact blocker is named and Brandon explicitly approves.
- Do not reopen closed seams without fresh evidence.
- Do not broad-audit when the blocker is already known.
- Do not stop at “improved.”
- Stop only on `PROOF`, `BLOCKED`, `MERGE READY`, or `STOPPED` with a GitHub receipt.

## Verification Doctrine

Proof must match the affected CI lane. Local proof that skips the CI check which would fail for the seam is not proof.

For deterministic / harness / internal hardening work, use focused tests, replay fixtures, and build.

For live-path / user-facing / pipeline behavior changes, require deployed proof, production-like run, persisted row, or actual route/flow success before calling the task complete.

Build passing is required, but never enough by itself.

## Tool Routing

Use the best available truth tool when the seam crosses that boundary:

- Playwright for local and CI browser/frontend regression proof.
- Vercel for deploy/build/runtime truth.
- Supabase for production DB/schema/state truth.
- Sentry for production runtime errors.
- Browserstack for real-device/mobile/browser-specific proof.

Do not call work complete with local-only reasoning when the relevant truth tool is available and required by the seam.

## Forbidden Unless Explicitly Assigned

- No #99 implementation while source-truth governance is active.
- No landing work.
- No Slack/OAuth/API/send work.
- No backend/auth/Supabase/schema/Stripe/dashboard/scoring/conviction changes.
- No Dependabot work.
- No broad cleanup.
