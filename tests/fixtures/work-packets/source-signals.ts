import type { PacketSourceSignal } from '@/lib/work-packets/types';

export const workPacketFixtureSignals: PacketSourceSignal[] = [
  {
    fixture_id: 'gmail_owner_reply',
    source_type: 'gmail_fixture',
    source_id: 'gmail-thread-acme-renewal',
    source_label: 'Gmail: ACME renewal owner reply',
    observed_at: '2026-06-02T14:05:00.000Z',
    summary: 'Owner confirmed the renewal clause is acceptable and asked for the final review note.',
    relevance_reason: 'Confirms the blocker cleared and the next move can be reviewed.',
    safe_reference: 'fixture:gmail_owner_reply#summary',
  },
  {
    fixture_id: 'calendar_review_window',
    source_type: 'calendar_fixture',
    source_id: 'calendar-acme-renewal-review',
    source_label: 'Calendar: ACME renewal review window',
    observed_at: '2026-06-02T14:20:00.000Z',
    summary: 'A review block starts at 3 PM PT, leaving one focused window for the renewal note.',
    relevance_reason: 'Establishes timing for one reviewable intervention.',
    safe_reference: 'fixture:calendar_review_window#summary',
  },
  {
    fixture_id: 'slack_cfo_ping',
    source_type: 'slack_fixture',
    source_id: 'slack-cfo-renewal-ping',
    source_label: 'Slack: CFO renewal ping',
    observed_at: '2026-06-02T14:45:00.000Z',
    summary: 'CFO asked whether the owner confirmation has enough context for a final approval note.',
    relevance_reason: 'Adds corroborating urgency without requiring an automatic reply.',
    safe_reference: 'fixture:slack_cfo_ping#summary',
  },
];

export const marcusApprovedEstimateSignal: PacketSourceSignal = {
  fixture_id: 'slack_marcus_estimate_approved',
  source_type: 'slack_fixture',
  source_id: 'slack-thread-marcus-estimate-approval',
  source_label: 'Slack: Marcus approved estimate',
  observed_at: '2026-06-04T16:12:00.000Z',
  summary: 'Marcus approved the estimate. Redacted fixture content contains approval only; no raw private message body is stored.',
  relevance_reason: 'Actor Marcus performed approval action on estimate subject, creating deterministic evidence for the next move.',
  safe_reference: 'fixture:slack_marcus_estimate_approved#summary',
};
