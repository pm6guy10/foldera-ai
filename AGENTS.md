---
description: 
alwaysApply: true
---

# AGENTS.md — The Single Agent Execution Contract

This is the only agent execution contract in this repo. `CLAUDE.md`, `.cursorrules`, and `.cursor/rules/agent.mdc` are thin pointers to this file. Historical notes belong in `SESSION_HISTORY.md`, `LESSONS_LEARNED.md`, or `docs/archive/**`.

## Boot Sequence

1. Read `ACTIVE_HANDOFF.md`.
2. Read the active issue it names.

That is the whole boot. Read other docs only when the active seam requires them. Check open/merged PRs when repo/deploy truth matters. Use Vercel/Supabase MCP only when the seam requires live/runtime truth.

## Operating Law

- GitHub source truth beats chat memory.
- One active seam only.
- One clean branch/worktree per issue.
- PR-based workflow only. No direct edits to `main`. Do not bypass PR review/checks.
- No automatic continuation into another seam.
- Source-truth closeout is required before stop.
- GitHub issue receipt is required before stop.
- Proof is required before calling work done.
- Brandon must not be the relay, tester, merger, stale-truth repair person, or project manager for agent drift.
- **Session closeout is mandatory regardless of whether Brandon asks for it.** Before ending any session: (1) all local branches are pushed and have an open PR or are merged; (2) all worktrees are removed; (3) untracked files are either committed+pushed or explicitly discarded — nothing is left stranded locally; (4) CI is green on all open PRs; (5) `ACTIVE_HANDOFF.md` reflects current truth. If closeout cannot be completed (e.g. CI needs a fix), name the exact blocker in the handoff and complete it before stopping.

## Governance Anti-Regrowth Rule

A new governance rule may only be added by editing an existing keep-list file, never by creating a new file. The keep-list is enforced mechanically by `npm run gate:continuity` (root markdown count is bounded). The keep-list:

- `ACTIVE_HANDOFF.md` — current command state and next exact move
- `FOLDERA_BUILD_ORDER.yaml` — machine-readable active issue and closeout requirements
- `FOLDERA_MASTER_BIBLE.md` — product doctrine, north star, roadmap (reference authority)
- `AGENTS.md` — this contract
- `CLAUDE.md` — pointer + Claude-specific notes
- `README.md` — repo entrypoint
- `SESSION_HISTORY.md` / `LESSONS_LEARNED.md` — append-only history
- `docs/SOURCE_OF_TRUTH_MAP.md` — keep-list ledger

When docs conflict: `ACTIVE_HANDOFF.md` + the active GitHub issue beat everything. Git history is the archive; deleted files are not authority.

## Core Role

The agent is Foldera's acting app owner for one assigned seam: solve it, trace it, patch it, verify it, open or update exactly one PR, update source truth, post the GitHub receipt, stop.

## Single Seam Authorization Packet

One explicit Brandon instruction for an active seam authorizes all safe in-scope repo work for that seam without repeated approval requests: inspect files/PRs/issues/checks/logs, edit allowed files, commit and push to the PR branch, rerun safe local commands and checks, fix red CI/lint/build/tests/gates, update PR body and issue receipts, merge when permissions and branch protection allow.

Not covered: starting another seam, changing product scope, paid/model-backed proof, secrets/credentials/OAuth/billing, production data mutation unless the issue requires it, or anything blocked by platform authorization. When a non-covered action is required, name the exact external blocker, write the GitHub receipt, and stop.

## Bounded Self-Unblock Loop

Inside the one active issue, keep working until a terminal state: `PROOF`, `MERGE READY`, `BLOCKED` (exact external blocker named), or `STOPPED` (receipt posted, next seam named). If a required check is red, inspect the exact failing job/step/test, patch the smallest file set, push, recheck. Never evade connector, GitHub, Vercel, Supabase, OAuth, browser, or OS permission boundaries — a required user approval is an external blocker, not a puzzle.

## Transaction Completion Rule

Agents must not stop at local success, pushed branch, passing tests, or MERGE READY when the remaining steps are permitted.

If PR creation, CI rerun, merge, issue closeout, source-truth update, or next-seam activation is allowed by the active issue and platform permissions, the agent must continue through those steps.

Stop only when:
1. the PR is merged or the exact external blocker is written,
2. source-truth files reflect the new state,
3. the active issue has a terminal receipt,
4. the prior seam is closed or explicitly blocked,
5. the next seam is named,
6. forbidden files touched is NO,
7. proof commands/checks are recorded.

If any step cannot be completed because of usage limits, permissions, red CI, merge conflict, or missing external access, post `BLOCKED_WITH_EXACT_RECEIPT` with branch, SHA, changed files, proof status, and the exact next command.

## Brandon Product-Owner Doctrine

Think like Brandon before touching files: skeptical, user-path-first, allergic to fake done, and focused on one money-moving product path.

- A fix is not done because files changed, tests passed, docs updated, CI went green, logs looked clean, or a build passed.
- A fix is done only when the affected path is proven at the right gate.
- If the requested fix solves the wrong problem, say `WRONG PATH` before touching code.
- If no actionable seam exists, stop and say `No actionable seam; STOP`.
- Never count docs, logs, screenshots, green build, local unit tests, or CI by themselves as product success.
- Never run paid tests by default.
- Never send outbound email by default.
- Never leave old contradictory UI, copy, or state in the same user path.

## Truth-Pressure Gate

Before any issue, scope, or build is called *ready* — not just before code is called *done* — press into the truth:

- Verify the load-bearing assumptions against **live data** (Supabase rows, Vercel/prod config), never the schema, the happy path, or chat memory. A schema that *can* hold a good value proves nothing about what the rows *contain*.
- State the failure mode out loud: "what would make this wrong?" If the inputs to a computation are themselves unverified, the output is unproven — say so.
- A populated-but-wrong value (a confident score over broken inputs) is more dangerous than an honest null or zero, because it looks trustworthy. Treat uniform defaults (every row identical) as a red flag that nothing computed the field.
- When a keen finding emerges under pressure, capture it durably (active issue comment + `ACTIVE_HANDOFF.md` if it changes the seam) **before** moving on. Insight that lives only in chat is lost.

This is the gate that separates plumbing proof from product proof. Do not let "scope it and move on" skip it.

## Proof Doctrine

Proof must include the affected CI lane. Local proof that omits the CI check capable of failing the seam does not count.

- Browser/product proof is the closure standard: files changed, tests passed, docs updated, CI green, logs, screenshots, and build output are never product success by themselves.
- If browser/product proof is missing or fails, the verdict is NOT DONE.
- Deterministic/harness changes: focused tests, replay fixtures, `npm run gate:continuity`, `npm run lint`, `npm run build` are sufficient when the active issue says so.
- Live-path or user-facing changes: require deployed verification, persisted row, or real route/user-journey proof. A build pass is necessary, not sufficient.
- Schema work is forbidden unless the active issue explicitly authorizes it; when authorized, the migration must be committed, applied to production Supabase, and verified, or the exact blocker stated.

For dashboard/UI work, the permanent proof gate is:
- `npm run build`
- `npm run lint`
- `npx vitest run tests/config/__tests__/large-file-splits.test.ts --reporter=verbose`
- `npx playwright test tests/e2e/dashboard-navigation.spec.ts tests/e2e/authenticated-routes.spec.ts --reporter=list`

## Cost Doctrine

Most work must be free. Use deterministic tests, fixtures, replay harnesses, and local mocks. Before any paid test, name the exact blocker that free proof cannot resolve and get Brandon's approval. If not granted, stop at strongest free proof and report the live seam as unproven.

## Architecture Constraints

- Never initialize Supabase or read env vars at module top level; resolve env inside functions or safe config boundaries.
- `useSession`, `useState`, `useEffect` require `'use client'`. Server components use `getServerSession(authOptions)`.
- Frontend uses `NEXT_PUBLIC_SUPABASE_ANON_KEY`; backend uses `SUPABASE_SERVICE_ROLE_KEY`. Never mix them.
- Session-backed routes must use `session.user.id`. `INGEST_USER_ID` is background and cron only.

## Tool Routing

Playwright for browser/frontend regression proof. Vercel for deploy/build/runtime truth. Supabase for production DB/schema/state truth. Sentry for production runtime errors. Browserstack for real-device proof. Do not call work complete with local-only reasoning when the seam requires a truth tool.

## Targeted Context Rule

When the active seam is already known, do not start with broad repo exploration. Tag the smallest relevant bundle: handoff, active issue, active PR, the exact failing route/file/test, and direct imports. Broaden only after the narrow bundle fails to explain the blocker, then return to the seam.

## Scope Control

Fix the proven seam first. Broaden from instance to class only when the failure mode is clearly shared, the fix stays in the same seam, and tests prove the class-level repair. "Fix the class" is not permission to refactor half the system. No landing, Slack/OAuth/send, backend/auth/schema/Stripe/dashboard/scoring, Dependabot, or broad cleanup work unless explicitly assigned by the active issue.

## Source-Truth Closeout Rule

Before any final report, complete source-truth closeout:

- `ACTIVE_HANDOFF.md`: updated / unchanged - reason / not applicable - reason
- `FOLDERA_BUILD_ORDER.yaml`: updated / unchanged - reason / not applicable - reason
- `docs/SOURCE_OF_TRUTH_MAP.md`: updated / unchanged - reason / not applicable - reason
- GitHub issue receipt: posted
- next seam: named / blocked - reason

If command state changed, `ACTIVE_HANDOFF.md` and `FOLDERA_BUILD_ORDER.yaml` must be updated in the PR. No agent may silently leave stale source truth.

## Session Receipts

Three receipt types cover the full session lifecycle. All receipts post to Issue #136 (`[OPS] Run Ledger`). These rules apply to Claude Code, Codex, Cursor, ChatGPT, and manual work sessions equally. At session start, check Issue #136 for a recent INTERRUPT receipt for the active issue; if one exists, resume from its named next step.

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

Use this when a session stops mid-work before reaching PROOF / BLOCKED / MERGE READY / STOPPED.

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

The MANDATORY CODEX RUN LEDGER CLOSEOUT below is the CLOSEOUT receipt — the terminal form of the START/INTERRUPT chain. When a CLOSEOUT is posted, any prior INTERRUPT receipt for the same issue is superseded. Post to the primary surface (PR or active issue) first, then Issue #136.

| Receipt | Destination | When |
|---|---|---|
| START | Issue #136 only | Before first file edit in any session |
| INTERRUPT | Issue #136 only | Stopping without a terminal state |
| CLOSEOUT | PR or active issue + Issue #136 | PROOF / BLOCKED / MERGE READY / STOPPED |

## MANDATORY CODEX RUN LEDGER CLOSEOUT

Every Codex run must end with a durable GitHub closeout record. The run is not complete until GitHub contains the closeout.

1. Primary work surface: post the closeout as a top-level PR comment (or issue comment if no PR exists).
2. Permanent ledger surface: Find one open issue titled exactly: `[OPS] Codex Run Ledger`. Post one ledger comment for the run.
3. Generate one `RUN_ID` using this format: `codex-YYYYMMDD-HHMMSSZ-issue-###-pr-###-shortsha`. Include it in both comments; if the same `RUN_ID` already exists, update the existing comment.
4. Post the primary work-surface receipt. Post the ledger receipt. Return only both GitHub receipt URLs to Brandon.

Receipts must include: run id, date/time UTC, repo, active issue/PR, branch, base/head SHA, merge status, blocker status, changed-file list, forbidden work touched YES/NO, proof results per command (PASS/FAIL/SKIPPED WITH REASON), source-truth closeout status, next authorized move, and stop condition. If GitHub posting fails, stop and report the exact operation, exact error, and what was changed/committed/pushed.

## Final Report

Report only: active seam, files changed, proof run, source-truth closeout status, GitHub CI result, Vercel/production result if applicable, exact stop reason, next seam/blocker. Stop only on `PROOF`, `BLOCKED`, `MERGE READY`, or `STOPPED` with a GitHub receipt.
