# ACTIVE HANDOFF - FOLDERA

Last updated: 2026-06-02 PT
Current `origin/main` SHA at Work Packet Brain promotion start: `cb5fbef6b528f1d199e2fef3c909053f00e3767e`.

## Canonical Boot Sequence
For any Foldera task, use this order:

1. Read `ACTIVE_HANDOFF.md`.
2. Read `FOLDERA_BUILD_ORDER.yaml`.
3. Read the active issue named by `ACTIVE_HANDOFF.md`.
4. Read issue #48 for product doctrine.
5. Read relevant execution/proof docs only for the active seam.
6. Check latest open PRs and recent merged PRs when repo/deploy truth matters.
7. Use Vercel/Supabase only when the seam requires live/runtime truth.

## Active command gate
Active implementation seam is issue #143: MVP Work Packet Brain source trails -> consolidated review packet -> Slack review card.

Issue #126 is complete: PR #132 landed Supabase egress controls on `main`, PR #133 completed source-truth closeout, and current-cycle Supabase usage showed projected API/database egress under the Free-plan target. The Supabase measurement/downgrade blocker is resolved.

Issue #131 is complete: PR #135 landed the Slack test-mode MVP Presence Loop on `main`.

Issue #136 is complete: PR #137 installed mandatory Codex Run Ledger closeout discipline on `main`.

Issue #138 is complete: PR #139 promoted the Real Slack Self-Loop source-truth target on `main` without Slack implementation code.

Issue #140 / PR #142 is accepted as rail-only proof/blocker: deterministic Slack self-loop proof passed, live Slack send reached the rail, and the remaining real Slack button callback proof is externally blocked. Do not implement packet-brain behavior inside PR #142.

## Current slice:

- Issue #126 recovery and downgrade decision are complete/resolved.
- Issue #131 MVP Presence Loop is complete on `main`.
- Issue #136 Codex Run Ledger governance is complete on `main`.
- Issue #138 Real Slack Self-Loop source-truth promotion is complete on `main`.
- Issue #140 / PR #142 remains rail-only and must not become product-brain implementation.
- Issue #143 is now the active next product-brain seam.
- Issue #121 landing work remains paused unless explicitly reassigned after issue #136.
- Issue #99 remains paused.
- Issue #48 remains the product doctrine.
- PR #124 and PR #125 are closed/superseded and must not be reopened or reused.

## Product doctrine

Foldera is a Workday Presence Layer / context conduit:
state + connectors + triggers + one intervention.
Stay quiet otherwise; no task-list/dashboard replacement behavior.
Issue #48 remains the product contract.

## Required issue #143 outcome

Promote and then implement the MVP Work Packet Brain only when explicitly assigned:
multiple consented source signals -> source trail -> consolidated `work_packet` -> prepared reviewable work -> Slack review card -> human review/dismiss -> packet/workday state update -> quiet.

Required future proof for issue #143: fixture-driven fake source signals, deterministic packet generation in TEST_MODE, no paid model call, one packet from multiple signals, source trail plus prepared work, Slack review card with Review/View sources/Dismiss and no Send, human review state update, dismiss audit trail, no dashboard/task-list/inbox-summary behavior, and `gate:continuity` or a narrow packet-brain gate enforcing doctrine.

PR #142 stays rail-only. Do not block, widen, or mutate PR #142 to implement `work_packet`.

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

- No landing, Stripe, dashboard redesign, Supabase schema, Slack OAuth expansion, Teams/email/calendar expansion, outreach, billing/downgrade work, or broad cleanup.
- For issue #143 specifically, narrow packet-brain source trails and review-card proof only; no live connector expansion and no paid model proof.

## Next exact move

Run issue #143 only after this source-truth promotion PR lands. Do not implement `work_packet` in this promotion PR, and do not start landing, dashboard, Slack OAuth expansion, Teams/email/calendar connectors, Stripe, auth, Supabase schema, Dependabot, or broad cleanup.
