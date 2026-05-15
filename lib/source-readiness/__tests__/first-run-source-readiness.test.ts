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
    });

    expect(readiness.status).toBe('connected_but_not_enough_evidence');
    expect(readiness.headline).toBe('Foldera connected Google, but only found 1 usable item so far.');
    expect(readiness.reason).toContain('0 processed');
    expect(readiness.reason).toContain('1 waiting');
    expect(readiness.next_action).toBe(
      'Check again after more mail/calendar activity, or connect another source.',
    );
    expect(readiness.nothing_sent_label).toBe('Nothing was sent.');
    expect(readiness.can_check_now).toBe(true);
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
    });

    expect(readiness.status).toBe('connected_and_syncing');
    expect(readiness.value_proof_ready).toBe(false);
    expect(readiness.headline).toBe('Foldera connected Google and is checking sources now.');
  });
});
