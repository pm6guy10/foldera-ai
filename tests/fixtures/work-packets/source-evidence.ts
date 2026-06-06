import type { WorkdayPresenceState } from '@/lib/workday-presence/model';

export type SourceEvidenceSignalFact = {
  signal_id: string;
  summary: string;
  relevance_reason: string;
  safe_reference: string;
};

export type SourceEvidenceFixture = {
  fixture_id: string;
  source_type: 'gmail_fixture' | 'calendar_fixture' | 'slack_fixture';
  source_id: string;
  source_label: string;
  observed_at: string;
  redacted_summary: string;
  signal_facts: SourceEvidenceSignalFact[];
};

export const sourceBackedMoveEvidenceFixture: SourceEvidenceFixture = {
  fixture_id: 'gmail_acme_renewal_review_note',
  source_type: 'gmail_fixture',
  source_id: 'gmail-thread-acme-renewal',
  source_label: 'Gmail: ACME renewal review note',
  observed_at: '2026-06-02T14:05:00.000Z',
  redacted_summary:
    'Owner confirmed the renewal clause is acceptable and asked for the final review note.',
  signal_facts: [
    {
      signal_id: 'owner_confirmation',
      summary: 'Owner confirmed the renewal clause is acceptable.',
      relevance_reason: 'Clears the blocker and makes the remaining move reviewable.',
      safe_reference: 'fixture:gmail_acme_renewal_review_note#owner_confirmation',
    },
    {
      signal_id: 'final_review_request',
      summary: 'Asked for the final review note.',
      relevance_reason: 'Turns the evidence into one safe next move instead of silence.',
      safe_reference: 'fixture:gmail_acme_renewal_review_note#final_review_request',
    },
  ],
};

export const sourceBackedSilenceEvidenceFixture: SourceEvidenceFixture = {
  fixture_id: 'calendar_acme_status_only',
  source_type: 'calendar_fixture',
  source_id: 'calendar-acme-status-only',
  source_label: 'Calendar: ACME status note',
  observed_at: '2026-06-02T15:05:00.000Z',
  redacted_summary: 'Calendar note records a status-only check-in with no requested action.',
  signal_facts: [
    {
      signal_id: 'status_note_only',
      summary: 'Status note recorded; no action requested.',
      relevance_reason: 'Evidence exists, but it does not justify a competing move.',
      safe_reference: 'fixture:calendar_acme_status_only#status_note_only',
    },
  ],
};

export const deterministicBeforeState: WorkdayPresenceState = {
  current_focus: 'Close ACME renewal decision',
  next_move: 'Send the final owner-confirmed renewal review note',
  why_it_matters: 'The renewal window is open and needs one safe next move.',
  blocker: 'Waiting on owner confirmation',
  do_not_touch: 'Do not send automatically',
  waiting_on: 'Owner confirmation',
  last_completed_step: null,
  state_source: 'manual_anchor',
  source_trail: [],
  snoozed_until: null,
  interaction_history: [],
  created_at: '2026-06-02T13:00:00.000Z',
  updated_at: '2026-06-02T13:10:00.000Z',
};
