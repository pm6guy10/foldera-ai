import { describe, it, expect } from 'vitest';
import {
  buildConvictionLine,
  buildCoverageLine,
  buildContinuityLine,
  shortenObjectiveLabel,
  type ClaimIdentity,
  type ConvictionRunnerUp,
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

describe('shortenObjectiveLabel — the objective, not the search terms', () => {
  it('cuts the stated-goal keyword tail at the em-dash', () => {
    expect(
      shortenObjectiveLabel(
        'Ship Foldera and onboard the first paying customer — launch, demo, signup, onboard, revenue, paying user, pricing, sales',
      ),
    ).toBe('Ship Foldera and onboard the first paying customer');
  });

  it('cuts at an opening paren too', () => {
    expect(
      shortenObjectiveLabel(
        'Keep Foldera shippable (Supabase, Vercel, deploy, outage, error, invoice)',
      ),
    ).toBe('Keep Foldera shippable');
  });

  it('caps long labels with an ellipsis', () => {
    const label = shortenObjectiveLabel('x'.repeat(80));
    expect(label).toHaveLength(58); // 57 chars + ellipsis
    expect(label?.endsWith('…')).toBe(true);
  });

  it('returns null on empty input', () => {
    expect(shortenObjectiveLabel(null)).toBeNull();
    expect(shortenObjectiveLabel('')).toBeNull();
    expect(shortenObjectiveLabel('   ')).toBeNull();
  });
});

describe('buildConvictionLine — why this one beat the rest', () => {
  const runnerUp = (title: string, killReason: ConvictionRunnerUp['killReason'] = 'not_now') => ({
    title,
    killReason,
  });

  it('names the anchor, the beaten runner-up, and the size of the rest of the field', () => {
    expect(
      buildConvictionLine({
        objectiveLabel: 'Ship Foldera and onboard the first paying customer',
        runnerUps: [runnerUp('Renew domain autopay')],
        candidateCount: 11,
      }),
    ).toBe(
      'Ranked against "Ship Foldera and onboard the first paying customer" · beat "Renew domain autopay" (important, not today) and 9 others.',
    );
  });

  it('singularizes one remaining loop and omits the tail when the field was just the two', () => {
    expect(
      buildConvictionLine({
        objectiveLabel: 'Ship Foldera',
        runnerUps: [runnerUp('Renew domain autopay')],
        candidateCount: 3,
      }),
    ).toContain('and 1 other.');
    expect(
      buildConvictionLine({
        objectiveLabel: 'Ship Foldera',
        runnerUps: [runnerUp('Renew domain autopay')],
        candidateCount: 2,
      }),
    ).toBe('Ranked against "Ship Foldera" · beat "Renew domain autopay" (important, not today).');
  });

  it('translates every kill reason into plain judgment language, never scorer internals', () => {
    const line = (reason: ConvictionRunnerUp['killReason']) =>
      buildConvictionLine({
        objectiveLabel: 'Ship Foldera',
        runnerUps: [runnerUp('Something else', reason)],
        candidateCount: null,
      });
    expect(line('noise')).toContain('(urgent but off-goal)');
    expect(line('not_now')).toContain('(important, not today)');
    expect(line('trap')).toContain('(low follow-through)');
  });

  it('never fabricates: null without an objective anchor or without a clean runner-up', () => {
    expect(
      buildConvictionLine({ objectiveLabel: null, runnerUps: [runnerUp('X')], candidateCount: 5 }),
    ).toBeNull();
    expect(
      buildConvictionLine({ objectiveLabel: 'Ship Foldera', runnerUps: [], candidateCount: 5 }),
    ).toBeNull();
  });

  it('skips runner-up titles carrying UUID-like internal ids (the #606 lesson) and falls through to the next clean one', () => {
    expect(
      buildConvictionLine({
        objectiveLabel: 'Ship Foldera',
        runnerUps: [
          runnerUp('commitment 3f2a9b1c-77aa-4f00-9c1d-aaaa00001111 follow-up'),
          runnerUp('Renew domain autopay'),
        ],
        candidateCount: 4,
      }),
    ).toBe(
      'Ranked against "Ship Foldera" · beat "Renew domain autopay" (important, not today) and 2 others.',
    );
    expect(
      buildConvictionLine({
        objectiveLabel: 'Ship Foldera',
        runnerUps: [runnerUp('3f2a9b1c-77aa-4f00-9c1d-aaaa00001111')],
        candidateCount: 4,
      }),
    ).toBeNull();
  });

  it('caps a runaway runner-up title', () => {
    const line = buildConvictionLine({
      objectiveLabel: 'Ship Foldera',
      runnerUps: [runnerUp('y'.repeat(90))],
      candidateCount: null,
    });
    expect(line).toContain(`"${'y'.repeat(57)}…"`);
  });
});
