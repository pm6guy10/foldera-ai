import { describe, expect, it } from 'vitest';
import { parseGeneratedPayload, parseSignalSnippetWithFullBody } from '../generator';

describe('parseSignalSnippetWithFullBody (interview write_document hydration)', () => {
  it('preserves full mail body beyond the 1.5k standard snippet cap', () => {
    const longTail = 'Q'.repeat(4000);
    const plaintext = [
      '[Email received: 2026-04-17T15:25:35Z]',
      'From: recruiter@agency.gov',
      'To: user@example.com',
      'Subject: Interview logistics and prep',
      `Body preview: Hello — here are the panel questions for your screen. ${longTail}`,
    ].join('\n');

    const row = {
      id: 'sig-1',
      source: 'outlook',
      occurred_at: '2026-04-17T15:25:35Z',
      author: 'recruiter@agency.gov',
      type: 'email_received',
    };

    const s = parseSignalSnippetWithFullBody(plaintext, row, 12_000);
    expect(s).not.toBeNull();
    expect(s!.snippet.length).toBeGreaterThan(3500);
    expect(s!.subject).toContain('Interview logistics');
  });

  it('truncates with explicit notice when over maxChars', () => {
    const plaintext = 'Z'.repeat(5000);
    const row = {
      id: 'sig-2',
      source: 'gmail',
      occurred_at: '2026-01-01T00:00:00Z',
      author: 'a@b.com',
      type: 'email_received',
    };
    const s = parseSignalSnippetWithFullBody(plaintext, row, 1000);
    expect(s!.snippet).toContain('[truncated');
    expect(s!.snippet.length).toBeLessThanOrEqual(1100);
  });
});

describe('parseGeneratedPayload (legacy write_document hydration)', () => {
  it('adds write_document metadata for legacy interview-shaped payloads', () => {
    const raw = JSON.stringify({
      action_type: 'write_document',
      directive_text: 'Alex sent interview confirmation April 21. Here is your prep sheet for April 29.',
      confidence: 72,
      reason: 'Interview is 7 days away; calendar time differs from email.',
      artifact: {
        type: 'document',
        title: 'Interview prep',
        content: 'Confirmed interview with candidate Alex for Care Coordinator role on April 29, 2026.',
      },
    });

    expect(parseGeneratedPayload(raw)).toMatchObject({
      artifact_type: 'write_document',
      artifact: expect.objectContaining({
        document_purpose: 'decision memo',
        target_reader: 'decision owner',
        title: 'Interview prep',
      }),
    });
  });
});
