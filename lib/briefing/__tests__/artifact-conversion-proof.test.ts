import { describe, expect, it } from 'vitest';
import { FIXTURES, evaluateRun } from './holy-crap-multi-run-proof.fixtures';

describe('artifact conversion decision-enforcement proof', () => {
  it('forces movement across 5 high-signal discrepancy cases', () => {
    const runs = FIXTURES.slice(0, 5).map(evaluateRun);

    const pressureRegex = /\b(if we miss|otherwise|risk|blocked|deadline|cutoff|consequence)\b/i;
    const pressureCount = runs.filter((run) => {
      const artifact = run.artifact as Record<string, unknown>;
      const text = `${artifact.body ?? ''}\n${artifact.content ?? ''}`;
      return pressureRegex.test(text);
    }).length;

    for (const run of runs) {
      expect(run.judgment).toBe('PASS');
      expect(run.discrepancyOrOutcomeMoving).toBe(true);
      expect(run.nonGenericWinner).toBe(true);
      expect(run.directlyApprovable).toBe(true);
      expect(run.finishedWork).toBe(true);
      expect(run.persistedCleanly).toBe(true);
    }

    expect(pressureCount).toBeGreaterThanOrEqual(3);
  });
});

