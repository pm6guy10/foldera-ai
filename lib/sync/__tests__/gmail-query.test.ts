import { describe, expect, it } from 'vitest';
import { gmailSearchAfterDateClause } from '../gmail-query';

describe('gmailSearchAfterDateClause', () => {
  it('uses yyyy/mm/dd UTC for Gmail after: operator (not Unix seconds)', () => {
    const ms = Date.UTC(2026, 2, 27, 15, 30, 0);
    expect(gmailSearchAfterDateClause(ms)).toBe('2026/03/27');
  });
});
