import { describe, expect, it } from 'vitest';
import {
  directiveHasStalePastDates,
  extractSuppressionKeysFromExecutionResult,
  normalizeDirectiveForLoopDetection,
  rawScorerCandidateMatchesFailureSuppression,
} from '../scorer-failure-suppression';

describe('normalizeDirectiveForLoopDetection', () => {
  it('lowercases and strips punctuation', () => {
    expect(normalizeDirectiveForLoopDetection('Hello, World!!')).toBe('hello world');
  });
});

describe('directiveHasStalePastDates', () => {
  it('flags ISO date more than 3 days in the past', () => {
    const now = new Date('2026-04-07T12:00:00.000Z');
    const r = directiveHasStalePastDates(
      'Please confirm by 2026-04-01 end of day.',
      now,
      3,
    );
    expect(r.stale).toBe(true);
    expect(r.matches).toContain('2026-04-01');
  });

  it('allows recent ISO dates', () => {
    const now = new Date('2026-04-07T12:00:00.000Z');
    const r = directiveHasStalePastDates('Deadline 2026-04-06.', now, 3);
    expect(r.stale).toBe(false);
  });

  it('flags month name dates in the past', () => {
    const now = new Date('2026-04-07T12:00:00.000Z');
    const r = directiveHasStalePastDates(
      'Send a decision request by March 27 5pm PT.',
      now,
      3,
    );
    expect(r.stale).toBe(true);
  });
});

describe('extractSuppressionKeysFromExecutionResult', () => {
  it('reads sourceSignals from selected topCandidate', () => {
    const keys = extractSuppressionKeysFromExecutionResult({
      generation_log: {
        candidateDiscovery: {
          topCandidates: [
            {
              decision: 'selected',
              sourceSignals: [
                { kind: 'signal', id: 'sig-1' },
                { kind: 'relationship', id: 'ent-2' },
              ],
            },
          ],
        },
      },
    });
    expect(keys).toContain('signal:sig-1');
    expect(keys).toContain('entity:ent-2');
  });

  it('merges loop_suppression_keys', () => {
    const keys = extractSuppressionKeysFromExecutionResult({
      loop_suppression_keys: ['signal:a', 'commitment:b'],
    });
    expect(keys).toEqual(expect.arrayContaining(['signal:a', 'commitment:b']));
  });
});

describe('rawScorerCandidateMatchesFailureSuppression', () => {
  it('matches primary signal id', () => {
    const hit = rawScorerCandidateMatchesFailureSuppression(
      {
        id: 'sig-9',
        type: 'signal',
        sourceSignals: [{ kind: 'signal', id: 'sig-9' }],
      },
      new Set(['signal:sig-9']),
    );
    expect(hit).toBe(true);
  });

  it('matches entity on relationship candidate', () => {
    const hit = rawScorerCandidateMatchesFailureSuppression(
      {
        id: 'ent-1',
        type: 'relationship',
        sourceSignals: [{ kind: 'relationship', id: 'ent-1' }],
      },
      new Set(['entity:ent-1']),
    );
    expect(hit).toBe(true);
  });
});
