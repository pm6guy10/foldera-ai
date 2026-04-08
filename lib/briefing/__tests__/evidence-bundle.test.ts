import { describe, expect, it } from 'vitest';
import {
  buildEvidenceBundleReceipt,
  buildPromptFromStructuredContext,
} from '../generator';
import type { StructuredContext } from '../generator';

describe('buildEvidenceBundleReceipt', () => {
  it('counts combined distinct sources across supporting and life_context', () => {
    const ctx = {
      supporting_signals: [
        { source: 'gmail', occurred_at: '2026-01-01', entity: null, summary: 'a', direction: 'received' as const },
        { source: 'outlook', occurred_at: '2026-01-02', entity: null, summary: 'b', direction: 'received' as const },
      ],
      life_context_signals: [
        { source: 'google_calendar', occurred_at: '2026-01-03', entity: null, summary: 'c', direction: 'unknown' as const },
      ],
    } as unknown as StructuredContext;

    const r = buildEvidenceBundleReceipt(ctx);
    expect(r.supporting_signal_source_count).toBe(2);
    expect(r.combined_distinct_source_count).toBe(3);
    expect(r.meets_three_source_bar).toBe(true);
    expect(r.combined_distinct_sources).toEqual(['gmail', 'google_calendar', 'outlook']);
  });

  it('meets_three_source_bar false when fewer than three sources', () => {
    const ctx = {
      supporting_signals: [
        { source: 'gmail', occurred_at: '2026-01-01', entity: null, summary: 'a', direction: 'received' as const },
      ],
      life_context_signals: [],
    } as unknown as StructuredContext;

    const r = buildEvidenceBundleReceipt(ctx);
    expect(r.meets_three_source_bar).toBe(false);
  });
});

describe('buildPromptFromStructuredContext recipient-short', () => {
  it('includes [source] on RECENT_SIGNALS lines', () => {
    const ctx = {
      has_real_recipient: true,
      recipient_brief: 'Alex Person <alex@example.com>',
      supporting_signals: [
        {
          source: 'outlook',
          occurred_at: '2026-02-01',
          entity: 'bob@example.com',
          summary: 'Hello',
          direction: 'received' as const,
        },
      ],
      life_context_signals: [],
      already_sent_14d: [],
      recent_action_history_7d: [],
      confidence_prior: 75,
      user_full_name: 'the user',
      user_first_name: '',
    } as unknown as StructuredContext;
    const prompt = buildPromptFromStructuredContext(ctx, 'send_message');
    expect(prompt).toContain('[outlook]');
    expect(prompt).toContain('RECENT_SIGNALS:');
  });

  it('injects LIFE_CONTEXT when life_context_signals present', () => {
    const ctx = {
      has_real_recipient: true,
      recipient_brief: 'Alex Person <alex@example.com>',
      supporting_signals: [],
      life_context_signals: [
        {
          source: 'drive',
          occurred_at: '2026-02-02',
          entity: 'self',
          summary: 'Resume.docx modified',
          direction: 'unknown' as const,
        },
      ],
      already_sent_14d: [],
      recent_action_history_7d: [],
      confidence_prior: 75,
      user_full_name: 'the user',
      user_first_name: '',
    } as unknown as StructuredContext;
    const prompt = buildPromptFromStructuredContext(ctx, 'send_message');
    expect(prompt).toContain('LIFE_CONTEXT');
    expect(prompt).toContain('[drive]');
    expect(prompt).toContain('LIFE_CONTEXT_WEAVE');
  });
});
