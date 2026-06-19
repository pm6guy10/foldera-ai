import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiUsageInsertSpy = vi.fn();
const costEventsInsertSpy = vi.fn();
const logStructuredEvent = vi.fn();
const tableRows: Record<string, Array<Record<string, unknown>>> = {
  api_usage: [],
  cost_events: [],
};

const queryChains = {
  api_usage: {
    eq() { return this; },
    not() { return this; },
    in() { return this; },
    gte() { return Promise.resolve({ data: tableRows.api_usage, error: null }); },
  },
  cost_events: {
    eq() { return this; },
    not() { return this; },
    in() { return this; },
    gte() { return Promise.resolve({ data: tableRows.cost_events, error: null }); },
  },
};

vi.mock('@/lib/db/client', () => ({
  createServerClient: () => ({
    from(table: string) {
      if (table === 'api_usage') {
        return {
          insert: apiUsageInsertSpy,
          select() {
            return queryChains.api_usage;
          },
        };
      }

      if (table === 'cost_events') {
        return {
          insert: costEventsInsertSpy,
          select() {
            return queryChains.cost_events;
          },
        };
      }

      throw new Error(`Unexpected table ${table}`);
    },
  }),
}));

vi.mock('@/lib/utils/structured-logger', () => ({
  logStructuredEvent,
}));

describe('trackApiCall', () => {
  beforeEach(() => {
    vi.resetModules();
    apiUsageInsertSpy.mockReset();
    costEventsInsertSpy.mockReset();
    logStructuredEvent.mockReset();
    apiUsageInsertSpy.mockResolvedValue({ error: null });
    costEventsInsertSpy.mockResolvedValue({ error: null });
    tableRows.api_usage = [];
    tableRows.cost_events = [];
  });

  it('writes the logical call site to endpoint', async () => {
    const { trackApiCall } = await import('../api-tracker');

    await trackApiCall({
      userId: 'user-1',
      model: 'claude-haiku-4-5-20251001',
      inputTokens: 1000,
      outputTokens: 500,
      callType: 'directive',
    });

    expect(apiUsageInsertSpy).toHaveBeenCalledTimes(1);
    expect(apiUsageInsertSpy).toHaveBeenCalledWith(expect.objectContaining({
      endpoint: 'directive',
    }));
    expect(apiUsageInsertSpy.mock.calls[0][0]).not.toHaveProperty('call_type');
  });

  it('appends a matching cost_events ledger row for each tracked call', async () => {
    const { trackApiCall } = await import('../api-tracker');

    await trackApiCall({
      userId: 'user-1',
      model: 'claude-haiku-4-5-20251001',
      inputTokens: 1000,
      outputTokens: 500,
      callType: 'directive',
    });

    expect(apiUsageInsertSpy).toHaveBeenCalledTimes(1);
    expect(costEventsInsertSpy).toHaveBeenCalledTimes(1);
    expect(costEventsInsertSpy).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 'user-1',
      provider: 'anthropic',
      model: 'claude-haiku-4-5-20251001',
      endpoint: 'directive',
      input_tokens: 1000,
      output_tokens: 500,
    }));
  });

  it('reports the permanent daily spend cap in the summary', async () => {
    apiUsageInsertSpy.mockReset();

    const { getSpendSummary } = await import('../api-tracker');
    const summary = await getSpendSummary('user-1');

    expect(summary.dailyCapUSD).toBe(1);
    // Reverted 4 -> 0.25 in #445 Pass 3 C-1 (the un-reverted 2026-04-09 backlog
    // raise was a 16x latent landmine); this stale assertion was missed then.
    expect(summary.extractionDailyCapUSD).toBe(0.25);
    expect(summary.capPct).toBe(0);
  });

  it('uses the extraction cap only for extraction traffic', async () => {
    const { isOverDailyLimit } = await import('../api-tracker');
    const inSpy = vi.spyOn(queryChains.api_usage, 'in');
    const gteSpy = vi.spyOn(queryChains.api_usage, 'gte');

    await expect(isOverDailyLimit('user-1', 'signal_extraction')).resolves.toBe(false);

    expect(inSpy).toHaveBeenCalledWith('endpoint', ['extraction', 'signal_extraction']);
    expect(gteSpy).toHaveBeenCalled();
    expect(logStructuredEvent).not.toHaveBeenCalled();
    inSpy.mockRestore();
    gteSpy.mockRestore();
  });

  it('builds a ledger summary from cost_events rows', async () => {
    const now = new Date('2026-05-09T22:00:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);
    tableRows.cost_events = [
      {
        created_at: '2026-05-09T21:30:00.000Z',
        endpoint: 'directive',
        model: 'claude-sonnet-4-20250514',
        estimated_cost: 0.12,
        input_tokens: 1000,
        output_tokens: 500,
      },
      {
        created_at: '2026-05-06T12:00:00.000Z',
        endpoint: 'researcher_synthesis',
        model: 'claude-haiku-4-5-20251001',
        estimated_cost: 0.03,
        input_tokens: 400,
        output_tokens: 120,
      },
    ];

    const { getCostEventSummaryReport } = await import('../api-tracker');
    const summary = await getCostEventSummaryReport();

    expect(summary.windows.last_24h.total_usd).toBeCloseTo(0.12, 6);
    expect(summary.windows.last_7d.total_usd).toBeCloseTo(0.15, 6);
    expect(summary.by_endpoint_7d).toEqual([
      expect.objectContaining({ endpoint: 'directive', total_usd: 0.12 }),
      expect.objectContaining({ endpoint: 'researcher_synthesis', total_usd: 0.03 }),
    ]);

    vi.useRealTimers();
  });
});
