import { describe, expect, it } from 'vitest';
import { estimateMonthlyBurnFromSignalAmounts } from '../monthly-burn-inference';

describe('estimateMonthlyBurnFromSignalAmounts (CE-2 recurring proxy)', () => {
  it('returns null when fewer than two qualifying amounts and no recurring days', () => {
    expect(estimateMonthlyBurnFromSignalAmounts([{ amounts: [100], dateKey: '2026-01-01' }])).toBeNull();
    expect(estimateMonthlyBurnFromSignalAmounts([])).toBeNull();
  });

  it('uses legacy top-five sum when no amount repeats on 2+ days', () => {
    const burn = estimateMonthlyBurnFromSignalAmounts([
      { amounts: [200, 100], dateKey: '2026-01-01' },
      { amounts: [150], dateKey: '2026-01-02' },
    ]);
    expect(burn).toBe(Math.round([200, 150, 100].slice(0, 5).reduce((s, n) => s + n, 0)));
  });

  it('prefers same rounded amount on two distinct days (recurring)', () => {
    const burn = estimateMonthlyBurnFromSignalAmounts([
      { amounts: [1200.1], dateKey: '2026-01-01' },
      { amounts: [1199.9], dateKey: '2026-02-01' },
      { amounts: [50], dateKey: '2026-01-03' },
    ]);
    expect(burn).toBe(1200);
  });

  it('ignores amounts outside 50–5000', () => {
    expect(
      estimateMonthlyBurnFromSignalAmounts([
        { amounts: [10, 6000], dateKey: '2026-01-01' },
        { amounts: [20], dateKey: '2026-01-02' },
      ]),
    ).toBeNull();
  });

  it('uses 3+ occurrences of same rounded amount on one day as weak recurring (CE-2)', () => {
    const burn = estimateMonthlyBurnFromSignalAmounts([
      { amounts: [450], dateKey: '2026-01-10' },
      { amounts: [450], dateKey: '2026-01-10' },
      { amounts: [450], dateKey: '2026-01-10' },
    ]);
    expect(burn).toBe(450);
  });

  it('prefers strong recurring (2+ days) over weak same-day repetition', () => {
    const burn = estimateMonthlyBurnFromSignalAmounts([
      { amounts: [300], dateKey: '2026-01-01' },
      { amounts: [300], dateKey: '2026-01-02' },
      { amounts: [900, 900, 900], dateKey: '2026-01-03' },
    ]);
    expect(burn).toBe(300);
  });
});
