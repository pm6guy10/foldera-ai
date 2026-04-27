# FOLDERA Production Backlog

Last refreshed: 2026-04-27

## Current top item
BL-002 — Rung 1 — Production daily-send path still lacks live wait-rationale delivery proof.

## How to use this file
- Every Codex run opens this file first.
- Execute the first OPEN item only.
- After shipping, update Status to CLOSED with evidence.
- If a new blocker is discovered, insert it at the correct rung position.
- Infrastructure items always sort above code items at the same rung.
- Do not reorder closed items.

## How to add items
- Assign the next BL-NNN ID.
- Place it at the correct rung position, not at the bottom.
- Infrastructure > code > polish at the same rung.

## Items

### BL-001
ID: BL-001
Rung: 1
Title: Production paid-LLM gate no longer blocks live generation
User-facing path: Owner triggers a real brief run and expects Foldera to generate instead of hard-failing before generation.
Starting route or trigger: `POST /api/settings/run-brief?force=true&use_llm=true` or nightly `daily-generate`
Ending success state: A fresh live row proves the newest production blocker is no longer `paid_llm_disabled`.
Problem: Historical `paid_llm_disabled` rows were still tripping `npm run preflight` even after the production paid-LLM env contract was fixed and redeployed.
Protected contracts: Keep preview/local paid gates off by default, preserve the spend-policy contract, and do not fake success with `do_nothing` or wait-rationale when generation is infra-blocked.
Allowed files: `lib/llm/paid-llm-gate.ts`, `app/api/settings/run-brief/**`, `scripts/preflight.ts`, focused tests, `SESSION_HISTORY.md`, `CURRENT_STATE.md`
Forbidden files: `app/dashboard/**`, `app/api/stripe/**`, `app/(marketing)/**`, unrelated Playwright/dashboard suites
Required local proof: `npm run preflight`; `npx vitest run lib/llm/__tests__/paid-llm-gate.test.ts app/api/settings/run-brief/__tests__/route.test.ts`; `npm run build`
Required production proof: Confirm the live production env contract on the current deployment, then verify the newest production action after redeploy is blocked by something other than `paid_llm_disabled`.
Done means: Production truth shows the newest live generation row is no longer blocked by `paid_llm_disabled`.
Do-not-count: Cron 200s, deploy logs, DB rows without a completed user-facing run, or docs/screenshots/refactors/unrelated tests.
Status: CLOSED
Last evidence: 2026-04-26 — production env pull shows `ALLOW_PAID_LLM=true`, `ALLOW_PROD_PAID_LLM=true`, `PROD_DEFAULT_PIPELINE_DRY_RUN=false`; live `/api/health?depth=full` reports build `2e7dfd1`; newest owner action at 09:15 PT is `Daily spend cap reached.`, not `paid_llm_disabled`.
Next blocker: BL-008.

### BL-008
ID: BL-008
Rung: 1
Title: Production daily spend cap now blocks real generation after paid-gate clearance
User-facing path: Owner triggers a real brief run and expects Foldera to generate a real artifact instead of a no-send blocker.
Starting route or trigger: Nightly `daily-generate` or a real generation path after the paid gate clears.
Ending success state: A fresh run persists a real non-`do_nothing` action instead of `Daily spend cap reached.`
Problem: The newest post-deploy owner action on 2026-04-26 at 09:15 PT is a `daily_cron` `do_nothing` with reason `Daily spend cap reached.` even though the production paid-LLM env contract is live.
Protected contracts: Preserve the spend-policy contract, keep local/preview paid gates off by default, and do not fake success with `do_nothing` or wait-rationale when real generation should be possible.
Allowed files: `lib/utils/api-tracker.ts`, `lib/briefing/generator.ts`, `lib/cron/daily-brief-generate.ts`, `app/api/settings/run-brief/**`, focused tests, `SESSION_HISTORY.md`, `CURRENT_STATE.md`
Forbidden files: `app/dashboard/**`, `app/api/stripe/**`, `app/(marketing)/**`, unrelated Playwright/dashboard suites
Required local proof: Focused spend-cap / generation-path tests for touched files; `npm run preflight`; `npm run build`
Required production proof: Verify the newest live generation row no longer records `Daily spend cap reached.` and instead persists a real generated non-`do_nothing` action.
Done means: A real production generation path gets past the spend-cap blocker and persists a real action.
Do-not-count: Cron 200s, deploy logs, DB rows without a completed user-facing run, or docs/screenshots/refactors/unrelated tests.
Status: CLOSED
Last evidence: 2026-04-27 — live build `d30bc22`; authenticated owner `POST /api/settings/run-brief?force=true&use_llm=true` returned `200`, spent through `insight_scan` + `directive` / `directive_retry`, and persisted action `2a04fa59-c1b7-4312-9adf-f99937cdd552`, which proves the newest live row is no longer blocked by `Daily spend cap reached.`.
Next blocker: BL-009.

### BL-002
ID: BL-002
Rung: 1
Title: Production daily-send path still lacks live wait-rationale delivery proof
User-facing path: Scheduled daily brief email arrives even when no send-worthy artifact exists.
Starting route or trigger: `POST /api/cron/daily-send`
Ending success state: One live send-stage run delivers exactly one fresh daily brief email or wait-rationale and marks the action row sent.
Problem: The send-stage no-send path shipped on 2026-04-25, but session history still marks live `/api/cron/daily-send` proof as unresolved after deploy.
Protected contracts: Exactly one email per run, idempotent resend guards stay intact, and no operator-only resend workaround is required.
Allowed files: `lib/cron/daily-brief-send.ts`, `lib/cron/brief-service.ts`, `app/api/cron/daily-send/route.ts`, `lib/cron/__tests__/daily-brief.test.ts`, `lib/cron/__tests__/brief-service.test.ts`, `SESSION_HISTORY.md`, `CURRENT_STATE.md`
Forbidden files: `app/dashboard/**`, `lib/briefing/**`, `app/api/stripe/**`, unrelated landing/auth surfaces
Required local proof: `npx vitest run lib/cron/__tests__/daily-brief.test.ts lib/cron/__tests__/brief-service.test.ts`; `npm run build`
Required production proof: `curl -i -X POST https://foldera.ai/api/cron/daily-send -H "Authorization: Bearer $CRON_SECRET" -H "x-cron-secret: $CRON_SECRET"` and then verify the intended recipient receives exactly one fresh daily brief email or wait-rationale for that run.
Done means: One real production daily-send trigger produces exactly one user-facing email outcome with the row marked sent.
Do-not-count: HTTP 200 or 204 alone, logs/traces alone, DB rows alone, or docs/screenshots/refactors/unrelated tests.
Status: OPEN
Last evidence: 2026-04-25 — session history recorded post-push deploy and live `/api/cron/daily-send` proof as still pending.
Next blocker: Trigger the live send path once after deploy and verify the actual email result, not just the HTTP response.

### BL-009
ID: BL-009
Rung: 2
Title: Owner paid run still collapses the selected winner into internal no-send blocker sludge
User-facing path: Owner triggers a real paid brief run and expects one usable artifact instead of an internal blocker dump.
Starting route or trigger: `POST /api/settings/run-brief?force=true&use_llm=true`
Ending success state: A real production paid run persists one usable artifact instead of `do_nothing` / wait-rationale with raw internal validator strings.
Problem: Live production proof on 2026-04-27 cleared the spend cap and completed the route, but the selected winner `discrepancy_risk_a11fc15a-819e-4ac6-b44f-9a7de1757c7c` still failed `stale_date_in_directive:March 30`, and fallback candidates collapsed into LLM / validator blocks that were emailed back as user-visible no-send sludge.
Protected contracts: Preserve the spend-policy contract, one-artifact rule, hard validators, and do not expose internal blocker/debug strings in user-facing output.
Allowed files: `lib/briefing/generator.ts`, `lib/briefing/decision-enforcement.ts`, `lib/cron/daily-brief-generate.ts`, `app/api/settings/run-brief/**`, focused tests, `SESSION_HISTORY.md`, `CURRENT_STATE.md`
Forbidden files: `app/dashboard/**`, `app/api/stripe/**`, `app/(marketing)/**`, unrelated landing/dashboard suites
Required local proof: `npx vitest run lib/briefing/__tests__/generator-runtime.test.ts lib/briefing/__tests__/artifact-decision-enforcement.test.ts lib/cron/__tests__/daily-brief.test.ts app/api/settings/run-brief/__tests__/route.test.ts`; `npm run build`
Required production proof: Trigger one real authenticated `POST https://foldera.ai/api/settings/run-brief?force=true&use_llm=true`, then verify the latest action is not `do_nothing` and does not expose internal blocker strings.
Done means: The same live owner paid path produces one usable artifact or a clean user-facing wait-rationale instead of internal validation sludge.
Do-not-count: HTTP 200 alone, `pipeline_runs` / `api_usage` alone, internal logs alone, or docs/screenshots/refactors/unrelated tests.
Status: OPEN
Last evidence: 2026-04-27 — build `d30bc22`; authenticated owner paid run returned `200`, spent through `insight_scan` + multiple `directive` calls, and persisted `no_send_persisted` action `2a04fa59-c1b7-4312-9adf-f99937cdd552` with `All 10 candidates blocked...`; top selected candidate blocked by `stale_date_in_directive:March 30`.
Next blocker: Repair the selected risk winner's stale-date / no-send collapse so the same live owner path can persist a usable artifact.

### BL-003
ID: BL-003
Rung: 2
Title: Native interview write_document still does not reliably persist as the real winner
User-facing path: A live interview-related run should create one usable `write_document`, not block or fall back away from the intended artifact.
Starting route or trigger: `POST /api/settings/run-brief?force=true&use_llm=true` on interview-class owner data
Ending success state: Exactly one valid interview-class `write_document` reaches `pending_approval` as the selected winner.
Problem: Recent owner-data evidence still shows interview candidates getting blocked by lifecycle/ranking or validator failures, so the native artifact is not reliably persisting.
Protected contracts: Preserve decision enforcement, bottom-gate hardness, artifact validity, and the no-paid-run-for-discovery rule.
Allowed files: `lib/briefing/scorer.ts`, `lib/briefing/stakes-gate.ts`, `lib/briefing/generator.ts`, `lib/briefing/decision-enforcement.ts`, `lib/cron/daily-brief-generate.ts`, focused tests, `SESSION_HISTORY.md`, `CURRENT_STATE.md`
Forbidden files: `app/dashboard/**`, `app/api/auth/**`, `app/api/stripe/**`, landing/visual-only files
Required local proof: `npx vitest run lib/briefing/__tests__/stakes-gate.test.ts lib/briefing/__tests__/write-document-hydration.test.ts lib/briefing/__tests__/interview-fallback.test.ts lib/briefing/__tests__/artifact-decision-enforcement.test.ts`; `npm run build`
Required production proof: Trigger one real owner interview-class run through `POST https://foldera.ai/api/settings/run-brief?force=true&use_llm=true`, then verify the resulting latest action is a single interview-class `write_document` in `pending_approval`, not a blocked fallback or `do_nothing`.
Done means: A real production interview-class run creates exactly one usable `write_document` artifact instead of blocking before persistence.
Do-not-count: Logs saying “artifact created,” a persisted invalid payload, static mock screenshots, or docs/screenshots/refactors/unrelated tests.
Status: OPEN
Last evidence: 2026-04-24 — paid owner generate still produced prep-trash / validator-blocked interview output; 2026-04-22 owner-data traces still showed interview winners falling out before stable persistence.
Next blocker: Get one real interview-class candidate to survive ranking plus persistence gates in the live owner path.

### BL-004
ID: BL-004
Rung: 3
Title: Pending write_document visibility on `/dashboard` still lacks locked production proof
User-facing path: A signed-in user opens `/dashboard` and sees the pending artifact directly before taking any action.
Starting route or trigger: `/dashboard`
Ending success state: The pending `write_document` title and body are visibly rendered on the real dashboard surface before approve or skip.
Problem: `CURRENT_STATE.md` still lists a dashboard proof gap: API JSON matches the dashboard data, but the live pending-state proof has not been captured before approve/skip.
Protected contracts: Show the real live artifact, avoid `demoDraft`, preserve approve/skip controls, and do not require DB/debug-panel inspection.
Allowed files: `app/dashboard/page.tsx`, `app/api/conviction/latest/route.ts`, `tests/e2e/authenticated-routes.spec.ts`, `tests/dashboard/live-artifact-pixel-lock.spec.ts`, `tests/production/**`, `SESSION_HISTORY.md`, `CURRENT_STATE.md`
Forbidden files: `lib/briefing/**`, `lib/cron/**`, `app/api/stripe/**`, landing/marketing routes
Required local proof: `npx playwright test tests/e2e/authenticated-routes.spec.ts --grep "write_document journey"`; `npx playwright test tests/dashboard/live-artifact-pixel-lock.spec.ts`; `npm run build`
Required production proof: Browser check on `https://foldera.ai/dashboard` with a known `pending_approval` `write_document`: capture a screenshot before approve/skip and confirm the title/body are visible in the real dashboard surface.
Done means: A signed-in production user can open `/dashboard` and see the pending artifact directly, with captured proof before taking action.
Do-not-count: DB/API inspection, console logs, screenshots from non-dashboard surfaces, or static mock content.
Status: OPEN
Last evidence: 2026-04-26 — `CURRENT_STATE.md` still lists the dashboard pending-write_document proof gap as open.
Next blocker: Line up one known pending-artifact window and capture the real dashboard state before it is approved or skipped.

### BL-005
ID: BL-005
Rung: 5
Title: Interview write_document artifacts still miss the demoable quality bar
User-facing path: The user opens the generated interview document and expects finished work, not prep homework.
Starting route or trigger: Interview-class production run that reaches `write_document`
Ending success state: The artifact is grounded, timely, polished, and usable without rewriting.
Problem: `CURRENT_STATE.md` and recent session history still report prep-style / clothing-tip / STAR-prompt output and small typos on interview-class documents.
Protected contracts: Keep validators hard, preserve one-artifact rules, and do not lower the bar by allowing generic coaching output.
Allowed files: `lib/briefing/generator.ts`, `lib/briefing/decision-enforcement.ts`, `lib/conviction/artifact-generator-compat.ts`, focused tests, `SESSION_HISTORY.md`, `CURRENT_STATE.md`
Forbidden files: `app/dashboard/**`, `app/api/auth/**`, `app/api/stripe/**`, unrelated cron/dashboard shell files
Required local proof: `npx vitest run lib/briefing/__tests__/artifact-decision-enforcement.test.ts lib/briefing/__tests__/write-document-hydration.test.ts lib/briefing/__tests__/interview-fallback.test.ts`; `npm run build`
Required production proof: Trigger one real interview-class production run, open the resulting artifact in-product, and verify it reads like finished work instead of checklist/STAR/dress-code prep trash.
Done means: The real artifact is demoable and money-moving without manual rewrite.
Do-not-count: Structural validity alone, pretty formatting alone, or “better than before” language by itself.
Status: OPEN
Last evidence: 2026-04-24 — paid run still hit `generic_prep_trash` / `prepare_examples_handoff`; `CURRENT_STATE.md` still marks interview write_document quality as broken.
Next blocker: Tighten the prompt/model output enough that the first persisted interview document clears validators and reads like finished work.

### BL-006
ID: BL-006
Rung: 6
Title: No real connected non-owner account exists to prove repeatable multi-user runs
User-facing path: A non-owner user connects providers and receives the same daily brief loop without operator help.
Starting route or trigger: Real non-owner connect flow plus nightly `daily-generate` and `daily-send`
Ending success state: One real non-owner user completes the full loop without synthetic users or owner-only assumptions.
Problem: Production evidence still shows only the owner plus a synthetic test user; `NON_OWNER_DEPTH` remains blocked.
Protected contracts: Do not fabricate auth users or DB rows, preserve non-owner acceptance checks, and avoid owner-only shortcuts.
Allowed files: `scripts/beta-readiness.ts`, `lib/cron/acceptance-gate.ts`, `tests/production/**`, `SESSION_HISTORY.md`, `CURRENT_STATE.md`
Forbidden files: `app/dashboard/**`, `lib/briefing/generator.ts`, `app/api/stripe/**`, landing/marketing routes
Required local proof: `npm run beta:readiness -- <real-non-owner-user-id-or-email>` when environment allows; `npm run build`
Required production proof: Connect one real non-owner account through the product, then verify one full run reaches artifact, email, and approve depth for that user without synthetic IDs.
Done means: One real non-owner user completes the production loop and the acceptance gate no longer fails `NON_OWNER_DEPTH`.
Do-not-count: Synthetic user rows, owner-only runs, logs alone, or manual DB fabrication.
Status: OPEN
Last evidence: 2026-04-14 and 2026-03-29 — no real connected non-owner auth account exists; `NON_OWNER_DEPTH` remains blocked.
Next blocker: Provision and connect one real non-owner user with live auth and token rows.

### BL-007
ID: BL-007
Rung: 6
Title: Repeated-directive health failure still trips within the 24-hour window
User-facing path: The user receives daily briefs on consecutive runs without the same directive shape being reissued.
Starting route or trigger: Nightly `daily-generate` or manual `POST /api/settings/run-brief?force=true&use_llm=true`
Ending success state: Health no longer reports repeated directive copies in the rolling 24-hour window.
Problem: `npm run health` on 2026-04-26 failed `Repeated directive` with the latest persisted copy 1 hour ago.
Protected contracts: Preserve duplicate-defense and freshness rules, keep one directive per email, and do not mute the health gate instead of fixing the repeat class.
Allowed files: `scripts/health.ts`, `lib/cron/daily-brief-generate.ts`, `lib/cron/daily-brief-send.ts`, `lib/briefing/scorer.ts`, focused tests, `SESSION_HISTORY.md`, `CURRENT_STATE.md`
Forbidden files: `app/dashboard/**`, `app/api/auth/**`, `app/api/stripe/**`, landing/visual-only files
Required local proof: `npm run health`; focused duplicate/regression tests for touched files; `npm run build`
Required production proof: Run the real brief path twice inside the monitored window and verify health no longer reports repeated copies of one directive shape.
Done means: Consecutive real runs stay unique enough that the 24-hour repeated-directive health gate passes.
Do-not-count: Muting the check, deleting rows manually, or proving uniqueness only in mocks.
Status: OPEN
Last evidence: 2026-04-26 — `npm run health` failed `Repeated directive`; latest persisted copy 1 hour ago.
Next blocker: Trace which stage is reissuing the same directive shape and prove the fix survives a second real run.
