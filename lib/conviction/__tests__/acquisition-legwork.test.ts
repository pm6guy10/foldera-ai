/**
 * Acquisition legwork — "card IS the act" for write_document (#546).
 *
 * Proves the purchase/prep class (the Nathaniel-birthday checklist) now hands over a
 * FINISHED act — the chosen thing plus a real, grounded link — instead of a homework plan,
 * and that the finished artifact clears the live importance bar (evaluateBottomGate).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ConvictionDirective } from '@/lib/briefing/types';
import {
  isAcquisitionDirective,
  buildAcquisitionSearchQuery,
  buildAcquisitionArtifactFromSearch,
} from '../acquisition-legwork';
import { evaluateBottomGate } from '@/lib/cron/daily-brief-generate';

// generateArtifact pulls db/anthropic/logging through the module graph — same mock set the
// sibling artifact-generator test uses, so the wiring test runs without live calls.
const { mockSearch } = vi.hoisted(() => ({ mockSearch: vi.fn() }));
vi.mock('@/lib/scout/web-search', () => ({ searchWebForEnrichment: mockSearch }));
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(function () {
    return { messages: { create: vi.fn() } };
  }),
}));
vi.mock('@/lib/db/client', () => {
  const ch: any = {};
  ['select', 'eq', 'neq', 'gte', 'order'].forEach((m) => {
    ch[m] = () => ch;
  });
  ch.limit = () => Promise.resolve({ data: [], error: null });
  ch.maybeSingle = () => Promise.resolve({ data: null, error: null });
  return { createServerClient: () => ({ from: () => ch }) };
});
vi.mock('@/lib/utils/api-tracker', () => ({ trackApiCall: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/encryption', () => ({
  decryptWithStatus: vi.fn((v: string) => ({ plaintext: v, usedFallback: false })),
}));
vi.mock('@/lib/utils/structured-logger', () => ({ logStructuredEvent: vi.fn() }));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

const giftDirective: ConvictionDirective = {
  directive: 'Buy a birthday gift for Nathaniel before 2026-07-04',
  action_type: 'write_document',
  confidence: 80,
  reason: "Nathaniel's birthday is 2026-07-04 and no gift is ordered yet.",
  evidence: [
    { type: 'commitment', description: 'Commitment: get Nathaniel a birthday present', date: '2026-06-20' },
  ],
};

const SOURCE_CITED_SUMMARY =
  'LEGO Botanicals Orchid (set 10311) is a well-reviewed buildable gift, available now for $49.99. ' +
  'Source: https://www.lego.com/en-us/product/orchid-10311';

describe('isAcquisitionDirective', () => {
  it('detects a purchase/gift write_document move', () => {
    expect(isAcquisitionDirective(giftDirective)).toBe(true);
  });

  it('ignores send_message and non-acquisition write_documents', () => {
    expect(isAcquisitionDirective({ ...giftDirective, action_type: 'send_message' })).toBe(false);
    expect(
      isAcquisitionDirective({
        ...giftDirective,
        directive: 'Write a decision memo on the ACME renewal',
        reason: 'Decision lock needed before the deadline.',
      }),
    ).toBe(false);
  });

  it('does not collide with the dedicated finished-work paths', () => {
    expect(
      isAcquisitionDirective({
        ...giftDirective,
        directive: 'Buy the accepted .docx documents for the collection',
      }),
    ).toBe(false);
  });
});

describe('buildAcquisitionSearchQuery', () => {
  it('asks for one concrete pick + link, not a list of steps', () => {
    const q = buildAcquisitionSearchQuery(giftDirective);
    expect(q).toContain('Nathaniel');
    expect(q.toLowerCase()).toContain('url');
    expect(q.toLowerCase()).toContain('single best concrete pick');
  });
});

describe('buildAcquisitionArtifactFromSearch', () => {
  it('produces a finished pick + real link, never a homework checklist', () => {
    const art = buildAcquisitionArtifactFromSearch(giftDirective, SOURCE_CITED_SUMMARY);
    expect(art).not.toBeNull();
    expect(art!.type).toBe('document');
    expect(art!.content).toContain('https://www.lego.com/en-us/product/orchid-10311');
    expect(art!.content).toContain('THE PICK');
    expect(art!.content).toContain('NEXT PHYSICAL STEP');
    expect(art!.title).toContain('Nathaniel');
    // Not a multi-step user to-do list.
    expect(art!.content).not.toMatch(/^\s*(?:[-*]|\d+\.)\s*(?:decide|wrap|confirm|choose)/im);
  });

  it('returns null (degrades, never fabricates) when no link is grounded', () => {
    expect(buildAcquisitionArtifactFromSearch(giftDirective, 'No reliable result found.')).toBeNull();
    expect(buildAcquisitionArtifactFromSearch(giftDirective, '')).toBeNull();
    expect(buildAcquisitionArtifactFromSearch(giftDirective, null)).toBeNull();
  });

  it('clears the live importance bar (evaluateBottomGate)', () => {
    const art = buildAcquisitionArtifactFromSearch(giftDirective, SOURCE_CITED_SUMMARY)!;
    const gate = evaluateBottomGate(giftDirective, art);
    expect(gate.blocked_reasons).toEqual([]);
    expect(gate.pass).toBe(true);
  });
});

describe('generateArtifact wiring', () => {
  beforeEach(() => {
    mockSearch.mockReset();
  });

  it('does the legwork and returns the pick + link doc for acquisition moves', async () => {
    mockSearch.mockResolvedValue(SOURCE_CITED_SUMMARY);
    const { generateArtifact } = await import('../artifact-generator');
    const art = await generateArtifact('user-1', giftDirective);
    expect(mockSearch).toHaveBeenCalledTimes(1);
    expect(art).not.toBeNull();
    expect((art as any).content).toContain('https://www.lego.com/en-us/product/orchid-10311');
  });

  it('falls through to the normal path when the lookup is off / grounds nothing', async () => {
    mockSearch.mockResolvedValue(null);
    const { generateArtifact } = await import('../artifact-generator');
    const art = await generateArtifact('user-1', giftDirective);
    // No fabricated link: either a decisive brief or null, never the invented "Order it here".
    if (art) {
      expect((art as any).content ?? '').not.toContain('Order it here: undefined');
    }
    expect(mockSearch).toHaveBeenCalledTimes(1);
  });
});
