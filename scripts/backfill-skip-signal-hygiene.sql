-- One-time backfill: quarantine non-judgment "skipped" tkg_actions rows so the
-- scorer's behavioral_rate (lib/briefing/scorer.ts computeCandidateScore /
-- getApprovalHistory) only learns from real user decisions.
--
-- Context (issue #592, PR #610 follow-up): ACTIVE_HANDOFF.md / issue #592 claimed
-- "1,204 skips taught nothing" because they were type-inert `presence_action`
-- receipts. Live-verified that claim is wrong: only 15 rows are action_type=
-- 'presence_action' (see the presence_action reclassify below). The real
-- "1,205 skipped" rows (owner-scoped) are almost entirely REAL action types
-- (do_nothing/write_document/send_message/...) that already flow into
-- getApprovalHistory's per-type behavioral_rate via `status`. So most of them
-- were never "wasted" — but a large majority were never real user judgment
-- either: they are pipeline self-log/automation/dev-test rows that got counted
-- as if the user rejected that action type, which POLLUTES the rate rather than
-- informing it. This script neutralizes exactly that population by setting
-- feedback_weight = 0 (the existing "quarantined, don't count" convention from
-- supabase/migrations/20260327000001_add_outcome_closed.sql), leaving `status`
-- and every other column untouched (fully reversible: re-derive feedback_weight
-- from status if this classification is ever revisited).
--
-- Two groups, both verified by direct row sampling before writing this script:
--
-- (A) Explicit automation/dev-test skip_reason values — auto-suppression before
--     regeneration, auto-cleaned duplicates, auto-abandon/expire timers, and
--     one-off dev/ops flush-and-retest markers. None of these represent a user
--     looking at a card and deciding to skip it.
--
-- (B) action_type = 'do_nothing' AND skip_reason IS NULL — sampled extensively;
--     the directive_text is overwhelmingly system self-log placeholders
--     ("Nothing cleared the bar today...", "__GENERATION_FAILED__",
--     "paid_llm_disabled", "INSIGHT: ...", "No ranked daily brief candidate.",
--     "All N candidates blocked: ...") — i.e. there was no real candidate for
--     the user to reject in the first place. Genuine explicit skip reasons
--     (not_relevant / already_handled / wrong_approach / passive_timeout) and
--     null-reason rows on REAL directive types (send_message/write_document/
--     make_decision/schedule/research) are left untouched — those carry real
--     directive text and are plausible genuine skip signal.
--
-- Run as a dry-run count first (SELECT), then the UPDATE. Idempotent: re-running
-- is a no-op once feedback_weight is already 0 for the matched rows.

-- ---------------------------------------------------------------------------
-- Dry run: counts before touching anything
-- ---------------------------------------------------------------------------
-- SELECT
--   count(*) FILTER (WHERE skip_reason IN (
--     'Auto-suppressed stale pending action before daily brief generation.',
--     'Auto-suppressed pending action before forced fresh generation.',
--     'Auto-suppressed do_nothing pending action — never send to user.',
--     'Auto-suppressed pending action for dev brain-receipt force-fresh run.',
--     'Auto-suppressed already-sent pending action before daily brief generation.',
--     'Auto-suppressed invalid pending action before daily brief generation.',
--     'Auto-suppressed duplicate pending action before daily brief generation.',
--     'Auto-drained stale pending/draft (>20h) before daily brief generation.',
--     'auto-cleaned: duplicate pending directives',
--     'auto-cleaned: stale pending duplicates',
--     'auto_abandoned_7d',
--     'auto_expired_36h',
--     'Dev skip: unblock fresh paid generation (scripts/skip-pending-for-dev-generate.ts)',
--     'manually_cleared_stale_queue',
--     'db_flush_commitment_gate_fix',
--     'db_flush_unblock_ce1_wiring',
--     'db_flush_brandon_kapp_selfname_fix',
--     'verdict_run_clear_pending_for_fresh_gen',
--     'pre_dedup_fix',
--     'manual_verification_test',
--     'pre_selfref_fix_test',
--     'manually cleared stale pending_approval to unblock generation test',
--     'proof_run_gate_test',
--     'stale_retest',
--     'gate_1_test_row',
--     'pre_quality_test_skip',
--     'cleared_for_bottom_gate_test',
--     'pre_brain_test'
--   ) AND (feedback_weight IS NULL OR feedback_weight != 0)) AS group_a_to_quarantine,
--   count(*) FILTER (WHERE action_type = 'do_nothing' AND skip_reason IS NULL
--     AND (feedback_weight IS NULL OR feedback_weight != 0)) AS group_b_to_quarantine
-- FROM tkg_actions
-- WHERE status = 'skipped';

-- ---------------------------------------------------------------------------
-- Apply
-- ---------------------------------------------------------------------------

-- Group A: explicit automation / dev-test skip_reason markers.
UPDATE tkg_actions
SET feedback_weight = 0
WHERE status = 'skipped'
  AND (feedback_weight IS NULL OR feedback_weight != 0)
  AND skip_reason IN (
    'Auto-suppressed stale pending action before daily brief generation.',
    'Auto-suppressed pending action before forced fresh generation.',
    'Auto-suppressed do_nothing pending action — never send to user.',
    'Auto-suppressed pending action for dev brain-receipt force-fresh run.',
    'Auto-suppressed already-sent pending action before daily brief generation.',
    'Auto-suppressed invalid pending action before daily brief generation.',
    'Auto-suppressed duplicate pending action before daily brief generation.',
    'Auto-drained stale pending/draft (>20h) before daily brief generation.',
    'auto-cleaned: duplicate pending directives',
    'auto-cleaned: stale pending duplicates',
    'auto_abandoned_7d',
    'auto_expired_36h',
    'Dev skip: unblock fresh paid generation (scripts/skip-pending-for-dev-generate.ts)',
    'manually_cleared_stale_queue',
    'db_flush_commitment_gate_fix',
    'db_flush_unblock_ce1_wiring',
    'db_flush_brandon_kapp_selfname_fix',
    'verdict_run_clear_pending_for_fresh_gen',
    'pre_dedup_fix',
    'manual_verification_test',
    'pre_selfref_fix_test',
    'manually cleared stale pending_approval to unblock generation test',
    'proof_run_gate_test',
    'stale_retest',
    'gate_1_test_row',
    'pre_quality_test_skip',
    'cleared_for_bottom_gate_test',
    'pre_brain_test'
  );

-- Group B: do_nothing system self-log rows with no recorded skip reason.
UPDATE tkg_actions
SET feedback_weight = 0
WHERE status = 'skipped'
  AND (feedback_weight IS NULL OR feedback_weight != 0)
  AND action_type = 'do_nothing'
  AND skip_reason IS NULL;

-- Presence-action reclassify (separate, tiny, non-guessing correction): a
-- historical presence_action receipt row already recorded its real action_type
-- in execution_result.draft_action_type at insert time (lib/workday-presence/
-- presence-action-receipt.ts never persisted this to the action_type column
-- itself). Correcting the label — using data already on the row, no guessing —
-- lets its already-correct status flow into that real type's behavioral_rate.
UPDATE tkg_actions
SET action_type = execution_result->>'draft_action_type'
WHERE action_type = 'presence_action'
  AND execution_result->>'draft_action_type' IN (
    'send_message', 'write_document', 'schedule', 'schedule_block',
    'do_nothing', 'make_decision', 'research', 'wait_rationale'
  );
