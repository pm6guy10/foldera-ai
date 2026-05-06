import { describe, expect, it } from 'vitest';

import { classifyRecentAction } from '../winner-truth';

describe('winner truth replay classification', () => {
  it('treats do_nothing no-send rows with concrete blockers as no-safe artifacts', () => {
    const classified = classifyRecentAction({
      action_type: 'do_nothing',
      directive_text: 'Nothing cleared the bar today after evaluating 11 candidates.',
      skip_reason: null,
      generated_at: '2026-05-04T11:03:00.782+00:00',
      execution_result: {
        no_send: true,
        outcome_type: 'no_send',
        generation_log: {
          candidateDiscovery: {
            failureReason:
              'All ranked candidates blocked: "Commitment due 2026-05-13" -> missing_schedule_resolution_context',
          },
        },
      },
    });

    expect(classified.classification).toBe('no_safe_artifact');
    expect(classified.summary).toContain('Explicit no-safe-artifact outcome');
    expect(classified.summary).toContain('Commitment due');
  });

  it('does not count user-skipped not-relevant write_document rows as useful proof', () => {
    const classified = classifyRecentAction({
      action_type: 'write_document',
      directive_text:
        'Stop holding live bandwidth open for Accepted MACSC MAS3 Interview; reopen only if a concrete next-step signal arrives.',
      skip_reason: 'not_relevant',
      generated_at: '2026-05-05T11:08:38.584+00:00',
      execution_result: {
        artifact_quality_gate: {
          reasons: [],
          soft_warnings: ['no_concrete_outcome'],
        },
      },
    });

    expect(classified.classification).toBe('garbage_regression');
  });
});
