# Final Seam Ledger

Date: 2026-05-16
Mode: branch and document gap triage only. No product features, schema work, paid generation, outbound email, or Stripe work.

## Live Truth Baseline

- Baseline `origin/main`: `bc0ed91bd496742159d888b92109cbffdacd9c86`.
- Baseline local `HEAD`: `bc0ed91bd496742159d888b92109cbffdacd9c86`.
- Baseline production `/api/health`: `bc0ed91bd496742159d888b92109cbffdacd9c86`, build `bc0ed91`, deployment `dpl_Dhrkk5D7FCZzbpWrRiSu7vL7Ct1i`.
- Baseline Vercel production: `READY`, commit `bc0ed91bd496742159d888b92109cbffdacd9c86`, message `Fix frontend receipt wording`.
- Baseline worktree: clean before this ledger was added.

This file is a receipt-only ledger. A later commit containing this file may advance `origin/main` and production health without changing product/runtime behavior.

## Classification Key

- `SHIPPED`: on `main` and production-aligned, with local or external proof recorded.
- `SHIPPED BUT NEEDS REPEATABILITY`: on `main`, but the product claim still needs more real-user or repeated proof.
- `LOCAL-ONLY / NOT ON MAIN`: exists only in ignored local files, stashes, or old working state.
- `STALE BRANCH / TRIAGE`: branch contains either superseded work or narrow salvage candidates; do not merge wholesale.
- `EXTERNAL BLOCKER`: next proof requires a real external condition or explicit approval.
- `DO NOT TOUCH NOW`: real but outside this mode or unsafe to advance without a separate approved seam.

## Main Seams

| Item | Status | Evidence | Decision |
| --- | --- | --- | --- |
| Current `main` / production live truth | `SHIPPED` | `origin/main`, local `HEAD`, Vercel production, and `/api/health` all matched `bc0ed91bd496742159d888b92109cbffdacd9c86` at ledger start. | Treat main as clean baseline. |
| GATE_9A / GATE_9 split | `SHIPPED BUT NEEDS REPEATABILITY` | `docs/RELEASE_GATES.md` contains `GATE_9A_FIRST_RUN_ACTIVATION` and separate `GATE_9_REAL_NON_OWNER_BETA`; `npm run gate:status` reports GATE_9A pass and GATE_9 external blocker. | Do not collapse GATE_9A into full beta success. |
| Real non-owner beta | `EXTERNAL BLOCKER` | Gate status requires a source-backed real non-owner action or explicit tester feedback after first-run activation. | Wait for real non-owner source-backed action or tester feedback; no fake rows, owner proof, paid generation, or UI polish. |
| Outcome Autopsy CWU playbook | `SHIPPED` | `app/api/outcome-autopsy/latest/route.ts`, `lib/outcome-autopsy/**`, `scripts/outcome-autopsy.ts`, and `tests/e2e/outcome-autopsy.spec.ts` are on `main`. | Keep as shipped deterministic playbook layer. |
| Outcome Learning / CWU engine | `SHIPPED BUT NEEDS REPEATABILITY` | `lib/outcome-learning/outcome-learning-engine.ts`, its tests, `scripts/outcome-learning.ts`, `package.json` script `outcome:learning`, `/dashboard/playbooks`, and CWU evidence/pattern-memory strings are on `main`. | The engine exists on main; repeatability still needs future non-owner outcomes, not more owner-only CWU proof. |
| Outcome Learning production proof artifacts | `LOCAL-ONLY / NOT ON MAIN` | `artifacts/proof/outcome-learning/**` exists in the local filesystem but is ignored by `.gitignore` and has no tracked history on `main`. | Do not assume proof artifacts are durable in git; preserve separately only if a future receipt explicitly requires them. |
| `codex/outcome-learning-from-f6e3b34` | `STALE BRANCH / TRIAGE` | Branch is `1` commit ahead and `12` commits behind `origin/main`; direct diff would remove newer first-run/source-readiness/auth guard work. `git cherry` still shows unique commit `945a272`. | Do not merge wholesale. Salvage only narrow outcome-learning hardening hunks if that becomes the active seam. |
| Branch outcome-learning hardening hunks | `STALE BRANCH / TRIAGE` | Useful diff remains in `app/dashboard/playbooks/page.tsx`, `lib/outcome-learning/outcome-learning-engine.ts`, `lib/outcome-learning/__tests__/outcome-learning-engine.test.ts`, and `tests/e2e/outcome-autopsy.spec.ts`: ledger filtering, stored-signal fallback, downstream summary, seed evidence expansion, and summary cards. | Cherry-pick manually by file/hunk only; rerun focused outcome-learning tests, Playwright autopsy proof, `gate:status`, `build`, and `lint`. |
| Owner canary guard | `SHIPPED` | `docs/OWNER_CANARY_TEST_RUNBOOK.md` is not on current main, but the product guard and release docs exclude `OWNER_CANARY_USER_IDS`; local branch `codex/owner-canary-guard` is merged/superseded by main. | Safe to ignore/close local branch; do not count owner canaries as beta proof. |
| First-run source-only onboarding | `SHIPPED` | `/onboard`, start/login OAuth account-choice support, source-readiness API/model, and related tests are present on `main`. | Keep; no focus-bucket onboarding resurrection. |
| Google OAuth redirect documentation | `SHIPPED` | `docs/GOOGLE_OAUTH_REDIRECTS.md`, `tests/config/__tests__/google-oauth-redirects.test.ts`, and `lib/auth/oauth-account-choice.ts` are on `main`. | Current redirect/account-choice docs are present. |
| `docs/GOOGLE_OAUTH_VERIFICATION_PLAN.md` | `LOCAL-ONLY / NOT ON MAIN` | Requested file does not exist on `main`, in visible branch history, or in the inspected stashes. | If needed, create as a new doc seam; do not confuse it with the shipped redirects doc. |
| `docs/SUPABASE_DOWNGRADE_CHECKLIST.md` | `LOCAL-ONLY / NOT ON MAIN` | Missing on `main`; present in stashes `stash@{3}` and `stash@{4}`. | Salvage later only if Supabase downgrade/cost mode is reopened; do not downgrade now. |
| `docs/PROD_RISK_SNAPSHOT.md` | `LOCAL-ONLY / NOT ON MAIN` | Missing on `main`; present in stashes `stash@{3}` and `stash@{4}`. | Salvage later only if production risk/cost mode is reopened; stale SHA values inside must be refreshed before use. |
| Supabase downgrade decision | `DO NOT TOUCH NOW` | The stashed checklist says downgrade is conditional and forbidden during live tester/debug windows; current mode bans schema/destructive DB and does not authorize plan changes. | Keep Pro decision out of this branch triage unless Brandon opens a fresh Supabase cost seam. |
| Schema reconciliation / migrations | `DO NOT TOUCH NOW` | `CURRENT_STATE.md` records migration-history drift and forbids broad reconciliation without a separate plan. | Do not run migration repair or schema actions in this mode. |
| Paid owner artifact proof / BL-015 | `EXTERNAL BLOCKER` | Current doctrine requires explicit paid/model approval for any live owner proof. | Do not run paid generation. |
| Interview artifact paid proof / BL-005 | `EXTERNAL BLOCKER` | Current state still requires a fresh paid interview-class proof to close; this mode forbids paid generation. | Do not run paid generation. |
| Dependency update branches | `DO NOT TOUCH NOW` | Dependabot branches for `framer-motion`, `stripe`, `svix`, `@types/node`, and `typescript` are open remote branches. | Do not touch under this seam; Stripe branch is explicitly out of scope. |
| Old Claude/Cursor/rescue branches | `STALE BRANCH / TRIAGE` | Multiple open old local/remote branches exist with product, infra, Stripe, dashboard, and ops changes. | Do not merge in this mode. Triage only if one becomes the active seam with fresh proof. |

## Branch Ledger

| Branch | Status | Notes |
| --- | --- | --- |
| `main` / `origin/main` | `SHIPPED` | Clean baseline at `bc0ed91bd496742159d888b92109cbffdacd9c86` before this ledger commit. |
| `codex/outcome-learning-from-f6e3b34` / `origin/codex/outcome-learning-from-f6e3b34` | `STALE BRANCH / TRIAGE` | One unique commit remains; do not merge wholesale. Narrow salvage only. |
| `codex/first-run-value` | `SHIPPED` | Local branch is behind `main`; first-run source readiness and GATE_9A split are already on main. Safe to ignore/close locally. |
| `codex/owner-canary-guard` | `SHIPPED` | Local branch is behind/superseded by main guard behavior. Safe to ignore/close locally. |
| `codex/pending-approval-fix` | `STALE BRANCH / TRIAGE` | Separate old branch; not part of final doc/branch gap mode. Do not merge without fresh current-main proof. |
| `codex/settings-redirect-fix` / `origin/codex/settings-redirect-fix` | `STALE BRANCH / TRIAGE` | Older settings redirect branch; current OAuth account-choice/redirect docs are on main. Do not merge without a fresh OAuth seam. |
| `claude/*`, `cursor/*`, `rescue/*`, `frontend-hybrid-pass`, `dashboard-*` | `STALE BRANCH / TRIAGE` | Historical branches with broad product/UI/ops changes. No action in this mode. |
| `dependabot/*` | `DO NOT TOUCH NOW` | Dependency-only branches; Stripe-related branch is explicitly out of scope. |

## Local Drift And Stashes

- Active dirty files before this ledger: none.
- `stash@{3}` contains `docs/PROD_RISK_SNAPSHOT.md` and `docs/SUPABASE_DOWNGRADE_CHECKLIST.md` plus auth/OAuth files.
- `stash@{4}` contains `docs/PROD_RISK_SNAPSHOT.md`, `docs/SUPABASE_DOWNGRADE_CHECKLIST.md`, and outcome-learning hardening hunks.
- `artifacts/proof/outcome-learning/**` exists locally but is ignored by `.gitignore`; it is not on `main`.
- No `docs/GOOGLE_OAUTH_VERIFICATION_PLAN.md` was found on main, branch history, or inspected stashes.

## Do Not Touch Now

- Product feature buildout.
- UI polish.
- Schema, migrations, Supabase downgrade, or destructive DB actions.
- Paid/model-backed generation.
- Outbound email.
- Stripe.
- Wholesale branch merges from stale branches.

## Next Safe Move

Only after this ledger is pushed and verified, the next autonomous code move is one of:

1. If Brandon wants to recover stranded docs, create a fresh Supabase risk/downgrade doc seam from the stashed content with current SHA/Supabase/Vercel truth refreshed.
2. If Brandon wants to recover branch code, cherry-pick only the narrow outcome-learning hardening hunks from `codex/outcome-learning-from-f6e3b34`.
3. If the product loop is the priority, wait for `GATE_9_REAL_NON_OWNER_BETA` external proof: real non-owner source-backed action or explicit tester feedback.

Do not do all three in one seam.
