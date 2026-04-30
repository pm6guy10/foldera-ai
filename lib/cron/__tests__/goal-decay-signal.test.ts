import { beforeEach, describe, expect, it, vi } from 'vitest';

const testState = vi.hoisted(() => ({
  goals: [] as Array<Record<string, unknown>>,
  signals: [] as Array<Record<string, unknown>>,
  trackedCalls: [] as Array<Record<string, unknown>>,
}));

function projectRow(row: Record<string, unknown>, columns: string): Record<string, unknown> {
  const fields = columns.split(',').map((field) => field.trim()).filter(Boolean);
  if (fields.length === 0 || fields.includes('*')) return { ...row };
  return Object.fromEntries(fields.map((field) => [field, row[field]]));
}

function applyFilters(
  rows: Array<Record<string, unknown>>,
  filters: Array<{ kind: 'eq' | 'gte'; field: string; value: unknown }>,
): Array<Record<string, unknown>> {
  return rows.filter((row) =>
    filters.every((filter) => {
      const value = row[filter.field];
      if (filter.kind === 'eq') return value === filter.value;
      if (value == null) return false;
      return value >= filter.value;
    }),
  );
}

function runSelectQuery(
  table: string,
  columns: string,
  filters: Array<{ kind: 'eq' | 'gte'; field: string; value: unknown }>,
  orderBy: { field: string; ascending: boolean } | null,
  limit: number | null,
): { data: Array<Record<string, unknown>>; error: null } {
  const source =
    table === 'tkg_goals'
      ? testState.goals
      : table === 'tkg_signals'
        ? testState.signals
        : [];
  let rows = applyFilters(source, filters);
  if (orderBy) {
    rows = [...rows].sort((left, right) => {
      const leftValue = left[orderBy.field];
      const rightValue = right[orderBy.field];
      if (leftValue === rightValue) return 0;
      const comparison = leftValue! > rightValue! ? 1 : -1;
      return orderBy.ascending ? comparison : -comparison;
    });
  }
  const limited = limit == null ? rows : rows.slice(0, limit);
  return {
    data: limited.map((row) => projectRow(row, columns)),
    error: null,
  };
}

function applyGoalUpdate(
  patch: Record<string, unknown>,
  filters: Array<{ field: string; value: unknown }>,
): { data: null; error: null } {
  for (const goal of testState.goals) {
    const matches = filters.every((filter) => goal[filter.field] === filter.value);
    if (matches) Object.assign(goal, patch);
  }
  return { data: null, error: null };
}

function buildSelectBuilder(table: string) {
  const query = {
    columns: '*',
    filters: [] as Array<{ kind: 'eq' | 'gte'; field: string; value: unknown }>,
    orderBy: null as { field: string; ascending: boolean } | null,
    limit: null as number | null,
  };

  const execute = () =>
    Promise.resolve(runSelectQuery(table, query.columns, query.filters, query.orderBy, query.limit));

  const builder: any = {
    select(columns: string) {
      query.columns = columns;
      return builder;
    },
    eq(field: string, value: unknown) {
      query.filters.push({ kind: 'eq', field, value });
      return builder;
    },
    gte(field: string, value: unknown) {
      query.filters.push({ kind: 'gte', field, value });
      return builder;
    },
    order(field: string, options?: { ascending?: boolean }) {
      query.orderBy = { field, ascending: options?.ascending ?? true };
      return builder;
    },
    limit(count: number) {
      query.limit = count;
      return execute();
    },
    maybeSingle() {
      query.limit = 1;
      return execute().then((result) => ({
        data: result.data[0] ?? null,
        error: null,
      }));
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
      return {
        ...buildSelectBuilder(table),
        update(patch: Record<string, unknown>) {
          const filters: Array<{ field: string; value: unknown }> = [];
          return {
            eq(field: string, value: unknown) {
              filters.push({ field, value });
              return Promise.resolve(applyGoalUpdate(patch, filters));
            },
          };
        },
      };
    },
  }),
}));

vi.mock('@/lib/encryption', () => ({
  decryptWithStatus: vi.fn((value: string) => ({ plaintext: value, usedFallback: false })),
}));

vi.mock('@/lib/llm/paid-llm-gate', () => ({
  isPaidLlmAllowed: vi.fn(() => false),
}));

vi.mock('@/lib/utils/api-tracker', () => ({
  isOverDailyLimit: vi.fn(async () => false),
  trackApiCall: vi.fn(async (payload: Record<string, unknown>) => {
    testState.trackedCalls.push(payload);
  }),
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: vi.fn() },
  })),
}));

import { refreshGoalContext, signalReinforcesGoalKeywords } from '../goal-refresh';

describe('signalReinforcesGoalKeywords (CE-5)', () => {
  beforeEach(() => {
    testState.goals.length = 0;
    testState.signals.length = 0;
    testState.trackedCalls.length = 0;
  });

  it('returns true when two keywords hit the same signal', () => {
    const keywords = ['mas3', 'yadira', 'interview'];
    const texts = ['schedule the mas3 interview with yadira next week'];
    expect(signalReinforcesGoalKeywords(keywords, texts)).toBe(true);
  });

  it('returns false when fewer than two keywords match', () => {
    const keywords = ['mas3', 'yadira'];
    const texts = ['unrelated email about groceries'];
    expect(signalReinforcesGoalKeywords(keywords, texts)).toBe(false);
  });

  it('physically deprecates an unreinforced goal from the current set during CE-5 decay', async () => {
    testState.goals.push({
      id: 'goal-1',
      user_id: 'user-1',
      goal_text: 'Land MAS3 role',
      priority: 3,
      goal_category: 'career',
      source: 'extracted',
      status: 'active',
      current_priority: true,
    });
    testState.signals.push({
      user_id: 'user-1',
      content: 'grocery list and weekend errands',
      source: 'gmail',
      processed: true,
      occurred_at: new Date().toISOString(),
    });

    const result = await refreshGoalContext();

    expect(result).toMatchObject({ ok: true, decayed: 1 });
    expect(testState.goals[0]).toMatchObject({
      id: 'goal-1',
      priority: 2,
      status: 'active',
      current_priority: false,
    });
  });

  it('keeps a goal current when recent decrypted signals still reinforce it', async () => {
    testState.goals.push({
      id: 'goal-2',
      user_id: 'user-2',
      goal_text: 'Land MAS3 role',
      priority: 3,
      goal_category: 'career',
      source: 'extracted',
      status: 'active',
      current_priority: true,
    });
    testState.signals.push({
      id: 'signal-2',
      user_id: 'user-2',
      type: 'email_received',
      author: 'hiring@example.com',
      recipients: ['user-2@example.com'],
      extracted_entities: ['MAS3 role'],
      extracted_commitments: ['MAS3 role interview moved to Thursday afternoon'],
      source: 'gmail',
      processed: true,
      occurred_at: new Date().toISOString(),
    });

    const result = await refreshGoalContext();

    expect(result).toMatchObject({ ok: true, decayed: 0 });
    expect(testState.goals[0]).toMatchObject({
      id: 'goal-2',
      priority: 3,
      status: 'active',
      current_priority: true,
    });
  });
});
