import { describe, expect, it } from 'vitest';
import { evaluateRun, FIXTURES } from './holy-crap-multi-run-proof.fixtures';

describe('holy-crap multi-run proof fixtures', () => {
  it('keeps weak classes from winning across 10 deterministic runs', () => {
    const results = FIXTURES.map(evaluateRun);

    const passCount = results.filter((run) => run.judgment === 'PASS').length;
    const softFailCount = results.filter((run) => run.judgment === 'SOFT_FAIL').length;
    const hardFails = results.filter((run) => run.judgment === 'HARD_FAIL');

    const hardClassCounts = new Map<string, number>();
    for (const run of hardFails) {
      hardClassCounts.set(run.why, (hardClassCounts.get(run.why) ?? 0) + 1);
    }

    expect(passCount).toBeGreaterThanOrEqual(8);
    expect(softFailCount).toBeLessThanOrEqual(2);
    expect(hardFails.length).toBe(0);

    for (const [, count] of hardClassCounts) {
      expect(count).toBeLessThan(2);
    }

    for (const run of results) {
      expect(run.afterTop3).toHaveLength(3);
      expect(run.actionableTop3).toBe(true);
      expect(run.persistedCleanly).toBe(true);
      expect(run.sendDecisionValid).toBe(true);
      expect(run.nonGenericWinner).toBe(true);
      expect(run.finishedWork).toBe(true);
    }
  });
});
