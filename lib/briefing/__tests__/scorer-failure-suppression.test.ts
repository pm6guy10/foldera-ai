import { describe, expect, it, vi } from 'vitest';
import {
  collectActiveFailureSuppressionKeys,
  detectDominantNormalizedDirectiveLoop,
  directiveHasStalePastDates,
  extractSuppressionKeysFromExecutionResult,
  GENERATION_LOOP_DETECTION_WINDOW,
  GENERATION_LOOP_MIN_REPEATS,
  normalizeDirectiveForLoopDetection,
  rawScorerCandidateMatchesFailureSuppression,
  rowContributesUserSkipSuppression,
  userFacingStaleDateScanText,
  USER_SKIP_SUPPRESSION_WINDOW_MS,
} from '../scorer-failure-suppression';

describe('normalizeDirectiveForLoopDetection', () => {
  it('lowercases and strips punctuation', () => {
    expect(normalizeDirectiveForLoopDetection('Hello, World!!')).toBe('hello world');
  });
});

describe('detectDominantNormalizedDirectiveLoop', () => {
  const minLen = 16;
  const longA = 'Follow up with Acme about the contract renewal this week';
  const longB = 'Different directive about something else entirely here';

  it('returns isLoop when last three of three are identical', () => {
    const r = detectDominantNormalizedDirectiveLoop([longA, longA, longA], minLen);
    expect(r.isLoop).toBe(true);
    if (r.isLoop) {
      expect(r.dominantNorm).toBe(normalizeDirectiveForLoopDetection(longA));
    }
  });

  it('returns no loop when no normalized text appears three times in the window', () => {
    const longC = 'Third unique directive about a different topic altogether';
    const longD = 'Fourth unique directive with enough length for the min threshold';
    const longE = 'Fifth unique directive so we fill the window without triples';
    const r = detectDominantNormalizedDirectiveLoop(
      [longA, longB, longA, longC, longD, longE],
      minLen,
    );
    expect(r.isLoop).toBe(false);
  });

  it('returns isLoop when three matches are non-consecutive in a window of five', () => {
    const r = detectDominantNormalizedDirectiveLoop(
      [longA, longB, longA, longB, longA],
      minLen,
    );
    expect(r.isLoop).toBe(true);
  });

  it('returns isLoop when three matches are sparse across the full detection window', () => {
    const f = (i: number) =>
      `Filler directive number ${i} with enough characters to exceed minimum length`;
    const seq = [
      longA,
      longB,
      f(0),
      f(1),
      f(2),
      f(3),
      f(4),
      longA,
      f(5),
      f(6),
      f(7),
      longA,
    ];
    expect(seq).toHaveLength(GENERATION_LOOP_DETECTION_WINDOW);
    const r = detectDominantNormalizedDirectiveLoop(seq, minLen);
    expect(r.isLoop).toBe(true);
  });

  it('uses at most GENERATION_LOOP_DETECTION_WINDOW rows', () => {
    const many = Array.from({ length: GENERATION_LOOP_DETECTION_WINDOW + 2 }, () => longA);
    const r = detectDominantNormalizedDirectiveLoop(many, minLen);
    expect(r.isLoop).toBe(true);
    const windowOnly = many.slice(0, GENERATION_LOOP_DETECTION_WINDOW);
    const counts = new Map<string, number>();
    for (const t of windowOnly) {
      const n = normalizeDirectiveForLoopDetection(t);
      if (n.length >= minLen) counts.set(n, (counts.get(n) ?? 0) + 1);
    }
    expect([...counts.values()].some((c) => c >= GENERATION_LOOP_MIN_REPEATS)).toBe(true);
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

  it('flags slash ISO dates in the past', () => {
    const now = new Date('2026-04-07T12:00:00.000Z');
    const r = directiveHasStalePastDates('Follow up after 2026/03/27.', now, 3);
    expect(r.stale).toBe(true);
    expect(r.matches.some((x) => x.includes('2026'))).toBe(true);
  });
});

describe('userFacingStaleDateScanText', () => {
  it('joins directive and supporting brief fields', () => {
    const s = userFacingStaleDateScanText({
      directive: 'Do the thing',
      why_now: 'Because',
      evidence: 'They said 2026-03-20',
      insight: '',
    });
    expect(s).toContain('Do the thing');
    expect(s).toContain('Because');
    expect(s).toContain('2026-03-20');
  });

  it('allows stale detection when ISO is only in evidence', () => {
    const now = new Date('2026-04-07T12:00:00.000Z');
    const blob = userFacingStaleDateScanText({
      directive: 'Send the recap today.',
      evidence: 'Last commitment was due 2026-03-27.',
    });
    const r = directiveHasStalePastDates(blob, now, 3);
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

describe('rowContributesUserSkipSuppression', () => {
  it('is true for skipped + generation_log.outcome selected', () => {
    expect(
      rowContributesUserSkipSuppression('skipped', {
        generation_log: { outcome: 'selected' },
      } as Record<string, unknown>),
    ).toBe(true);
  });

  it('is false for no_send rows', () => {
    expect(
      rowContributesUserSkipSuppression('skipped', {
        generation_log: { outcome: 'no_send', candidateFailureReasons: ['duplicate_100pct_similar'] },
      } as Record<string, unknown>),
    ).toBe(false);
  });

  it('is false when status is not skipped', () => {
    expect(
      rowContributesUserSkipSuppression('pending_approval', {
        generation_log: { outcome: 'selected' },
      } as Record<string, unknown>),
    ).toBe(false);
  });
});

function createSupabaseMock(rows: unknown[], eqSpy?: (col: string, val: string) => void) {
  const builder: Record<string, unknown> = {
    eq(col: string, val: string) {
      eqSpy?.(col, val);
      return builder;
    },
    gte: () => builder,
    order: () => builder,
    limit: () => Promise.resolve({ data: rows, error: null }),
  };
  return {
    from: () => ({
      select: () => builder,
    }),
  };
}

describe('collectActiveFailureSuppressionKeys', () => {
  it('suppresses keys from user-skipped selected directives for 48h', async () => {
    vi.useFakeTimers();
    const now = new Date('2026-04-07T12:00:00.000Z').getTime();
    vi.setSystemTime(now);

    const generatedAt = new Date(now).toISOString();
    const rows = [
      {
        generated_at: generatedAt,
        status: 'skipped',
        action_type: 'send_message',
        execution_result: {
          generation_log: {
            outcome: 'selected',
            candidateDiscovery: {
              topCandidates: [
                {
                  decision: 'selected',
                  sourceSignals: [{ kind: 'signal', id: 'sig-user-skip' }],
                },
              ],
            },
          },
        },
      },
    ];

    const eqSpy = vi.fn();
    const supabase = createSupabaseMock(rows, eqSpy) as never;

    const keys = await collectActiveFailureSuppressionKeys(supabase, 'user-aaa-111');
    expect(eqSpy).toHaveBeenCalledWith('user_id', 'user-aaa-111');
    expect(keys.has('signal:sig-user-skip')).toBe(true);

    vi.setSystemTime(now + USER_SKIP_SUPPRESSION_WINDOW_MS - 60_000);
    const keysStill = await collectActiveFailureSuppressionKeys(supabase, 'user-aaa-111');
    expect(keysStill.has('signal:sig-user-skip')).toBe(true);

    vi.setSystemTime(now + USER_SKIP_SUPPRESSION_WINDOW_MS + 60_000);
    const keysExpired = await collectActiveFailureSuppressionKeys(supabase, 'user-aaa-111');
    expect(keysExpired.has('signal:sig-user-skip')).toBe(false);

    vi.useRealTimers();
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
