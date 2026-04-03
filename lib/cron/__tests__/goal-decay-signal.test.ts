import { describe, expect, it } from 'vitest';
import { signalReinforcesGoalKeywords } from '../goal-refresh';

describe('signalReinforcesGoalKeywords (CE-5)', () => {
  it('returns true when two keywords hit the same signal', () => {
    const keywords = ['mas3', 'yadira', 'interview'];
    const texts = ['schedule the mas3 interview with yadira next week'];
    expect(signalReinforcesGoalKeywords(keywords, texts)).toBe(true);
  });

  it('returns false when fewer than two keywords match', () => {
    const keywords = ['mas3', 'yadira'];
    const texts = ['unrelated email about groceries'];
    expect(signalReinforcesGoalKeywords(keywords, texts)).toBe(false);
  });
});
