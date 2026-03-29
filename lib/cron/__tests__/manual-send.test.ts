import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runDailySend } from '../daily-brief';
import { getVerifiedDailyBriefRecipientEmail } from '@/lib/auth/daily-brief-users';
import { sendDailyDirective } from '@/lib/email/resend';

const USER_ID = '55555555-5555-5555-5555-555555555555';

const mockSupabase = {
  actionRows: [] as Array<Record<string, unknown>>,
  updatedActions: [] as Array<Record<string, unknown>>,

  from(table: string) {
    const self = this;

    if (table === 'tkg_actions') {
      return {
        select(_columns?: string, options?: { count?: string; head?: boolean }) {
          const state = {
            filters: {} as Record<string, unknown>,
            gteField: null as string | null,
            gteValue: null as string | null,
            notField: null as string | null,
          };

          const query = {
            eq(field: string, value: unknown) {
              state.filters[field] = value;
              return query;
            },
            gte(field: string, value: string) {
              state.gteField = field;
              state.gteValue = value;
              return query;
            },
            not(field: string) {
              state.notField = field;

              let rows = [...self.actionRows];
              for (const [filterField, filterValue] of Object.entries(state.filters)) {
                rows = rows.filter((row) => row[filterField] === filterValue);
              }
              if (state.gteField && state.gteValue) {
                rows = rows.filter((row) => {
                  const fieldValue = row[state.gteField!];
                  return typeof fieldValue === 'string' && fieldValue >= state.gteValue!;
                });
              }

              if (options?.head && options.count === 'exact') {
                const count = rows.filter((row) => {
                  const executionResult = row.execution_result as Record<string, unknown> | undefined;
                  return Boolean(executionResult?.daily_brief_sent_at);
                }).length;

                return Promise.resolve({ count, error: null });
              }

              return Promise.resolve({ data: rows, error: null });
            },
            order() {
              return query;
            },
            limit(count: number) {
              let rows = [...self.actionRows];
              for (const [filterField, filterValue] of Object.entries(state.filters)) {
                rows = rows.filter((row) => row[filterField] === filterValue);
              }
              if (state.gteField && state.gteValue) {
                rows = rows.filter((row) => {
                  const fieldValue = row[state.gteField!];
                  return typeof fieldValue === 'string' && fieldValue >= state.gteValue!;
                });
              }

              if (options?.head && options.count === 'exact') {
                return Promise.resolve({ count: rows.length, error: null });
              }

              return Promise.resolve({ data: rows.slice(0, count), error: null });
            },
          };

          return query;
        },
        update(payload: Record<string, unknown>) {
          return {
            eq(field: string, value: unknown) {
              self.updatedActions.push({ payload, [field]: value });
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    }

    if (table === 'tkg_signals' || table === 'tkg_commitments' || table === 'tkg_goals') {
      return {
        select(_columns?: string, options?: { count?: string; head?: boolean }) {
          const query = {
            eq() {
              return query;
            },
            is() {
              return query;
            },
            gte() {
              return Promise.resolve({ count: 0, error: null });
            },
          };

          if (options?.head && options.count === 'exact') {
            return {
              eq() {
                return query;
              },
              is() {
                return query;
              },
              gte() {
                return Promise.resolve({ count: 0, error: null });
              },
            };
          }

          return query;
        },
      };
    }

    if (table === 'user_tokens') {
      return {
        select() {
          return {
            eq() {
              return {
                order() {
                  return {
                    limit() {
                      return {
                        maybeSingle: () => Promise.resolve({ data: { last_synced_at: null }, error: null }),
                      };
                    },
                  };
                },
              };
            },
          };
        },
      };
    }

    throw new Error(`Unexpected table ${table}`);
  },
};

vi.mock('@/lib/db/client', () => ({
  createServerClient: () => mockSupabase,
}));

vi.mock('@/lib/auth/daily-brief-users', () => ({
  filterDailyBriefEligibleUserIds: vi.fn(async (userIds: string[]) => userIds),
  getVerifiedDailyBriefRecipientEmail: vi.fn(),
}));

vi.mock('@/lib/email/resend', () => ({
  sendDailyDirective: vi.fn(),
}));

vi.mock('@/lib/briefing/generator', () => ({
  buildDirectiveExecutionResult: vi.fn(),
  generateDirective: vi.fn(),
  validateDirectiveForPersistence: vi.fn(),
}));

vi.mock('@/lib/conviction/artifact-generator', () => ({
  generateArtifact: vi.fn(),
  getArtifactPersistenceIssues: vi.fn().mockReturnValue([]),
}));

vi.mock('@/lib/extraction/conversation-extractor', () => ({
  extractFromConversation: vi.fn(),
}));

vi.mock('@/lib/signals/signal-processor', () => ({
  countUnprocessedSignals: vi.fn(),
  processUnextractedSignals: vi.fn(),
}));

vi.mock('@/lib/signals/summarizer', () => ({
  summarizeSignals: vi.fn(),
}));

vi.mock('@/lib/utils/structured-logger', () => ({
  logStructuredEvent: vi.fn(),
}));

describe('runDailySend explicit user scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase.actionRows = [];
    mockSupabase.updatedActions = [];
  });

  it('sends email for an explicitly scoped user without relying on owner eligibility', async () => {
    vi.mocked(getVerifiedDailyBriefRecipientEmail).mockResolvedValue('member@example.com');
    vi.mocked(sendDailyDirective).mockResolvedValue({ data: { id: 'resend-555' } } as never);
    mockSupabase.actionRows = [
      {
        id: 'action-555',
        user_id: USER_ID,
        status: 'pending_approval',
        action_type: 'send_message',
        directive_text: 'Send the update email.',
        reason: 'Keep momentum.',
        confidence: 84,
        generated_at: new Date().toISOString(),
        execution_result: {
          artifact: {
            type: 'email',
            to: 'member@example.com',
            subject: 'Update',
            body: 'Hello',
          },
        },
      },
    ];

    const result = await runDailySend({ userIds: [USER_ID] });

    expect(result.results).toEqual([
      expect.objectContaining({
        code: 'email_sent',
        success: true,
        userId: USER_ID,
        meta: expect.objectContaining({
          action_id: 'action-555',
          resend_id: 'resend-555',
        }),
      }),
    ]);
    expect(sendDailyDirective).toHaveBeenCalledTimes(1);
    expect(mockSupabase.updatedActions).toEqual([
      expect.objectContaining({
        id: 'action-555',
        payload: expect.objectContaining({
          execution_result: expect.objectContaining({
            daily_brief_sent_at: expect.any(String),
          }),
        }),
      }),
    ]);
  });
});
