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
        return {
          select: () => ({
            eq: () => ({
              neq: () => ({
                eq: () => Promise.resolve({
                  data: input.entities,
                  error: null,
                }),
              }),
            }),
          }),
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
    expect(supabase.entityUpdates[0]?.payload.patterns.bx_stats).toMatchObject({
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
});
