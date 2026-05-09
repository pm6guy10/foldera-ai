import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSelect = vi.fn();

vi.mock('@/lib/db/client', () => ({
  createServerClient: () => ({
    from: () => ({
      select: mockSelect,
    }),
  }),
}));

describe('fetchGlobalMlPriorMap', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('reads the current production approve_rate column when available', async () => {
    mockSelect.mockResolvedValueOnce({
      data: [{ bucket_key: 'deadline:send_message', approve_rate: 0.81 }],
      error: null,
    });

    const { fetchGlobalMlPriorMap, invalidateGlobalMlPriorCache } = await import('../priors');
    invalidateGlobalMlPriorCache();
    const priors = await fetchGlobalMlPriorMap();

    expect(priors.get('deadline:send_message')).toBe(0.81);
    expect(mockSelect).toHaveBeenCalledWith('bucket_key, approve_rate');
  });

  it('falls back to the legacy smoothed_approve_rate column for older local schemas', async () => {
    mockSelect
      .mockResolvedValueOnce({
        data: null,
        error: { message: 'column tkg_directive_ml_global_priors.approve_rate does not exist' },
      })
      .mockResolvedValueOnce({
        data: [{ bucket_key: 'legacy:write_document', smoothed_approve_rate: 0.62 }],
        error: null,
      });

    const { fetchGlobalMlPriorMap, invalidateGlobalMlPriorCache } = await import('../priors');
    invalidateGlobalMlPriorCache();
    const priors = await fetchGlobalMlPriorMap();

    expect(mockSelect).toHaveBeenNthCalledWith(1, 'bucket_key, approve_rate');
    expect(mockSelect).toHaveBeenNthCalledWith(2, 'bucket_key, smoothed_approve_rate');
    expect(priors.get('legacy:write_document')).toBe(0.62);
  });
});
