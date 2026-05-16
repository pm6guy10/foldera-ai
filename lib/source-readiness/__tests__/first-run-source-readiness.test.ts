import { describe, expect, it } from 'vitest';

import { buildFirstRunSourceReadiness } from '../first-run-source-readiness';

describe('first-run source readiness', () => {
  it('explains a connected source with one unprocessed signal as useful but not enough yet', () => {
    const readiness = buildFirstRunSourceReadiness({
      providers: [
        {
          provider: 'google',
          label: 'Google',
          is_active: true,
          status: 'never_synced',
          last_synced_at: null,
          can_check_now: true,
        },
      ],
      signal_count: 1,
      processed_signal_count: 0,
      unprocessed_signal_count: 1,
      action_count: 0,
      pipeline_run_count: 0,
      last_checked_at: '2026-05-15T22:33:55.815Z',
      newest_signal_at: '2026-05-15T22:33:55.815Z',
    });

    expect(readiness.status).toBe('connected_but_not_enough_evidence');
    expect(readiness.headline).toBe('Foldera connected Google, but only found 1 usable item so far.');
    expect(readiness.reason).toContain('0 processed');
    expect(readiness.reason).toContain('1 waiting');
    expect(readiness.next_action).toBe(
      'Check sources now to process waiting metadata, or connect another source.',
    );
    expect(readiness.nothing_sent_label).toBe('Nothing was sent.');
    expect(readiness.can_check_now).toBe(true);
    expect(readiness.newest_signal_at).toBe('2026-05-15T22:33:55.815Z');
    expect(readiness.metadata_summary).toBe(
      'Metadata says Google is connected and 1 Gmail/calendar item has arrived.',
    );
    expect(readiness.why_no_finished_move).toBe(
      'No finished move exists because 0 source items have been processed and no action or pipeline run exists yet.',
    );
    expect(readiness.value_unlock_next).toBe(
      'Check sources now to process the waiting item, or connect another source if this inbox is too thin.',
    );
  });

  it('summarizes the micro1-like low-data state without claiming a source-backed action', () => {
    const readiness = buildFirstRunSourceReadiness({
      providers: [
        {
          provider: 'google',
          label: 'Google',
          is_active: true,
          status: 'never_synced',
          last_synced_at: null,
          can_check_now: true,
        },
      ],
      signal_count: 2,
      processed_signal_count: 0,
      unprocessed_signal_count: 2,
      action_count: 0,
      pipeline_run_count: 0,
      last_checked_at: '2026-05-15T22:44:00.324Z',
      newest_signal_at: '2026-05-15T22:44:00.324Z',
    });

    expect(readiness.status).toBe('connected_but_not_enough_evidence');
    expect(readiness.connected).toBe(true);
    expect(readiness.providers).toEqual(['Google']);
    expect(readiness.signal_count).toBe(2);
    expect(readiness.processed_signal_count).toBe(0);
    expect(readiness.unprocessed_signal_count).toBe(2);
    expect(readiness.newest_signal_at).toBe('2026-05-15T22:44:00.324Z');
    expect(readiness.metadata_summary).toBe(
      'Metadata says Google is connected and 2 Gmail/calendar items have arrived.',
    );
    expect(readiness.why_no_finished_move).toBe(
      'No finished move exists because 0 source items have been processed and no action or pipeline run exists yet.',
    );
    expect(readiness.value_unlock_next).toBe(
      'Check sources now to process the waiting items, or connect another source if this inbox is too thin.',
    );
    expect(readiness.nothing_sent_label).toBe('Nothing was sent.');
    expect(readiness.next_action).toBe(
      'Check sources now to process waiting metadata, or connect another source.',
    );
  });

  it('does not treat token-only source proof as first-run value proof', () => {
    const readiness = buildFirstRunSourceReadiness({
      providers: [
        {
          provider: 'google',
          label: 'Google',
          is_active: true,
          status: 'never_synced',
          last_synced_at: null,
          can_check_now: true,
        },
      ],
      signal_count: 0,
      processed_signal_count: 0,
      unprocessed_signal_count: 0,
      action_count: 0,
      pipeline_run_count: 0,
      last_checked_at: null,
      newest_signal_at: null,
    });

    expect(readiness.status).toBe('connected_and_syncing');
    expect(readiness.value_proof_ready).toBe(false);
    expect(readiness.headline).toBe('Foldera connected Google and is checking sources now.');
  });
});
