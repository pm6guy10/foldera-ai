/**
 * Regression tests for analysis dump leak prevention in artifact-generator.
 *
 * Proof case: tkg_actions row f756c56f — type=document, content started with
 * "INSIGHT: Financial runway..." — raw scoring metadata surfaced to user.
 *
 * Two defenses under test:
 *   Fix 1 — generateArtifact catch block: analysis dumps in embeddedArtifact.context
 *            are no longer shortcut-converted to raw document content.
 *   Fix 2 — validateArtifact write_document: hard-rejects any document content
 *            that matches isAnalysisDump() (defense-in-depth).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateArtifact } from '../artifact-generator';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockCreate } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}));

vi.mock('@/lib/db/client', () => {
  // Chainable query builder — every method returns itself so any query
  // chain terminates cleanly without needing per-path stubs.
  const ch: any = {};
  ['select', 'eq', 'neq', 'gte', 'order'].forEach((m) => {
    ch[m] = () => ch;
  });
  ch.limit = () => Promise.resolve({ data: [], error: null });
  ch.maybeSingle = () => Promise.resolve({ data: null, error: null });
  return { createServerClient: () => ({ from: () => ch }) };
});

vi.mock('@/lib/utils/api-tracker', () => ({
  trackApiCall: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/encryption', () => ({
  decryptWithStatus: vi.fn((v: string) => ({ plaintext: v, usedFallback: false })),
}));

vi.mock('@/lib/utils/structured-logger', () => ({
  logStructuredEvent: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Exact format that leaks from buildFullContext() in generator.ts */
const ANALYSIS_DUMP =
  'INSIGHT: test\n\nWHY NOW: test\n\nWinning loop: test\n\nRunner-ups rejected:\n- test';
const HOSTILE_META_DUMP =
  'Insight - drift\nWhy now - timing\nThis candidate won because score: 4.7\nRunner ups rejected because low tractability\nClient asked for revised budget by Friday.';

function anthropicResponse(content: string) {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ type: 'document', title: 'Test Title', content }),
      },
    ],
    usage: { input_tokens: 10, output_tokens: 20 },
  };
}

const BASE_WRITE_DOCUMENT_DIRECTIVE: any = {
  action_type: 'write_document',
  directive: 'Address financial runway concern',
  reason: '',
  evidence: [],
  requires_search: false,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('artifact-generator — analysis dump leak prevention', () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it('does not surface raw analysis dump when embeddedArtifact.context is an analysis dump (Fix 1)', async () => {
    // Before the fix: the catch-block shortcut would have returned the analysis dump
    // verbatim as document content. After the fix: isAnalysisDump() is false in the
    // condition, so the shortcut is skipped and the generator falls through to LLM
    // generation, which returns clean content.
    mockCreate.mockResolvedValue(
      anthropicResponse('This is clean and actionable content.'),
    );

    const directive: any = {
      ...BASE_WRITE_DOCUMENT_DIRECTIVE,
      embeddedArtifact: {
        type: 'wait_rationale',
        context: ANALYSIS_DUMP,
      },
    };

    const result = await generateArtifact('user-1', directive);

    expect(result).not.toBeNull();
    const content = (result as any)?.content ?? '';
    expect(content).not.toMatch(/Runner-ups rejected:/);
    expect(content).not.toMatch(/Winning loop:/);
    expect(content).not.toMatch(/^INSIGHT:/m);
    expect(content).not.toMatch(/^WHY NOW:/m);
  });

  it('uses emergency write_document when LLM returns a raw analysis dump (validateArtifact rejects; generator still returns artifact)', async () => {
    // validateArtifact hard-rejects analysis-shaped document content; generateArtifact
    // must still return an emergency_fallback document so the brief pipeline does not stop at null.
    mockCreate.mockResolvedValue(anthropicResponse(ANALYSIS_DUMP));

    const result = await generateArtifact('user-1', { ...BASE_WRITE_DOCUMENT_DIRECTIVE });

    expect(result).not.toBeNull();
    expect((result as any).type).toBe('document');
    expect((result as any).emergency_fallback).toBe(true);
    // Emergency uses directive.fullContext when set; fixture has none — falls back to directive text.
    expect((result as any).content).toBe('Address financial runway concern');
  });

  it('accepts a clean finished write_document artifact', async () => {
    const directive: any = {
      ...BASE_WRITE_DOCUMENT_DIRECTIVE,
      fullContext: 'Action Plan\n\n1. Draft the final proposal package.\n2. Send it by 4pm with explicit approval ask.',
    };

    const result = await generateArtifact('user-1', directive);

    expect(result).toEqual({
      type: 'document',
      title: 'Address financial runway concern',
      content: 'Action Plan\n\n1. Draft the final proposal package.\n2. Send it by 4pm with explicit approval ask.',
    });
  });

  it('falls back to emergency document when LLM returns hostile meta commentary as content', async () => {
    mockCreate.mockResolvedValue(anthropicResponse(HOSTILE_META_DUMP));

    const result = await generateArtifact('user-1', { ...BASE_WRITE_DOCUMENT_DIRECTIVE });

    expect(result).not.toBeNull();
    expect((result as any).emergency_fallback).toBe(true);
    expect((result as any).content.length).toBeGreaterThan(20);
  });

  it('fallback repair path returns finished document text, not analysis scaffolding', async () => {
    mockCreate.mockResolvedValue(anthropicResponse(ANALYSIS_DUMP));

    const directive: any = {
      ...BASE_WRITE_DOCUMENT_DIRECTIVE,
      fullContext: HOSTILE_META_DUMP,
    };

    const result = await generateArtifact('user-1', directive);

    expect(result).not.toBeNull();
    const content = (result as any).content as string;
    expect(content).not.toMatch(/insight/i);
    expect(content).not.toMatch(/why now/i);
    expect(content).not.toMatch(/runner[\s-]?ups?/i);
    expect(content).not.toMatch(/rejected because/i);
    expect(content).not.toMatch(/this candidate/i);
  });
});
