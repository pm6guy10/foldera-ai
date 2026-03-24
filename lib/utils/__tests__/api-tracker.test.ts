import { beforeEach, describe, expect, it, vi } from 'vitest';

const insertSpy = vi.fn();
const logStructuredEvent = vi.fn();
const selectChain = {
  eq() { return this; },
  in() { return this; },
  gte() { return Promise.resolve({ data: [], error: null }); },
};

vi.mock('@/lib/db/client', () => ({
  createServerClient: () => ({
    from(table: string) {
      if (table !== 'api_usage') {
        throw new Error(`Unexpected table ${table}`);
      }

      return {
        insert: insertSpy,
        select() {
          return selectChain;
        },
      };
    },
  }),
}));

vi.mock('@/lib/utils/structured-logger', () => ({
  logStructuredEvent,
}));

describe('trackApiCall', () => {
  beforeEach(() => {
    vi.resetModules();
    insertSpy.mockReset();
    logStructuredEvent.mockReset();
    insertSpy.mockResolvedValue({ error: null });
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

    expect(insertSpy).toHaveBeenCalledTimes(1);
    expect(insertSpy).toHaveBeenCalledWith(expect.objectContaining({
      endpoint: 'directive',
    }));
    expect(insertSpy.mock.calls[0][0]).not.toHaveProperty('call_type');
  });

  it('reports the permanent daily spend cap in the summary', async () => {
    insertSpy.mockReset();

    const { getSpendSummary } = await import('../api-tracker');
    const summary = await getSpendSummary('user-1');

    expect(summary.dailyCapUSD).toBe(1.0);
    expect(summary.extractionDailyCapUSD).toBe(2);
    expect(summary.capPct).toBe(0);
  });

  it('uses the extraction cap only for extraction traffic', async () => {
    const { isOverDailyLimit } = await import('../api-tracker');
    const inSpy = vi.spyOn(selectChain, 'in');
    const gteSpy = vi.spyOn(selectChain, 'gte');

    await expect(isOverDailyLimit('user-1', 'signal_extraction')).resolves.toBe(false);

    expect(inSpy).toHaveBeenCalledWith('endpoint', ['extraction', 'signal_extraction']);
    expect(gteSpy).toHaveBeenCalled();
    expect(logStructuredEvent).not.toHaveBeenCalled();
  });
});
