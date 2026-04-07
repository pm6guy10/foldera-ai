import { describe, expect, it } from 'vitest';
import {
  buildGmailMessagesListQuery,
  gmailIngestQueryPairDry,
  gmailSearchAfterDateClause,
} from '../gmail-query';

describe('gmailSearchAfterDateClause', () => {
  it('uses yyyy/mm/dd UTC for Gmail after: operator (not Unix seconds)', () => {
    const ms = Date.UTC(2026, 2, 27, 15, 30, 0);
    expect(gmailSearchAfterDateClause(ms)).toBe('2026/03/27');
  });
});

describe('buildGmailMessagesListQuery', () => {
  it('defaults to inclusive of Promotions tab (spam/trash excluded only)', () => {
    expect(buildGmailMessagesListQuery('2026/03/27')).toBe('after:2026/03/27 -in:spam -in:trash');
  });

  it('optional strict mode adds -category:promotions', () => {
    expect(buildGmailMessagesListQuery('2026/03/27', { excludePromotions: true })).toBe(
      'after:2026/03/27 -in:spam -in:trash -category:promotions',
    );
  });
});

describe('gmailIngestQueryPairDry', () => {
  it('returns both variants for one sinceMs', () => {
    const ms = Date.parse('2026-03-27T23:59:59.999Z');
    const p = gmailIngestQueryPairDry(ms);
    expect(p.inclusiveOfPromotionsTab.q).not.toContain('category');
    expect(p.strictExcludePromotions.q).toContain('-category:promotions');
  });
});
