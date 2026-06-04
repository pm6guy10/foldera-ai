# Rung 2 Schema / Evidence Lane Audit

Authority status: `ISSUE_175_READ_ONLY_AUDIT_ARTIFACT`.

Controlling issue: #175, "Rung 2: audit current schema and choose first evidence lane".

Audit date: 2026-06-04.

Scope: read-only repo audit. No product/runtime implementation, schema migration, data mutation, Vercel change, Slack rail work, Stripe, connector expansion, landing, dashboard, auth, backend, package/dependency change, fake evidence, or Rung 3 implementation was performed.

## Current Truth

- Foldera doctrine remains `state + connectors + triggers + one intervention`; issue #48 remains product doctrine.
- Active issue #175 authorizes one audit artifact that maps current support and selects or blocks exactly one first evidence lane for Rung 3.
- Current repo support is strongest in deterministic TypeScript models, fixtures, and tests.
- Current persistence is not first-class workday state schema. `app/api/workday-presence/route.ts` stores MVP state in Supabase auth user metadata and explicitly says a first-class `workday_presence_state` table with RLS/history is needed before production Slack/cron use.
- Existing source-shaped schema support lives mainly in older `tkg_signals`, `tkg_commitments`, `tkg_actions`, `tkg_action_summaries`, and `pipeline_runs` surfaces, not in a dedicated Workday Presence schema.
- Rung 3 must not assume live connector, Slack, Supabase migration, or production data proof.

## Audit Map

| Capability | Current repo support | Missing / risk | Existing enforcement |
| --- | --- | --- | --- |
| Persisted workday state | `WorkdayPresenceState` model exists in `lib/workday-presence/model.ts`. `GET/PUT /api/workday-presence` read and write `workday_presence_state` in auth user metadata. `POST /api/workday-presence/message-action` persists action results back to metadata. | No first-class `workday_presence_state` table, RLS policy, append-only history table, or migration. Metadata storage is acceptable only as MVP/local support and is not safe to treat as production Slack/cron persistence. | `app/api/workday-presence/__tests__/route.test.ts`, `app/api/workday-presence/message-action/__tests__/route.test.ts`, `lib/workday-presence/__tests__/actions.test.ts`. |
| Normalized source/evidence records | `selectSourceBackedRightNowState` maps `tkg_signals`, `tkg_commitments`, and optional `tkg_actions` shaped rows into source-backed state with redacted `source_trail[]`. Test-mode connector adapters normalize simulated Gmail/calendar/Slack events into trigger contexts. | No dedicated normalized evidence table for Workday Presence. Existing `tkg_*` rows are older conviction/briefing infrastructure and should be treated as available source-shaped rows, not as a new schema contract for Rung 3. | `lib/workday-presence/__tests__/source-backed-state.test.ts`, `lib/connectors/test-mode/__tests__/evidence-adapters.test.ts`; Supabase migrations for `tkg_signals`, `tkg_commitments`, `tkg_actions`, and `tkg_action_summaries`. |
| Trigger/candidate detection | `evaluateWorkdayPresenceTrigger` supports `morning_anchor`, `pre_meeting`, `end_of_day`, `waiting_on_changed`, and `mention_reply_needed`. Test-mode evidence adapters collapse simulated connector events into one trigger candidate. | Trigger support is deterministic and in-memory. No production scheduler/source ingestion lane should be inferred from this audit. | `lib/workday-presence/__tests__/triggers.test.ts`, `app/api/workday-presence/__tests__/triggers-route.test.ts`, `lib/connectors/test-mode/__tests__/evidence-adapters.test.ts`. |
| Priority selection / safe silence | Trigger evaluator returns `quiet` with a reason when no saved state exists, prep is not useful, reply is not needed, or changed/reply-needed signal does not affect the active waiting thread. Connector adapter dedupes and selects one highest-priority intervention. Source-backed selector returns `null` when no safe row exists. | Safe silence is deterministic but not yet persisted as an audit row. No cooldown/snooze scheduler persistence beyond metadata state. | `lib/workday-presence/__tests__/triggers.test.ts`, `lib/connectors/test-mode/__tests__/evidence-adapters.test.ts`, `lib/workday-presence/__tests__/source-backed-state.test.ts`. |
| Work packet generation | `buildDeterministicWorkPacket` creates one TEST_MODE work packet from multiple fixture source signals with source trail, normalized signals, prepared work, review surface, forbidden send actions, audit trail, and `quiet_by_default: true`. | Work packets are deterministic objects, not persisted schema rows. Review surface is Slack test-mode only. | `lib/work-packets/__tests__/work-packet-brain.test.ts`, `tests/fixtures/work-packets/source-signals.ts`. |
| One-click user actions | Workday Presence actions support `done`, `stuck`, `break_smaller`, and `snooze`. Work packet review supports `review_packet`, `view_sources`, and `dismiss`; send/auto-send/reply automatically are forbidden by packet type/generator. | `view_sources` is a review-card action label, not a state transition. Real Slack click delivery remains parked under PR #142 and must not be widened here. | `lib/workday-presence/__tests__/presence-loop-receipt.test.ts`, `lib/slack-test-mode/__tests__/work-packet-review.test.ts`, `lib/work-packets/__tests__/work-packet-brain.test.ts`. |
| State mutation | `applyWorkdayPresenceAction` mutates state for done/stuck/break-smaller/snooze. `applyWorkPacketReviewTransition` mutates workday state after review or dismiss. API route persists message-action mutation to auth metadata. | No first-class mutation table, transaction boundary, or append-only production receipt table. Work packet review/dismiss mutation is deterministic in memory only. | `lib/workday-presence/__tests__/actions.test.ts`, `lib/workday-presence/__tests__/work-packet-state-update.test.ts`, `app/api/workday-presence/message-action/__tests__/route.test.ts`. |
| Receipts | `buildPresenceLoopReceipt` proves before state -> Right Now card -> Slack test-mode message -> button action -> after state. `buildWorkPacketBrainReceipt` proves fixture signals -> generated work packet -> Slack review card -> review/dismiss action -> packet/workday state after. | Receipts are deterministic proof objects, not persisted audit records. GitHub/ledger receipts remain the durable closeout surface for this audit seam. | `lib/workday-presence/__tests__/presence-loop-receipt.test.ts`, `lib/work-packets/__tests__/work-packet-brain.test.ts`, `lib/work-packets/receipt.ts`. |
| Source trail / no-send / privacy rail | Source-backed state carries redacted `source_trail[]` and tests assert raw private payload content does not appear. Work packets preserve safe references only, forbid send/auto-send/reply automatically, and mark paid/live connector calls as false in receipts. | No production privacy/audit table yet. No broad compliance claim is supported. No real connector source trail reliability is proved by this audit. | `lib/workday-presence/__tests__/source-backed-state.test.ts`, `lib/work-packets/__tests__/work-packet-brain.test.ts`, `lib/slack-test-mode/__tests__/work-packet-review.test.ts`. |
| Tests/gates | Focused unit tests cover models, source-backed selection, triggers, actions, routes, connector test-mode adapters, work-packet generation, review card, state transition, and receipts. Source-truth gates enforce active seam routing. | No dedicated Rung 3 end-to-end gate yet. Rung 3 should add or run a focused deterministic fixture loop proof rather than relying on broad build alone. | `npm run health`, `npm run gate:command`, `npm run gate:continuity`, focused Vitest lanes, `git diff --check`. |

## First Evidence Lane Decision

Selected first evidence lane for Rung 3: deterministic work-packet fixture lane.

Exact lane:

1. Start from `tests/fixtures/work-packets/source-signals.ts`.
2. Build a `WorkdayPresenceState` fixture.
3. Generate one `work_packet` with `buildDeterministicWorkPacket`.
4. Render the Slack test-mode review card with `buildSlackTestModeWorkPacketReviewCard`.
5. Apply exactly one human review transition with `applyWorkPacketReviewTransition`.
6. Produce a receipt with `buildWorkPacketBrainReceipt` that proves fixture signals -> generated work packet -> review card -> review/dismiss -> packet/workday state after.

Why this lane is first:

- It is already repo-supported by deterministic fixtures, models, and tests.
- It needs no Supabase migration or data mutation.
- It needs no live Slack callback, no Vercel change, no connector expansion, and no paid/model call.
- It directly advances the next named seam: "Rung 3 - Prove deterministic one-verdict fixture loop".
- It preserves the Workday Presence doctrine: one source-backed intervention, safe review, one-click human action, state update, quiet by default.

Lane selection status: `SELECTED`.

Blocked lanes:

- First-class persisted workday-state schema: blocked for Rung 3 because it would require a future schema/migration issue.
- Live Slack callback / PR #142: blocked for Rung 3 because it is parked rail-only and externally blocked.
- Live connector evidence lane: blocked for Rung 3 because live connector/source reliability is a later seam and would require runtime/data proof.
- Payment, landing, dashboard, auth, Stripe, Teams/email/calendar expansion, and enterprise/privacy compliance claims: blocked by issue #175 scope and product doctrine.

## Rung 3 Stop Condition Recommendation

Rung 3 should stop when one deterministic proof shows:

- fixture source signals entered the lane,
- exactly one work packet was generated,
- exactly one review card was produced,
- `Review packet` or `Dismiss` mutated packet/workday state,
- source trail and forbidden send actions remained intact,
- receipt proves no paid model call and no live connector fetch,
- no runtime/schema/provider work started.

Rung 3 should not claim product success, live Slack success, production persistence, real connector proof, non-owner proof, pilot readiness, enterprise readiness, or compliance readiness.
