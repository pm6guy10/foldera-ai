/**
 * Free dry-run “production comparison”: no Gmail API, no DB, no paid calls.
 * Proves query shapes for the same `after:` window and models how strict
 * `-category:promotions` can yield zero list hits when all matching mail is tabbed Promotions.
 */
import { describe, expect, it } from 'vitest';
import {
  buildGmailMessagesListQuery,
  gmailIngestQueryPairDry,
  gmailSearchAfterDateClause,
} from '../gmail-query';

/** Fixture: mimics an inbox where every post-cutoff thread is in Promotions — strict q returns none. */
function simulateMessagesListCountDry(q: string): { count: number; sampleIds: string[] } {
  if (q.includes('-category:promotions')) {
    return { count: 0, sampleIds: [] };
  }
  return {
    count: 4,
    sampleIds: ['18f0a1b2c3d4e5f6', '18f0a1b2c3d4e5f7', '18f0a1b2c3d4e5f8', '18f0a1b2c3d4e5f9'],
  };
}

/** Hypothetical tkg_signals rows that would be inserted = one per distinct message id in dry list. */
function dryInsertedSignalCount(messageIds: string[]): number {
  return messageIds.length;
}

describe('Gmail ingest — promotions filter dry comparison (no API)', () => {
  const sinceEndOfMar27Utc = Date.parse('2026-03-27T23:59:59.999Z');

  it('same window: query strings differ only by -category:promotions', () => {
    const pair = gmailIngestQueryPairDry(sinceEndOfMar27Utc);
    expect(pair.afterDate).toBe('2026/03/27');
    expect(pair.inclusiveOfPromotionsTab.q).toBe('after:2026/03/27 -in:spam -in:trash');
    expect(pair.strictExcludePromotions.q).toBe('after:2026/03/27 -in:spam -in:trash -category:promotions');
  });

  it('dry-run counts + sample IDs: strict can eliminate all mail (fixture model)', () => {
    const afterDate = gmailSearchAfterDateClause(sinceEndOfMar27Utc);
    const qStrict = buildGmailMessagesListQuery(afterDate, { excludePromotions: true });
    const qInclusive = buildGmailMessagesListQuery(afterDate, { excludePromotions: false });

    const strictResult = simulateMessagesListCountDry(qStrict);
    const inclusiveResult = simulateMessagesListCountDry(qInclusive);

    expect(strictResult).toEqual({ count: 0, sampleIds: [] });
    expect(inclusiveResult.count).toBe(4);
    expect(inclusiveResult.sampleIds).toHaveLength(4);

    const beforeInserts = dryInsertedSignalCount(strictResult.sampleIds);
    const afterInserts = dryInsertedSignalCount(inclusiveResult.sampleIds);
    expect(beforeInserts).toBe(0);
    expect(afterInserts).toBe(4);
  });

  it('documents falsifiable production check (operator runs two searches in Gmail UI)', () => {
    const pair = gmailIngestQueryPairDry(sinceEndOfMar27Utc);
    expect(pair.strictExcludePromotions.q).toContain('after:2026/03/27');
    expect(pair.inclusiveOfPromotionsTab.q).not.toContain('promotions');
  });
});
