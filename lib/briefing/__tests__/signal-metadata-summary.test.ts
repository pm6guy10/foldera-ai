import { describe, expect, it } from 'vitest';
import { buildSignalMetadataSummaryRows } from '../signal-metadata-summary';

describe('buildSignalMetadataSummaryRows', () => {
  it('builds scorer-safe metadata summaries without full body content', () => {
    const rows = buildSignalMetadataSummaryRows([
      {
        id: 'sig-1',
        source: 'gmail',
        type: 'email_received',
        occurred_at: '2026-04-20T12:00:00.000Z',
        author: 'Alex Rivera <alex@clientco.com>',
        source_id: 'gmail-1',
      },
      {
        id: 'sig-2',
        source: 'gmail',
        type: 'email_received',
        occurred_at: '2026-04-19T12:00:00.000Z',
        author: 'Alex Rivera <alex@clientco.com>',
        source_id: 'gmail-2',
      },
      {
        id: 'sig-3',
        source: 'outlook_calendar',
        type: 'calendar_event',
        occurred_at: '2026-04-22T09:00:00.000Z',
        author: 'Jordan Hiring <jordan@agency.gov>',
        source_id: 'cal-1',
      },
    ]);

    expect(rows).toHaveLength(3);
    expect(rows[0].thread_size).toBe(2);
    expect(rows[0].content).toContain('[Email received metadata]');
    expect(rows[0].content).toContain('From: Alex Rivera <alex@clientco.com>');
    expect(rows[0].content).toContain('Thread messages (metadata window): 2');
    expect(rows[0].content).not.toContain('Body:');

    expect(rows[2].thread_size).toBe(1);
    expect(rows[2].content).toContain('[Calendar event: Metadata only]');
    expect(rows[2].content).toContain('Start: 2026-04-22T09:00:00.000Z');
    expect(rows[2].content).not.toContain('Subject:');
  });
});
