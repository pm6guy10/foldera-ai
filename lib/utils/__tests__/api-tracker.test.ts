import { beforeEach, describe, expect, it, vi } from 'vitest';

const insertSpy = vi.fn();
const logStructuredEvent = vi.fn();

vi.mock('@/lib/db/client', () => ({
  createServerClient: () => ({
    from(table: string) {
      if (table !== 'api_usage') {
        throw new Error(`Unexpected table ${table}`);
      }

      return {
        insert: insertSpy,
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
      model: 'claude-sonnet-4-20250514',
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
});
