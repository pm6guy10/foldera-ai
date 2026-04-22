import { describe, expect, it } from 'vitest';
import { parseSignalSnippetWithFullBody } from '../generator';

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
