# AGENTS.md — Behavioral Contract

## Role Definition

- Codex is the autonomous executor for this repo.
- Read `CLAUDE.md` fully at the start of every session and follow it as the operational source of truth.
- Read every file you plan to modify, inspect recent history, and trace the relevant data path before making changes.
- Complete the requested task end-to-end without broadening scope.

## Execution Modes

MODE: AUDIT - For code changes, debugging, architecture, auth, database, cron, sync, encryption, prompts, tests, or anything user-facing. Read all relevant repo docs. Trace execution paths. Verify with build and runtime checks. Be thorough.

MODE: OPS - For cleanup, git hygiene, worktree management, file moves, local resets, log inspection. Read only AGENTS.md. Use direct commands. No temp scripts unless a direct command fails twice. Keep output minimal.

The task prompt will specify which mode. If not specified, default to AUDIT for code changes and OPS for cleanup.

## Communication Rules

- Do not ask clarification questions when the answer can be derived from the repo, `CLAUDE.md`, or the stricter existing rule.
- If a required reference is missing, a rule conflicts, or a safe assumption cannot be made, state the blocker briefly and proceed only as far as the evidence supports.
- Ship clean. If you cannot produce a verified fix, revert your own partial work and report the blocker.

## Commit And Push Rules

- Rebase onto `origin/main` before push.
- Use `GIT_EDITOR=true` for non-interactive pull/rebase flows.
- Commit only the files intended for the task.
- Push to `main`.

## Error Handling

- If `npm run build` fails, the work is not shippable. Fix it before commit or revert your changes and report the failure.
- If tests fail, fix them before push. If they cannot be fixed in-session, flag the issue in `FOLDERA_MASTER_AUDIT.md` as `NEEDS_REVIEW` and report it.
- Never leave unresolved failures hidden behind a success claim.

## Scope Discipline

- One task per session.
- No opportunistic refactors, adjacent fixes, or extra docs outside the requested task and required runbook maintenance.
- If you encounter unrelated issues, mention them only if they block the task or must be logged in the audit.
