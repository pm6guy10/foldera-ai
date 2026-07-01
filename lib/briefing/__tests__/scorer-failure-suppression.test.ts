import { describe, expect, it, vi } from 'vitest';
import {
  classifyCausalMechanism,
  collectActiveFailureSuppressionKeys,
  collectActiveJudgmentSuppressionEntries,
  detectDominantNormalizedDirectiveLoop,
  directiveHasStalePastDates,
  extractDismissalFromExecutionResult,
  extractSuppressionKeysFromExecutionResult,
  GENERATION_LOOP_DETECTION_WINDOW,
  GENERATION_LOOP_MIN_REPEATS,
  judgmentSuppressionMultiplierForCandidate,
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
  it('includes directive and why_now only', () => {
    const s = userFacingStaleDateScanText({
      directive: 'Do the thing',
      why_now: 'Because now',
      evidence: 'They said 2026-03-20',
      insight: 'Old insight',
    });
    expect(s).toContain('Do the thing');
    expect(s).toContain('Because now');
    // evidence and insight are historical context — not scanned for stale dates
    expect(s).not.toContain('2026-03-20');
    expect(s).not.toContain('Old insight');
  });

  it('does not flag stale when ISO is only in evidence (historical context, not a deadline)', () => {
    const now = new Date('2026-04-07T12:00:00.000Z');
    const blob = userFacingStaleDateScanText({
      directive: 'Send the recap today.',
      evidence: 'Last commitment was due 2026-03-27.',
    });
    const r = directiveHasStalePastDates(blob, now, 3);
    expect(r.stale).toBe(false);
  });

  it('flags stale when ISO deadline is in directive', () => {
    const now = new Date('2026-04-07T12:00:00.000Z');
    const blob = userFacingStaleDateScanText({
      directive: 'Please confirm by 2026-04-01.',
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
  it('suppresses keys from artifact-quality no-send rows so bad candidates do not keep winning', async () => {
    vi.useFakeTimers();
    const now = new Date('2026-05-01T16:00:00.000Z').getTime();
    vi.setSystemTime(now);

    const rows = [
      {
        generated_at: new Date(now).toISOString(),
        status: 'skipped',
        action_type: 'do_nothing',
        execution_result: {
          generation_log: {
            outcome: 'no_send',
            candidateDiscovery: {
              topCandidates: [
                {
                  decision: 'selected',
                  sourceSignals: [{ kind: 'signal', id: 'sig-resend-onboarding' }],
                },
              ],
            },
          },
          original_candidate: {
            action_type: 'write_document',
            candidate_description: 'Resend relationship status and interview decision map',
            blocked_by: 'artifact_quality:transactional_sender_decision_pressure',
          },
        },
      },
    ];

    const supabase = createSupabaseMock(rows) as never;

    const keys = await collectActiveFailureSuppressionKeys(supabase, 'user-aaa-111');
    expect(keys.has('signal:sig-resend-onboarding')).toBe(true);

    vi.useRealTimers();
  });

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

describe('classifyCausalMechanism', () => {
  it('classifies avoidance and approval-blocker language', () => {
    expect(classifyCausalMechanism('No reply on the thread, defer to next week')).toBe('avoidance_pattern');
    expect(classifyCausalMechanism('Needs final sign-off from the approver')).toBe('hidden_approval_blocker');
    expect(classifyCausalMechanism('Just a normal status update')).toBe('general');
  });
});

describe('extractDismissalFromExecutionResult', () => {
  it('prefers the rich execution_result.dismissal block when present', () => {
    const result = extractDismissalFromExecutionResult({
      inspection: { mechanism_class: 'general', topic_key: 'sig-old:*' },
      dismissal: { reason: 'never', mechanism_class: 'avoidance_pattern', topic_key: 'sig-1:*' },
    });
    expect(result).toEqual({ reason: 'never', mechanismClass: 'avoidance_pattern', topicKey: 'sig-1:*' });
  });

  it('falls back to inspection.mechanism_class + a conservative legacy skip_reason mapping', () => {
    expect(
      extractDismissalFromExecutionResult({ inspection: { mechanism_class: 'timing_asymmetry' } }, 'already_handled'),
    ).toEqual({ reason: 'already_done', mechanismClass: 'timing_asymmetry', topicKey: null });

    expect(
      extractDismissalFromExecutionResult({ inspection: { mechanism_class: 'timing_asymmetry' } }, 'wrong_approach'),
    ).toEqual({ reason: 'wrong_framing', mechanismClass: 'timing_asymmetry', topicKey: null });

    // No skip_reason at all still yields the weakest (`not_now`) tier rather than null,
    // since `never` is a new explicit signal only the one-tap reason UI sets.
    expect(
      extractDismissalFromExecutionResult({ inspection: { mechanism_class: 'timing_asymmetry' } }, null),
    ).toEqual({ reason: 'not_now', mechanismClass: 'timing_asymmetry', topicKey: null });

    // A legacy `not_relevant` skip_reason must NOT be inferred as `never` — that tier is
    // reserved for the new explicit one-tap signal.
    const legacyNotRelevant = extractDismissalFromExecutionResult(
      { inspection: { mechanism_class: 'general' } },
      'not_relevant',
    );
    expect(legacyNotRelevant?.reason).not.toBe('never');
  });

  it('returns null when there is no mechanism to key suppression on at all', () => {
    expect(extractDismissalFromExecutionResult(null, null)).toBeNull();
    expect(extractDismissalFromExecutionResult({}, 'not_relevant')).toBeNull();
  });
});

describe('judgmentSuppressionMultiplierForCandidate', () => {
  it('returns 1 (no suppression) when there is no matching entry', () => {
    const entries = new Map([['avoidance_pattern:sig-1:*', { expiresAtMs: Date.now() + 1000, reason: 'never' as const, feedbackWeight: -0.5 }]]);
    expect(judgmentSuppressionMultiplierForCandidate(null, null, entries)).toBe(1);
    expect(judgmentSuppressionMultiplierForCandidate('avoidance_pattern', 'sig-2:*', new Map())).toBe(1);
    expect(judgmentSuppressionMultiplierForCandidate('timing_asymmetry', 'sig-1:*', entries)).toBe(1);
  });

  it('prefers the precise mechanism:topic entry over the broader mechanism-only entry', () => {
    const entries = new Map([
      ['avoidance_pattern', { expiresAtMs: Date.now() + 1000, reason: 'not_now' as const, feedbackWeight: -0.5 }],
      ['avoidance_pattern:sig-1:*', { expiresAtMs: Date.now() + 1000, reason: 'never' as const, feedbackWeight: -0.5 }],
    ]);
    // Exact mechanism+topic match -> the stronger 'never' floor, not the weaker mechanism-only one.
    expect(judgmentSuppressionMultiplierForCandidate('avoidance_pattern', 'sig-1:*', entries)).toBeLessThan(
      judgmentSuppressionMultiplierForCandidate('avoidance_pattern', 'sig-2:*', entries),
    );
  });

  it('demotes harder for "never"/"already_done" than for "not_now" — never hard-drops (multiplier > 0)', () => {
    const entryFor = (reason: 'not_now' | 'never' | 'wrong_framing' | 'already_done') =>
      new Map([['avoidance_pattern', { expiresAtMs: Date.now() + 1000, reason, feedbackWeight: -0.5 }]]);

    const notNow = judgmentSuppressionMultiplierForCandidate('avoidance_pattern', null, entryFor('not_now'));
    const wrongFraming = judgmentSuppressionMultiplierForCandidate('avoidance_pattern', null, entryFor('wrong_framing'));
    const alreadyDone = judgmentSuppressionMultiplierForCandidate('avoidance_pattern', null, entryFor('already_done'));
    const never = judgmentSuppressionMultiplierForCandidate('avoidance_pattern', null, entryFor('never'));

    expect(never).toBeGreaterThan(0);
    expect(never).toBeLessThan(alreadyDone);
    expect(alreadyDone).toBeLessThan(wrongFraming);
    expect(wrongFraming).toBeLessThan(notNow);
    expect(notNow).toBeLessThan(1);
  });

  it('lifts the dampening entirely when feedback_weight is non-negative (forgiven/reconciled)', () => {
    const entries = new Map([['avoidance_pattern', { expiresAtMs: Date.now() + 1000, reason: 'never' as const, feedbackWeight: 0 }]]);
    expect(judgmentSuppressionMultiplierForCandidate('avoidance_pattern', null, entries)).toBe(1);
  });
});

describe('collectActiveJudgmentSuppressionEntries', () => {
  it('expires a "not_now" dismissal quickly but keeps a "never" dismissal active much longer', async () => {
    vi.useFakeTimers();
    const generatedAt = new Date('2026-04-01T00:00:00.000Z').getTime();
    vi.setSystemTime(generatedAt);

    const rows = [
      {
        generated_at: new Date(generatedAt).toISOString(),
        skip_reason: null,
        feedback_weight: -0.5,
        execution_result: {
          dismissal: { reason: 'not_now', mechanism_class: 'avoidance_pattern', topic_key: 'sig-now:*' },
        },
      },
      {
        generated_at: new Date(generatedAt).toISOString(),
        skip_reason: 'not_relevant',
        feedback_weight: -0.5,
        execution_result: {
          dismissal: { reason: 'never', mechanism_class: 'unowned_dependency', topic_key: 'sig-never:*' },
        },
      },
    ];

    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              gte: () => ({
                order: () => ({
                  limit: () => Promise.resolve({ data: rows, error: null }),
                }),
              }),
            }),
          }),
        }),
      }),
    } as never;

    // Day 5: not_now (3-day decay) has expired; never (90-day decay) is still active.
    vi.setSystemTime(generatedAt + 5 * 24 * 60 * 60 * 1000);
    const entriesDay5 = await collectActiveJudgmentSuppressionEntries(supabase, 'user-aaa-111');
    expect(entriesDay5.has('avoidance_pattern:sig-now:*')).toBe(false);
    expect(entriesDay5.has('unowned_dependency:sig-never:*')).toBe(true);
    expect(entriesDay5.get('unowned_dependency:sig-never:*')?.reason).toBe('never');

    // Day 60: never is still active (90-day decay).
    vi.setSystemTime(generatedAt + 60 * 24 * 60 * 60 * 1000);
    const entriesDay60 = await collectActiveJudgmentSuppressionEntries(supabase, 'user-aaa-111');
    expect(entriesDay60.has('unowned_dependency:sig-never:*')).toBe(true);

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
