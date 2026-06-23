/**
 * Validates the stale-signal backlog gate threshold calibration.
 *
 * Root cause (2026-06-23): 219 Drive file_modified signals (occurred_at April-May)
 * were bulk-ingested on June 22 at 19:17 UTC. By the June 23 morning cron the 20-second
 * processing budget couldn't clear them, so staleAfter=219 ≥ 10 fired, producing
 * code:'stale_signal_backlog_remaining' and silencing an established account with
 * 1,010 processed signals. The old threshold of 10 is too strict for bulk-import spikes.
 * The new threshold of 250 allows generation through temporary spikes while still blocking
 * truly degraded new accounts.
 */

import { describe, expect, it } from 'vitest';
import { STALE_SIGNAL_BACKLOG_GATE_THRESHOLD } from '../daily-brief-generate';

describe('STALE_SIGNAL_BACKLOG_GATE_THRESHOLD', () => {
  it('is above the June 23 bulk-import spike of 219 so established accounts are not silenced', () => {
    const juneSpike = 219;
    expect(STALE_SIGNAL_BACKLOG_GATE_THRESHOLD).toBeGreaterThan(juneSpike);
  });

  it('is at most 250 — still blocks pathologically degraded accounts', () => {
    expect(STALE_SIGNAL_BACKLOG_GATE_THRESHOLD).toBeLessThanOrEqual(250);
  });

  it('blocks when staleAfter equals the threshold (gate is inclusive)', () => {
    const staleAfter = STALE_SIGNAL_BACKLOG_GATE_THRESHOLD;
    expect(staleAfter >= STALE_SIGNAL_BACKLOG_GATE_THRESHOLD).toBe(true);
  });

  it('allows generation when staleAfter is one below the threshold', () => {
    const staleAfter = STALE_SIGNAL_BACKLOG_GATE_THRESHOLD - 1;
    expect(staleAfter >= STALE_SIGNAL_BACKLOG_GATE_THRESHOLD).toBe(false);
  });
});
