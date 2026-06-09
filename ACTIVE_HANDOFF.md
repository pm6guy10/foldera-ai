# ACTIVE HANDOFF - FOLDERA

Last updated: 2026-06-09 PT (issue #231 activation — work-state purity, owner directive)
Current `origin/main` SHA: see GitHub for latest.

## Canonical Boot Sequence
1. Read `ACTIVE_HANDOFF.md`.
2. Read `FOLDERA_BUILD_ORDER.yaml`.
3. Read the active issue named by `ACTIVE_HANDOFF.md`.
4. Read issue #48 for product doctrine.
5. Read relevant execution/proof docs only for the active seam.
6. Check latest open PRs and recent merged PRs when repo/deploy truth matters.
7. Use Vercel/Supabase only when the seam requires live/runtime truth.

## Active command gate
Issue #181 is completed by merged PR #191.
Issue #192 is completed by merged PR #193.
Issue #196 is completed by merged PR #197.
Issue #198 is completed by merged PR #198 and restored issue #194 as active control.
Issue #194 is completed by merged PR #201.
Issue #140 is completed by merged PR #206.
Issue #208 is completed by merged PR #215.
Issue #216 is completed by merged PR #218.
Issue #220 is completed — rung 5 live proof passed (all 5 checks proven via Supabase MCP + Vercel MCP + code audit).
Issue #178 is suspended/queued and no longer active.
Current Phase: Rung 6 ACTIVE. Issue #231 is IN_PROGRESS — work-state purity: earned trust + clean graph + agent quarantine (owner directive).
The launch_ladder in FOLDERA_BUILD_ORDER.yaml is the ordering authority for the Foldera build sequence. Rung 3 (issue #208) is COMPLETE. Rung 4 (issue #216) is COMPLETE. Rung 5 (issue #220) is COMPLETE. Rung 6 (issue #231 work-state purity) is IN_PROGRESS. Rung 6b (issue #226 owner-path readiness) is PAUSED and resumes next. Rungs 7-8 are PENDING with needs_issue markers.
Issue #231 is the active work-state purity seam.
Issue #226 is paused and resumes after issue #231 is proven.
`FOLDERA_MASTER_BIBLE.md` is the canonical master bible reference authority.
`FOLDERA_EXECUTION_QUEUE.yaml` remains inactive and does not control the next move.
PR #189 remains `UNMERGED_DRAFT_CONTEXT_ONLY`.
Issue #165 Open Threads remains capture-only and cannot authorize implementation.
Issue #182 is completed/superseded by PR #203.
Issue #168 is completed/superseded by PR #205.
Issue #136 remains open as the standing Codex Run Ledger only.
GitHub writeback is mandatory.
One active seam only.

## Current slice:
- PR #207 completed the governance pivot and moved repo control from issue #178 to issue #208.
- Rung 5 (issue #220) prove/closeout is COMPLETE. Payment path proven end-to-end via live infrastructure checks.
- Issue #165 remains the raw-input inbox and capture-only.
- Issue #140 is complete and no longer the active seam.
- Issue #178 is suspended/queued and no longer the active seam.
- Issue #220 is completed (rung 5 proven).
- Issue #231 is now the active seam (owner directive) — work-state purity: trusted requires outbound evidence, personal/automated senders are classified and capped, the nightly demotion sweep cleans the contaminated graph, and acquisition agents default off (health watchdog exempt).
- Issue #226 (owner-path readiness) is PAUSED and resumes as the next seam. Its slice 1 (owner-landing honesty, PR #229) and slice 2 (sign-in reliability, PR #230) are merged; live owner sign-in proof + the Slack self-loop receipt remain open. No non-owner or rung 7 work until #226 is proven.
- `FOLDERA_EXECUTION_QUEUE.yaml` stays inactive/reference-only until a future explicit activation issue reopens it.
- Issues #48, #121, #99, #131, #147, #151, #154, #159, #163, #166, #170, #173, #175, #179, #181, #182, #183, #192, #194, and #196 are closed/completed/superseded. Do not reopen them here.

## Product doctrine
Foldera is a Workday Presence Layer / context conduit:
state + connectors + triggers + one intervention.
Remember where the user was, decide when to interrupt, give one next move, let the user respond with one click, update state, and stay quiet otherwise.
No dashboard/task-manager/inbox-summary/chatbot/surveillance drift.
Issue #48 remains the product contract.
`FOLDERA_NORTH_STAR_LOCK.md` controls product doctrine; `FOLDERA_PRODUCT_OPERATING_SYSTEM.md` controls roadmap, phase order, backlog lanes, and enterprise path.

## Source-truth boundary
Active seam: issue #231 — work-state purity (owner directive). This slice authorizes source-truth files (`ACTIVE_HANDOFF.md`, `FOLDERA_BUILD_ORDER.yaml`, `.foldera-contract.json`, `docs/SOURCE_OF_TRUTH_MAP.md`, `scripts/source-truth-check.ts`, continuity gate, focused gate tests) PLUS the entity-trust pipeline (`lib/signals/**`), the agent kill-switch surface (`lib/agents/agents-enabled.ts`, `lib/agents/run-agent.ts`), and the nightly-ops repair stage (`app/api/cron/nightly-ops/**`) with their focused tests.
Current source-truth truth is: `FOLDERA_MASTER_BIBLE.md` is the canonical reference authority, issue #220 is completed (rung 5 COMPLETE — live proof passed), issue #216 is completed by PR #218 (rung 4 COMPLETE), issue #231 is the active work-state purity seam, issue #226 is paused and resumes next, issue #178 is suspended/queued, issue #140 is completed/closed, issue #168 is completed/superseded, issue #165 is capture-only, issue #182 is completed/superseded, and the queue file remains inactive/reference-only.
Forbidden: all implementation beyond the purity seam files above — no Slack, auth, Stripe, schema migrations, components/**, landing/dashboard UI, nav architecture, new connectors, new agents, non-owner loop, rung 7, or broad cleanup until issue #231 is proven and issue #226 resumes.

## GitHub writeback contract
- GitHub writeback before stop is mandatory.
- Chat memory is not source of truth.
- If work was done and not written to GitHub, the transaction is incomplete.
- Before stopping, write one terminal GitHub comment: `PR OPENED`, `PROOF`, `MERGE READY`, `BLOCKED`, or `STOPPED`.
- Every PR must close source truth before stop.
- `ACTIVE_HANDOFF.md` must be updated when the active seam, proof status, next seam, or blocker changes.
- `FOLDERA_BUILD_ORDER.yaml` must be updated when the active issue, paused issue list, priority class, or work type changes.
- If a source-truth file is not updated, the PR receipt must say `unchanged - reason` or `not applicable - reason`.

## Next exact move
Issue #231 is the active seam. Work: land the earned-trust pipeline (outbound evidence, relationship labels, personal salience cap), the nightly demotion sweep, and the agent quarantine in one PR with focused test proof.
Proof required: focused vitest suites (lib/signals, lib/agents, app/api/cron/nightly-ops) green + gates green; live demotion counts appear in the nightly entity_trust_repair stage receipt after deploy.
After #231 merges, resume issue #226 (owner sign-in + Slack self-loop). Non-owner proof (rung 7) remains forbidden until #226 is proven.
