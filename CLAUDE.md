---
description: 
alwaysApply: true
---

# CLAUDE.md — Active Operator Runbook

## Purpose

This file is an execution contract for Foldera work. It exists to keep agent sessions outcome-focused, cheap, verifiable, and aligned with the repo source of truth.

It is not an archive, audit log, or historical dumping ground. Historical notes belong in `SESSION_HISTORY.md`, `LESSONS_LEARNED.md`, `AUTOMATION_BACKLOG.md`, or `docs/**`.

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

## Session Start

1. Follow the canonical boot sequence.
2. Read additional execution/proof docs only when directly relevant to the active seam.
3. **Check Issue #136 for a recent INTERRUPT receipt for the active issue. If one exists, read it and resume from the named next step.**
4. Run `npm run health`.
5. Inspect the full output.
6. If health shows `FAIL`, prioritize the first relevant failure unless the assigned issue explicitly targets another proven seam.
7. If health is green or warnings-only, continue within the single active seam.

Health is orientation, not completion. A green health check does not mean the mission is done.

## Session Receipts

Three receipt types cover the full session lifecycle. All receipts post to Issue #136 (the standing `[OPS] Run Ledger`).

### START receipt — post to Issue #136 before the first file edit

```
SESSION START
Tool: [Claude Code / Codex / Cursor / ChatGPT / Manual]
Date: YYYY-MM-DD UTC
Issue: #XXX
PR: #XXX or NONE
Branch: <branch>
SHA: <short-sha> or NONE
Prior interrupt: NONE / see #136 comment <id>
First step: <one sentence>
```

### INTERRUPT receipt — post to Issue #136 when stopping without a terminal state

```
SESSION INTERRUPT
Tool: [Claude Code / Codex / Cursor / ChatGPT / Manual]
Date: YYYY-MM-DD UTC
Issue: #XXX
PR: #XXX or NONE
Branch: <branch>
SHA: <short-sha>
Uncommitted files: <list> or NONE
Committed not pushed: <list> or NONE
Stopped at: <one sentence>
Next step: <one sentence>
Blocker: NONE / <exact>
```

### CLOSEOUT receipt — post when reaching a terminal state

See `AGENTS.md` `MANDATORY CODEX RUN LEDGER CLOSEOUT` for the full template.
Post to: primary surface (PR or active issue) + Issue #136.

### Receipt routing

| Receipt | Destination | When |
|---|---|---|
| START | Issue #136 only | Before first file edit in any session |
| INTERRUPT | Issue #136 only | Stopping without PROOF / BLOCKED / MERGE READY / STOPPED |
| CLOSEOUT | PR or active issue + Issue #136 | Terminal state reached |

If a session produces a CLOSEOUT, a prior INTERRUPT receipt for the same issue is superseded. Do not retroactively clean it up — the CLOSEOUT is sufficient.

## Core Execution Doctrine

- One seam at a time.
- One proof path at a time.
- Free tests first.
- Paid/live proof only after the exact blocker is named and Brandon explicitly approves.
- Do not reopen closed seams without fresh evidence.
- Do not broad-audit when the blocker is already known.
- Do not stop at “improved.”
- Stop only on `PROOF`, `BLOCKED`, `MERGE READY`, or `STOPPED` with a GitHub receipt.

### PROOF

A real board change exists and the proof required by the active issue passes.

### BLOCKED

A narrow blocker is proven with seam name, file/surface, exact check or external system, and evidence.

### MERGE READY

The PR has the required proof, source-truth closeout, and all required checks are green or explicitly skipped by path rules.

### STOPPED

The active seam is closed out and the next seam is named or blocked. No automatic continuation is allowed.

## Foldera Product Doctrine

Issue #48 and `FOLDERA_OPERATING_SYSTEM.md` control product doctrine.

Foldera is a Workday Presence Layer:

- state + connectors + triggers + one intervention
- remembers where the user was
- decides when to interrupt
- gives one next move
- lets the user respond with one click
- updates state
- stays quiet otherwise

Foldera is not a dashboard, task manager, inbox-summary product, chatbot-first assistant, surveillance system, or fake enterprise-readiness theater.

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

## Cost Doctrine

Most work must be free. Paid runs are for final proof only.

Rules:

- use deterministic tests for basic bugs
- use fixtures and replay harnesses for known failure classes
- use local mocks and offline paths whenever possible
- do not burn paid model calls to discover obvious bugs
- before any paid test, name the exact blocker that free proof cannot resolve
- ask Brandon for permission before running the paid step
- if permission is not granted, stop at strongest free proof and report the live seam as unproven

## Git / Shipping Rules

- Use PR workflow for meaningful repo changes.
- Do not push directly to `main`.
- Do not bypass PR review/checks.
- Do not ask Brandon to push, merge, test, relay, apply migrations, or repair stale source truth when the agent can do the work through the proper tool path.
- Do not leave meaningful verified work local-only.
- Use one clean branch/worktree per active issue.
- Run the proof required by the active issue before calling the seam complete.
- If CI is red, fix only the exact failing check.
- Commit receipts must be specific and factual.

## Source-Truth Closeout

Every final receipt must include:

- `ACTIVE_HANDOFF.md`: updated / unchanged - reason / not applicable - reason
- `FOLDERA_BUILD_ORDER.yaml`: updated / unchanged - reason / not applicable - reason
- `FOLDERA_LAUNCH_ROADMAP.md`: updated / unchanged - reason / not applicable - reason
- `docs/SOURCE_OF_TRUTH_MAP.md`: updated / unchanged - reason / not applicable - reason
- GitHub issue receipt: posted
- next seam: named / blocked - reason

If command state changed, update `ACTIVE_HANDOFF.md` and `FOLDERA_BUILD_ORDER.yaml` in the PR.

## Codex Run Ledger

`AGENTS.md` contains the authoritative `MANDATORY CODEX RUN LEDGER CLOSEOUT` rule. Follow that rule before any final report: post the primary GitHub receipt, post the standing `[OPS] Codex Run Ledger` entry, and return only the required receipt URLs.

## Verification Rules

### Deterministic or harness-only changes

Local or CI proof is sufficient when the active issue says so:

- focused tests
- replay suite
- `npm run gate:continuity`
- `npm run lint`
- `npm run build`

### Live-path or user-facing behavior changes

Require one real proof before calling the work complete:

- production-like execution
- deployed verification
- persisted row
- real route or user-journey proof

A build pass is necessary, not sufficient.

### Schema-dependent changes

Schema work is forbidden unless the active issue explicitly authorizes it.

When a future active issue authorizes production schema work, the migration must be committed, applied to production Supabase, and verified before done is claimed. If production apply is impossible because of missing credentials, missing tool access, or network failure, state that exact blocker and do not claim the migration task complete.

## Architecture Constraints

- Never initialize Supabase or read env vars at top level.
- Always resolve env inside functions or safe config boundaries.
- `useSession`, `useState`, and `useEffect` require `'use client'`.
- Server components use `getServerSession(authOptions)`.
- Frontend uses `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Backend uses `SUPABASE_SERVICE_ROLE_KEY`.
- Never mix frontend and backend Supabase credentials.
- Session-backed routes must use `session.user.id`.
- `INGEST_USER_ID` is background and cron only.

## Tool Routing

Use the best available truth tool when the seam crosses that boundary:

- Playwright for browser/frontend regression proof.
- Vercel for deploy/build/runtime truth.
- Supabase for production DB/schema/state truth.
- Sentry for production runtime errors.
- Browserstack for real-device/mobile/browser-specific proof.

Do not call work complete with local-only reasoning when the relevant truth tool is available and required by the seam.

## Scope Control

Fix the proven seam first. Broaden from instance to class only when the same failure mode is clearly shared, the broader fix stays in the same seam, and tests prove the class-level repair.

Do not use “fix the class” as permission to refactor half the system.

## Forbidden Unless Explicitly Assigned

- No #99 implementation while source-truth governance is active.
- No landing work.
- No Slack/OAuth/API/send work.
- No backend/auth/Supabase/schema/Stripe/dashboard/scoring/conviction changes.
- No Dependabot work.
- No broad cleanup.

## Final Report

Report only:

- active seam
- files changed
- proof run
- source-truth closeout status
- GitHub CI result if available
- Vercel deployment result if applicable
- production SHA if applicable
- exact stop reason
- next seam/blocker
