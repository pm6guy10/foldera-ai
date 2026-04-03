# AGENTS.md — Behavioral Contract

## Role Definition

- Codex is the autonomous executor for this repo.
- Read `CLAUDE.md` fully at the start of every session and follow it as the operational source of truth.
- Read `LESSONS_LEARNED.md`. Every rule is enforced. No exceptions.
- Read `FOLDERA_PRODUCT_SPEC.md`. Every fix must map to a spec item. Fixes outside the spec require explicit approval. Update the spec before closing.
- Read every file you plan to modify, inspect recent history, and trace the relevant data path before making changes.
- Complete the requested task end-to-end without broadening scope.
- Multi-session “mega prompt” quality work: follow the sequenced program in `docs/MEGA_PROMPT_PROGRAM.md` (one session per row; baseline + receipts).
- **Operator quick links** (Vercel, Supabase, GitHub, Resend, “no email” after Generate Now, Gate 4 steps): `docs/MASTER_PUNCHLIST.md`.
- **Quarterly A–Z audit artifact + prioritized backlog table:** `docs/AZ_AUDIT_2026-04.md`, `AUTOMATION_BACKLOG.md` OPEN; local vs prod Playwright: `docs/LOCAL_E2E_AND_PROD_TESTS.md`.

## Execution Modes

MODE: AUDIT - For code changes, debugging, architecture, auth, database, cron, sync, encryption, prompts, tests, or anything user-facing. Read all relevant repo docs. Trace execution paths. Verify with build and runtime checks. Be thorough.

MODE: OPS - For cleanup, git hygiene, worktree management, file moves, local resets, log inspection. Read only AGENTS.md. Use direct commands. No temp scripts unless a direct command fails twice. Keep output minimal.

MODE: FLOW - For user-flow continuity fixes (auth, onboarding, connectors, dashboard, navigation, redirect logic, UI interaction bugs).
Rules:
- You are fixing a full user journey, not a single file.
- You may modify multiple files if required to restore end-to-end flow.
- Trace the real runtime path (routing, session, state, handlers) before editing.
- Fix root causes, not surface symptoms.
- Remove conflicting logic instead of layering conditions.
- Build must pass AND flow must be verified through actual navigation paths.

Verification required:
- No dead clicks
- No redirect loops
- No blocked progression
- No session mismatch between pages
- No visible flicker from auth/onboarding race conditions

FLOW mode overrides "one task per file" constraints but still respects:
- no backend feature expansion
- no redesign
- no scope creep outside the defined flow

The task prompt will specify which mode. If not specified, default to AUDIT for code changes, OPS for cleanup, and FLOW for any cross-route UX or auth/session interaction bugs.

## Session Log Rule

Every session, regardless of mode, must append a session log to SESSION_HISTORY.md before the final push. The log must include:

- Date and one-line session description
- MODE used (AUDIT, OPS, or FLOW)
- Commit hash(es)
- Files changed
- What was verified
- Any unresolved issues

This is not optional. No push happens without a session log entry.

## Communication Rules

- Do not ask clarification questions when the answer can be derived from the repo, `CLAUDE.md`, or the stricter existing rule.
- If a required reference is missing, a rule conflicts, or a safe assumption cannot be made, state the blocker briefly and proceed only as far as the evidence supports.
- Ship clean. If you cannot produce a verified fix, revert your own partial work and report the blocker.

## Commit And Push Rules

- Do not rebase. Commit only task files. Leave unrelated worktree changes untouched.
- Push to `main`.

## ABSOLUTE RULE — NO BRANCHES, NO PRs, NO EXCEPTIONS

NEVER create a branch. NEVER create a PR. NEVER use git checkout -b. NEVER use gh pr create.

The only valid final action is:
  git add -A
  git commit -m "..."
  git push origin main

If you are about to create a branch or PR, STOP. Run the three commands above instead.
If the UI shows "Create PR", do not click it. Run git push origin main in the terminal.
Brandon is never the middleman. CC never asks Brandon to merge, push, or resolve anything.
Violating this rule means the session produced zero value regardless of code quality.

## FLOW Verification Requirement

Any change affecting frontend, auth, onboarding, connectors, or routing must pass the end-to-end flow test suite (tests/e2e/). If E2E tests fail, the task is not complete. Build success is not sufficient.

## Error Handling

- If `npm run build` fails, the work is not shippable. Fix it before commit or revert your changes and report the failure.
- If tests fail, fix them before push. If they cannot be fixed in-session, flag the issue in `FOLDERA_MASTER_AUDIT.md` as `NEEDS_REVIEW` and report it.
- Never leave unresolved failures hidden behind a success claim.

## Pipeline Verification

- Every session that touches the pipeline must re-trigger production after deploying, query the database for the expected outcome, and show the receipt (email delivered, action row created, correct status).
- A build pass alone is not sufficient verification. "Done" without a production receipt is not done.
- No session closes without confirming the acceptance gate passes against production.

## Nightly Orchestrator Contract (Job 1)

- The nightly orchestrator must fully prepare next-day execution during **Job 1**.
- For every backlog item created in Job 1, include these fields:
  - `Status`
  - `Classification`
  - `Evidence`
  - `Human Action`
- If `Classification = AUTO_FIXABLE`, `CODEX_PROMPT` is required in Job 1 (not Job 2).
- `CODEX_PROMPT` must be complete and paste-ready, and must follow the exact mega-prompt template in `CLAUDE.md`. It must:
  - name the specific files to edit
  - state the exact fix to make
  - include verification steps
  - include a multi-user check
  - end with the exact line: `Push directly to main. Do not create a branch.`
- By the time `NIGHTLY_REPORT.md` is written, every AUTO_FIXABLE item must already include its final `CODEX_PROMPT`.

## Scope Discipline

- One task per session.
- No opportunistic refactors, adjacent fixes, or extra docs outside the requested task and required runbook maintenance.
- If you encounter unrelated issues, mention them only if they block the task or must be logged in the audit.

## Standing Rules Additions (2026-03-20 to 2026-03-26)

- Production Playwright flow commands are now standard: `npm run test:prod`, `npm run test:prod:setup`, and `npm run test:prod:refresh` (commit `fbb1072`, `package.json`, `tests/production/setup-auth.ts`, `tests/production/smoke.spec.ts`, `playwright.prod.config.ts`).
- Weekly adversarial production audit command exists: `npm run test:audit` (commit `2de4942`, `package.json`, `tests/production/audit.spec.ts`).
- CI/ops workflows to account for during verification:
  - `.github/workflows/production-e2e.yml` runs production smoke checks on deploy success, daily schedule, and manual dispatch (commit `371f9ea`).
  - `.github/workflows/weekly-audit.yml` runs Monday production audit and uploads `tests/production/audit-summary.md`/`audit-report.json` artifacts (commit `2de4942`).
- New route contracts added:
  - `GET /api/health` is a schema/env/credit canary JSON contract used by cron health-check and prod smoke tests (commit `e1555d0`, `app/api/health/route.ts`).
  - `POST /api/dev/stress-test` is a dry-run pipeline stress endpoint for signed-in sessions (commit `9b3e719`, `app/api/dev/stress-test/route.ts`).
  - `GET /api/dev/email-preview` renders sample daily-brief HTML in the browser (`?variant=nothing` for the no-directive template); `?action_id=<uuid>` (owner session, after `POST /api/dev/brain-receipt`) loads that `tkg_actions` row and matches production send HTML; `lib/email/resend.ts` exports `buildDailyDirectiveEmailHtml` (same markup as send).
  - `GET /api/dev/ops-health` is owner-only; returns JSON env/DB readiness checks without exposing secret values (`app/api/dev/ops-health/route.ts`). See repo-root `LAUNCH_CHECKLIST.md` for manual launch steps.
  - `GET /api/model/state` is a read-only behavioral model state endpoint (commit `95c2edf`, `app/api/model/state/route.ts`).
- Environment variable note: `ALLOW_DEV_ROUTES=true` is required to access dev-only API routes such as `/api/dev/stress-test` (commit `9b3e719`, `app/api/dev/stress-test/route.ts`).
- Directory structure note: `tests/production/` now contains production auth-state scripts and smoke/audit suites referenced by CI workflows (introduced in commit `fbb1072`, extended in `2de4942`). **`tests/local/`** — gitignored `auth-state-owner.json` + `npm run test:local:setup` / `test:local:check` / `test:local:brain-receipt` for localhost owner `/api/dev/*` (see `tests/local/README.md`, `CLAUDE.md` Autonomous local hammer).

## Vercel Deployment
Vercel deploys are triggered by GitHub Actions, NOT by Vercel's automatic git integration. This is because Vercel Hobby blocks deploys from committers who aren't the repo owner (CC and Codex commits were blocked). The workflow at `.github/workflows/deploy.yml` uses VERCEL_TOKEN to deploy on every push to main. Any committer identity works.

Required GitHub Secrets:
- VERCEL_TOKEN: Vercel personal access token (Settings > Tokens)
- VERCEL_ORG_ID: team_y2RdnSgeVsCExRheya1QRB5z
- VERCEL_PROJECT_ID: prj_eG5St3NmUtqYGXJwXsANdZBLYr9N
