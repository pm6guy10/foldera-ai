import { beforeEach, describe, expect, it, vi } from 'vitest';
import { decryptWithStatus, encrypt } from '@/lib/encryption';

type Row = Record<string, any>;

type RuntimeState = {
  apiUsage: Row[];
  entities: Row[];
  commitments: Row[];
  signals: Row[];
  goals: Row[];
  actions: Row[];
  userSubscriptions: Row[];
  userTokens: Row[];
  authUsers: Record<string, { email: string; email_confirmed_at: string | null }>;
  ids: Record<string, number>;
};

const TEST_USER_ID = '66666666-6666-4666-8666-666666666666';
const TEST_EMAIL = 'pipeline-receipt@example.com';

let runtime: RuntimeState;

const mockAnthropicCreate = vi.fn();
const mockResendSend = vi.fn();

function createRuntime(): RuntimeState {
  return {
    apiUsage: [],
    entities: [],
    commitments: [],
    signals: [],
    goals: [],
    actions: [],
    userSubscriptions: [],
    userTokens: [],
    authUsers: {},
    ids: {
      entity: 0,
      commitment: 0,
      signal: 0,
      goal: 0,
      action: 0,
      api_usage: 0,
    },
  };
}

function nextId(prefix: keyof RuntimeState['ids']): string {
  runtime.ids[prefix] += 1;
  return `${prefix}-${runtime.ids[prefix]}`;
}

function asArray<T>(value: T | T[]): T[] {
  return Array.isArray(value) ? value : [value];
}

function splitColumns(columns?: string): string[] | null {
  if (!columns) return null;
  return columns.split(',').map((part) => part.trim()).filter(Boolean);
}

function pickColumns(row: Row, columns?: string): Row {
  const selected = splitColumns(columns);
  if (!selected) {
    return { ...row };
  }

  return selected.reduce<Row>((acc, column) => {
    acc[column] = row[column];
    return acc;
  }, {});
}

function applyFilters(rows: Row[], state: QueryState): Row[] {
  let filtered = rows.filter((row) =>
    state.filters.every((filter) => filter(row)),
  );

  if (state.orderField) {
    filtered = [...filtered].sort((left, right) => {
      const leftValue = left[state.orderField!];
      const rightValue = right[state.orderField!];
      if (leftValue === rightValue) return 0;
      if (leftValue == null) return state.orderAscending ? 1 : -1;
      if (rightValue == null) return state.orderAscending ? -1 : 1;
      return leftValue > rightValue
        ? (state.orderAscending ? 1 : -1)
        : (state.orderAscending ? -1 : 1);
    });
  }

  if (typeof state.limitCount === 'number') {
    filtered = filtered.slice(0, state.limitCount);
  }

  return filtered;
}

type QueryState = {
  columns?: string;
  countExact: boolean;
  filters: Array<(row: Row) => boolean>;
  head: boolean;
  limitCount?: number;
  orderAscending: boolean;
  orderField?: string;
};

class SelectQuery {
  private state: QueryState;

  constructor(
    private readonly rows: Row[],
    columns?: string,
    options?: { count?: string; head?: boolean },
  ) {
    this.state = {
      columns,
      countExact: options?.count === 'exact',
      filters: [],
      head: options?.head === true,
      orderAscending: true,
    };
  }

  eq(field: string, value: unknown) {
    this.state.filters.push((row) => row[field] === value);
    return this;
  }

  neq(field: string, value: unknown) {
    this.state.filters.push((row) => row[field] !== value);
    return this;
  }

  in(field: string, values: unknown[]) {
    this.state.filters.push((row) => values.includes(row[field]));
    return this;
  }

  gte(field: string, value: unknown) {
    this.state.filters.push((row) => row[field] >= value);
    return this;
  }

  lte(field: string, value: unknown) {
    this.state.filters.push((row) => row[field] <= value);
    return this;
  }

  lt(field: string, value: unknown) {
    this.state.filters.push((row) => row[field] < value);
    return this;
  }

  gt(field: string, value: unknown) {
    this.state.filters.push((row) => row[field] > value);
    return this;
  }

  is(field: string, value: unknown) {
    this.state.filters.push((row) => row[field] === value);
    return this;
  }

  not(field: string, operator: string, value: unknown) {
    if (operator === 'is' && value === null) {
      this.state.filters.push((row) => row[field] !== null && row[field] !== undefined);
      return this;
    }

    this.state.filters.push((row) => row[field] !== value);
    return this;
  }

  contains(field: string, values: unknown[]) {
    this.state.filters.push((row) =>
      Array.isArray(row[field]) && values.every((value) => row[field].includes(value)),
    );
    return this;
  }

  ilike(field: string, value: string) {
    const lowered = value.toLowerCase();
    this.state.filters.push((row) => String(row[field] ?? '').toLowerCase() === lowered);
    return this;
  }

  order(field: string, options?: { ascending?: boolean }) {
    this.state.orderField = field;
    this.state.orderAscending = options?.ascending !== false;
    return this;
  }

  limit(count: number) {
    this.state.limitCount = count;
    return this.execute();
  }

  maybeSingle() {
    const rows = applyFilters(this.rows, this.state);
    return Promise.resolve({
      data: rows[0] ? pickColumns(rows[0], this.state.columns) : null,
      error: null,
    });
  }

  single() {
    const rows = applyFilters(this.rows, this.state);
    return Promise.resolve(
      rows[0]
        ? { data: pickColumns(rows[0], this.state.columns), error: null }
        : { data: null, error: new Error('row not found') },
    );
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.execute().then(onfulfilled, onrejected);
  }

  private execute() {
    const rows = applyFilters(this.rows, this.state);
    if (this.state.head) {
      return Promise.resolve({
        count: this.state.countExact ? rows.length : null,
        data: null,
        error: null,
      });
    }

    return Promise.resolve({
      count: this.state.countExact ? rows.length : null,
      data: rows.map((row) => pickColumns(row, this.state.columns)),
      error: null,
    });
  }
}

class UpdateQuery {
  private filters: Array<(row: Row) => boolean> = [];

  constructor(
    private readonly rows: Row[],
    private readonly payload: Row,
  ) {}

  eq(field: string, value: unknown) {
    this.filters.push((row) => row[field] === value);
    return this;
  }

  in(field: string, values: unknown[]) {
    this.filters.push((row) => values.includes(row[field]));
    return this;
  }

  lte(field: string, value: unknown) {
    this.filters.push((row) => row[field] <= value);
    return this;
  }

  not(field: string, operator: string, value: unknown) {
    if (operator === 'is' && value === null) {
      this.filters.push((row) => row[field] !== null && row[field] !== undefined);
      return this;
    }

    this.filters.push((row) => row[field] !== value);
    return this;
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.execute().then(onfulfilled, onrejected);
  }

  private execute() {
    const matches = this.rows.filter((row) => this.filters.every((filter) => filter(row)));
    for (const row of matches) {
      Object.assign(row, this.payload);
    }
    return Promise.resolve({ data: null, error: null });
  }
}

class InsertQuery {
  private selectedColumns?: string;

  constructor(
    private readonly table: keyof RuntimeState,
    private readonly rows: Row[],
    payload: Row | Row[],
  ) {
    for (const item of asArray(payload)) {
      const row = { ...item };
      if (!row.id) {
        const prefix = this.table === 'apiUsage'
          ? 'api_usage'
          : this.table.slice(0, -1);
        row.id = nextId(prefix as keyof RuntimeState['ids']);
      }
      if (this.table === 'apiUsage' && !row.created_at) {
        row.created_at = new Date().toISOString();
      }
      if (this.table === 'commitments') {
        if (row.suppressed_at === undefined) {
          row.suppressed_at = null;
        }
        if (!row.updated_at) {
          row.updated_at = new Date().toISOString();
        }
      }
      this.rows.push(row);
    }
  }

  select(columns: string) {
    this.selectedColumns = columns;
    return this;
  }

  single() {
    const row = this.rows[this.rows.length - 1] ?? null;
    return Promise.resolve({
      data: row ? pickColumns(row, this.selectedColumns) : null,
      error: row ? null : new Error('row not found'),
    });
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return Promise.resolve({ data: null, error: null }).then(onfulfilled, onrejected);
  }
}

function createSupabaseMock() {
  return {
    auth: {
      admin: {
        getUserById: async (userId: string) => {
          const user = runtime.authUsers[userId];
          return {
            data: user
              ? {
                user: {
                  id: userId,
                  email: user.email,
                  email_confirmed_at: user.email_confirmed_at,
                },
              }
              : { user: null },
            error: user ? null : new Error('user not found'),
          };
        },
      },
    },
    from(table: string) {
      switch (table) {
        case 'api_usage':
          return {
            select: (columns?: string, options?: { count?: string; head?: boolean }) =>
              new SelectQuery(runtime.apiUsage, columns, options),
            insert: (payload: Row | Row[]) => new InsertQuery('apiUsage', runtime.apiUsage, payload),
          };
        case 'tkg_entities':
          return {
            select: (columns?: string, options?: { count?: string; head?: boolean }) =>
              new SelectQuery(runtime.entities, columns, options),
            insert: (payload: Row | Row[]) => new InsertQuery('entities', runtime.entities, payload),
            update: (payload: Row) => new UpdateQuery(runtime.entities, payload),
          };
        case 'tkg_commitments':
          return {
            select: (columns?: string, options?: { count?: string; head?: boolean }) =>
              new SelectQuery(runtime.commitments, columns, options),
            insert: (payload: Row | Row[]) => new InsertQuery('commitments', runtime.commitments, payload),
            update: (payload: Row) => new UpdateQuery(runtime.commitments, payload),
          };
        case 'tkg_signals':
          return {
            select: (columns?: string, options?: { count?: string; head?: boolean }) =>
              new SelectQuery(runtime.signals, columns, options),
            insert: (payload: Row | Row[]) => new InsertQuery('signals', runtime.signals, payload),
            update: (payload: Row) => new UpdateQuery(runtime.signals, payload),
          };
        case 'tkg_goals':
          return {
            select: (columns?: string, options?: { count?: string; head?: boolean }) =>
              new SelectQuery(runtime.goals, columns, options),
            insert: (payload: Row | Row[]) => new InsertQuery('goals', runtime.goals, payload),
            update: (payload: Row) => new UpdateQuery(runtime.goals, payload),
          };
        case 'tkg_actions':
          return {
            select: (columns?: string, options?: { count?: string; head?: boolean }) =>
              new SelectQuery(runtime.actions, columns, options),
            insert: (payload: Row | Row[]) => new InsertQuery('actions', runtime.actions, payload),
            update: (payload: Row) => new UpdateQuery(runtime.actions, payload),
          };
        case 'user_subscriptions':
          return {
            select: (columns?: string, options?: { count?: string; head?: boolean }) =>
              new SelectQuery(runtime.userSubscriptions, columns, options),
            update: (payload: Row) => new UpdateQuery(runtime.userSubscriptions, payload),
          };
        case 'user_tokens':
          return {
            select: (columns?: string, options?: { count?: string; head?: boolean }) =>
              new SelectQuery(runtime.userTokens, columns, options),
          };
        case 'tkg_pattern_metrics':
          return {
            select: (columns?: string, options?: { count?: string; head?: boolean }) =>
              new SelectQuery([], columns, options),
          };
        default:
          throw new Error(`Unexpected table ${table}`);
      }
    },
  };
}

vi.mock('@/lib/db/client', () => ({
  createServerClient: () => createSupabaseMock(),
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = {
      create: mockAnthropicCreate,
    };
  },
}));

vi.mock('resend', () => ({
  Resend: class MockResend {
    emails = {
      send: mockResendSend,
    };
  },
}));

function seedPipelineUser(plaintextSignal: string) {
  runtime.authUsers[TEST_USER_ID] = {
    email: TEST_EMAIL,
    email_confirmed_at: new Date().toISOString(),
  };

  runtime.entities.push({
    id: 'entity-self',
    user_id: TEST_USER_ID,
    type: 'person',
    name: 'self',
    display_name: 'You',
    emails: [],
    patterns: {},
  });

  runtime.entities.push({
    id: 'entity-jamie',
    user_id: TEST_USER_ID,
    type: 'person',
    name: 'jamie lee',
    display_name: 'Jamie Lee',
    total_interactions: 6,
    last_interaction: '2026-02-01T10:00:00.000Z',
    patterns: {},
  });

  runtime.goals.push({
    id: 'goal-1',
    user_id: TEST_USER_ID,
    goal_text: 'Send the signed permit appeal draft to Alex Morgan before Friday.',
    goal_category: 'project',
    priority: 5,
    source: 'manual',
    current_priority: true,
  });

  runtime.userTokens.push({
    id: 'token-1',
    user_id: TEST_USER_ID,
    provider: 'google',
    last_synced_at: new Date().toISOString(),
  });

  runtime.signals.push({
    id: 'signal-1',
    user_id: TEST_USER_ID,
    source: 'gmail',
    source_id: 'gmail-1',
    type: 'email_received',
    content: encrypt(plaintextSignal),
    author: 'Alex Morgan <alex@example.com>',
    occurred_at: '2026-03-24T15:00:00.000Z',
    created_at: '2026-03-24T15:00:00.000Z',
    processed: false,
    extracted_entities: null,
    extracted_commitments: null,
    extracted_dates: null,
  });
}

function anthropicResponse(payload: unknown) {
  return {
    usage: { input_tokens: 120, output_tokens: 80 },
    content: [
      {
        type: 'text',
        text: typeof payload === 'string' ? payload : JSON.stringify(payload),
      },
    ],
  };
}

function setAnthropicPipelineMocks() {
  mockAnthropicCreate.mockImplementation(async (input: { system?: string }) => {
    const system = input.system ?? '';

    if (system.includes('You are extracting structured data from raw signals')) {
      return anthropicResponse([
        {
          signal_id: 'signal-1',
          persons: [
            {
              name: 'Alex Morgan',
              email: 'alex@example.com',
              role: 'Operations Lead',
              company: 'Northwind',
            },
          ],
          commitments: [
            {
              description: 'Send the signed permit appeal draft to Alex Morgan by Friday.',
              who: 'self',
              to_whom: 'Alex Morgan',
              due: '2026-03-28T17:00:00.000Z',
              category: 'deliver_document',
            },
          ],
          topics: [
            {
              name: 'Permit appeal draft',
              domain: 'project',
            },
          ],
        },
      ]);
    }

    if (system.includes("You are Foldera's behavioral analyst")) {
      return anthropicResponse({
        directive: 'Alex Morgan asked for the signed permit appeal draft by Friday and you have not replied, so this email acknowledges the commitment before the deadline slips.',
        artifact_type: 'send_message',
        artifact: {
          to: 'alex@example.com',
          subject: 'Signed permit appeal draft by Friday',
          body: 'Hi Alex,\n\nI have the signed permit appeal draft ready and will send the final copy by Friday afternoon.\n\nBest,\nBrandon',
        },
        evidence: 'Alex Morgan requested the signed permit appeal draft by Friday and the signal has no reply from you.',
        why_now: 'The deadline is this week and the thread is already aging.',
      });
    }

    return anthropicResponse({
      patterns: [],
      commitments: [],
      goals: [],
    });
  });
}

function expectExecutableArtifact(artifact: Row) {
  expect(artifact).toBeTruthy();

  switch (artifact.type) {
    case 'email':
      expect(artifact.to).toBeTruthy();
      expect(artifact.subject).toBeTruthy();
      expect(artifact.body).toBeTruthy();
      return;
    case 'document':
      expect(artifact.title).toBeTruthy();
      expect(artifact.content).toBeTruthy();
      return;
    case 'calendar_event':
      expect(artifact.title).toBeTruthy();
      expect(artifact.start).toBeTruthy();
      expect(artifact.end).toBeTruthy();
      return;
    default:
      throw new Error(`Unexpected artifact type ${artifact.type}`);
  }
}

describe('briefing pipeline receipt', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    runtime = createRuntime();
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
    process.env.RESEND_API_KEY = 'test-resend-key';
    process.env.RESEND_FROM_EMAIL = 'Foldera <brief@foldera.ai>';
    process.env.NEXTAUTH_URL = 'https://www.foldera.ai';
    process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');

    seedPipelineUser([
      '[Email received: Tue, 24 Mar 2026 08:00:00 -0700]',
      'From: Alex Morgan <alex@example.com>',
      'Subject: Signed permit appeal draft needed by Friday',
      'Body: Brandon, can you send the signed permit appeal draft by Friday so we can file it on time?',
    ].join('\n'));

    setAnthropicPipelineMocks();
    mockResendSend.mockResolvedValue({ data: { id: 're_12345' }, error: null });
  });

  it('verifies the pipeline end to end with a real encrypted signal', async () => {
    const { processUnextractedSignals } = await import('@/lib/signals/signal-processor');
    const { scoreOpenLoops } = await import('@/lib/briefing/scorer');
    const { generateDirective } = await import('@/lib/briefing/generator');
    const { runDailyGenerate, runDailySend } = await import('@/lib/cron/daily-brief');

    const rawSignal = runtime.signals[0];
    expect(rawSignal.user_id).toBe(TEST_USER_ID);
    expect(rawSignal.content).not.toContain('Signed permit appeal draft needed by Friday');
    expect(decryptWithStatus(rawSignal.content).usedFallback).toBe(false);

    const extraction = await processUnextractedSignals(TEST_USER_ID, { maxSignals: 1 });
    expect(extraction.signals_processed).toBe(1);

    const processedSignal = runtime.signals.find((signal) => signal.id === 'signal-1');
    expect(processedSignal?.extracted_entities).not.toBeNull();
    expect(processedSignal?.extracted_entities).not.toEqual([]);

    const scored = await scoreOpenLoops(TEST_USER_ID);
    expect(scored?.winner).toBeTruthy();
    expect(scored?.winner.score ?? 0).toBeGreaterThan(0);

    const directive = await generateDirective(TEST_USER_ID);
    expect(directive.action_type).not.toBe('do_nothing');
    expect((directive as Row).embeddedArtifact).toBeTruthy();

    const generateResult = await runDailyGenerate({ userIds: [TEST_USER_ID] });
    expect(generateResult.results).toEqual([
      expect.objectContaining({
        code: 'pending_approval_persisted',
        success: true,
        userId: TEST_USER_ID,
      }),
    ]);

    const savedAction = runtime.actions.find(
      (action) => action.user_id === TEST_USER_ID && action.status === 'pending_approval',
    );
    expect(savedAction).toBeTruthy();
    expect(savedAction?.action_type).not.toBe('do_nothing');
    expect(savedAction?.execution_result?.artifact).toBeTruthy();
    expect(savedAction?.execution_result?.artifact?.type).not.toBe('wait_rationale');
    expectExecutableArtifact(savedAction!.execution_result.artifact);

    const sendResult = await runDailySend({ userIds: [TEST_USER_ID] });
    expect(sendResult.results).toEqual([
      expect.objectContaining({
        code: 'email_sent',
        success: true,
        userId: TEST_USER_ID,
        meta: expect.objectContaining({
          resend_id: 're_12345',
        }),
      }),
    ]);
    expect(mockResendSend).toHaveBeenCalledTimes(1);

    const sentAction = runtime.actions.find((action) => action.id === savedAction?.id);
    expect(sentAction?.execution_result?.daily_brief_sent_at).toEqual(expect.any(String));
  }, 30000);
});
