import { describe, expect, it } from 'vitest';
import {
  assessProofOutcome,
  summarizeRepeatedDirectiveHealth,
} from '../duplicate-truth';

describe('duplicate truth semantics', () => {
  const now = new Date('2026-04-16T18:00:00.000Z').getTime();

  it('treats old duplicate rows alone as historical backlog, not active regression', () => {
    const summary = summarizeRepeatedDirectiveHealth([
      {
        directive_text: 'Email Alex about the permit appeal deadline.',
        generated_at: '2026-04-16T08:00:00.000Z',
      },
      {
        directive_text: 'Email Alex about the permit appeal deadline.',
        generated_at: '2026-04-16T09:00:00.000Z',
      },
      {
        directive_text: 'Email Alex about the permit appeal deadline.',
        generated_at: '2026-04-16T10:00:00.000Z',
      },
    ], now);

    expect(summary.status).toBe('historical_backlog');
    expect(summary.maxCopies).toBe(3);
  });

  it('flags a new duplicate persistence as active duplicate regression', () => {
    const summary = summarizeRepeatedDirectiveHealth([
      {
        directive_text: 'Email Alex about the permit appeal deadline.',
        generated_at: '2026-04-16T15:15:00.000Z',
      },
      {
        directive_text: 'Email Alex about the permit appeal deadline.',
        generated_at: '2026-04-16T16:15:00.000Z',
      },
      {
        directive_text: 'Email Alex about the permit appeal deadline.',
        generated_at: '2026-04-16T17:45:00.000Z',
      },
    ], now);

    expect(summary.status).toBe('active_regression');
    expect(summary.maxCopies).toBe(3);
  });

  it('accepts no_send_persisted when duplicate guard blocked another persistence', () => {
    const assessment = assessProofOutcome({
      code: 'no_send_persisted',
      detail: 'All 2 candidates blocked: "Permit appeal follow-up" → duplicate_100pct_similar',
      meta: { protective_duplicate_block: true },
    });

    expect(assessment).toEqual({
      accepted: true,
      reason: 'no_send_persisted:protective_duplicate_block',
    });
  });

  it('keeps fresh-proof semantics intact for successful and generic blocked outcomes', () => {
    expect(assessProofOutcome({
      code: 'pending_approval_persisted',
    })).toEqual({
      accepted: true,
      reason: 'pending_approval_persisted',
    });

    expect(assessProofOutcome({
      code: 'no_send_persisted',
      detail: 'Artifact generation failed.',
      meta: {},
    })).toEqual({
      accepted: false,
      reason: 'no_send_persisted',
    });
  });
});
