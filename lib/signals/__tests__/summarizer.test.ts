import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class MockAnthropicBudgetExceededError extends Error {
  constructor(
    public readonly scope: string,
    public readonly raw: unknown,
    public readonly rpcErrorMessage?: string,
  ) {
    super(`Anthropic budget governor blocked ${scope}`);
    this.name = 'AnthropicBudgetExceededError';
  }
}

const FIXED_NOW = new Date('2026-05-09T12:00:00.000Z');

const testState = vi.hoisted(() => ({
  signals: [] as Array<Record<string, unknown>>,
  summaries: [] as Array<Record<string, unknown>>,
  upserts: [] as Array<Record<string, unknown>>,
}));

const mockEnsureAnthropicBudget = vi.fn().mockResolvedValue({
  allowed: true,
  raw: { bypassed: 'test' },
});
const mockTrackApiCall = vi.fn().mockResolvedValue(undefined);
const mockLogStructuredEvent = vi.fn();
const mockAnthropicCreate = vi.fn();

function filterRows(
  rows: Array<Record<string, unknown>>,
  filters: Array<{ kind: 'eq' | 'lt'; field: string; value: unknown }>,
): Array<Record<string, unknown>> {
  return rows.filter((row) =>
    filters.every((filter) => {
      const value = row[filter.field];
      if (filter.kind === 'eq') return value === filter.value;
      if (value == null) return false;
      return String(value) < String(filter.value);
    }),
  );
}

function buildSelectBuilder(table: 'tkg_signals' | 'signal_summaries') {
  const query = {
    filters: [] as Array<{ kind: 'eq' | 'lt'; field: string; value: unknown }>,
    orderField: null as string | null,
    ascending: true,
    limit: null as number | null,
  };

  const execute = () => {
    const source = table === 'tkg_signals' ? testState.signals : testState.summaries;
    let rows = filterRows(source, query.filters);
    if (query.orderField) {
      rows = [...rows].sort((left, right) => {
        const leftValue = String(left[query.orderField!] ?? '');
        const rightValue = String(right[query.orderField!] ?? '');
        if (leftValue === rightValue) return 0;
        const comparison = leftValue > rightValue ? 1 : -1;
        return query.ascending ? comparison : -comparison;
      });
    }
    if (query.limit != null) {
      rows = rows.slice(0, query.limit);
    }
    return Promise.resolve({ data: rows, error: null });
  };

  const builder: Record<string, unknown> & {
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise<unknown>;
  } = {
    select() {
      return builder;
    },
    eq(field: string, value: unknown) {
      query.filters.push({ kind: 'eq', field, value });
      return builder;
    },
    lt(field: string, value: unknown) {
      query.filters.push({ kind: 'lt', field, value });
      return builder;
    },
    order(field: string, options?: { ascending?: boolean }) {
      query.orderField = field;
      query.ascending = options?.ascending ?? true;
      return builder;
    },
    limit(count: number) {
      query.limit = count;
      return execute();
    },
    then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
      return execute().then(resolve, reject);
    },
  };

  return builder;
}

vi.mock('@/lib/db/client', () => ({
  createServerClient: () => ({
    from(table: string) {
      if (table === 'tkg_signals') {
        return buildSelectBuilder('tkg_signals');
      }
      if (table === 'signal_summaries') {
        return {
          ...buildSelectBuilder('signal_summaries'),
          upsert(row: Record<string, unknown>) {
            testState.upserts.push({ ...row });
            return Promise.resolve({ error: null });
          },
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  }),
}));

vi.mock('@/lib/llm/paid-llm-gate', () => ({
  isPaidLlmAllowed: vi.fn(() => true),
}));

vi.mock('@/lib/llm/anthropic-budget-governor', () => ({
  ensureAnthropicBudget: (...args: unknown[]) => mockEnsureAnthropicBudget(...args),
  isAnthropicBudgetExceededError: (error: unknown) => error instanceof MockAnthropicBudgetExceededError,
  AnthropicBudgetExceededError: MockAnthropicBudgetExceededError,
}));

vi.mock('@/lib/utils/api-tracker', () => ({
  trackApiCall: (...args: unknown[]) => mockTrackApiCall(...args),
}));

vi.mock('@/lib/utils/structured-logger', () => ({
  logStructuredEvent: (...args: unknown[]) => mockLogStructuredEvent(...args),
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: (...args: unknown[]) => mockAnthropicCreate(...args),
    },
  })),
}));

describe('summarizeSignals budget governor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    testState.signals.length = 0;
    testState.summaries.length = 0;
    testState.upserts.length = 0;
    mockEnsureAnthropicBudget.mockReset();
    mockEnsureAnthropicBudget.mockResolvedValue({
      allowed: true,
      raw: { bypassed: 'test' },
    });
    mockTrackApiCall.mockClear();
    mockLogStructuredEvent.mockClear();
    mockAnthropicCreate.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('falls back to a deterministic weekly summary when the governor blocks Anthropic', async () => {
    mockEnsureAnthropicBudget.mockRejectedValue(
      new MockAnthropicBudgetExceededError(
        'signal-summarizer.compressWeek',
        { allowed: false },
        'cap reached',
      ),
    );

    testState.signals.push(
      {
        id: 'sig-1',
        user_id: 'user-1',
        source: 'gmail',
        type: 'email_received',
        author: 'alex@example.com',
        occurred_at: '2026-04-28T12:00:00.000Z',
      },
      {
        id: 'sig-2',
        user_id: 'user-1',
        source: 'google_calendar',
        type: 'calendar_event',
        author: 'alex@example.com',
        occurred_at: '2026-04-30T15:00:00.000Z',
      },
    );

    const { summarizeSignals } = await import('../summarizer');
    const created = await summarizeSignals('user-1');

    expect(created).toBe(1);
    expect(mockAnthropicCreate).not.toHaveBeenCalled();
    expect(mockTrackApiCall).not.toHaveBeenCalled();
    expect(testState.upserts).toHaveLength(1);
    expect(testState.upserts[0]).toMatchObject({
      user_id: 'user-1',
      week_start: '2026-04-27',
      week_end: '2026-05-03',
      signal_count: 2,
      emotional_tone: 'neutral',
    });
    expect(String(testState.upserts[0].summary)).toContain('Week of 2026-04-27: 2 signals');
    expect(String(testState.upserts[0].summary)).toContain('alex@example.com');
    expect(mockLogStructuredEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'summary_budget_governor_blocked',
        generationStatus: 'anthropic_budget_exhausted',
        details: expect.objectContaining({
          scope: 'summarizer',
          week_start: '2026-04-27',
        }),
      }),
    );
  });
});
