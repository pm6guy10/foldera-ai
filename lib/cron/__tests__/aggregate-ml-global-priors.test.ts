import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockDelete = vi.fn();
const mockInsert = vi.fn();
const mockSnapshotSelect = vi.fn();
const invalidateGlobalMlPriorCache = vi.fn();

vi.mock('@/lib/db/client', () => ({
  createServerClient: () => ({
    from: (table: string) => {
      if (table === 'tkg_directive_ml_snapshots') {
        return {
          select: mockSnapshotSelect,
        };
      }
      if (table === 'tkg_directive_ml_global_priors') {
        return {
          delete: mockDelete,
          insert: mockInsert,
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  }),
}));

vi.mock('@/lib/ml/priors', () => ({
  invalidateGlobalMlPriorCache,
}));

describe('runAggregateMlGlobalPriors', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    mockSnapshotSelect.mockReturnValue({
      neq: vi.fn().mockReturnValue({
        neq: vi.fn().mockResolvedValue({
          data: [
            { bucket_key: 'bucket-1', outcome_label: 'approved' },
            { bucket_key: 'bucket-1', outcome_label: 'executed' },
            { bucket_key: 'bucket-1', outcome_label: 'skipped' },
          ],
          error: null,
        }),
      }),
    });
    mockDelete.mockReturnValue({
      neq: vi.fn().mockResolvedValue({ error: null }),
    });
  });

  it('writes the current production-compatible prior columns by default', async () => {
    mockInsert.mockResolvedValueOnce({ error: null });

    const { runAggregateMlGlobalPriors } = await import('../aggregate-ml-global-priors');
    const result = await runAggregateMlGlobalPriors();

    expect(result).toEqual({
      bucketsWritten: 1,
      snapshotsLabeled: 3,
      error: null,
    });
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        bucket_key: 'bucket-1',
        approve_count: 2,
        skip_count: 1,
        total_count: 3,
        approve_rate: expect.any(Number),
      }),
    );
    expect(mockInsert.mock.calls[0]?.[0]).not.toHaveProperty('smoothed_approve_rate');
    expect(invalidateGlobalMlPriorCache).toHaveBeenCalledTimes(1);
  });

  it('falls back to the legacy insert shape when the current columns are missing', async () => {
    mockInsert
      .mockResolvedValueOnce({
        error: { message: 'column tkg_directive_ml_global_priors.approve_count does not exist' },
      })
      .mockResolvedValueOnce({ error: null });

    const { runAggregateMlGlobalPriors } = await import('../aggregate-ml-global-priors');
    const result = await runAggregateMlGlobalPriors();

    expect(result.error).toBeNull();
    expect(result.bucketsWritten).toBe(1);
    expect(mockInsert).toHaveBeenCalledTimes(2);
    expect(mockInsert.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        bucket_key: 'bucket-1',
        approved_count: 1,
        skipped_count: 1,
        executed_count: 1,
        total_labeled: 3,
        smoothed_approve_rate: expect.any(Number),
      }),
    );
  });
});
