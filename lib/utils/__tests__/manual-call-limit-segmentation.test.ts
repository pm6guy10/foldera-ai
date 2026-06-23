import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Issue #518 operational fix: the manual directive cap must count only INTERACTIVE
 * directive calls (pipeline_run_id IS NULL). Cron runs generate directive/
 * directive_retry rows inside a pipeline-run context (so those rows carry a
 * pipeline_run_id); before segmentation a single morning cron's 8+ rows blew the
 * manual cap of 3, short-circuiting the dashboard's "Generate Now" self-test.
 */

type Row = {
  user_id: string;
  endpoint: string;
  pipeline_run_id: string | null;
  created_at: string;
};

let dataset: Row[] = [];
const logStructuredEvent = vi.fn();

// Minimal Supabase query-builder stand-in: records filters, then resolves a
// head/count query the same way PostgREST would (count of matching rows).
function makeApiUsageQuery() {
  const filters: { user_id?: string; pipeline_run_id?: string | null; endpoints?: string[]; since?: string } = {};
  const builder = {
    eq(col: string, val: string) {
      if (col === 'user_id') filters.user_id = val;
      return builder;
    },
    is(col: string, val: null) {
      if (col === 'pipeline_run_id') filters.pipeline_run_id = val;
      return builder;
    },
    in(col: string, vals: string[]) {
      if (col === 'endpoint') filters.endpoints = vals;
      return builder;
    },
    gte(col: string, val: string) {
      if (col === 'created_at') filters.since = val;
      const count = dataset.filter((r) => {
        if (filters.user_id !== undefined && r.user_id !== filters.user_id) return false;
        if ('pipeline_run_id' in filters && r.pipeline_run_id !== filters.pipeline_run_id) return false;
        if (filters.endpoints && !filters.endpoints.includes(r.endpoint)) return false;
        if (filters.since && r.created_at < filters.since) return false;
        return true;
      }).length;
      return Promise.resolve({ count, error: null });
    },
  };
  return builder;
}

vi.mock('@/lib/db/client', () => ({
  createServerClient: () => ({
    from(table: string) {
      if (table === 'api_usage') {
        return { select: () => makeApiUsageQuery() };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  }),
}));

vi.mock('@/lib/utils/structured-logger', () => ({ logStructuredEvent }));

const NOW = new Date().toISOString();

describe('isOverManualCallLimit — pipeline_run_id segmentation', () => {
  beforeEach(() => {
    vi.resetModules();
    logStructuredEvent.mockReset();
    dataset = [];
  });

  it('does NOT count cron directive rows (pipeline_run_id set) against the manual cap', async () => {
    // A morning cron logging 8 directive/directive_retry rows — all with a pipeline_run_id.
    dataset = Array.from({ length: 8 }, (_, i) => ({
      user_id: 'owner',
      endpoint: i % 2 === 0 ? 'directive' : 'directive_retry',
      pipeline_run_id: 'run-123',
      created_at: NOW,
    }));
    const { isOverManualCallLimit } = await import('../api-tracker');
    expect(await isOverManualCallLimit('owner')).toBe(false);
  });

  it('blocks once 3 interactive (pipeline_run_id NULL) directive calls have run', async () => {
    dataset = Array.from({ length: 3 }, () => ({
      user_id: 'owner',
      endpoint: 'directive',
      pipeline_run_id: null,
      created_at: NOW,
    }));
    const { isOverManualCallLimit } = await import('../api-tracker');
    expect(await isOverManualCallLimit('owner')).toBe(true);
    expect(logStructuredEvent).toHaveBeenCalled();
  });

  it('cron rows do not crowd out the manual budget: 8 cron + 2 manual still allows a 3rd manual', async () => {
    dataset = [
      ...Array.from({ length: 8 }, (_, i) => ({
        user_id: 'owner',
        endpoint: i % 2 === 0 ? 'directive' : 'directive_retry',
        pipeline_run_id: 'run-123',
        created_at: NOW,
      })),
      ...Array.from({ length: 2 }, () => ({
        user_id: 'owner',
        endpoint: 'directive',
        pipeline_run_id: null,
        created_at: NOW,
      })),
    ];
    const { isOverManualCallLimit } = await import('../api-tracker');
    expect(await isOverManualCallLimit('owner')).toBe(false);
  });

  it('scopes the count to the user', async () => {
    dataset = Array.from({ length: 5 }, () => ({
      user_id: 'someone-else',
      endpoint: 'directive',
      pipeline_run_id: null,
      created_at: NOW,
    }));
    const { isOverManualCallLimit } = await import('../api-tracker');
    expect(await isOverManualCallLimit('owner')).toBe(false);
  });
});
