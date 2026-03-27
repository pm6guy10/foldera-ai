-- Add outcome_closed to tkg_actions.
--
-- The scorer and anti-pattern detector reference this column to determine
-- whether an approved/executed action was confirmed complete by the user.
-- NULL = unknown (no follow-up recorded)
-- TRUE = user confirmed the outcome closed / action completed
-- FALSE = outcome still open or never reported
--
-- Also adds feedback_quarantined for the learning reset: setting this to TRUE
-- on polluted-era skips excludes them from the approval-rate calculation
-- (getApprovalHistory already filters feedback_weight=0; this provides a
-- second, cleaner mechanism that does not require mutating feedback_weight).

ALTER TABLE tkg_actions
  ADD COLUMN IF NOT EXISTS outcome_closed BOOLEAN DEFAULT NULL;

COMMENT ON COLUMN tkg_actions.outcome_closed IS
  'NULL=unknown, TRUE=user confirmed outcome complete, FALSE=still open.';

-- Quarantine polluted-era skip signals: skips generated before 2026-03-25
-- (before signal hygiene was in place) are unreliable negative training signals
-- because they reflect junk directives from junk commitments. Setting
-- feedback_weight = 0 on them excludes them from getApprovalHistory() which
-- already filters weight=0 actions.
--
-- We do NOT touch approved/executed actions — those are still valid positives.
-- We do NOT touch skips from 2026-03-25+ — those are post-fix era skips.

UPDATE tkg_actions
SET feedback_weight = 0
WHERE status = 'skipped'
  AND (feedback_weight IS NULL OR feedback_weight != 0)
  AND generated_at < '2026-03-25T00:00:00Z';
