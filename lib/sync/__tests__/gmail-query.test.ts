import { describe, expect, it } from 'vitest';
import {
  buildGmailIncrementalListQuery,
  buildGmailMessagesListQuery,
  gmailIngestQueryPairDry,
  gmailNewerThanClause,
  gmailSearchAfterDateClause,
} from '../gmail-query';

describe('gmailSearchAfterDateClause', () => {
  it('uses yyyy/mm/dd from UTC calendar components (legacy after: helper)', () => {
    const ms = Date.UTC(2026, 2, 27, 15, 30, 0);
    expect(gmailSearchAfterDateClause(ms)).toBe('2026/03/27');
  });
});

describe('gmailNewerThanClause', () => {
  it('uses at least 1h for sub-hour windows', () => {
    const now = Date.UTC(2026, 4, 1, 12, 0, 0);
    const since = Date.UTC(2026, 4, 1, 11, 59, 30);
    expect(gmailNewerThanClause(since, now)).toBe('newer_than:1h');
  });

  it('uses hours up to one week', () => {
    const now = Date.UTC(2026, 4, 8, 12, 0, 0);
    const since = Date.UTC(2026, 4, 8, 4, 0, 0);
    expect(gmailNewerThanClause(since, now)).toBe('newer_than:8h');
  });

  it('uses days beyond one week', () => {
    const now = Date.UTC(2026, 4, 8, 12, 0, 0);
    const since = Date.UTC(2026, 3, 1, 12, 0, 0);
    expect(gmailNewerThanClause(since, now)).toMatch(/^newer_than:\d+d$/);
  });
});

describe('buildGmailIncrementalListQuery', () => {
  it('combines newer_than with spam/trash filters', () => {
    const now = Date.UTC(2026, 4, 8, 12, 0, 0);
    const since = Date.UTC(2026, 4, 8, 11, 0, 0);
    expect(buildGmailIncrementalListQuery(since, now)).toBe('newer_than:1h -in:spam -in:trash');
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
