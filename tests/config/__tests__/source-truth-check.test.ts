import { describe, expect, it } from 'vitest';
import { runContinuityGate } from '@/scripts/continuity-gate';
import { runSourceTruthCheck } from '@/scripts/source-truth-check';

describe('source truth command gate', () => {
  it('delegates to the continuity gate (single enforcement surface)', () => {
    expect(runSourceTruthCheck(process.cwd())).toEqual(runContinuityGate(process.cwd()));
  });

  it('passes against the real repo', () => {
    expect(runSourceTruthCheck(process.cwd())).toEqual([]);
  });
});
