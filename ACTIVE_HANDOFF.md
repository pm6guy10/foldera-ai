# ACTIVE HANDOFF - FOLDERA

Last updated: 2026-06-12 PT (#274 COMPLETE — Command State Resolver v0 contract locked; issue #276 is the next implementation seam)

## Boot

1. Read this file.
2. Read the active issue it names.

## Active command gate

Issue #276 is the active implementation seam.
Issue #274 is COMPLETE — Command State Resolver v0 source-truth contract locked 2026-06-12. Next implementation issue created: #276.
Issue #262 is COMPLETE — PR #273 merged d6b99f2 on 2026-06-12. Production/main Vercel deploy `dpl_A4XzywTzsTqhc31KRRWyXxdUg6b7` is READY for merge SHA `d6b99f2`.
Issue #259 is COMPLETE — rung-7 mechanical non-owner loop proven 2026-06-12. Proof receipt: https://github.com/pm6guy10/foldera-ai/issues/259#issuecomment-4692374168
Issue #251 (rung-7 foundation hardening) is COMPLETE — PR #258 merged b0de76d (2026-06-11).
Issue #226 (rung-6 owner-path readiness) is COMPLETE — PR #256 merged 2026-06-11.
Issue #249 (scorer-winner invariant) is COMPLETE — PR #257 merged 2026-06-11.
`FOLDERA_MASTER_BIBLE.md` is the single doctrine file. `AGENTS.md` is the single agent contract.
One active seam only.

**Next seam: issue #276 — Implement Command State Resolver v0 backend verdict object.**
Open issue #276 and keep the work backend-only.

## Current slice:

Issue #276: Implement Command State Resolver v0 backend verdict object.
Resolver contract: one backend verdict object with exactly four allowed outputs:
- `MERGE_READY`
- `FIX_FIRST`
- `WAIT`
- `CLEAR`
Forbidden: `app/dashboard/**`, `components/**`, dashboard/UI, visual redesign, Slack card redesign, new connectors, Stripe, `#244`, `#246`.

## #259 closeout record

Proof type: mechanical non-owner pipe proof (per user decision 2026-06-12).
- Non-owner account: b.kapp1010@gmail.com / `2cbc1bab-8e0e-43b0-bf4a-9a0cd6b5d91f`
- Gmail + Microsoft connected, 1,275 real signals synced (128 pre-key-fix ciphertext signals deleted as corrupted-data cleanup)
- Scorer exercised on real data → honest SAFE_SILENCE (`no_valid_action`)
- Pipe-test card delivered via `GET /api/slack/test-mode/right-now`
- Interaction fired via `POST /api/slack/test-mode/interaction { action_id: "dismiss" }`
- Durable receipt written: tkg_actions id=`c48ad06c`, action_type=`presence_action`, action_source=`workday_presence`, status=`draft_rejected`
- Schema fix: `tkg_actions_action_type_check` constraint was missing `presence_action` — fixed via migration 2026-06-12
- Proof receipt: https://github.com/pm6guy10/foldera-ai/issues/259#issuecomment-4692374168
- Future organic source-backed pilot validation is a separate product-validation seam. NOT reopen criteria for #259.

## Product doctrine

Foldera is a Workday Presence Layer: state + connectors + triggers + one intervention; remembers where the user was, decides when to interrupt, gives one next move, lets the user respond with one click, updates state, stays quiet otherwise. No dashboard/task-manager/inbox-summary/chatbot/surveillance drift. Issue #48 and `FOLDERA_MASTER_BIBLE.md` carry product doctrine.

## GitHub writeback contract

- GitHub writeback before stop is mandatory.
- Chat memory is not source of truth.
- If work was done and not written to GitHub, the transaction is incomplete.
- Before stopping, write one terminal GitHub comment: `PR OPENED`, `PROOF`, `MERGE READY`, `BLOCKED`, or `STOPPED`.
- `ACTIVE_HANDOFF.md` must be updated when the active seam, proof status, next seam, or blocker changes.
- `FOLDERA_BUILD_ORDER.yaml` must be updated when the active issue changes.

## Next exact move

Read issue #276 and implement the backend verdict object only. Do not broaden into dashboard/UI, connector work, Stripe, or rung-9 validation.

## #249 closeout record

Invariant: scored winner beats recency — enforced in `selectSourceBackedRightNowState`; PR #257 merged 2026-06-11 (`ac8b15e`).
Proof: 20/20 vitest pass · gate:continuity pass · lint clean · build clean · 53-gate pre-push pass · CI green. Receipt: https://github.com/pm6guy10/foldera-ai/issues/249#issuecomment-4686122101

## #226 closeout record

Sub-proof 1: Gmail sign-in — PASS (prior session)
Sub-proof 2: Microsoft sign-in — PASS (Azure client secret regenerated + ENCRYPTION_KEY fixed in Vercel, 2026-06-11)
Sub-proof 3: Slack self-loop scored winner — PASS (2026-06-11, PR #256); `scoreOpenLoops` fired with `pipelineDryRun: true`, winner was "Commitment due in 0d: Homeschool meeting with Deanne Varnum", `state_source: 'scored_winner'`, loop closed. Receipt: https://github.com/pm6guy10/foldera-ai/issues/226#issuecomment-4685107461
