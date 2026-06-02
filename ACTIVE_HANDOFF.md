# ACTIVE HANDOFF - FOLDERA

Last updated: 2026-06-02 PT
Current `origin/main` SHA after PR #146 merge: `26c19af9070e40a2699a8af7857c3b205d94aee6`.

## Canonical Boot Sequence
1. Read `ACTIVE_HANDOFF.md`.
2. Read `FOLDERA_BUILD_ORDER.yaml`.
3. Read the active issue named by `ACTIVE_HANDOFF.md`.
4. Read issue #48 for product doctrine.
5. Read relevant execution/proof docs only for the active seam.
6. Check latest open PRs and recent merged PRs when repo/deploy truth matters.
7. Use Vercel/Supabase only when the seam requires live/runtime truth.

## Active command gate
Active implementation seam is issue #147: Public landing shell adaptation from Figma export without changing auth/access/backend behavior.
Issue #126 is complete: PR #132 landed Supabase egress controls on `main`, PR #133 completed source-truth closeout, and current-cycle Supabase usage showed projected API/database egress under the Free-plan target. The Supabase measurement/downgrade blocker is resolved.
Issue #131 is complete: PR #135 landed the Slack test-mode MVP Presence Loop on `main`.
Issue #136 is complete: PR #137 installed mandatory Codex Run Ledger closeout discipline on `main`.
Issue #138 is complete: PR #139 promoted the Real Slack Self-Loop source-truth target on `main` without Slack implementation code.
Issue #140 / PR #142 is accepted as rail-only proof/blocker: deterministic Slack self-loop proof passed, live Slack send reached the rail, and the remaining real Slack button callback proof is externally blocked. Do not implement packet-brain behavior inside PR #142.
Issue #143 is complete: PR #145 landed deterministic Work Packet Brain proof on `main` at merge commit `e93f8fa5fdcd2a4fb907370a71791484678cbadc`.
Issue #147 is now the single assigned next seam: adapt `/` into a code-native public marketing shell while preserving the real route/access/auth contract.

## Current slice:
- Issue #126 recovery and downgrade decision are complete/resolved.
- Issue #131 MVP Presence Loop is complete on `main`.
- Issue #136 Codex Run Ledger governance is complete on `main`.
- Issue #138 Real Slack Self-Loop source-truth promotion is complete on `main`.
- Issue #140 / PR #142 remains rail-only and must not become product-brain implementation.
- Issue #143 Work Packet Brain deterministic proof is complete on `main` via PR #145.
- Issue #147 public landing shell adaptation is active and supersedes paused issue #121 / issue #84 landing references for the current implementation command.
- Issue #121 landing work is paused/superseded by issue #147.
- Issue #99 remains paused.
- Issue #48 remains the product doctrine.
- PR #124 and PR #125 are closed/superseded and must not be reopened or reused.

## Product doctrine
Foldera is a Workday Presence Layer / context conduit:
state + connectors + triggers + one intervention.
Stay quiet otherwise; no task-list/dashboard replacement behavior.
Issue #48 remains the product contract.

## Completed issue #143 outcome
PR #145 implemented the MVP Work Packet Brain deterministic proof: multiple consented source signals -> source trail -> consolidated `work_packet` -> prepared reviewable work -> Slack review card -> human review/dismiss -> packet/workday state update -> quiet.
Issue #143 proof completed in PR #145 with TEST_MODE fixtures, no paid model call, review/dismiss state update, source trail, no dashboard/task-list/inbox-summary behavior, and `gate:continuity` doctrine enforcement.
PR #142 stays rail-only. Do not block, widen, or mutate PR #142 to implement `work_packet`.

## Required issue #147 outcome
Implement only the public landing shell adaptation in the next implementation PR:
- `/` is the public marketing landing shell.
- Access, Get started, and Join pilot CTAs point to `/start`.
- Login CTAs point to `/login`.
- `/signup` continues redirecting to `/start`.
- `/try` remains redirected to `/start`.
- `/request-access` is absent or redirects to `/start`.
- `/demo` remains unchanged unless linked only as the existing demo.
- No fake signup, waitlist, request-access API, email/password auth, customer logos, certifications, enterprise proof, or unsupported product claims.
- Uploaded Figma/Vite export and `foldera (1).html` are visual/content references only; do not import either wholesale.

## GitHub writeback contract
- GitHub writeback before stop is mandatory.
- Chat memory is not source of truth.
- If work was done and not written to GitHub, the transaction is incomplete.
- Before stopping, write one terminal GitHub comment: `PR OPENED`, `PROOF`, `MERGE READY`, `BLOCKED`, or `STOPPED`.
- Every PR must close source truth before stop.
- `ACTIVE_HANDOFF.md` must be updated when the active seam, proof status, next seam, or blocker changes.
- `FOLDERA_BUILD_ORDER.yaml` must be updated when the active issue, paused issue list, priority class, or work type changes.
- If a source-truth file is not updated, the PR receipt must say `unchanged - reason` or `not applicable - reason`.

## Forbidden unless explicitly assigned
- For issue #147, no Slack files, Supabase schema, dashboard files, auth rewrite, backend changes, Stripe changes, package.json dependency additions, Vite scaffold, React Router, bulk shadcn/Radix import, PR #142 mutation, fake customer logos, fake SOC2/HIPAA/ISO claims, 10x/autonomous-agents/coding-agent language, or broad cleanup.
- No live connector expansion, paid model proof, or implementation outside the public landing route/access contract is authorized by this handoff.

## Next exact move
Run issue #147 only.
Next seam: issue #147 - public landing shell adaptation from Figma export without changing auth/access/backend behavior.
Stop after one implementation PR proves the route/access contract. Do not touch Slack, Supabase schema, dashboard, auth/backend, Stripe, package dependencies, PR #142, or broad cleanup.
