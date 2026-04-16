# SYSTEM RUNBOOK

## Mission
Make Foldera reliably complete the full product loop:
connect → ingest → process → generate → persist → send → approve

## Primary Goal
Achieve 3 consecutive successful runs for a non-Brandon user.

## Hard Rules
- No feature work
- No scope expansion
- No shipping without proof
- Nothing is "done" until production verification passes
- If code is pushed but not proven, mark it incomplete
- If any source-of-truth file is stale, update it before closing the session

## Source of Truth
- FOLDERA_MASTER_AUDIT.md = what is broken
- ACCEPTANCE_GATE.md = what done means
- BRANDON.md = what the product should feel like
- SYSTEM_RUNBOOK.md = current operating plan

## Execution Order
1. Build
2. Auth
3. Supabase write guarantee
4. Pipeline integrity
5. Email delivery
6. Approve flow
7. Non-owner verification
8. 3 consecutive successful runs

## Loop Definition
A valid loop requires:
- exactly one directive
- exactly one valid artifact
- persisted tkg_actions row
- successful email delivery
- user can approve
- works for non-owner user

## Required Verification After Every Meaningful Change
1. npm run build
2. npx playwright test
3. npm run test:prod
4. verify DB row exists
5. verify email receipt exists
6. verify expected status/result in database

## Failure Policy
If any verification step fails:
- task is not complete
- do not say fixed
- update FOLDERA_MASTER_AUDIT.md with exact unresolved issue

## Session Closure Policy
Before ending:
- update SYSTEM_RUNBOOK.md with current status
- update FOLDERA_MASTER_AUDIT.md with anything still broken
- update SESSION_HISTORY.md with what changed, what was verified, and what remains unverified
- print final status as:
  - FIXED
  - PARTIALLY FIXED
  - BLOCKED

---

## Current Operating Status (updated 2026-03-31)

### Build
- Status: PASSING
- Last verified: 2026-03-29 (`npm run build` passes)

### Production Tests (npm run test:prod)
- Status: PASSING
- Last confirmed pass: 51/51 on 2026-03-29 (this session)
- Local omnibus note: full `npx playwright test` still has pre-existing local-auth failures (`112 passed, 10 failed, 6 skipped`) and is tracked in `FOLDERA_MASTER_AUDIT.md` as `NEEDS_REVIEW`.

### Non-Owner Depth
- Status: BLOCKED (now explicitly enforced)
- Last verified: 2026-03-29
- Evidence:
  - Acceptance gate now includes `NON_OWNER_DEPTH` and excludes synthetic `TEST_USER_ID` from `AUTH`/`TOKENS`/`SESSION`.
  - Post-deploy nightly receipt:
    - `SESSION`: `pass=true`, `detail="Connected providers map to auth users: microsoft, google"`
    - `NON_OWNER_DEPTH`: `pass=false`, `detail="No connected non-owner users (owner-only run)."`
  - Production DB receipt:
    - `connected_user_ids`: owner + synthetic test user only
    - `real_non_owner_connected_user_ids`: `[]`
    - `non_owner_subscriptions`: `[]`
    - `non_owner_actions_today`: `[]`
  - Deepest non-owner stage reached: `token_refresh_pre` (synthetic user only), then blocked before daily brief eligibility.

### Artifact Quality (write_document)
- Status: HARDENED + BOTTOM GATE
- Last verified: 2026-03-31
- Evidence:
  - `lib/conviction/artifact-generator.ts` now blocks analysis scaffolding variants (not only exact `INSIGHT`/`WHY NOW` labels), enforces finished-document structure, and repairs/falls through safely.
  - `lib/cron/daily-brief-generate.ts` now enforces artifact persistence checks (`getArtifactPersistenceIssues`) before any `pending_approval` insert.
  - **NEW (2026-03-31):** `evaluateBottomGate()` added as final pre-persistence gate. Blocks operationally empty winners that pass all upstream gates but are fortune-cookie output: no external target, no concrete ask, no real pressure, self-referential documents, generic social motion, non-executable artifacts. 6 block reason enums. 11 unit tests.
  - Production proof: BEFORE (`af60f967` write_document memo-to-self) blocked by `NO_CONCRETE_ASK`. AFTER (`daa49f78` send_message with ask+deadline) survived the gate.
  - `lib/conviction/__tests__/artifact-generator.test.ts` + `lib/cron/__tests__/daily-brief.test.ts` + `lib/cron/__tests__/bottom-gate.test.ts` cover analysis rejection, clean acceptance, hostile-meta rejection, fallback safety, invalid-artifact no-persist behavior, and operationally empty winner blocking.
  - Artifact conversion pass: `lib/briefing/generator.ts` + `lib/cron/daily-brief-generate.ts` now enforce decision leverage (`explicit ask`, `time constraint`, `pressure/consequence`, and ownership for documents) via `getDecisionEnforcementIssues(...)`; informational/ignorable artifacts fail closed at generation, persistence, and send-worthiness gates.
  - 5-case discrepancy conversion proof: `lib/briefing/__tests__/artifact-conversion-proof.test.ts` passed with 5/5 `PASS`, and each artifact contained decision + deadline + consequence text.

### Causal Diagnosis Layer
- Status: HARDENED
- Last verified: 2026-03-29
- Evidence:
  - `lib/briefing/generator.ts` now requires a structured `causal_diagnosis` field (`why_exists_now`, `mechanism`) in generation output, computes a required diagnosis before rendering (`inferRequiredCausalDiagnosis`), and blocks artifacts that do not target the diagnosed mechanism (`getCausalDiagnosisIssues(...)`).
  - Regression tests: `lib/briefing/__tests__/causal-diagnosis.test.ts` and `lib/briefing/__tests__/generator-runtime.test.ts` (causal-mechanism differentiation + send_message fallback explicit-ask repair) pass.
  - Real owner production receipt (post-deploy run):
    - `POST /api/settings/run-brief` at `2026-03-29T15:55:42.099Z` returned `200`, `ok=true`.
    - `daily_brief.generate.results[0].code = pending_approval_reused`, `action_id = 2e3a92ac-f93e-42b4-a978-bedd3dcee4d6`.
    - `daily_brief.send.results[0].code = email_already_sent` for the same action.
    - Persisted action remains valid decision artifact (`status=pending_approval`, `action_type=send_message`, `confidence=76`) with top-5 candidate discovery persisted in `execution_result.generation_log.candidateDiscovery.topCandidates`.
  - Grounding-authority hardening (same date):
    - Prompt now uses non-authoritative `MECHANISM_HINT` instead of authoritative required diagnosis.
    - Model-produced diagnosis is accepted only if deterministic grounding passes (time reference + >=2 concrete signal anchors + non-restatement + non-meta mechanism).
    - Fallback selection source is tagged at selection point (`llm_grounded`, `llm_ungrounded_fallback`, `template_fallback`) and used for validation decisions.
    - Validation now checks artifact against the accepted diagnosis actually used.
    - Verification: targeted causal/runtime tests PASS; full `lib/briefing` + `lib/cron` suites PASS; `npm run build` PASS; `npm run test:prod` PASS.

### Owner Real-Data Brain Receipt (forced fresh run)
- Status: BUILT (owner-only debug path)
- Last verified: 2026-04-16
- Evidence:
  - New endpoint: `POST /api/dev/brain-receipt` (owner-only via `OWNER_USER_ID` check).
  - Proof-specific invocations (`dev_brain_receipt`, `dev_brain_receipt_verification`) now **suppress** in-window `pending_approval` reuse during `forceFreshRun` so the current generation path runs instead of silently replaying old output.
  - If a pending row still survives suppression on a proof run, `runDailyGenerate` now returns `proof_freshness_failed` (failed proof, explicit blocker) instead of a successful reuse code.
  - Proof responses/results now carry `proof_revision` metadata and `/api/dev/brain-receipt` echoes top-level `revision`, so fresh output is tied to the current deploy/runtime revision.
  - Session receipt run created fresh action `3f8369a6-e557-4086-86c2-eab554d40766` at `2026-03-29T20:34:17.957+00:00`.
  - Stale reuse proof: `stale_action_not_reused=true` for `2e3a92ac-f93e-42b4-a978-bedd3dcee4d6`.
  - Fresh proof rerun on 2026-04-16: `npx tsx scripts/run-verification-golden-path-once.ts` auto-suppressed stale pending `85a6f986-9d71-4c9b-bc16-514753423bf1` and persisted fresh action `e2e10034-d9b3-48c3-97ac-5b1b40bc6840` with `generate.results[0].meta.proof_fresh_run = true`.

### Ranking Quality (candidate selection)
- Status: HARDENED
- Last verified: 2026-03-29
- Evidence:
  - `lib/briefing/scorer.ts` now enforces ranking invariants (`applyRankingInvariants`) before winner/top-3 selection:
    - hard rejects obvious-first-layer, routine-maintenance, weak-evidence, already-known, and non-send/write-capable candidates
    - collapses duplicate-like candidates
    - applies discrepancy-priority over generic task classes
  - `lib/briefing/generator.ts` `selectRankedCandidates` now disqualifies schedule-only/obvious candidates and preserves discrepancy priority in viability ranking.
  - Tests: `lib/briefing/__tests__/scorer-ranking-invariants.test.ts` + `lib/briefing/__tests__/winner-selection.test.ts` additions.
  - Multi-run proof: `lib/briefing/__tests__/holy-crap-multi-run-proof.fixtures.ts` + `holy-crap-multi-run-proof.test.ts` run 10 deterministic end-to-end ranking scenarios and enforce audit thresholds (`PASS >= 8/10`, no repeated HARD_FAIL class). Latest receipt: `10/10 PASS`.

### Pending Migrations NOT in Production DB
All of these are in source code but NOT yet applied to production:

1. `20260326000001_unify_check_constraints.sql` — unified CHECK constraints on tkg_goals/tkg_signals
2. `20260326000002_api_usage_index.sql` — composite index on api_usage(user_id, created_at DESC)
3. `20260326000003_remove_test_subscription.sql` — UNTRACKED (not in git yet)
4. `20260327000001_add_outcome_closed.sql` — UNTRACKED; adds outcome_closed BOOLEAN to tkg_actions; scorer queries this column, degraded without it (returns empty arrays, not crash)
5. `20260327000002_cleanup_malformed_suppressions.sql` — UNTRACKED; deletes garbage auto-suppression goals

### Active Degradations (not crashes)
- `detectAntiPatterns()` and `detectEmergentPatterns()` in scorer.ts query `outcome_closed` column which does not exist in production DB → queries return `data: null` → functions return empty arrays → anti-pattern/emergent detection silently disabled
- Malformed auto-suppression goals (garbage entity keys from old n-gram fallback) still present in production DB until migration 20260327000002 is applied

### Known Non-Blockers (pre-existing)
- Full local `npx playwright test` omnibus suite fails for local-auth reasons (production smoke tests run against localhost without auth) — pre-existing, not new
- Local auth state not valid for interactive testing

### Unresolved From Audit (non-critical)
- P2: Missing DB indexes on tkg_signals (user_id, processed), (user_id, occurred_at) — no migration exists yet

---

## Next Steps (This Session)
1. [x] Trace non-owner production path end-to-end (`nightly-ops` -> `runBriefLifecycle` -> generate/send/persistence).
2. [x] Capture live non-owner depth receipts from production (`nightly-ops` response + DB queries).
3. [x] Implement structural blocker fix: acceptance-gate `NON_OWNER_DEPTH` + synthetic-user exclusion from auth/session checks.
4. [x] Add regression tests for blocker class (`lib/cron/__tests__/acceptance-gate.test.ts`).
5. [x] Verify targeted + relevant suites (`vitest`), `npm run build`, `npm run test:prod`.
6. [x] Re-trigger production and confirm blocker is now explicit (`NON_OWNER_DEPTH` fail with exact reason).

## Remaining Open Items
1. No real connected non-owner account in production (owner-only run) — `NON_OWNER_DEPTH` fails by design until this is true.
2. Missing tkg_signals indexes (no migration written yet)
3. npm run test:prod 51/51 is Brandon-session coverage; true non-owner end-to-end loop still unverified
4. Local omnibus `npx playwright test` still fails with pre-existing localhost authenticated-smoke harness mismatches; tracked as `NEEDS_REVIEW` in `FOLDERA_MASTER_AUDIT.md`

---

## Usefulness Gate (added 2026-03-27)

### CURRENT STATE
- usefulness gate: implemented — `lib/briefing/generator.ts`, commit `cf8b5d0`
- usefulness gate: execution-proofed — `lib/briefing/__tests__/usefulness-gate.test.ts`, commit `3a2fb11`
- 7/7 test cases passed against real `generateDirective()` call path with mocked Anthropic
- production: deployed and stable (Vercel build passed on both commits)

### KNOWN TRUTHS
- `generic_language` ("just checking in", "touching base", "wanted to reach out", "following up") is the only check **uniquely enforced by `isUseful`** — these phrases are NOT in `BANNED_LANGUAGE_PATTERNS`, so they pass structural validation and only `isUseful` blocks them
- `empty_artifact`, `no_evidence`, `no_action` are caught upstream by `validateGeneratedArtifact` before `isUseful` fires — defense-in-depth
- `generateDirective()` returns `GENERATION_FAILED_SENTINEL` on any rejection; callers check this and skip `tkg_actions` insert and email send
- Stage evidence: rejected by `isUseful` → `generationLog.stage = "validation"` (not "generation") — distinguishable in logs

### OPEN ITEMS
- non-owner full loop verification still unverified (per ACCEPTANCE_GATE.md)
- no new open items from this gate implementation

### RULES GOING FORWARD
- no feature without execution proof
- no claim without logs or test output
- every completed feature must have: scoped diff → deploy → execution proof → regression test
