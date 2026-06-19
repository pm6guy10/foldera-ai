import { beforeEach, describe, expect, it, vi } from 'vitest';

const createServerClient = vi.fn();

vi.mock('@/lib/db/client', () => ({
  createServerClient,
}));

function buildSupabaseMock(input: {
  entities: Array<Record<string, unknown>>;
  signals: Array<Record<string, unknown>>;
}) {
  const entityUpdates: Array<{ id: string; payload: Record<string, unknown> }> = [];

  return {
    entityUpdates,
    from(table: string) {
      if (table === 'tkg_entities') {
        const entityQuery = {
          eq: () => entityQuery,
          neq: () => entityQuery,
          order: () => entityQuery,
          limit: () => Promise.resolve({
            data: input.entities,
            error: null,
          }),
          then: (
            resolve: (value: { data: Array<Record<string, unknown>>; error: null }) => unknown,
          ) => resolve({ data: input.entities, error: null }),
        };
        return {
          select: () => entityQuery,
          update: (payload: Record<string, unknown>) => ({
            eq: (field: string, id: string) => {
              if (field === 'id') {
                entityUpdates.push({ id, payload });
              }
              return Promise.resolve({ error: null });
            },
          }),
        };
      }

      if (table === 'tkg_signals') {
        return {
          select: () => {
            const query = {
              eq: () => query,
              gte: () => query,
              not: () => query,
              order: () => query,
              range: (from: number, to: number) => Promise.resolve({
                data: input.signals.slice(from, to + 1),
                error: null,
              }),
              limit: () => ({
                maybeSingle: () => Promise.resolve({
                  data: input.signals[0] ?? null,
                  error: null,
                }),
              }),
            };
            return query;
          },
        };
      }

      throw new Error(`Unexpected table ${table}`);
    },
  };
}

describe('behavioral graph', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-05T12:00:00.000Z'));
  });

  it('paginates through all processed signal metadata instead of stopping at one page', async () => {
    const entity = {
      id: 'entity-1',
      name: 'alex crisler',
      total_interactions: 1001,
      last_interaction: '2026-05-05T11:00:00.000Z',
      patterns: {},
      patterns_updated_at: '2026-05-01T00:00:00.000Z',
    };
    const signals = Array.from({ length: 1001 }, (_, index) => ({
      extracted_entities: ['entity-1'],
      occurred_at: new Date(Date.UTC(2026, 4, 5, 11, 0, Math.max(0, 59 - (index % 50)))).toISOString(),
    }));
    createServerClient.mockReturnValue(buildSupabaseMock({ entities: [entity], signals }));

    const { computeBehavioralStats } = await import('../behavioral-graph');
    const result = await computeBehavioralStats('user-1');
    const supabase = createServerClient.mock.results[0]?.value as ReturnType<typeof buildSupabaseMock>;

    expect(result.entities_updated).toBe(1);
    expect(result.signals_scanned).toBe(1001);
    expect(result.pages_fetched).toBe(2);
    expect(supabase.entityUpdates).toHaveLength(1);
    expect((supabase.entityUpdates[0]?.payload as Record<string, Record<string, unknown>>)?.patterns.bx_stats).toMatchObject({
      signal_count_14d: 1001,
      signal_count_30d: 1001,
      signal_count_90d: 1001,
    });
  });

  it('marks the graph stale when processed signals are newer than stored graph timestamps', async () => {
    const entity = {
      id: 'entity-1',
      name: 'alex crisler',
      total_interactions: 11,
      last_interaction: '2026-05-01T11:00:00.000Z',
      patterns: {},
      patterns_updated_at: '2026-05-01T11:00:00.000Z',
    };
    const signals = [
      { occurred_at: '2026-05-05T11:00:00.000Z', extracted_entities: ['entity-1'] },
    ];
    createServerClient.mockReturnValue(buildSupabaseMock({ entities: [entity], signals }));

    const { needsBehavioralGraphRefresh } = await import('../behavioral-graph');
    await expect(needsBehavioralGraphRefresh('user-1')).resolves.toBe(true);
  });

  it('ignores one-count rolling-window drift when no newer signal exists', async () => {
    const entity = {
      id: 'entity-1',
      name: 'keri nopens',
      display_name: 'Keri Nopens',
      total_interactions: 17,
      last_interaction: '2026-03-30T16:32:19.372Z',
      patterns: {
        bx_stats: {
          signal_count_14d: 0,
          signal_count_30d: 0,
          signal_count_90d: 17,
        },
      },
      patterns_updated_at: '2026-05-05T11:05:06.682Z',
    };
    const signals = Array.from({ length: 16 }, () => ({
      extracted_entities: ['entity-1'],
      occurred_at: '2026-03-30T16:32:19.372Z',
    }));
    createServerClient.mockReturnValue(buildSupabaseMock({ entities: [entity], signals }));

    const { auditBehavioralGraphConsistency } = await import('../behavioral-graph');
    await expect(auditBehavioralGraphConsistency('user-1')).resolves.toEqual([]);
  });

  it('ignores small 90-day rolling-window drift when no newer signal exists', async () => {
    const entity = {
      id: 'entity-1',
      name: 'brandon kapp',
      display_name: 'Brandon Kapp',
      total_interactions: 96,
      last_interaction: '2026-05-01T16:25:56.000Z',
      patterns: {
        bx_stats: {
          signal_count_14d: 1,
          signal_count_30d: 12,
          signal_count_90d: 96,
        },
      },
      patterns_updated_at: '2026-05-05T11:52:44.601Z',
    };
    const signals = [
      {
        extracted_entities: ['entity-1'],
        occurred_at: '2026-05-01T16:25:56.000Z',
      },
      ...Array.from({ length: 11 }, () => ({
        extracted_entities: ['entity-1'],
        occurred_at: '2026-04-15T16:32:19.372Z',
      })),
      ...Array.from({ length: 82 }, () => ({
        extracted_entities: ['entity-1'],
        occurred_at: '2026-03-10T16:32:19.372Z',
      })),
    ];
    createServerClient.mockReturnValue(buildSupabaseMock({ entities: [entity], signals }));

    const { auditBehavioralGraphConsistency } = await import('../behavioral-graph');
    await expect(auditBehavioralGraphConsistency('user-1')).resolves.toEqual([]);
  });

  it('ignores larger monotonic rolling-window aging when no newer signal exists', async () => {
    const entity = {
      id: 'entity-1',
      name: 'alex crisler',
      display_name: 'Alex Crisler',
      total_interactions: 11,
      last_interaction: '2026-04-15T22:42:05.000Z',
      patterns: {
        bx_stats: {
          signal_count_14d: 2,
          signal_count_30d: 10,
          signal_count_90d: 11,
        },
      },
      patterns_updated_at: '2026-05-05T11:55:21.896Z',
    };
    const signals = [
      ...Array.from({ length: 7 }, () => ({
        extracted_entities: ['entity-1'],
        occurred_at: '2026-04-15T22:42:05.000Z',
      })),
      ...Array.from({ length: 4 }, () => ({
        extracted_entities: ['entity-1'],
        occurred_at: '2026-03-10T16:32:19.372Z',
      })),
    ];
    createServerClient.mockReturnValue(buildSupabaseMock({ entities: [entity], signals }));

    const { auditBehavioralGraphConsistency } = await import('../behavioral-graph');
    await expect(auditBehavioralGraphConsistency('user-1')).resolves.toEqual([]);
  });

  it('still reports drift when newer signal activity exists after graph computation', async () => {
    const entity = {
      id: 'entity-1',
      name: 'alex crisler',
      display_name: 'Alex Crisler',
      total_interactions: 11,
      last_interaction: '2026-05-13T22:42:05.000Z',
      patterns: {
        bx_stats: {
          signal_count_14d: 2,
          signal_count_30d: 10,
          signal_count_90d: 11,
        },
      },
      patterns_updated_at: '2026-05-13T11:55:21.896Z',
    };
    const signals = [
      ...Array.from({ length: 12 }, () => ({
        extracted_entities: ['entity-1'],
        occurred_at: '2026-05-13T22:42:05.000Z',
      })),
    ];
    createServerClient.mockReturnValue(buildSupabaseMock({ entities: [entity], signals }));

    const { auditBehavioralGraphConsistency } = await import('../behavioral-graph');
    const result = await auditBehavioralGraphConsistency('user-1');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      name: 'Alex Crisler',
      actual: {
        signal_count_14d: 12,
        signal_count_30d: 12,
        signal_count_90d: 12,
      },
    });
  });
});
