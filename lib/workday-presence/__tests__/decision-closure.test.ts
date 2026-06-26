import { describe, it, expect } from 'vitest';
import {
  buildCoverageLine,
  buildContinuityLine,
  type ClaimIdentity,
} from '../decision-closure';

describe('buildCoverageLine — coverage-assurance, not display', () => {
  it('states the surveyed field size without listing it', () => {
    expect(buildCoverageLine(11)).toBe(
      'Checked 11 other open loops — none outranks this right now.',
    );
  });

  it('singularizes one competitor', () => {
    expect(buildCoverageLine(1)).toBe(
      'Checked 1 other open loop — none outranks this right now.',
    );
  });

  it('returns null when there is no field to survey (asserting coverage we did not do is false authority)', () => {
    expect(buildCoverageLine(0)).toBeNull();
    expect(buildCoverageLine(-3)).toBeNull();
    expect(buildCoverageLine(Number.NaN)).toBeNull();
  });
});

describe('buildContinuityLine — maintained judgment, not a fresh guess', () => {
  const claim = (key: string | null, label?: string | null): ClaimIdentity => ({ key, label });

  it('stays quiet on the first claim (no prior to be continuous with)', () => {
    expect(buildContinuityLine(null, claim('c1'))).toBeNull();
    expect(buildContinuityLine(claim(null), claim('c1'))).toBeNull();
    expect(buildContinuityLine(claim('  '), claim('c1'))).toBeNull();
  });

  it('affirms stability when the same claim holds', () => {
    expect(buildContinuityLine(claim('c1'), claim('c1'))).toBe(
      'Still the top priority since last time.',
    );
  });

  it('names what was displaced when the claim shifts', () => {
    expect(
      buildContinuityLine(claim('c1', 'Reply to Jacob Santoyo'), claim('c2')),
    ).toBe('New top priority — "Reply to Jacob Santoyo" is no longer the most urgent.');
  });

  it('announces a shift even without a prior label', () => {
    expect(buildContinuityLine(claim('c1'), claim('c2'))).toBe(
      'New top priority since last time.',
    );
  });

  it('does not fabricate a reason for the shift (v1 states the move, not an invented cause)', () => {
    const line = buildContinuityLine(claim('c1', 'Old thing'), claim('c2'));
    expect(line).not.toMatch(/because/i);
  });
});
