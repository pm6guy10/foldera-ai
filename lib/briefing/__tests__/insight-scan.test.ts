import { describe, it, expect, vi, beforeEach } from 'vitest';

const createMock = vi.fn().mockImplementation(() => ({
  messages: {
    create: vi.fn().mockResolvedValue({
      content: [
        {
          type: 'text',
          text: '[]',
        },
      ],
      usage: { input_tokens: 500, output_tokens: 200 },
    }),
  },
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: createMock,
}));

vi.mock('@/lib/utils/api-tracker', () => ({
  getDailySpend: vi.fn().mockResolvedValue(0.01),
  trackApiCall: vi.fn().mockResolvedValue(undefined),
}));

const mockLogStructuredEvent = vi.fn();
vi.mock('@/lib/utils/structured-logger', () => ({
  logStructuredEvent: (...args: unknown[]) => mockLogStructuredEvent(...(args as [])),
}));

describe('runInsightScan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLogStructuredEvent.mockClear();
    createMock.mockImplementation(() => ({
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [
            {
              type: 'text',
              text: '[]',
            },
          ],
          usage: { input_tokens: 500, output_tokens: 200 },
        }),
      },
    }));
  });

  it('returns insight candidates from LLM response', async () => {
    const base = Date.now();
    const d0 = new Date(base).toISOString().split('T')[0];
    const d1 = new Date(base - 86400000).toISOString().split('T')[0];
    const d2 = new Date(base - 2 * 86400000).toISOString().split('T')[0];

    createMock.mockImplementation(() => ({
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [
            {
              type: 'text',
              text: JSON.stringify([
                {
                  title: 'You start strong then go silent',
                  pattern_type: 'behavioral',
                  confidence: 75,
                  evidence: `Signals on ${d0}, ${d1}, ${d2} show burst then drop-off`,
                  insight:
                    'Three threads in the window follow the same arc: intense activity then silence.',
                  suggested_action: 'write_document',
                  suggested_entity: 'Test Person',
                  suggested_entity_email: 'test@example.com',
                  grounding: `${d0} email_sent; ${d1} email_sent; ${d2} outlook_calendar`,
                },
              ]),
            },
          ],
          usage: { input_tokens: 500, output_tokens: 200 },
        }),
      },
    }));

    const { runInsightScan } = await import('../insight-scan');

    const signals = Array.from({ length: 15 }, (_, i) => ({
      id: `sig-${i}`,
      content: `Test signal content ${i}`,
      source: i % 2 === 0 ? 'email_received' : 'email_sent',
      type: 'email' as string | null,
      occurred_at: new Date(base - i * 86400000).toISOString(),
      author: i % 2 === 0 ? 'test@example.com' : null,
    }));

    const result = await runInsightScan({
      userId: 'test-user',
      decryptedSignals: signals,
      goals: [{ goal_text: 'Land a job', priority: 2, goal_category: 'career' }],
      entities: [{ name: 'Test Person', total_interactions: 10, primary_email: 'test@example.com' }],
    });

    expect(result.length).toBeGreaterThan(0);
    expect(result[0].pattern_type).toBe('behavioral');
    expect(result[0].confidence).toBeGreaterThanOrEqual(60);
    expect(result[0].title).toBeTruthy();
    expect(result[0].evidence_signals.length).toBeGreaterThanOrEqual(3);
  });

  it('returns empty array with insufficient signals', async () => {
    const { runInsightScan } = await import('../insight-scan');

    const result = await runInsightScan({
      userId: 'test-user',
      decryptedSignals: [
        {
          id: 'sig-1',
          content: 'One signal',
          source: 'email',
          type: null,
          occurred_at: new Date().toISOString(),
        },
      ],
      goals: [],
      entities: [],
    });

    expect(result).toEqual([]);
    expect(mockLogStructuredEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'insight_scan_skipped',
        generationStatus: 'insight_scan_skipped_low_signal_count',
        details: expect.objectContaining({
          scope: 'insight_scan',
          reason: 'insufficient_signals_last_30d',
          recent_signal_count: 1,
          min_required: 10,
        }),
      }),
    );
  });

  it('skips when daily spend already exceeds insight budget threshold', async () => {
    const { getDailySpend } = await import('@/lib/utils/api-tracker');
    vi.mocked(getDailySpend).mockResolvedValueOnce(0.76);

    const { runInsightScan } = await import('../insight-scan');

    const base = Date.UTC(2026, 2, 20);
    const signals = Array.from({ length: 15 }, (_, i) => ({
      id: `sig-${i}`,
      content: `c ${i}`,
      source: 'email_sent',
      type: null as string | null,
      occurred_at: new Date(base - i * 86400000).toISOString(),
    }));

    const result = await runInsightScan({
      userId: 'test-user',
      decryptedSignals: signals,
      goals: [],
      entities: [],
    });

    expect(result).toEqual([]);
    expect(createMock).not.toHaveBeenCalled();
    expect(mockLogStructuredEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'insight_scan_skipped',
        generationStatus: 'insight_scan_skipped_spend_guard',
        details: expect.objectContaining({
          scope: 'insight_scan',
          reason: 'daily_spend_above_threshold',
          threshold_usd: 0.04,
        }),
      }),
    );
  });
});
