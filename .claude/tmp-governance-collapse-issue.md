# Governance Collapse v1 — reduce root docs to 8, rewrite continuity gate, delete shims

## Why

The governance system built to stop agent drift has become the primary source of drift. Evidence:

- ~40 markdown files at repo root; 5+ files claim doctrine authority.
- `docs/SOURCE_OF_TRUTH_MAP.md` is 254 lines and contradicts itself (issue #226 listed as both `CURRENT_CONTROL` and `REFERENCE_ONLY`).
- `scripts/continuity-gate.ts` hard-requires shim files to exist (lines 15–34), so dead files are load-bearing and deletion is CI-blocked.
- The map's own "Forbidden Broad Work" section bans archive sweeps, so cleanup has no lane and never happens ("No file was deleted in this sweep").
- 6 agent contracts (`CLAUDE.md`, `AGENTS.md`, `CODEX_START.md`, `GPT.md`, `.cursorrules`, `.cursor/rules/agent.mdc`) duplicate one contract; every rule change is a 6-file edit.
- Every state change requires ~7 file writes (handoff, build-order, contract.json, map, issue, PR template closeout, gate), guaranteeing staleness.

Cost: every agent session burns context orienting across competing truth files; the boot sequence is 7 steps.

## Goal (acceptance tests)

1. Root `*.md` count ≤ 8.
2. Boot sequence is 2 steps: read `ACTIVE_HANDOFF.md`, read the active issue.
3. `npm run gate:continuity` passes with the new file set and no longer requires any deleted file.
4. `docs/SOURCE_OF_TRUTH_MAP.md` ≤ 40 lines: keep-list + "everything else is archive or git history."
5. One agent contract file; all others are ≤5-line pointers or deleted.
6. No product/runtime behavior change (lint + build green; no app/, lib/, pages/ changes except none).

## Target end state (root)

KEEP (8):
- `ACTIVE_HANDOFF.md` — single state file (absorbs CURRENT_STATE.md runtime-truth role)
- `FOLDERA_BUILD_ORDER.yaml` — machine mirror (prune `source_of_truth_order` to the keep-list)
- `FOLDERA_MASTER_BIBLE.md` — single doctrine file (absorbs NORTH_STAR_LOCK + PRODUCT_OPERATING_SYSTEM as dated sections)
- `AGENTS.md` — single agent execution contract (absorbs CLAUDE.md rules, ACCEPTANCE_GATE.md proof rules, SYSTEM_RUNBOOK.md tool boundaries)
- `CLAUDE.md` — ≤10-line pointer to AGENTS.md + Claude-specific notes only
- `README.md` — entrypoint: what Foldera is, local commands, pointer to ACTIVE_HANDOFF.md
- `SESSION_HISTORY.md` — append-only receipts
- `LESSONS_LEARNED.md` — append-only

## Work plan (one PR, ordered)

### Phase 0 — Gate rewrite (prerequisite, same PR)
Rewrite `scripts/continuity-gate.ts` to enforce ONLY:
- `ACTIVE_HANDOFF.md` exists and names exactly one active seam
- handoff active issue == `FOLDERA_BUILD_ORDER.yaml active_issue`
- `.github/pull_request_template.md` has the closeout section
- keep-list files exist; root `*.md` count ≤ 8 (new check — prevents regression)
Delete: shim-marker checks, boot-sequence text alignment across 9 docs, per-agent-doc rule-phrase checks (now one contract file), roadmap/issue-#48 reference checks.

### Phase 1 — Delete (git history is the archive)
`FOLDERA_LAUNCH_ROADMAP.md`, `FOLDERA_OPERATING_SYSTEM.md`, `FOLDERA_OPERATING_DOCTRINE.md`, `FOLDERA_PRODUCT_SPEC.md`, `FOLDERA_PRODUCTION_BACKLOG.md`, `FOLDERA_MASTER_AUDIT.md`, `FOLDERA_SHIP_SPEC.md`, `WHATS_NEXT.md`, `CODEX_PROMPT_MAS3_REMOVAL.md`, `CODEX_START.md`, `GPT.md`, `SYSTEM_RUNBOOK.md`, `ACCEPTANCE_GATE.md`, `CURRENT_STATE.md` (content folded per Phase 3 first where noted).

### Phase 2 — Archive to docs/archive/
`FOLDERA_MASTER_SYNTHESIS_DRAFT.md`, `FOLDERA_BUILD_SPEC.md`, `FOLDERA_CAPABILITY_MAP.md`, `FOLDERA_QUEUE_GENERATION_RULES.md`, `FOLDERA_EXECUTION_QUEUE.yaml`, `FOLDERA_EXECUTION_QUEUE_NEXT_DRAFT.yaml`, `FOLDERA_PRODUCT_SPEC_NEXT.md`, `FOLDERA_GITHUB_ISSUE_PR_PLAN.md`, `FOLDERA_SURFACE_FIXES.md`, `FULL_AUDIT_RESULTS.md`, `MIGRATION_RECONCILIATION_REPORT.md`, `PROMISE_CHAIN_AUDIT.md`, `NIGHTLY_REPORT.md`, `LANDING_PAGE_VISUAL_HANDOFF.md`, `LAUNCH_CHECKLIST.md`, `NON_OWNER_BETA_HARNESS_MAP.md`, `REVENUE_PROOF.md`, `AUTOMATION_BACKLOG.md`, `BRANDON.md` (or fold taste notes into MASTER_BIBLE).

### Phase 3 — Consolidate
- Merge `FOLDERA_NORTH_STAR_LOCK.md` + `FOLDERA_PRODUCT_OPERATING_SYSTEM.md` into `FOLDERA_MASTER_BIBLE.md` as top sections; delete the two source files. Update `gate:command` accordingly (fold into continuity gate or retarget to MASTER_BIBLE markers).
- Merge `CLAUDE.md` operational rules + `ACCEPTANCE_GATE.md` proof gates + `SYSTEM_RUNBOOK.md` tool boundaries into `AGENTS.md`. `CLAUDE.md` becomes pointer. `.cursorrules` and `.cursor/rules/agent.mdc` become 3-line pointers to AGENTS.md.
- Shrink `docs/SOURCE_OF_TRUTH_MAP.md` to ≤40 lines: keep-list table + conflict rule ("ACTIVE_HANDOFF.md + active issue beat everything; git history is the archive").
- Prune `FOLDERA_BUILD_ORDER.yaml source_of_truth_order` to keep-list files only; move historical `completed:` ledger entries older than the current rung to `SESSION_HISTORY.md`.
- Rewrite `README.md`: product one-liner, local commands, "start at ACTIVE_HANDOFF.md". Remove the 7-step chain.
- Update `.foldera-contract.json` and `.github/pull_request_template.md` closeout rows to the new file set.

### Phase 4 — Repo hygiene
- `.gitignore`: `output/`, `audit-output/`, `artifacts/*.json` receipts (move needed proofs to `docs/proofs/`).
- `git rm -r --cached` the above.
- Move root binaries (`Foldera Seo Blog Batch 30.pdf`, `Icon Watermark (The Detail).png`, `Primary Logo (The Workhorse).png`, `foldera_oauth_logo.png` if unreferenced) to `public/brand/` or delete; grep for references first.

### Phase 5 — The replacement rule (prevents regrowth)
Add one line to `AGENTS.md` and enforce in the gate (root md-count check):
> A new governance rule may only be added by editing an existing keep-list file, never by creating a new file.

## Proof required
- `npm run gate:continuity` (rewritten) green
- `npm run lint` green
- `npm run build` green
- `Get-ChildItem *.md` at root returns ≤8 files
- PR receipt: changed-file list, explicit "no product behavior changed", source-truth closeout

## Scope guard
- No app/, lib/, components/, pages/ changes.
- No Slack/auth/Stripe/schema work.
- This issue explicitly authorizes the archive sweep, file moves, and deletions that SOURCE_OF_TRUTH_MAP.md otherwise forbids.

## Sequencing
Activate after #226 is proven (or before, by owner decision — this work multiplies the velocity of every later rung and touches no product code).
