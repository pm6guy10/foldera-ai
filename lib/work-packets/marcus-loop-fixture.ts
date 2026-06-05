import { buildWorkPacketBrainReceipt } from './receipt';
import type { WorkdayPresenceState } from '@/lib/workday-presence/model';

const marcusApprovedEstimateSignal = {
  fixture_id: 'slack_marcus_estimate_approved',
  source_type: 'slack_fixture',
  source_id: 'slack-thread-marcus-estimate-approval',
  source_label: 'Slack: Marcus approved estimate',
  observed_at: '2026-06-04T16:12:00.000Z',
  summary: 'Marcus approved the estimate. Redacted fixture content contains approval only; no raw private message body is stored.',
  relevance_reason: 'Actor Marcus performed approval action on estimate subject, creating deterministic evidence for the next move.',
  safe_reference: 'fixture:slack_marcus_estimate_approved#summary',
} as const;

const calendarReviewWindowSignal = {
  fixture_id: 'calendar_review_window',
  source_type: 'calendar_fixture',
  source_id: 'calendar-acme-renewal-review',
  source_label: 'Calendar: ACME renewal review window',
  observed_at: '2026-06-02T14:20:00.000Z',
  summary: 'A review block starts at 3 PM PT, leaving one focused window for the renewal note.',
  relevance_reason: 'Establishes timing for one reviewable intervention.',
  safe_reference: 'fixture:calendar_review_window#summary',
} as const;

const beforeState: WorkdayPresenceState = {
  current_focus: 'Finalize revised estimate for Marcus',
  next_move: 'Wait for Marcus to approve the revised estimate',
  why_it_matters: 'The review window is today and the decision needs one safe next move.',
  blocker: 'Waiting on Marcus',
  do_not_touch: 'Do not send the renewal note automatically',
  waiting_on: 'Marcus approval',
  last_completed_step: null,
  state_source: 'manual_anchor',
  source_trail: [],
  snoozed_until: null,
  interaction_history: [],
  created_at: '2026-06-02T13:00:00.000Z',
  updated_at: '2026-06-02T13:10:00.000Z',
} as const;

export const marcusLoopReceipt = buildWorkPacketBrainReceipt({
  user_id: 'user_test_005',
  before_state: beforeState,
  fixture_signals: [marcusApprovedEstimateSignal, calendarReviewWindowSignal],
  action: 'done',
  nowIso: '2026-06-04T16:40:00.000Z',
});

export const marcusLoopSourceTrail = marcusLoopReceipt.before_fixture_signals.map((signal) => ({
  label: signal.source_label,
  title: signal.summary,
  detail: signal.relevance_reason,
}));

export function getMarcusLoopEvidenceRows(done: boolean) {
  return [
    { label: 'Focus', value: marcusLoopReceipt.generated_work_packet.workday_state_snapshot.current_focus },
    { label: 'Waiting on', value: marcusLoopReceipt.generated_work_packet.workday_state_snapshot.waiting_on ?? 'None' },
    { label: 'Blocker', value: marcusLoopReceipt.generated_work_packet.workday_state_snapshot.blocker ?? 'None' },
    { label: 'Last step', value: done ? marcusLoopReceipt.packet_workday_state_after.workday_state.last_completed_step ?? 'None yet' : 'None yet' },
  ];
}

export function getMarcusLoopNextMove(done: boolean) {
  return done
    ? 'Stay quiet until a new source-backed trigger appears.'
    : marcusLoopReceipt.generated_work_packet.next_move;
}
