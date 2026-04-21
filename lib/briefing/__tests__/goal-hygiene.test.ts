import { describe, expect, it } from 'vitest';
import { isUsableGoalRow } from '../goal-hygiene';

describe('isUsableGoalRow', () => {
  it('rejects manual constraint-note goals from prompt/scoring context', () => {
    expect(
      isUsableGoalRow({
        source: 'manual',
        goal_text:
          'DO NOT suggest contacting Keri Nopens until Brandon has stable employment with a current supervisor reference. Post-MAS3 only.',
      }),
    ).toBe(false);
  });

  it('rejects low-quality inferred behavior theme rows', () => {
    expect(
      isUsableGoalRow({
        source: 'extracted',
        goal_text: 'Inferred from behavior: recurring theme "has in" (116 signals in 14 days)',
      }),
    ).toBe(false);
  });

  it('keeps real user goals', () => {
    expect(
      isUsableGoalRow({
        source: 'manual',
        goal_text: 'Build Foldera into a revenue-generating product.',
      }),
    ).toBe(true);
  });
});
