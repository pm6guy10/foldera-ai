import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OWNER_USER_ID } from '@/lib/auth/constants';
import { TEST_USER_ID } from '@/lib/config/constants';

type Row = Record<string, any>;
type TableName = 'user_tokens' | 'tkg_signals' | 'tkg_commitments' | 'tkg_actions' | 'user_subscriptions';

interface MockDb {
  user_tokens: Row[];
  tkg_signals: Row[];
  tkg_commitments: Row[];
  tkg_actions: Row[];
  user_subscriptions: Row[];
}

const from = vi.fn();
const getUserById = vi.fn();
const sendResendEmail = vi.fn();
const logStructuredEvent = vi.fn();
const anthropicCreate = vi.fn();

let mockDb: MockDb;
const authUsers = new Map<string, Row | null>();

function cloneRows(rows: Row[]): Row[] {
  return rows.map((row) => ({ ...row }));
}

function createQuery(rows: Row[], selectOptions?: { count?: string; head?: boolean }) {
  let workingRows = cloneRows(rows);
  let limitValue: number | null = null;
  let orderValue: { column: string; ascending: boolean } | null = null;

  const execute = async () => {
    let resultRows = cloneRows(workingRows);
    if (orderValue) {
      const { column, ascending } = orderValue;
      resultRows.sort((a, b) => {
        const av = a[column];
        const bv = b[column];
        if (av === bv) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        if (av < bv) return ascending ? -1 : 1;
        return ascending ? 1 : -1;
      });
    }
    if (typeof limitValue === 'number') {
      resultRows = resultRows.slice(0, limitValue);
    }
    if (selectOptions?.head) {
      return { count: resultRows.length, error: null };
    }
    return { data: resultRows, error: null };
  };

  const query: any = {
    eq(column: string, value: unknown) {
      workingRows = workingRows.filter((row) => row[column] === value);
      return query;
    },
    neq(column: string, value: unknown) {
      workingRows = workingRows.filter((row) => row[column] !== value);
      return query;
    },
    is(column: string, value: unknown) {
      if (value === null) {
        workingRows = workingRows.filter((row) => row[column] == null);
      } else {
        workingRows = workingRows.filter((row) => row[column] === value);
      }
      return query;
    },
    not(column: string, operator: string, value: unknown) {
      if (operator === 'is' && value === null) {
        workingRows = workingRows.filter((row) => row[column] != null);
      } else {
        workingRows = workingRows.filter((row) => row[column] !== value);
      }
      return query;
    },
    lt(column: string, value: any) {
      workingRows = workingRows.filter((row) => row[column] < value);
      return query;
    },
    gte(column: string, value: any) {
      workingRows = workingRows.filter((row) => row[column] >= value);
      return query;
    },
    in(column: string, values: unknown[]) {
      const allowed = new Set(values);
      workingRows = workingRows.filter((row) => allowed.has(row[column]));
      return query;
    },
    order(column: string, options?: { ascending?: boolean }) {
      orderValue = { column, ascending: options?.ascending !== false };
      return query;
    },
    limit(value: number) {
      limitValue = value;
      return query;
    },
    maybeSingle: async () => {
      const result = await execute();
      const data = (result as { data?: Row[] }).data ?? [];
      return { data: data[0] ?? null, error: null };
    },
    then: (resolve: (value: any) => unknown, reject: (reason?: any) => unknown) =>
      execute().then(resolve, reject),
  };

  return query;
}

vi.mock('@/lib/db/client', () => ({
  createServerClient: () => ({
    from,
    auth: {
      admin: {
        getUserById,
      },
    },
  }),
}));

vi.mock('@/lib/email/resend', () => ({
  renderPlaintextEmailHtml: vi.fn((body: string) => `<p>${body}</p>`),
  sendResendEmail,
}));

vi.mock('@/lib/utils/structured-logger', () => ({
  logStructuredEvent,
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = {
      create: anthropicCreate,
    };
  },
}));

describe('runAcceptanceGate', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    const nowIso = new Date().toISOString();
    const tomorrowMs = Date.now() + 24 * 60 * 60 * 1000;
    const nonOwnerUserId = 'non-owner-1';

    mockDb = {
      user_tokens: [
        {
          user_id: OWNER_USER_ID,
          provider: 'google',
          email: 'owner@example.com',
          access_token: 'owner-token',
          refresh_token: 'owner-refresh',
          expires_at: tomorrowMs,
          disconnected_at: null,
        },
        {
          user_id: nonOwnerUserId,
          provider: 'google',
          email: 'member@example.com',
          access_token: 'member-token',
          refresh_token: 'member-refresh',
          expires_at: tomorrowMs,
          disconnected_at: null,
        },
        {
          user_id: TEST_USER_ID,
          provider: 'google',
          email: 'test@example.com',
          access_token: 'test-token',
          refresh_token: null,
          expires_at: Date.now() + 1_000,
          disconnected_at: null,
        },
      ],
      tkg_signals: [],
      tkg_commitments: [],
      tkg_actions: [
        {
          id: 'owner-action-1',
          user_id: OWNER_USER_ID,
          action_type: 'send_message',
          status: 'executed',
          execution_result: { resend_id: 'resend-owner' },
          generated_at: nowIso,
        },
        {
          id: 'member-action-1',
          user_id: nonOwnerUserId,
          action_type: 'do_nothing',
          status: 'skipped',
          execution_result: { outcome_type: 'no_send' },
          generated_at: nowIso,
        },
      ],
      user_subscriptions: [
        { user_id: nonOwnerUserId, plan: 'trial', status: 'active' },
      ],
    };

    authUsers.clear();
    authUsers.set(OWNER_USER_ID, { id: OWNER_USER_ID, email: 'owner@example.com' });
    authUsers.set(nonOwnerUserId, { id: nonOwnerUserId, email: 'member@example.com' });

    from.mockImplementation((table: TableName) => ({
      select: (_columns: string, options?: { count?: string; head?: boolean }) =>
        createQuery((mockDb as Record<TableName, Row[]>)[table] ?? [], options),
    }));

    getUserById.mockImplementation(async (userId: string) => ({
      data: { user: authUsers.get(userId) ?? null },
      error: null,
    }));

    sendResendEmail.mockResolvedValue({ data: { id: 'email-1' }, error: null });
    // Ensure the env-var canary passes by default in all tests
    process.env.ANTHROPIC_API_KEY = 'sk-test-canary';
  });

  it('passes api_credit_canary when ANTHROPIC_API_KEY is set', async () => {
    const { runAcceptanceGate } = await import('../acceptance-gate');
    const result = await runAcceptanceGate();

    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          check: 'api_credit_canary',
          pass: true,
          detail: 'ANTHROPIC_API_KEY is set',
        }),
      ]),
    );
  });

  it('fails api_credit_canary and sends alert when ANTHROPIC_API_KEY is missing', async () => {
    const savedKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      const { runAcceptanceGate } = await import('../acceptance-gate');
      const result = await runAcceptanceGate();

      expect(result.ok).toBe(false);
      expect(result.checks).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            check: 'api_credit_canary',
            pass: false,
            detail: 'ANTHROPIC_API_KEY is missing or empty',
          }),
        ]),
      );
      expect(sendResendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: 'Foldera: API credits may be exhausted',
        }),
      );
    } finally {
      if (savedKey !== undefined) {
        process.env.ANTHROPIC_API_KEY = savedKey;
      }
    }
  });

  it('fails NON_OWNER_DEPTH when only owner and synthetic test token users are connected', async () => {
    mockDb.user_tokens = mockDb.user_tokens.filter((row) => row.user_id !== 'non-owner-1');
    mockDb.user_subscriptions = [];
    mockDb.tkg_actions = mockDb.tkg_actions.filter((row) => row.user_id === OWNER_USER_ID);
    authUsers.delete('non-owner-1');

    const { runAcceptanceGate } = await import('../acceptance-gate');
    const result = await runAcceptanceGate();

    const nonOwnerCheck = result.checks.find((check) => check.check === 'NON_OWNER_DEPTH');
    const sessionCheck = result.checks.find((check) => check.check === 'SESSION');

    expect(nonOwnerCheck).toMatchObject({
      check: 'NON_OWNER_DEPTH',
      pass: false,
      detail: 'No connected non-owner users (owner-only run).',
    });
    expect(sessionCheck).toMatchObject({
      check: 'SESSION',
      pass: true,
    });
  });

  it('passes NON_OWNER_DEPTH when a real non-owner has active subscription and persisted evidence', async () => {
    const { runAcceptanceGate } = await import('../acceptance-gate');
    const result = await runAcceptanceGate();

    expect(result.ok).toBe(true);
    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          check: 'NON_OWNER_DEPTH',
          pass: true,
          detail: 'Non-owner production depth verified for 1 user(s).',
        }),
      ]),
    );
  });
});
