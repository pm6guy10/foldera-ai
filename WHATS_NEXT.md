# WHAT'S NEXT — Updated 2026-04-04

## STATUS: GREEN — Gate 4 unblocked, health system live

## RIGHT NOW (in flight)
- Post-deploy verification: Vercel Ready + `npm run test:prod`

## AFTER THAT (ordered, no skipping)
1. Trigger nightly-ops manually and confirm `system_health` row is written
2. Confirm morning email health footer appears (owner only)
3. Monitor 4am cron — expect a different candidate to win (drain + freshness fix active)
4. If `failure_class = INFINITE_LOOP` fires, `drainStuckCandidate` auto-runs — verify in logs

## GATE STATUS (live)
| Gate | Status | Last evidence |
|------|--------|---------------|
| Gate 1: Signal ingestion | GREEN | Claude export ingested 2026-04-03, claude_conversation source |
| Gate 2: Processing | YELLOW | Backlog clearing nightly |
| Gate 3: Generation | GREEN | Decision enforcement unblocked 2026-04-04 commit 4a75257 |
| Gate 4: Send | GREEN | Discrepancy gate alignment + explicit-ask patterns 2026-04-04 commit 4a75257 |
| Gate 5: Approve | — | Human only |

## PIPELINE HEALTH (live numbers from system_health)
Query `system_health` table — `SELECT failure_class, signals_synced, candidates_evaluated, winner_action_type, winner_confidence, same_candidate_streak FROM system_health WHERE user_id = 'e40b7cd8-4925-42f7-bc99-5022969f1d22' ORDER BY created_at DESC LIMIT 1;`

## BLOCKED BY
Nothing currently. Next cron run at 11:10 UTC.

## DO NOT TOUCH
- `isDiscrepancyWithRecipient` variable is gone — do not re-introduce it
- `isDiscrepancyCandidate` is now the single gate guard for both send_message and write_document
- `persistNoSendOutcome` must always include `original_candidate` metadata — scorer and health system depend on it
- `system_health` table insert must not be in the main request path (fire-and-forget in nightly-ops)
