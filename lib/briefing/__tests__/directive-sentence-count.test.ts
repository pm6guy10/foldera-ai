import { describe, expect, it } from 'vitest';
import { countSentences } from '../generator';

describe('countSentences (directive validation)', () => {
  it('does not split on dots inside email addresses', () => {
    expect(
      countSentences('Email keri.nopens@dshs.wa.gov about the April deadline cluster.'),
    ).toBe(1);
  });

  it('still counts two real sentences', () => {
    expect(countSentences('Do the first thing. Then do the second.')).toBe(2);
  });

  it('does not treat trailing year period as a second sentence when no space follows', () => {
    expect(countSentences('Apply to Keri by Apr 10, 2026.')).toBe(1);
  });
});
