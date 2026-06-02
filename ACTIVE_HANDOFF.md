# ACTIVE HANDOFF - FOLDERA

Last updated: 2026-06-02 PT
Current `origin/main` SHA after PR #150 merge: `313df387c993c77660217008f973b1d48d3aa09f`.

## Canonical Boot Sequence
1. Read `ACTIVE_HANDOFF.md`.
2. Read `FOLDERA_BUILD_ORDER.yaml`.
3. Read the active issue named by `ACTIVE_HANDOFF.md`.
4. Read issue #48 for product doctrine.
5. Read relevant execution/proof docs only for the active seam.
6. Check latest open PRs and recent merged PRs when repo/deploy truth matters.
7. Use Vercel/Supabase only when the seam requires live/runtime truth.

## Active command gate
Active implementation seam is issue #151: Source-backed Right Now state selector.
Issue #147 is complete: PR #149 landed the public landing shell adaptation on `main` at merge commit `d9ede1dd39c3de3b3fe5bd5e3592b0ced001fdf3`, and GitHub issue #147 is closed.
Issue #140 / PR #142 remains rail-only and parked externally blocked: deterministic Slack self-loop proof passed, live Slack send reached the rail, and the remaining real Slack button callback proof is externally blocked by Slack/Vercel callback delivery or preview access. Do not mutate PR #142 into packet-brain, connector-platform, dashboard, source-backed selector, or product-brain work.
Issue #136 remains open as the standing Codex Run Ledger only.

## Current slice:
- Issue #126 recovery and downgrade decision are complete/resolved.
- Issue #131 MVP Presence Loop is complete on `main` and closed; do not reopen.
- Issue #136 Codex Run Ledger governance is complete on `main` and remains open only as the standing ledger.
- Issue #138 Real Slack Self-Loop source-truth promotion is complete on `main`.
- Issue #140 / PR #142 is parked as the live rail proof/blocker seam only; do not widen it.
- Issue #151 is the active source-backed Right Now state selector seam.
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

## Required issue #151 source-backed selector outcome
Implement one narrow source-backed Right Now state selector from existing Supabase-shaped evidence only:
- read `tkg_signals`, `tkg_commitments`, and optionally `tkg_actions.evidence` shaped rows;
- return quiet/no safe source-backed move, or `WorkdayPresenceState` with `state_source: "source_backed"` and safe `source_trail[]`;
- choose at most one intervention;
- preserve `source_trail` through Right Now payload generation and Done / Stuck / Break smaller / Snooze mutations;
- do not dump raw private content, call paid models, mutate `tkg_*` tables, add connectors, or recompute full product state inline.

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
- For issue #151, do not patch PR #142, Slack app settings, Vercel settings, connector ingestion, or Supabase schema unless the implementation proves a strictly necessary source-truth change.
- No landing implementation, Supabase schema, dashboard/auth/backend, Stripe, package files, Dependabot, connector expansion, Teams/email/calendar, paid model proof, broad cleanup, or reopening #121/#131/#99/#48/#147.

## Next exact move
Run issue #151 source-backed Right Now state selector only.
Next seam: issue #151 - source-backed Right Now state selector from existing `tkg_signals`, `tkg_commitments`, and optional `tkg_actions.evidence` rows.
Stop after one PR proves source-backed `WorkdayPresenceState` with safe `source_trail`, deterministic tests, required gates, and no unrelated work. Do not touch PR #142, Slack code, landing, Supabase schema, dashboard/auth/backend, Stripe, package files, Dependabot, connector expansion, Teams/email/calendar, Vercel settings, Slack app settings, or broad cleanup.
