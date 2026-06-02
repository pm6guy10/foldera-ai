# ACTIVE HANDOFF - FOLDERA

Last updated: 2026-06-02 PT
Current `origin/main` SHA after PR #149 merge: `d9ede1dd39c3de3b3fe5bd5e3592b0ced001fdf3`.

## Canonical Boot Sequence
1. Read `ACTIVE_HANDOFF.md`.
2. Read `FOLDERA_BUILD_ORDER.yaml`.
3. Read the active issue named by `ACTIVE_HANDOFF.md`.
4. Read issue #48 for product doctrine.
5. Read relevant execution/proof docs only for the active seam.
6. Check latest open PRs and recent merged PRs when repo/deploy truth matters.
7. Use Vercel/Supabase only when the seam requires live/runtime truth.

## Active command gate
Active implementation seam is issue #140 / PR #142: Real Slack Self-Loop live rail proof and blocker classification only.
Issue #147 is complete: PR #149 landed the public landing shell adaptation on `main` at merge commit `d9ede1dd39c3de3b3fe5bd5e3592b0ced001fdf3`, and GitHub issue #147 is closed.
Issue #140 / PR #142 remains rail-only: deterministic Slack self-loop proof passed, live Slack send reached the rail, and the remaining real Slack button callback proof is externally blocked. Do not mutate PR #142 into packet-brain, connector-platform, dashboard, or product-brain work.
Issue #136 remains open as the standing Codex Run Ledger only.

## Current slice:
- Issue #126 recovery and downgrade decision are complete/resolved.
- Issue #131 MVP Presence Loop is complete on `main` and closed; do not reopen.
- Issue #136 Codex Run Ledger governance is complete on `main` and remains open only as the standing ledger.
- Issue #138 Real Slack Self-Loop source-truth promotion is complete on `main`.
- Issue #140 / PR #142 is the active live rail proof/blocker seam only.
- Issue #143 Work Packet Brain deterministic proof is complete on `main` via PR #145.
- Issue #147 public landing shell adaptation is complete on `main` via PR #149; issue #147 is closed.
- Issues #121, #99, and #48 are closed/superseded; issue #131 is closed/completed. Do not reopen them.
- PR #124 and PR #125 are closed/superseded and must not be reopened or reused.

## Product doctrine
Foldera is a Workday Presence Layer / context conduit:
state + connectors + triggers + one intervention.
Remember where the user was, decide when to interrupt, give one next move, let the user respond with one click, update state, and stay quiet otherwise.
No dashboard/task-manager/inbox-summary/chatbot/surveillance drift.
Issue #48 remains the product contract.
Issue #48 is carried forward in repo source truth; it is closed/superseded and must not be reopened.

## Required issue #140 / PR #142 live rail outcome
Prove or classify exactly the remaining live Slack rail blocker:
- send/use a current real Slack card only if live env/config is available;
- click exactly one real Slack button when possible;
- verify whether a signed POST reaches `/api/slack/interaction`;
- capture after-state proof only if the POST reaches Vercel and updates state;
- if no POST reaches Vercel, close the run as `BLOCKED` with Slack app/workspace/token/config or Socket Mode callback-delivery evidence.

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
- For issue #140 live rail proof, do not patch Slack code until logs prove a code-owned failure.
- No landing implementation, Supabase schema, dashboard/auth/backend, Stripe, package files, Dependabot, connector expansion, Teams/email/calendar, paid model proof, broad cleanup, or reopening #121/#131/#99/#48/#147.

## Next exact move
Run issue #140 / PR #142 live rail proof only.
Next seam: issue #140 / PR #142 - real Slack self-loop live callback proof or blocker classification.
Stop after one proof/blocker receipt. Do not touch landing, Slack code, Supabase schema, dashboard/auth/backend, Stripe, package files, Dependabot, or broad cleanup.
