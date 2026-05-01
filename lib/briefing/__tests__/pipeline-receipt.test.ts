import { beforeEach, describe, expect, it, vi } from 'vitest';
import { decryptWithStatus, encrypt } from '@/lib/encryption';

type Row = Record<string, any>;

type RuntimeState = {
  apiUsage: Row[];
  entities: Row[];
  commitments: Row[];
  signals: Row[];
  signalSelectColumns: string[];
  goals: Row[];
  actions: Row[];
  userSubscriptions: Row[];
  userTokens: Row[];
  mlSnapshots: Row[];
  mlGlobalPriors: Row[];
  briefCycleGates: Row[];
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
    signalSelectColumns: [],
    goals: [],
    actions: [],
    userSubscriptions: [],
    userTokens: [],
    mlSnapshots: [],
    mlGlobalPriors: [],
    briefCycleGates: [],
    authUsers: {},
    ids: {
      entity: 0,
      commitment: 0,
      signal: 0,
      goal: 0,
      action: 0,
      api_usage: 0,
      ml_snapshot: 0,
      ml_global_prior: 0,
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
    return this;
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
        const prefix =
          this.table === 'apiUsage'
            ? 'api_usage'
            : this.table === 'mlSnapshots'
              ? 'ml_snapshot'
              : this.table === 'mlGlobalPriors'
                ? 'ml_global_prior'
                : this.table === 'entities'
                  ? 'entity'
                  : this.table.slice(0, -1);
        row.id = nextId(prefix as keyof RuntimeState['ids']);
      }
      if (this.table === 'apiUsage' && !row.created_at) {
        row.created_at = new Date().toISOString();
      }
      if (this.table === 'commitments') {
        if (!row.trust_class) {
          row.trust_class = 'unclassified';
        }
        if (row.suppressed_at === undefined) {
          row.suppressed_at = null;
        }
        if (!row.updated_at) {
          row.updated_at = new Date().toISOString();
        }
      }
      if (this.table === 'entities' && !row.trust_class) {
        row.trust_class = 'unclassified';
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

/** Minimal upsert for `user_brief_cycle_gates` (onConflict: user_id). */
class BriefCycleGateUpsertQuery {
  constructor(
    private readonly rows: Row[],
    private readonly payload: Row,
  ) {}

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    const uid = this.payload.user_id;
    const idx = this.rows.findIndex((r) => r.user_id === uid);
    if (idx >= 0) {
      Object.assign(this.rows[idx], this.payload);
    } else {
      this.rows.push({ ...this.payload });
    }
    return Promise.resolve({ data: null, error: null }).then(onfulfilled, onrejected);
  }
}

function createSupabaseMock() {
  return {
    rpc: async (
      fnName: string,
      _params?: Record<string, unknown>,
    ): Promise<{ data: unknown; error: { message: string; code?: string } | null }> => {
      if (fnName === 'api_budget_check_and_reserve') {
        return { data: { allowed: true }, error: null };
      }
      if (fnName === 'apply_commitment_ceiling') {
        return { data: { suppressed_count: 0 }, error: null };
      }
      return { data: null, error: { message: `unexpected rpc ${fnName}` } };
    },
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
            select: (columns?: string, options?: { count?: string; head?: boolean }) => {
              runtime.signalSelectColumns.push(columns ?? '*');
              return new SelectQuery(runtime.signals, columns, options);
            },
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
        case 'tkg_directive_ml_snapshots':
          return {
            select: (columns?: string, options?: { count?: string; head?: boolean }) =>
              new SelectQuery(runtime.mlSnapshots, columns, options),
            insert: (payload: Row | Row[]) => new InsertQuery('mlSnapshots', runtime.mlSnapshots, payload),
            update: (payload: Row) => new UpdateQuery(runtime.mlSnapshots, payload),
          };
        case 'tkg_directive_ml_global_priors':
          return {
            select: (columns?: string, options?: { count?: string; head?: boolean }) =>
              new SelectQuery(runtime.mlGlobalPriors, columns, options),
            insert: (payload: Row | Row[]) => new InsertQuery('mlGlobalPriors', runtime.mlGlobalPriors, payload),
            update: (payload: Row) => new UpdateQuery(runtime.mlGlobalPriors, payload),
          };
        case 'tkg_constraints':
          return {
            select: (columns?: string, options?: { count?: string; head?: boolean }) =>
              new SelectQuery([], columns, options),
          };
        case 'user_brief_cycle_gates':
          return {
            select: (columns?: string, options?: { count?: string; head?: boolean }) =>
              new SelectQuery(runtime.briefCycleGates, columns, options),
            upsert: (payload: Row | Row[]) =>
              new BriefCycleGateUpsertQuery(runtime.briefCycleGates, asArray(payload)[0]),
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
    goal_text: 'Submit the signed permit appeal contract to Alex Morgan (Director) for approval before Friday.',
    goal_category: 'project',
    priority: 1,
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

function isContentSelectingColumns(columns: string): boolean {
  return /\bcontent\b/i.test(columns);
}

function flattenAnthropicPrompt(input: {
  system?: string;
  messages?: Array<{ content?: unknown }>;
}): string {
  const parts: string[] = [];
  if (typeof input.system === 'string') {
    parts.push(input.system);
  }

  for (const message of input.messages ?? []) {
    const content = message.content;
    if (typeof content === 'string') {
      parts.push(content);
      continue;
    }

    if (Array.isArray(content)) {
      for (const part of content) {
        if (part && typeof part === 'object' && 'text' in part && typeof (part as { text?: unknown }).text === 'string') {
          parts.push((part as { text: string }).text);
        }
      }
    }
  }

  return parts.join('\n');
}

function setAnthropicPipelineMocks() {
  mockAnthropicCreate.mockImplementation(async (input: {
    system?: string;
    messages?: Array<{ content?: unknown }>;
  }) => {
    const system = input.system ?? '';
    const prompt = flattenAnthropicPrompt(input);
    const promptBlob = `${system}\n${prompt}`;

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
              description: 'Submit the signed permit appeal contract to Alex Morgan (Director) for approval by Friday.',
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

    // Directive generation system prompt (operator / artifact renderer / analyst / conviction engine).
    if (
      system.includes('FOLDERA ARTIFACT RENDERER') ||
      system.includes('FOLDERA DISCREPANCY ENGINE') ||
      system.includes('FOLDERA CONVICTION ENGINE') ||
      system.includes("You are Foldera's behavioral analyst") ||
      system.includes("You are Foldera. You are the user's operator.")
    ) {
      if (promptBlob.includes('locked artifact type: write_document')) {
        return anthropicResponse({
          action: 'write_document',
          confidence: 82,
          reason: 'Alex Morgan requested the signed permit appeal draft by Friday and you have not replied — thread is 72h old.',
          causal_diagnosis: {
            why_exists_now:
              'Alex’s email set a Friday deadline for the signed permit appeal draft; the thread has gone unanswered.',
            mechanism:
              'A hard external deadline plus no outbound reply leaves approval and filing ownership undefined.',
          },
          directive: 'Lock the permit approval decision and final filing owner today.',
          artifact_type: 'write_document',
          artifact: {
            document_purpose: 'approval brief',
            target_reader: 'Brandon Kapp',
            title: 'Permit appeal approval decision needed today',
            content:
              'Alex Morgan requested the signed permit appeal draft by Friday. Today the open issue is whether the draft is approved for filing and who owns final submission. Confirm that decision now so the filing window does not slip past the stated deadline.',
          },
          why_now:
            'Alex Morgan requested the signed permit appeal draft by Friday and you have not replied — thread is 72h old.',
        });
      }

      return anthropicResponse({
        action: 'send_message',
        confidence: 82,
        reason: 'Alex Morgan requested the signed permit appeal draft by Friday and you have not replied — thread is 72h old.',
        causal_diagnosis: {
          why_exists_now:
            'Alex’s email set a Friday deadline for the signed permit appeal draft; the thread has gone unanswered.',
          mechanism:
            'A hard external deadline plus no outbound reply leaves approval and filing ownership undefined.',
        },
        message: {
          to: 'alex@example.com',
          subject: 'Signed permit appeal draft by Friday',
          body: 'Hi Alex,\n\nCan you confirm by 4 PM PT today that this signed permit appeal draft is approved for filing, and who owns final submission? If we miss this cutoff, the filing window slips and creates deadline risk.\n\nBest,\nBrandon',
        },
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
    process.env.RESEND_FROM_EMAIL = 'Foldera <noreply@foldera.ai>';
    process.env.NEXTAUTH_URL = 'https://foldera.ai';
    process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');

    seedPipelineUser([
      '[Email received: Tue, 24 Mar 2026 08:00:00 -0700]',
      'From: Alex Morgan <alex@example.com>',
      'Subject: Contract approval — signed permit appeal draft needed by Friday',
      'Body: Brandon, as Director of Operations I need you to submit the signed permit appeal draft by Friday so we can approve the filing before the deadline expires.',
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

    runtime.signalSelectColumns = [];
    const scored = await scoreOpenLoops(TEST_USER_ID);
    expect(scored?.winner).toBeTruthy();
    expect(scored?.winner.score ?? 0).toBeGreaterThan(0);
    expect(runtime.signalSelectColumns.some((columns) => isContentSelectingColumns(columns))).toBe(false);

    runtime.signalSelectColumns = [];
    const directive = await generateDirective(TEST_USER_ID);
    expect(directive.action_type).not.toBe('do_nothing');
    expect((directive as Row).embeddedArtifact).toBeTruthy();
    const directiveUsageRows = runtime.apiUsage.filter((row) =>
      row.endpoint === 'directive' || row.endpoint === 'directive_retry',
    );
    expect(directiveUsageRows.length).toBeGreaterThan(0);
    expect(directiveUsageRows.every((row) => row.model === 'claude-haiku-4-5-20251001')).toBe(true);
    const anomalyUsageRows = runtime.apiUsage.filter((row) => row.endpoint === 'anomaly_identification');
    expect(anomalyUsageRows.length).toBeGreaterThan(0);
    expect(anomalyUsageRows.every((row) => row.model === 'claude-haiku-4-5-20251001')).toBe(true);
    const firstContentSelectIndex = runtime.signalSelectColumns.findIndex((columns) =>
      isContentSelectingColumns(columns),
    );
    expect(firstContentSelectIndex).toBeGreaterThanOrEqual(0);
    expect(
      runtime.signalSelectColumns
        .slice(0, firstContentSelectIndex)
        .every((columns) => !isContentSelectingColumns(columns)),
    ).toBe(true);

    const generateResult = await runDailyGenerate({ userIds: [TEST_USER_ID] });
    const expectedGateBlockedDetail =
      'Artifact quality gate blocked: outside_command_center_scope; unclassified_artifact';
    const expectedGateBlockedReasons = ['outside_command_center_scope', 'unclassified_artifact'];
    expect(generateResult.results).toEqual([
      expect.objectContaining({
        code: 'no_send_persisted',
        detail: expectedGateBlockedDetail,
        meta: expect.objectContaining({
          artifact_quality_fail_safe_status: 'GREEN',
          artifact_quality_gate_blocked_reasons: expectedGateBlockedReasons,
          outcome_receipt: expect.objectContaining({
            artifact: expect.objectContaining({
              artifact_pass_fail: 'FAIL',
            }),
          }),
        }),
        success: true,
        userId: TEST_USER_ID,
      }),
    ]);

    const savedAction = runtime.actions.find(
      (action) => action.user_id === TEST_USER_ID && action.status === 'skipped',
    );
    expect(savedAction).toBeTruthy();
    expect(savedAction?.action_type).toBe('do_nothing');
    expect(savedAction?.reason).toBe(expectedGateBlockedDetail);
    expect(savedAction?.execution_result?.artifact_quality_gate).toEqual(
      expect.objectContaining({
        category: null,
        reasons: expectedGateBlockedReasons,
        fail_safe_status: 'GREEN',
      }),
    );
    expect(savedAction?.execution_result?.original_candidate).toEqual(
      expect.objectContaining({
        action_type: 'write_document',
        blocked_by: expectedGateBlockedDetail,
      }),
    );
    expect(
      runtime.actions.some((action) => action.user_id === TEST_USER_ID && action.status === 'pending_approval'),
    ).toBe(false);

    const sendResult = await runDailySend({ userIds: [TEST_USER_ID] });
    expect(sendResult.results).toEqual([
      expect.objectContaining({
        code: 'email_sent',
        success: true,
        userId: TEST_USER_ID,
        meta: expect.objectContaining({
          action_id: savedAction?.id,
          artifact_type: 'wait_rationale',
          no_send_blocker: true,
          resend_id: 're_12345',
        }),
      }),
    ]);
    expect(mockResendSend).toHaveBeenCalledTimes(1);

    const sentAction = runtime.actions.find((action) => action.id === savedAction?.id);
    expect(sentAction?.execution_result?.daily_brief_sent_at).toEqual(expect.any(String));
    expect(sentAction?.execution_result?.resend_id).toBe('re_12345');
  }, 30000);
});
