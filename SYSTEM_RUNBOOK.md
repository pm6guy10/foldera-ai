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

## Current Operating Status (updated 2026-03-29)

### Build
- Status: PASSING
- Last verified: 2026-03-29 (`npm run build` passes)

### Production Tests (npm run test:prod)
- Status: PASSING
- Last confirmed pass: 51/51 on 2026-03-29 (this session)
- Local omnibus note: full `npx playwright test` still has pre-existing local-auth failures (`112 passed, 10 failed, 6 skipped`) and is tracked in `FOLDERA_MASTER_AUDIT.md` as `NEEDS_REVIEW`.

### Artifact Quality (write_document)
- Status: HARDENED
- Last verified: 2026-03-29
- Evidence:
  - `lib/conviction/artifact-generator.ts` now blocks analysis scaffolding variants (not only exact `INSIGHT`/`WHY NOW` labels), enforces finished-document structure, and repairs/falls through safely.
  - `lib/cron/daily-brief-generate.ts` now enforces artifact persistence checks (`getArtifactPersistenceIssues`) before any `pending_approval` insert.
  - `lib/conviction/__tests__/artifact-generator.test.ts` + `lib/cron/__tests__/daily-brief.test.ts` cover analysis rejection, clean acceptance, hostile-meta rejection, fallback safety, and invalid-artifact no-persist behavior.

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
1. [x] Create SYSTEM_RUNBOOK.md
2. [x] Commit untracked migrations (20260326000003)
3. [x] Verify npm run test:prod baseline — 51/51 PASSED
4. [x] Apply all pending migrations to production DB via Supabase MCP
   - outcome_closed column added to tkg_actions
   - api_usage composite index created
   - test subscription deleted
   - 7 malformed auto-suppression goals deleted
5. [x] npm run test:prod after migrations — 51/51 PASSED
6. [x] Update FOLDERA_MASTER_AUDIT.md to reflect resolved vs open items

## Remaining Open Items
1. Non-owner flow not proven — no production receipt for any non-Brandon user
2. Missing tkg_signals indexes (no migration written yet)
3. npm run test:prod 51/51 is Brandon-only — multi-user loop unverified
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
