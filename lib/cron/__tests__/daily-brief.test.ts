import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConvictionDirective, GenerationRunLog } from '@/lib/briefing/types';
import { getTriggerResponseStatus, runDailyGenerate, runDailySend } from '../daily-brief';
import { generateDirective, validateDirectiveForPersistence } from '@/lib/briefing/generator';
import { generateArtifact, getArtifactPersistenceIssues } from '@/lib/conviction/artifact-generator';
import { persistDirectiveHistorySignal } from '@/lib/signals/directive-history-signal';
import { countUnprocessedSignals, processUnextractedSignals } from '@/lib/signals/signal-processor';
import { summarizeSignals } from '@/lib/signals/summarizer';
import { getVerifiedDailyBriefRecipientEmail } from '@/lib/auth/daily-brief-users';
import { sendDailyDirective } from '@/lib/email/resend';
import { logStructuredEvent } from '@/lib/utils/structured-logger';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const { mockResolveSignalBacklogMode } = vi.hoisted(() => ({
  mockResolveSignalBacklogMode: vi.fn((unprocessedCount: number) => (
    unprocessedCount >= 100
      ? { mode: 'high', maxSignals: 100, rounds: 10 }
      : { mode: 'low', maxSignals: 50, rounds: 3 }
  )),
}));

const mockSupabase = {
  actionRows: [] as Array<Record<string, unknown>>,
  insertedActions: [] as Array<Record<string, unknown>>,
  updatedActions: [] as Array<Record<string, unknown>>,
  briefCycleGateRows: [] as Array<{ user_id: string; last_cycle_at: string }>,
  pipelineRunRows: [] as Array<Record<string, unknown>>,

  auth: {
    admin: {
      getUserById: () =>
        Promise.resolve({
          data: { user: { created_at: '2020-01-01T00:00:00.000Z' } },
          error: null,
        }),
    },
  },

  from(table: string) {
    const self = this;

    if (table === 'tkg_directive_ml_global_priors') {
      return {
        select() {
          return Promise.resolve({ data: [], error: null });
        },
        insert() {
          return Promise.resolve({ error: null });
        },
      };
    }

    if (table === 'tkg_directive_ml_snapshots') {
      return {
        select() {
          return Promise.resolve({ data: [], error: null });
        },
        insert() {
          return Promise.resolve({ error: null });
        },
        update() {
          return {
            eq: () => Promise.resolve({ error: null }),
          };
        },
      };
    }

    if (table === 'user_subscriptions') {
      return {
        update() {
          return {
            eq() {
              return {
                eq() {
                  return {
                    lte: () => Promise.resolve({ error: null }),
                  };
                },
              };
            },
          };
        },
      };
    }

    if (table === 'user_brief_cycle_gates') {
      return {
        select() {
          return {
            in(_col: string, ids: string[]) {
              const rows = self.briefCycleGateRows.filter((r) => ids.includes(r.user_id));
              return Promise.resolve({ data: rows, error: null });
            },
          };
        },
        upsert(payload: Record<string, unknown> | Record<string, unknown>[]) {
          const rows = Array.isArray(payload) ? payload : [payload];
          for (const p of rows) {
            const uid = p.user_id as string;
            const at = p.last_cycle_at as string;
            const idx = self.briefCycleGateRows.findIndex((r) => r.user_id === uid);
            if (idx >= 0) {
              self.briefCycleGateRows[idx] = { user_id: uid, last_cycle_at: at };
            } else {
              self.briefCycleGateRows.push({ user_id: uid, last_cycle_at: at });
            }
          }
          return Promise.resolve({ error: null });
        },
      };
    }

    if (table === 'pipeline_runs') {
      return {
        select() {
          const state = {
            filters: {} as Record<string, unknown>,
            gteFilters: [] as Array<{ field: string; value: string }>,
          };

          const query = {
            eq(field: string, value: unknown) {
              state.filters[field] = value;
              return query;
            },
            gte(field: string, value: string) {
              state.gteFilters.push({ field, value });
              return query;
            },
            limit(count: number) {
              let rows = [...self.pipelineRunRows];

              for (const [field, value] of Object.entries(state.filters)) {
                rows = rows.filter((row) => row[field] === value);
              }

              for (const { field, value } of state.gteFilters) {
                rows = rows.filter((row) => {
                  const fieldValue = row[field];
                  return typeof fieldValue === 'string' && fieldValue >= value;
                });
              }

              return Promise.resolve({ data: rows.slice(0, count), error: null });
            },
          };

          return query;
        },
      };
    }

    if (table === 'tkg_entities') {
      return {
        select() {
          return {
            eq: () => Promise.resolve({
              data: [{ user_id: USER_ID }],
              error: null,
            }),
          };
        },
      };
    }

    if (table === 'tkg_signals') {
      const done = () => Promise.resolve({ count: 0, error: null });
      const chain: any = {
        eq: () => chain,
        lt: () => done(),
        then: (onF: any, onR: any) => done().then(onF, onR),
      };
      return {
        select() {
          return chain;
        },
      };
    }

    if (table === 'user_tokens') {
      const emptyList = () => Promise.resolve({ data: [], error: null });
      const countHead = () => Promise.resolve({ count: 0, error: null });
      return {
        select(_cols?: unknown, opts?: { count?: string; head?: boolean }) {
          if (opts?.count === 'exact' && opts?.head) {
            return {
              eq: () => countHead(),
            };
          }
          const afterIs: any = {
            not: () => ({
              not: () => emptyList(),
              then: (onF: any, onR: any) => emptyList().then(onF, onR),
            }),
            then: (onF: any, onR: any) => emptyList().then(onF, onR),
          };
          return {
            eq: () => ({
              is: () => emptyList(),
            }),
            is: () => afterIs,
          };
        },
      };
    }

    if (table === 'tkg_goals') {
      return {
        select() {
          return {
            eq: () => ({
              in: () => Promise.resolve({ data: [], error: null }),
            }),
          };
        },
      };
    }

    if (table === 'tkg_actions') {
      return {
        insert(payload: Record<string, unknown>) {
          self.insertedActions.push(payload);
          return {
            select() {
              return {
                single: () => Promise.resolve({
                  data: { id: `action-${self.insertedActions.length}` },
                  error: null,
                }),
              };
            },
          };
        },
        select() {
          const state = {
            filters: {} as Record<string, unknown>,
            gteFilters: [] as Array<{ field: string; value: string | number }>,
            ltFilters: [] as Array<{ field: string; value: string }>,
            inFilters: [] as Array<{ field: string; values: unknown[] }>,
            isNullFilters: [] as Array<{ field: string; isNull: boolean }>,
            neqFilters: [] as Array<{ field: string; value: unknown }>,
            notField: null as string | null,
            notValue: null as unknown,
            orderField: null as string | null,
            ascending: false,
          };

          const query = {
            eq(field: string, value: unknown) {
              state.filters[field] = value;
              return query;
            },
            gte(field: string, value: string | number) {
              state.gteFilters.push({ field, value });
              return query;
            },
            lt(field: string, value: string) {
              state.ltFilters.push({ field, value });
              return query;
            },
            in(field: string, values: unknown[]) {
              state.inFilters.push({ field, values });
              return query;
            },
            is(field: string, value: null | boolean) {
              state.isNullFilters.push({ field, isNull: value === null });
              return query;
            },
            neq(field: string, value: unknown) {
              state.neqFilters.push({ field, value });
              return query;
            },
            not(field: string, _operator: string, value: unknown) {
              state.notField = field;
              state.notValue = value;
              return Promise.resolve({
                count: self.actionRows.filter((row) => {
                  const filterMatches = Object.entries(state.filters)
                    .every(([filterField, filterValue]) => row[filterField] === filterValue);
                  if (!filterMatches) return false;
                  for (const { field: gf, value: gv } of state.gteFilters) {
                    const fv = row[gf];
                    if (typeof fv === 'string' && typeof gv === 'string' && fv < gv) return false;
                    if (typeof fv === 'number' && typeof gv === 'number' && fv < gv) return false;
                  }
                  if (field === 'execution_result->daily_brief_sent_at') {
                    const sentAt = (row.execution_result as Record<string, unknown> | undefined)?.daily_brief_sent_at;
                    return (sentAt ?? null) !== value;
                  }
                  return row[field] !== value;
                }).length,
                error: null,
              });
            },
            order(field: string, options: { ascending: boolean }) {
              state.orderField = field;
              state.ascending = options.ascending;
              return query;
            },
            limit(count: number) {
              let rows = [...self.actionRows];

              for (const [field, value] of Object.entries(state.filters)) {
                rows = rows.filter((row) => row[field] === value);
              }

              for (const { field: gf, value: gv } of state.gteFilters) {
                rows = rows.filter((row) => {
                  const fv = row[gf];
                  if (typeof fv === 'string' && typeof gv === 'string') return fv >= gv;
                  if (typeof fv === 'number' && typeof gv === 'number') return fv >= gv;
                  return false;
                });
              }

              for (const { field: lf, value: lv } of state.ltFilters) {
                rows = rows.filter((row) => {
                  const fv = row[lf];
                  return typeof fv === 'string' && fv < lv;
                });
              }

              for (const { field: inf, values } of state.inFilters) {
                rows = rows.filter((row) => values.includes(row[inf]));
              }

              for (const { field: isf, isNull } of state.isNullFilters) {
                rows = rows.filter((row) => isNull ? row[isf] == null : row[isf] != null);
              }

              for (const { field: nf, value: nv } of state.neqFilters) {
                rows = rows.filter((row) => row[nf] !== nv);
              }

              if (state.orderField) {
                rows.sort((left, right) => {
                  const leftValue = left[state.orderField!];
                  const rightValue = right[state.orderField!];
                  if (leftValue === rightValue) return 0;
                  if (leftValue == null) return state.ascending ? -1 : 1;
                  if (rightValue == null) return state.ascending ? 1 : -1;
                  return leftValue < rightValue
                    ? (state.ascending ? -1 : 1)
                    : (state.ascending ? 1 : -1);
                });
              }

              const sliced = rows.slice(0, count);
              return {
                then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
                  return Promise.resolve({ data: sliced, error: null }).then(resolve, reject);
                },
                catch(reject: (e: unknown) => unknown) {
                  return Promise.resolve({ data: sliced, error: null }).catch(reject);
                },
                maybeSingle() {
                  return Promise.resolve({ data: sliced[0] ?? null, error: null });
                },
              };
            },
          };

          return query;
        },
        update(payload: Record<string, unknown>) {
          return {
            eq(field: string, value: unknown) {
              if (field === 'id') {
                const row = self.actionRows.find((r) => r.id === value);
                if (row) Object.assign(row, payload);
              }
              self.updatedActions.push({ payload, [field]: value });
              return Promise.resolve({ error: null });
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

vi.mock('@/lib/briefing/generator', async () => {
  const actual = await vi.importActual<typeof import('@/lib/briefing/generator')>('@/lib/briefing/generator');
  return {
    ...actual,
    generateDirective: vi.fn(),
    validateDirectiveForPersistence: vi.fn(),
  };
});

vi.mock('@/lib/conviction/artifact-generator', () => ({
  generateArtifact: vi.fn(),
  getArtifactPersistenceIssues: vi.fn(),
}));

vi.mock('@/lib/signals/directive-history-signal', () => ({
  persistDirectiveHistorySignal: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/signals/signal-processor', () => ({
  countUnprocessedSignals: vi.fn().mockResolvedValue(0),
  resolveSignalBacklogMode: mockResolveSignalBacklogMode,
  processUnextractedSignals: vi.fn().mockResolvedValue({
    signals_processed: 0,
    entities_upserted: 0,
    commitments_created: 0,
    topics_merged: 0,
    deferred_signal_ids: [],
    errors: [],
  }),
}));

vi.mock('@/lib/signals/summarizer', () => ({
  summarizeSignals: vi.fn().mockResolvedValue(0),
}));

vi.mock('@/lib/auth/daily-brief-users', () => ({
  filterDailyBriefEligibleUserIds: vi.fn(async (userIds: string[]) => userIds),
  getVerifiedDailyBriefRecipientEmail: vi.fn(),
}));

vi.mock('@/lib/utils/structured-logger', () => ({
  logStructuredEvent: vi.fn(),
}));

vi.mock('@/lib/email/resend', () => ({
  NO_SEND_BODY_TEXT: 'Foldera checked your recent signals and did not find anything worth interrupting you for.',
  NO_SEND_DIRECTIVE_TEXT: 'Nothing cleared the bar today.',
  NO_SEND_SUBJECT: 'Foldera: Nothing cleared the bar today',
  isInternalFailureText: vi.fn((text: string) =>
    /\bllm_failed\b|\bstale_date_in_directive\b|all\s+\d+\s+candidates blocked/i.test(text),
  ),
  sendDailyDirective: vi.fn().mockResolvedValue(undefined),
  sendDailyDeliverySkipAlert: vi.fn().mockResolvedValue(undefined),
}));

function buildGenerationLog(overrides: Partial<GenerationRunLog> = {}): GenerationRunLog {
  return {
    outcome: 'selected',
    stage: 'generation',
    reason: 'Selected because score 3.40 beat the next-best candidate at 2.95 by 0.45.',
    candidateFailureReasons: [
      'Rejected because Stakes 3 but urgency only 0.30. Important, but the window is far enough out that today is not the day.',
      'Rejected because Tractability only 0.35 - historical data shows low follow-through on this type.',
    ],
    candidateDiscovery: {
      candidateCount: 3,
      suppressedCandidateCount: 0,
      selectionMargin: 0.45,
      selectionReason: 'Selected because score 3.40 beat the next-best candidate at 2.95 by 0.45.',
      failureReason: null,
      topCandidates: [
        {
          id: 'sig-1',
          rank: 1,
          candidateType: 'signal',
          actionType: 'send_message',
          score: 3.4,
          scoreBreakdown: {
            stakes: 5,
            urgency: 0.9,
            tractability: 0.8,
            freshness: 0.95,
          },
          targetGoal: {
            text: 'Advance MAS3 hiring process',
            priority: 5,
            category: 'career',
          },
          sourceSignals: [
            {
              kind: 'signal',
              id: 'sig-1',
              source: 'outlook',
              occurredAt: '2026-03-16T17:00:00.000Z',
              summary: 'Reference prep email.',
            },
          ],
          decision: 'selected',
          decisionReason: 'Selected because score 3.40 beat the next-best candidate at 2.95 by 0.45.',
        },
        {
          id: 'commitment-1',
          rank: 2,
          candidateType: 'commitment',
          actionType: 'make_decision',
          score: 2.95,
          scoreBreakdown: {
            stakes: 4,
            urgency: 0.6,
            tractability: 0.7,
            freshness: 0.88,
          },
          targetGoal: {
            text: 'Advance MAS3 hiring process',
            priority: 5,
            category: 'career',
          },
          sourceSignals: [
            {
              kind: 'commitment',
              id: 'commitment-1',
              occurredAt: '2026-03-16T18:00:00.000Z',
              summary: 'Finalize reference packet.',
            },
          ],
          decision: 'rejected',
          decisionReason: 'Rejected because Stakes 3 but urgency only 0.30. Important, but the window is far enough out that today is not the day.',
        },
        {
          id: 'rel-1',
          rank: 3,
          candidateType: 'relationship',
          actionType: 'send_message',
          score: 2.1,
          scoreBreakdown: {
            stakes: 3,
            urgency: 0.55,
            tractability: 0.5,
            freshness: 0.85,
          },
          targetGoal: {
            text: 'Advance MAS3 hiring process',
            priority: 5,
            category: 'career',
          },
          sourceSignals: [
            {
              kind: 'relationship',
              id: 'rel-1',
              occurredAt: '2026-03-01T18:00:00.000Z',
              summary: 'Follow up with Holly.',
            },
          ],
          decision: 'rejected',
          decisionReason: 'Rejected because Tractability only 0.35 - historical data shows low follow-through on this type.',
        },
      ],
    },
    ...overrides,
  };
}

function buildDirective(overrides: Partial<ConvictionDirective> = {}): ConvictionDirective {
  return {
    directive: 'Can you confirm by 4 PM PT today whether you will send two MAS3 reference talking points, and who owns final packet delivery?',
    action_type: 'send_message',
    confidence: 82,
    reason: 'The interview packet closes tomorrow; if we miss this cutoff, MAS3 hiring momentum slips.',
    evidence: [
      { type: 'signal', description: 'Outlook thread requesting MAS3 reference material.' },
    ],
    generationLog: buildGenerationLog(),
    ...overrides,
  };
}

describe('runDailyGenerate candidate logging', () => {
  beforeEach(() => {
    mockSupabase.actionRows = [];
    mockSupabase.insertedActions = [];
    mockSupabase.updatedActions = [];
    mockSupabase.briefCycleGateRows = [];
    mockSupabase.pipelineRunRows = [];
    vi.mocked(generateDirective).mockReset();
    vi.mocked(validateDirectiveForPersistence).mockReset();
    vi.mocked(generateArtifact).mockReset();
    vi.mocked(getArtifactPersistenceIssues).mockReset();
    vi.mocked(persistDirectiveHistorySignal).mockClear();
    vi.mocked(countUnprocessedSignals).mockReset();
    mockResolveSignalBacklogMode.mockClear();
    vi.mocked(processUnextractedSignals).mockClear();
    vi.mocked(summarizeSignals).mockClear();
    vi.mocked(getVerifiedDailyBriefRecipientEmail).mockReset();
    vi.mocked(sendDailyDirective).mockClear();
    vi.mocked(logStructuredEvent).mockClear();
    vi.mocked(validateDirectiveForPersistence).mockReturnValue([]);
    vi.mocked(getArtifactPersistenceIssues).mockReturnValue([]);
    vi.mocked(countUnprocessedSignals).mockResolvedValue(0);
  });

  it('auto-drains pending_approval and draft rows older than 20h before reconcile (logs auto_drained_stale_actions)', async () => {
    const staleIso = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    mockSupabase.actionRows = [
      {
        id: 'stale-pending-1',
        user_id: USER_ID,
        status: 'pending_approval',
        action_type: 'send_message',
        confidence: 80,
        generated_at: staleIso,
        directive_text: 'd',
        execution_result: {},
        reason: null,
      },
      {
        id: 'stale-draft-1',
        user_id: USER_ID,
        status: 'draft',
        action_type: 'send_message',
        confidence: 80,
        generated_at: staleIso,
        directive_text: 'd2',
        execution_result: {},
        reason: null,
      },
    ];
    vi.mocked(generateDirective).mockResolvedValue(buildDirective());
    vi.mocked(generateArtifact).mockResolvedValue({
      type: 'email',
      to: 'holly@example.com',
      subject: 'Decision needed today: MAS3 reference packet owner by 4 PM PT',
      body: 'Hi Holly,\n\nCan you confirm by 4 PM PT today whether you can send two MAS3 reference talking points, and name who owns final packet delivery? If we miss this cutoff, the interview packet slips.\n\nThanks,\nBrandon',
      draft_type: 'email_compose',
    });

    await runDailyGenerate({ userIds: [USER_ID], skipManualCallLimit: true });

    const drainedLog = vi.mocked(logStructuredEvent).mock.calls.find(
      (call) => call[0].event === 'auto_drained_stale_actions',
    );
    expect(drainedLog?.[0].details).toMatchObject({
      count: 2,
      older_than_hours: 20,
    });
    expect(mockSupabase.actionRows.find((r) => r.id === 'stale-pending-1')?.status).toBe('skipped');
    expect(mockSupabase.actionRows.find((r) => r.id === 'stale-draft-1')?.status).toBe('skipped');
  });

  it('returns generation_cycle_cooldown when last full cycle was within 20h', async () => {
    const recent = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    mockSupabase.briefCycleGateRows = [{ user_id: USER_ID, last_cycle_at: recent }];

    const result = await runDailyGenerate({ userIds: [USER_ID] });

    expect(result.results).toEqual([
      expect.objectContaining({ code: 'generation_cycle_cooldown', success: true, userId: USER_ID }),
    ]);
    expect(vi.mocked(generateDirective)).not.toHaveBeenCalled();
  });

  it('bypasses generation_cycle_cooldown when skipManualCallLimit (e.g. brain-receipt)', async () => {
    const recent = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    mockSupabase.briefCycleGateRows = [{ user_id: USER_ID, last_cycle_at: recent }];
    vi.mocked(generateDirective).mockResolvedValue(buildDirective());
    vi.mocked(generateArtifact).mockResolvedValue({
      type: 'email',
      to: 'holly@example.com',
      subject: 'Decision needed today: MAS3 reference packet owner by 4 PM PT',
      body: 'Hi Holly,\n\nCan you confirm by 4 PM PT today whether you can send two MAS3 reference talking points, and name who owns final packet delivery? If we miss this cutoff, the interview packet slips.\n\nThanks,\nBrandon',
      draft_type: 'email_compose',
    });

    const result = await runDailyGenerate({
      userIds: [USER_ID],
      skipManualCallLimit: true,
      briefInvocationSource: 'dev_brain_receipt',
    });

    expect(result.results.some((r) => r.code === 'generation_cycle_cooldown')).toBe(false);
    expect(result.results).toEqual([
      expect.objectContaining({ code: 'pending_approval_persisted', success: true, userId: USER_ID }),
    ]);
    expect(vi.mocked(generateDirective)).toHaveBeenCalled();
  });

  it('bypasses generation_cycle_cooldown when briefInvocationSource is settings_run_brief', async () => {
    const recent = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    mockSupabase.briefCycleGateRows = [{ user_id: USER_ID, last_cycle_at: recent }];
    vi.mocked(generateDirective).mockResolvedValue(buildDirective());
    vi.mocked(generateArtifact).mockResolvedValue({
      type: 'email',
      to: 'holly@example.com',
      subject: 'Decision needed today: MAS3 reference packet owner by 4 PM PT',
      body: 'Hi Holly,\n\nCan you confirm by 4 PM PT today whether you can send two MAS3 reference talking points, and name who owns final packet delivery? If we miss this cutoff, the interview packet slips.\n\nThanks,\nBrandon',
      draft_type: 'email_compose',
    });

    const result = await runDailyGenerate({
      userIds: [USER_ID],
      briefInvocationSource: 'settings_run_brief',
    });

    expect(result.results.some((r) => r.code === 'generation_cycle_cooldown')).toBe(false);
    expect(result.results).toEqual([
      expect.objectContaining({ code: 'pending_approval_persisted', success: true, userId: USER_ID }),
    ]);
    expect(vi.mocked(generateDirective)).toHaveBeenCalled();
  });

  it('does not let a recent manual settings_run_brief checkpoint block scheduled cron generation', async () => {
    const recent = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    mockSupabase.briefCycleGateRows = [{ user_id: USER_ID, last_cycle_at: recent }];
    mockSupabase.pipelineRunRows = [
      {
        id: 'manual-user-run-1',
        user_id: USER_ID,
        phase: 'user_run',
        invocation_source: 'settings_run_brief',
        created_at: recent,
        completed_at: recent,
        outcome: 'generation_returned',
      },
    ];
    vi.mocked(generateDirective).mockResolvedValue(buildDirective());
    vi.mocked(generateArtifact).mockResolvedValue({
      type: 'email',
      to: 'holly@example.com',
      subject: 'Decision needed today: MAS3 reference packet owner by 4 PM PT',
      body: 'Hi Holly,\n\nCan you confirm by 4 PM PT today whether you can send two MAS3 reference talking points, and name who owns final packet delivery? If we miss this cutoff, the interview packet slips.\n\nThanks,\nBrandon',
      draft_type: 'email_compose',
    });

    const result = await runDailyGenerate({
      userIds: [USER_ID],
      briefInvocationSource: 'cron_daily_brief',
    });

    expect(result.results.some((r) => r.code === 'generation_cycle_cooldown')).toBe(false);
    expect(result.results).toEqual([
      expect.objectContaining({ code: 'pending_approval_persisted', success: true, userId: USER_ID }),
    ]);
    expect(vi.mocked(generateDirective)).toHaveBeenCalled();
  });

  it('still blocks duplicate scheduled cron generation when a same-day scheduled run already completed', async () => {
    const recent = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    mockSupabase.briefCycleGateRows = [{ user_id: USER_ID, last_cycle_at: recent }];
    mockSupabase.pipelineRunRows = [
      {
        id: 'scheduled-user-run-1',
        user_id: USER_ID,
        phase: 'user_run',
        invocation_source: 'cron_daily_brief',
        created_at: recent,
        completed_at: recent,
        outcome: 'pending_approval_persisted',
      },
    ];

    const result = await runDailyGenerate({
      userIds: [USER_ID],
      briefInvocationSource: 'cron_daily_brief',
    });

    expect(result.results).toEqual([
      expect.objectContaining({ code: 'generation_cycle_cooldown', success: true, userId: USER_ID }),
    ]);
    expect(vi.mocked(generateDirective)).not.toHaveBeenCalled();
  });

  it('persists top candidate discovery on successful directive generation', async () => {
    vi.mocked(generateDirective).mockResolvedValue(buildDirective());
    vi.mocked(generateArtifact).mockResolvedValue({
      type: 'email',
      to: 'holly@example.com',
      subject: 'Decision needed today: MAS3 reference packet owner by 4 PM PT',
      body: 'Hi Holly,\n\nCan you confirm by 4 PM PT today whether you can send two MAS3 reference talking points, and name who owns final packet delivery? If we miss this cutoff, the interview packet slips.\n\nThanks,\nBrandon',
      draft_type: 'email_compose',
    });

    const result = await runDailyGenerate();

    expect(result.signalProcessing.results).toEqual([
      expect.objectContaining({ code: 'no_unprocessed_signals', success: true }),
    ]);
    expect(result.results).toEqual([
      expect.objectContaining({ code: 'pending_approval_persisted', success: true }),
    ]);
    expect(mockSupabase.insertedActions).toHaveLength(1);
    const saved = mockSupabase.insertedActions[0];
    expect(saved.status).toBe('pending_approval');
    expect((saved.execution_result as Record<string, any>).generation_log.candidateDiscovery.topCandidates).toHaveLength(3);
    expect((saved.execution_result as Record<string, any>).generation_log.candidateDiscovery.topCandidates[0].decision).toBe('selected');
    expect((saved.execution_result as Record<string, any>).generation_log.candidateDiscovery.topCandidates[1].decisionReason).toContain('Rejected because');
  });

  it('writes the actual fallback winner into the outcome receipt when winnerSelectionTrace displaces scorer-top', async () => {
    const directive = buildDirective({
      directive: 'Stop holding live bandwidth open for Waiting on MAS3 (HCA) hiring decision; reopen only if a concrete next-step signal arrives by 5:00 PM PT tomorrow.',
      action_type: 'write_document',
      reason: 'The MAS3 thread has gone quiet long enough that reclaiming attention now beats another generic nudge.',
      winnerSelectionTrace: {
        finalWinnerId: 'discrepancy-behavioral-mas3',
        finalWinnerType: 'discrepancy',
        finalWinnerReason: 'goal-anchored discrepancy with stronger 30-90 day leverage than the shadow-urgent schedule conflict',
        scorerTopId: 'discrepancy-schedule-conflict',
        scorerTopType: 'discrepancy',
        scorerTopDisplacementReason: 'shadow-urgency penalty',
      },
      generationLog: buildGenerationLog({
        candidateDiscovery: {
          candidateCount: 2,
          suppressedCandidateCount: 0,
          selectionMargin: 0.09,
          selectionReason: 'Selected because score 1.45 beat the next-best candidate at 1.36 by 0.09.',
          failureReason: null,
          topCandidates: [
            {
              id: 'discrepancy-schedule-conflict',
              rank: 1,
              candidateType: 'discrepancy',
              discrepancyClass: 'schedule_conflict',
              actionType: 'write_document',
              score: 1.45,
              scoreBreakdown: {
                stakes: 3,
                urgency: 0.75,
                tractability: 0.7,
                freshness: 1,
              },
              targetGoal: null,
              sourceSignals: [],
              decision: 'selected',
              decisionReason: 'Selected because score 1.45 beat the next-best candidate at 1.36 by 0.09.',
            },
            {
              id: 'discrepancy-behavioral-mas3',
              rank: 2,
              candidateType: 'discrepancy',
              discrepancyClass: 'behavioral_pattern',
              actionType: 'write_document',
              score: 1.36,
              scoreBreakdown: {
                stakes: 3,
                urgency: 0.9,
                tractability: 0.7,
                freshness: 1,
              },
              targetGoal: {
                text: 'Land MAS3 Management Analyst Supervisor position at HCA and establish 12-month tenure with clean supervisor reference',
                priority: 1,
                category: 'career',
              },
              sourceSignals: [
                {
                  kind: 'commitment',
                  id: 'mas3-commitment',
                  summary: 'Waiting on MAS3 (HCA) hiring decision',
                },
              ],
              decision: 'rejected',
              decisionReason: 'Rejected because the scorer-top schedule conflict was easier to notice than the stronger long-horizon move.',
            },
          ],
        },
      }),
    });

    vi.mocked(generateDirective).mockResolvedValue(directive);
    vi.mocked(generateArtifact).mockResolvedValue({
      type: 'document',
      title: 'Execution rule for Waiting on MAS3 (HCA) hiring decision',
      content: [
        'Execution move: stop holding live bandwidth open for Waiting on MAS3 (HCA) hiring decision today.',
        'Why this beats the alternatives: reclaiming the bandwidth changes the next 30-90 days of real leverage.',
        'Deprioritize: do not draft another status-check message.',
        'Reopen trigger: only reopen if a concrete next step, decision, or scheduling signal arrives by 2026-04-21.',
        'Deadline: 2026-04-21',
      ].join('\n\n'),
    });

    const result = await runDailyGenerate({ userIds: [USER_ID] });

    expect(result.results).toEqual([
      expect.objectContaining({ code: 'pending_approval_persisted', success: true }),
    ]);
    const saved = mockSupabase.insertedActions.at(-1);
    expect(saved.status).toBe('pending_approval');
    expect((saved.execution_result as Record<string, any>).inspection.winner_selection_trace).toEqual(
      directive.winnerSelectionTrace,
    );
    expect((saved.execution_result as Record<string, any>).outcome_receipt.winner).toEqual(
      expect.objectContaining({
        winner_candidate_id: 'discrepancy-behavioral-mas3',
        discrepancy_class: 'behavioral_pattern',
        matched_goal: 'Land MAS3 Management Analyst Supervisor position at HCA and establish 12-month tenure with clean supervisor reference',
        why_now: 'goal-anchored discrepancy with stronger 30-90 day leverage than the shadow-urgent schedule conflict',
      }),
    );
    expect((saved.execution_result as Record<string, any>).outcome_receipt.artifact).toEqual(
      expect.objectContaining({
        artifact_changes_probability_now: true,
        artifact_requires_more_thinking: false,
        artifact_pass_fail: 'PASS',
      }),
    );
  });

  it('passes the traced final selected fallback winner into persistence validation instead of scorer-top', async () => {
    const directive = buildDirective({
      winnerSelectionTrace: {
        finalWinnerId: 'hunt-final-winner',
        finalWinnerType: 'hunt',
        finalWinnerReason: 'grounded hunt thread survived fallback selection',
        scorerTopId: 'sig-scorer-top',
        scorerTopType: 'signal',
        scorerTopDisplacementReason: 'signal candidate blocked after fallback selection',
      },
      generationLog: buildGenerationLog({
        candidateDiscovery: {
          candidateCount: 2,
          suppressedCandidateCount: 0,
          selectionMargin: 0.04,
          selectionReason: 'Fallback hunt winner beat the blocked scorer-top candidate.',
          failureReason: null,
          topCandidates: [
            {
              id: 'sig-scorer-top',
              rank: 1,
              candidateType: 'signal',
              actionType: 'send_message',
              score: 3.4,
              scoreBreakdown: {
                stakes: 5,
                urgency: 0.9,
                tractability: 0.8,
                freshness: 0.95,
              },
              targetGoal: null,
              sourceSignals: [],
              decision: 'selected',
              decisionReason: 'Scorer-top before fallback.',
            },
            {
              id: 'hunt-final-winner',
              rank: 2,
              candidateType: 'hunt',
              actionType: 'send_message',
              score: 3.1,
              scoreBreakdown: {
                stakes: 4,
                urgency: 0.85,
                tractability: 0.75,
                freshness: 0.9,
              },
              targetGoal: {
                text: 'Advance MAS3 hiring process',
                priority: 1,
                category: 'career',
              },
              sourceSignals: [],
              decision: 'rejected',
              decisionReason: 'Would have lost without fallback selection.',
            },
          ],
        },
      }),
    });

    vi.mocked(generateDirective).mockResolvedValue(directive);
    vi.mocked(generateArtifact).mockResolvedValue({
      type: 'email',
      to: 'holly@example.com',
      subject: 'Decision needed today: MAS3 reference packet owner by 4 PM PT',
      body: 'Hi Holly,\n\nCan you confirm by 4 PM PT today whether you can send two MAS3 reference talking points, and name who owns final packet delivery? If we miss this cutoff, the interview packet slips.\n\nThanks,\nBrandon',
      draft_type: 'email_compose',
    });

    const result = await runDailyGenerate({ userIds: [USER_ID] });

    expect(result.results).toEqual([
      expect.objectContaining({ code: 'pending_approval_persisted', success: true }),
    ]);
    expect(validateDirectiveForPersistence).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateType: 'hunt',
        matchedGoalCategory: 'career',
      }),
    );
  });

  it('logs high nightly-ops signal mode during manual brief runs when all-source backlog is at least 100', async () => {
    vi.mocked(countUnprocessedSignals)
      .mockImplementation(async (_userId: string, options?: { includeAllSources?: boolean }) => (
        options?.includeAllSources ? 831 : 0
      ));
    vi.mocked(generateDirective).mockResolvedValue(buildDirective());
    vi.mocked(generateArtifact).mockResolvedValue({
      type: 'email',
      to: 'holly@example.com',
      subject: 'Decision needed today: MAS3 reference packet owner by 4 PM PT',
      body: 'Hi Holly,\n\nCan you confirm by 4 PM PT today whether you can send two MAS3 reference talking points, and name who owns final packet delivery? If we miss this cutoff, the interview packet slips.\n\nThanks,\nBrandon',
      draft_type: 'email_compose',
    });

    await runDailyGenerate({ userIds: [USER_ID] });

    expect(logStructuredEvent).toHaveBeenCalledWith(expect.objectContaining({
      event: 'daily_brief_signal_mode',
      userId: USER_ID,
      details: expect.objectContaining({
        nightly_ops_signal_mode: 'high',
        total_unprocessed_signals_before_processing: 831,
        signal_batch_size: 100,
        max_signal_rounds: 10,
      }),
    }));
  });

  it('persists explicit no-send outcomes with candidate failure reasons', async () => {
    vi.mocked(generateDirective).mockResolvedValue(buildDirective({
      directive: '__GENERATION_FAILED__',
      action_type: 'do_nothing',
      confidence: 0,
      reason: 'No ranked daily brief candidate.',
      evidence: [],
      generationLog: buildGenerationLog({
        outcome: 'no_send',
        stage: 'scoring',
        reason: 'No ranked daily brief candidate.',
        candidateFailureReasons: ['No ranked daily brief candidate.'],
        candidateDiscovery: {
          candidateCount: 0,
          suppressedCandidateCount: 2,
          selectionMargin: null,
          selectionReason: null,
          failureReason: 'No ranked daily brief candidate.',
          topCandidates: [],
        },
      }),
    }));

    const result = await runDailyGenerate();

    expect(result.results).toEqual([
      expect.objectContaining({
        code: 'no_send_persisted',
        detail: 'No ranked daily brief candidate.',
        success: true,
      }),
    ]);
    expect(result.message).toContain('No pending_approval brief was persisted');
    expect(result.message).toContain('No ranked daily brief candidate.');
    const saved = mockSupabase.insertedActions[0];
    expect(saved.status).toBe('skipped');
    expect((saved.execution_result as Record<string, any>).outcome_type).toBe('no_send');
    expect((saved.execution_result as Record<string, any>).generation_log.candidateDiscovery.failureReason).toBe('No ranked daily brief candidate.');
  });

  it('sanitizes internal generation blocker sludge before persisting no-send output', async () => {
    const internalReason =
      'All 10 candidates blocked: "Risk winner" → stale_date_in_directive:March 30 | "Fallback" → llm_failed';
    vi.mocked(generateDirective).mockResolvedValue(buildDirective({
      directive: '__GENERATION_FAILED__',
      action_type: 'do_nothing',
      confidence: 0,
      reason: internalReason,
      evidence: [],
      generationLog: buildGenerationLog({
        outcome: 'no_send',
        stage: 'validation',
        reason: internalReason,
        candidateFailureReasons: ['stale_date_in_directive:March 30', 'llm_failed'],
        candidateDiscovery: {
          ...buildGenerationLog().candidateDiscovery!,
          candidateCount: 10,
          failureReason: internalReason,
        },
      }),
    }));

    const result = await runDailyGenerate();

    expect(result.results).toEqual([
      expect.objectContaining({
        code: 'no_send_persisted',
        detail: 'Nothing cleared the bar today after evaluating 10 candidates.',
        success: true,
      }),
    ]);
    expect(result.message).toContain('Nothing cleared the bar today after evaluating 10 candidates.');
    expect(result.message).not.toContain('stale_date_in_directive');
    expect(result.message).not.toContain('llm_failed');
    const saved = mockSupabase.insertedActions[0];
    expect(saved.directive_text).toBe('Nothing cleared the bar today after evaluating 10 candidates.');
    expect(saved.reason).toBe('Nothing cleared the bar today after evaluating 10 candidates.');
    expect((saved.artifact as Record<string, any>).evidence).toBe(
      'Nothing cleared the bar today after evaluating 10 candidates.',
    );
    expect((saved.execution_result as Record<string, any>).no_send.reason).toBe(
      'Nothing cleared the bar today after evaluating 10 candidates.',
    );
    expect((saved.execution_result as Record<string, any>).generation_log.reason).toBe(internalReason);
  });

  it('persists blocked generation outcomes when artifact creation fails', async () => {
    vi.mocked(generateDirective).mockResolvedValue(buildDirective());
    vi.mocked(generateArtifact).mockResolvedValue(null);

    const result = await runDailyGenerate();

    expect(result.results).toEqual([
      expect.objectContaining({
        code: 'no_send_persisted',
        detail: 'Artifact generation failed.',
        success: true,
      }),
    ]);
    const saved = mockSupabase.insertedActions[0];
    expect(saved.status).toBe('skipped');
    expect((saved.execution_result as Record<string, any>).generation_log.outcome).toBe('no_send');
    expect((saved.execution_result as Record<string, any>).generation_log.stage).toBe('artifact');
    expect((saved.execution_result as Record<string, any>).generation_log.candidateFailureReasons[0]).toContain('Artifact generation failed.');
    expect((saved.execution_result as Record<string, any>).generation_log.candidateDiscovery.topCandidates[0].decision).toBe('selected');
    expect((saved.execution_result as Record<string, any>).artifact_quality_receipt).toEqual(
      expect.objectContaining({
        final_artifact_bar_passed: false,
        blocker_bucket: 'artifact_fallback_degradation',
      }),
    );
    expect(mockSupabase.insertedActions.some((row) => row.status === 'pending_approval')).toBe(false);
  });

  it('hydrates legacy interview write_document metadata before pending_approval persistence', async () => {
    vi.mocked(generateDirective).mockResolvedValue(buildDirective({
      action_type: 'write_document',
      directive: 'Interview is 0 days out with no calendar acceptance or confirmation sent.',
      reason:
        'Interview is due in 0 days. No confirmation email sent. No calendar response recorded. With an appointment scheduled at 3:30 PM tomorrow, the window to confirm and prepare closes tonight.',
      generationLog: buildGenerationLog({
        candidateDiscovery: {
          candidateCount: 1,
          suppressedCandidateCount: 0,
          selectionMargin: 0,
          selectionReason: 'Interview exposure is the strongest immediate thread.',
          failureReason: null,
          topCandidates: [
            {
              id: 'discrepancy_exposure_interview',
              rank: 1,
              candidateType: 'discrepancy',
              discrepancyClass: 'exposure',
              actionType: 'write_document',
              score: 999,
              scoreBreakdown: {
                stakes: 5,
                urgency: 0.95,
                tractability: 0.8,
                freshness: 1,
                actionTypeRate: 0.5,
                entityPenalty: 0,
              },
              targetGoal: {
                text: 'Care Coordinator interview with Alex April 29',
                priority: 5,
                category: 'career',
              },
              sourceSignals: [
                {
                  kind: 'signal',
                  id: 'sig-interview',
                  source: 'outlook',
                  occurredAt: '2026-04-28T02:00:00.000Z',
                  summary: 'Alex Crisler confirmed the Care Coordinator interview for April 29.',
                },
              ],
              decision: 'selected',
              decisionReason: 'Interview exposure is the strongest immediate thread.',
            },
          ],
        },
      }),
      winnerSelectionTrace: {
        finalWinnerId: 'discrepancy_exposure_interview',
        finalWinnerType: 'discrepancy',
        finalWinnerReason: 'Interview exposure is the strongest immediate thread.',
        scorerTopId: 'discrepancy_exposure_interview',
        scorerTopType: 'discrepancy',
        scorerTopDisplacementReason: null,
      },
    }));
    vi.mocked(generateArtifact).mockResolvedValue({
      type: 'document',
      title: 'Confirmation Email to Alex Crisler — Care Coordinator Interview, April 29, 9 PM',
      content: [
        'SOURCE',
        'Email: Alex Crisler (Alex.Crisler@comphc.org), April 21, 2026 — Comprehensive Healthcare - Interview Confirmation',
        '',
        'To: Alex.Crisler@comphc.org',
        'Subject: Confirming Interview Tomorrow — April 29, 9 PM',
        '',
        'Alex,',
        '',
        'Thank you for the confirmation email and interview details. I am confirming my attendance for tomorrow at 9 PM via Webex.',
      ].join('\n'),
    } as any);

    const result = await runDailyGenerate();

    expect(result.results).toEqual([
      expect.objectContaining({
        code: 'pending_approval_persisted',
        success: true,
      }),
    ]);
    const saved = mockSupabase.insertedActions[0];
    expect(saved.status).toBe('pending_approval');
    expect(saved.artifact).toEqual(
      expect.objectContaining({
        type: 'document',
        document_purpose: 'brief',
        target_reader: 'user',
      }),
    );
    expect((saved.execution_result as Record<string, any>).artifact).toEqual(
      expect.objectContaining({
        document_purpose: 'brief',
        target_reader: 'user',
      }),
    );
  });

  it('does not persist pending_approval when artifact structural validation fails', async () => {
    vi.mocked(generateDirective).mockResolvedValue(buildDirective());
    vi.mocked(generateArtifact).mockResolvedValue({
      type: 'email',
      to: 'holly@example.com',
      subject: 'Decision needed today: MAS3 reference packet owner by 4 PM PT',
      body: 'Hi Holly,\n\nCan you confirm by 4 PM PT today whether you can send two MAS3 reference talking points, and name who owns final packet delivery? If we miss this cutoff, the interview packet slips.\n\nThanks,\nBrandon',
      draft_type: 'email_compose',
    });
    vi.mocked(getArtifactPersistenceIssues).mockReturnValue([
      'artifact.body contains internal analysis scaffolding',
    ]);

    const result = await runDailyGenerate();

    expect(result.results).toEqual([
      expect.objectContaining({
        code: 'no_send_persisted',
        detail: expect.stringContaining('artifact.body contains internal analysis scaffolding'),
        success: true,
      }),
    ]);
    const saved = mockSupabase.insertedActions[0];
    expect((saved.execution_result as Record<string, any>).outcome_receipt.artifact_quality_receipt).toEqual(
      expect.objectContaining({
        final_artifact_bar_passed: false,
        blocker_bucket: 'artifact_fallback_degradation',
      }),
    );
    expect(mockSupabase.insertedActions.some((row) => row.status === 'pending_approval')).toBe(false);
    expect(mockSupabase.insertedActions.some((row) => row.status === 'skipped')).toBe(true);
  });

  it('does not persist pending_approval when persistence validation flags recursive directive sludge', async () => {
    vi.mocked(generateDirective).mockResolvedValue(buildDirective({
      directive:
        'Write a decision memo on "High-value relationship at risk: onboarding@resend.dev" — lock the final decision and owner for "High-value relationship at risk: onboarding@resend.dev" by end of day PT on 2026-04-26.',
      action_type: 'write_document',
      reason: 'The time window expires faster than ownership is being assigned.',
    }));
    vi.mocked(generateArtifact).mockResolvedValue({
      type: 'document',
      title: 'Decision lock: High-value relationship at risk: onboarding@resend.dev',
      content: [
        'Decision required for "High-value relationship at risk: onboarding@resend.dev": confirm the path, name one owner, and time-bound the commitment.',
        '',
        'Ask: lock the final decision and owner for "High-value relationship at risk: onboarding@resend.dev" by end of day PT on 2026-04-26.',
        '',
        'Consequence: if unresolved by end of day PT on 2026-04-26, the execution window closes before owners can act.',
      ].join('\n'),
      document_purpose: 'proposal',
      target_reader: 'decision owner',
    });
    vi.mocked(validateDirectiveForPersistence).mockReturnValue([
      'decision_enforcement:recursive_directive_template_sludge',
    ]);

    const result = await runDailyGenerate();

    expect(result.results).toEqual([
      expect.objectContaining({
        code: 'no_send_persisted',
        detail: expect.stringContaining('decision_enforcement:recursive_directive_template_sludge'),
        success: true,
      }),
    ]);
    expect(mockSupabase.insertedActions.some((row) => row.status === 'pending_approval')).toBe(false);
    expect(mockSupabase.insertedActions.some((row) => row.status === 'skipped')).toBe(true);
  });

  it('persists no_send instead of pending_approval for schedule_conflict write_document memo artifacts', async () => {
    vi.mocked(generateDirective).mockResolvedValue(buildDirective({
      directive: 'Overlapping events on 2026-04-25.',
      action_type: 'write_document',
      reason: 'Two calendar blocks overlap on 2026-04-25.',
      discrepancyClass: 'schedule_conflict',
    }));
    vi.mocked(generateArtifact).mockResolvedValue({
      type: 'document',
      title: 'Schedule conflict decision - 2026-04-25',
      content: `## Situation
You have overlapping calendar commitments on 2026-04-25.

## Conflicting commitments or risk
If unresolved, you default into a live double-booking.

## Recommendation / decision
Keep one event and move the other.

## Owner / next step
Calendar owner decides what to move.

## Timing / deadline
Decide by 2026-04-24.`,
    });
    vi.mocked(getArtifactPersistenceIssues).mockReturnValue([
      'schedule_conflict write_document below product bar; require a real calendar artifact or suppress',
    ]);

    const result = await runDailyGenerate();

    expect(result.results).toEqual([
      expect.objectContaining({
        code: 'no_send_persisted',
        detail: expect.stringContaining('schedule_conflict write_document below product bar'),
        success: true,
      }),
    ]);
    expect(mockSupabase.insertedActions.some((row) => row.status === 'pending_approval')).toBe(false);
    expect(mockSupabase.insertedActions.some((row) => row.status === 'skipped')).toBe(true);
  });

  it('allows generation when only 2 candidates survive (single strong winner is sufficient)', async () => {
    vi.mocked(generateDirective).mockResolvedValue(buildDirective({
      generationLog: buildGenerationLog({
        candidateDiscovery: {
          ...buildGenerationLog().candidateDiscovery!,
          candidateCount: 2,
          topCandidates: buildGenerationLog().candidateDiscovery!.topCandidates.slice(0, 2),
        },
      }),
    }));

    const result = await runDailyGenerate();

    // With 2 candidates, the acceptance gate no longer blocks.
    // The directive proceeds to artifact generation and persistence.
    expect(result.results).toEqual([
      expect.objectContaining({
        code: expect.stringMatching(/^(directive_persisted|no_send_persisted)$/),
        success: true,
      }),
    ]);
  });

  it('blocks generation when zero candidates were evaluated', async () => {
    vi.mocked(generateDirective).mockResolvedValue(buildDirective({
      generationLog: buildGenerationLog({
        candidateDiscovery: {
          ...buildGenerationLog().candidateDiscovery!,
          candidateCount: 0,
          topCandidates: [],
        },
      }),
    }));

    const result = await runDailyGenerate();

    expect(result.results).toEqual([
      expect.objectContaining({
        code: 'no_send_persisted',
        detail: 'Acceptance gate blocked send because zero candidates were evaluated.',
        success: true,
      }),
    ]);
    expect(generateArtifact).not.toHaveBeenCalled();
  });

  it('recovers a user-skipped high-confidence directive instead of generating do_nothing', async () => {
    const skippedId = 'skipped-good-action-1';
    mockSupabase.actionRows = [
      {
        id: skippedId,
        user_id: USER_ID,
        status: 'skipped',
        skip_reason: null,
        action_type: 'send_message',
        directive_text: 'Email Cheryl about reference coordination.',
        confidence: 82,
        generated_at: new Date().toISOString(),
        execution_result: {
          artifact: {
            type: 'email',
            to: 'cheryl.anderson1@dshs.wa.gov',
            subject: 'Reference Check Coordination',
            body: 'Hi Cheryl,',
            draft_type: 'email_compose',
          },
        },
      },
    ];

    const result = await runDailyGenerate({ userIds: [USER_ID] });

    expect(result.results).toEqual([
      expect.objectContaining({
        code: 'pending_approval_reused',
        success: true,
        meta: expect.objectContaining({
          action_id: skippedId,
          artifact_present: true,
          recovered: true,
        }),
      }),
    ]);

    // Should NOT have generated a new directive
    expect(generateDirective).not.toHaveBeenCalled();

    // Should have restored the action to pending_approval
    expect(mockSupabase.updatedActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: skippedId,
          payload: expect.objectContaining({ status: 'pending_approval' }),
        }),
      ]),
    );
  });

  it('auto-suppresses already-sent pending actions and generates a fresh action', async () => {
    const stalePendingId = 'stale-pending-sent-1';
    mockSupabase.actionRows = [
      {
        id: stalePendingId,
        user_id: USER_ID,
        status: 'pending_approval',
        action_type: 'send_message',
        directive_text: 'Old already-sent directive.',
        confidence: 88,
        generated_at: new Date().toISOString(),
        execution_result: {
          daily_brief_sent_at: new Date().toISOString(),
          artifact: {
            type: 'email',
            to: 'owner@example.com',
            subject: 'Old subject',
            body: 'Old body with enough content to pass.',
            draft_type: 'email_compose',
          },
        },
      },
    ];

    vi.mocked(generateDirective).mockResolvedValue(buildDirective());
    vi.mocked(generateArtifact).mockResolvedValue({
      type: 'email',
      to: 'holly@example.com',
      subject: 'Decision needed today: MAS3 reference packet owner by 4 PM PT',
      body: 'Hi Holly,\n\nCan you confirm by 4 PM PT today whether you can send two MAS3 reference talking points, and name who owns final packet delivery? If we miss this cutoff, the interview packet slips.\n\nThanks,\nBrandon',
      draft_type: 'email_compose',
    });

    const result = await runDailyGenerate({ userIds: [USER_ID] });

    expect(result.results).toEqual([
      expect.objectContaining({
        code: 'pending_approval_persisted',
        success: true,
      }),
    ]);
    expect(generateDirective).toHaveBeenCalledTimes(1);
    expect(mockSupabase.updatedActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: stalePendingId,
          payload: expect.objectContaining({
            status: 'skipped',
            skip_reason: 'Auto-suppressed already-sent pending action before daily brief generation.',
          }),
        }),
      ]),
    );
  });

  it('forceFreshRun still reuses a valid pending action within the stale window (no new generation)', async () => {
    const reusablePendingId = 'reusable-pending-1';
    mockSupabase.actionRows = [
      {
        id: reusablePendingId,
        user_id: USER_ID,
        status: 'pending_approval',
        action_type: 'send_message',
        directive_text: 'Previously valid pending action.',
        confidence: 90,
        generated_at: new Date().toISOString(),
        execution_result: {
          artifact: {
            type: 'email',
            to: 'owner@example.com',
            subject: 'Previous',
            body: 'Previous valid body that would normally be reused.',
            draft_type: 'email_compose',
          },
        },
      },
    ];

    vi.mocked(generateDirective).mockResolvedValue(buildDirective());
    vi.mocked(generateArtifact).mockResolvedValue({
      type: 'email',
      to: 'holly@example.com',
      subject: 'Decision needed today: MAS3 reference packet owner by 4 PM PT',
      body: 'Hi Holly,\n\nCan you confirm by 4 PM PT today whether you can send two MAS3 reference talking points, and name who owns final packet delivery? If we miss this cutoff, the interview packet slips.\n\nThanks,\nBrandon',
      draft_type: 'email_compose',
    });

    const result = await runDailyGenerate({ userIds: [USER_ID], forceFreshRun: true });

    expect(result.results).toEqual([
      expect.objectContaining({
        code: 'pending_approval_reused',
        success: true,
        meta: expect.objectContaining({ action_id: reusablePendingId }),
      }),
    ]);
    expect(generateDirective).not.toHaveBeenCalled();
    expect(mockSupabase.updatedActions).toEqual([]);
  });

  it('keeps normal pending reuse unless proof-specific bypass is requested', async () => {
    const reusablePendingId = 'proof-specific-bypass-pending-1';
    const pendingRow = {
      id: reusablePendingId,
      user_id: USER_ID,
      status: 'pending_approval',
      action_type: 'send_message',
      directive_text: 'Previously valid pending action.',
      confidence: 90,
      generated_at: new Date().toISOString(),
      execution_result: {
        artifact: {
          type: 'email',
          to: 'owner@example.com',
          subject: 'Previous',
          body: 'Previous valid body that would normally be reused.',
          draft_type: 'email_compose',
        },
      },
      reason: null,
    };

    mockSupabase.actionRows = [{ ...pendingRow }];
    const normalResult = await runDailyGenerate({ userIds: [USER_ID], forceFreshRun: true });

    expect(normalResult.results).toEqual([
      expect.objectContaining({
        code: 'pending_approval_reused',
        success: true,
        meta: expect.objectContaining({ action_id: reusablePendingId }),
      }),
    ]);
    expect(generateDirective).not.toHaveBeenCalled();

    vi.mocked(generateDirective).mockReset();
    vi.mocked(generateArtifact).mockReset();
    vi.mocked(generateDirective).mockResolvedValue(buildDirective());
    vi.mocked(generateArtifact).mockResolvedValue({
      type: 'email',
      to: 'holly@example.com',
      subject: 'Decision needed today: MAS3 reference packet owner by 4 PM PT',
      body: 'Hi Holly,\n\nCan you confirm by 4 PM PT today whether you can send two MAS3 reference talking points, and name who owns final packet delivery? If we miss this cutoff, the interview packet slips.\n\nThanks,\nBrandon',
      draft_type: 'email_compose',
    });
    mockSupabase.updatedActions = [];
    mockSupabase.actionRows = [{ ...pendingRow }];

    const proofResult = await runDailyGenerate({
      userIds: [USER_ID],
      forceFreshRun: true,
      briefInvocationSource: 'dev_brain_receipt',
      skipManualCallLimit: true,
    });

    expect(proofResult.results).toEqual([
      expect.objectContaining({
        code: 'pending_approval_persisted',
        success: true,
        meta: expect.objectContaining({
          proof_fresh_run: true,
          proof_invocation_source: 'dev_brain_receipt',
        }),
      }),
    ]);
    expect(generateDirective).toHaveBeenCalledTimes(1);
    expect(mockSupabase.updatedActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: reusablePendingId,
          payload: expect.objectContaining({
            status: 'skipped',
            skip_reason: 'Auto-suppressed pending action for dev brain-receipt force-fresh run.',
          }),
        }),
      ]),
    );
  });

  it('forceFreshRun bypasses pending reuse for dev brain-receipt and runs fresh generation', async () => {
    const reusablePendingId = 'reusable-pending-dev-1';
    mockSupabase.actionRows = [
      {
        id: reusablePendingId,
        user_id: USER_ID,
        status: 'pending_approval',
        action_type: 'send_message',
        directive_text: 'Previously valid pending action.',
        confidence: 90,
        generated_at: new Date().toISOString(),
        execution_result: {
          artifact: {
            type: 'email',
            to: 'owner@example.com',
            subject: 'Previous',
            body: 'Previous valid body that would normally be reused.',
            draft_type: 'email_compose',
          },
        },
      },
    ];

    vi.mocked(generateDirective).mockResolvedValue(buildDirective());
    vi.mocked(generateArtifact).mockResolvedValue({
      type: 'email',
      to: 'holly@example.com',
      subject: 'Decision needed today: MAS3 reference packet owner by 4 PM PT',
      body: 'Hi Holly,\n\nCan you confirm by 4 PM PT today whether you can send two MAS3 reference talking points, and name who owns final packet delivery? If we miss this cutoff, the interview packet slips.\n\nThanks,\nBrandon',
      draft_type: 'email_compose',
    });

    const result = await runDailyGenerate({
      userIds: [USER_ID],
      forceFreshRun: true,
      briefInvocationSource: 'dev_brain_receipt',
      skipManualCallLimit: true,
    });

    expect(result.results).toEqual([
      expect.objectContaining({
        code: 'pending_approval_persisted',
        success: true,
      }),
    ]);
    expect(generateDirective).toHaveBeenCalledTimes(1);
    expect(mockSupabase.updatedActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: reusablePendingId,
          payload: expect.objectContaining({
            status: 'skipped',
            skip_reason: 'Auto-suppressed pending action for dev brain-receipt force-fresh run.',
          }),
        }),
      ]),
    );
  });

  it('forceFreshRun does not recover same-day skipped actions back into pending_approval during dev brain-receipt proof runs', async () => {
    mockSupabase.actionRows = [
      {
        id: 'recoverable-skipped-1',
        user_id: USER_ID,
        status: 'skipped',
        skip_reason: null,
        action_type: 'send_message',
        directive_text: 'Older skipped action that would normally be recovered.',
        confidence: 90,
        generated_at: new Date().toISOString(),
        execution_result: {
          artifact: {
            type: 'email',
            to: 'owner@example.com',
            subject: 'Recovered if not proof run',
            body: 'Recovered if not proof run.',
            draft_type: 'email_compose',
          },
        },
      },
    ];

    vi.mocked(generateDirective).mockResolvedValue(buildDirective());
    vi.mocked(generateArtifact).mockResolvedValue({
      type: 'email',
      to: 'holly@example.com',
      subject: 'Decision needed today: MAS3 reference packet owner by 4 PM PT',
      body: 'Hi Holly,\n\nCan you confirm by 4 PM PT today whether you can send two MAS3 reference talking points, and name who owns final packet delivery? If we miss this cutoff, the interview packet slips.\n\nThanks,\nBrandon',
      draft_type: 'email_compose',
    });

    const result = await runDailyGenerate({
      userIds: [USER_ID],
      forceFreshRun: true,
      briefInvocationSource: 'dev_brain_receipt',
      skipManualCallLimit: true,
    });

    expect(result.results).toEqual([
      expect.objectContaining({
        code: 'pending_approval_persisted',
        success: true,
      }),
    ]);
    expect(generateDirective).toHaveBeenCalledTimes(1);
    expect(mockSupabase.updatedActions).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'recoverable-skipped-1',
          payload: expect.objectContaining({ status: 'pending_approval' }),
        }),
      ]),
    );
  });

  it('suppresses generic persisted no-send blocker during normal daily-send', async () => {
    vi.mocked(getVerifiedDailyBriefRecipientEmail).mockResolvedValue('owner@example.com');
    mockSupabase.actionRows = [
      {
        id: 'blocked-1',
        user_id: USER_ID,
        status: 'skipped',
        action_type: 'do_nothing',
        directive_text: 'Nothing cleared the bar today after evaluating 10 candidates.',
        reason: 'Nothing cleared the bar today after evaluating 10 candidates.',
        confidence: 45,
        generated_at: new Date().toISOString(),
        execution_result: {
          outcome_type: 'no_send',
          artifact: {
            type: 'wait_rationale',
            context: 'Foldera checked your recent signals and did not find anything worth interrupting you for.',
            evidence: 'Foldera checked your recent signals and did not find anything worth interrupting you for.',
          },
        },
      },
    ];

    const result = await runDailySend();

    expect(result.results).toEqual([
      expect.objectContaining({
        code: 'no_send_blocker_persisted',
        detail: 'Generic no-send blocker persisted without email delivery.',
        success: true,
        meta: expect.objectContaining({
          action_id: 'blocked-1',
          generic_no_send_suppressed: true,
          daily_email_idempotency_key: expect.stringContaining(`daily-brief:${USER_ID}:`),
        }),
      }),
    ]);
    expect(result.message).toContain('No brief email was sent for 1 user because an explicit no-send blocker was recorded.');
    expect(sendDailyDirective).not.toHaveBeenCalled();
    expect(mockSupabase.updatedActions).toEqual([]);
  });

  it('sends generic persisted no-send blocker once for an explicitly scoped manual run', async () => {
    vi.mocked(getVerifiedDailyBriefRecipientEmail).mockResolvedValue('owner@example.com');
    vi.mocked(sendDailyDirective).mockResolvedValue({ data: { id: 'resend-no-send' } } as never);
    mockSupabase.actionRows = [
      {
        id: 'blocked-1',
        user_id: USER_ID,
        status: 'skipped',
        action_type: 'do_nothing',
        directive_text: 'Nothing cleared the bar today after evaluating 10 candidates.',
        reason: 'Nothing cleared the bar today after evaluating 10 candidates.',
        confidence: 45,
        generated_at: new Date().toISOString(),
        execution_result: {
          outcome_type: 'no_send',
          artifact: {
            type: 'wait_rationale',
            context: 'Foldera checked your recent signals and did not find anything worth interrupting you for.',
            evidence: 'Foldera checked your recent signals and did not find anything worth interrupting you for.',
          },
        },
      },
    ];

    const result = await runDailySend({
      userIds: [USER_ID],
      briefInvocationSource: 'settings_run_brief',
    });

    expect(result.results).toEqual([
      expect.objectContaining({
        code: 'email_sent',
        success: true,
        meta: expect.objectContaining({
          action_id: 'blocked-1',
          no_send_blocker: true,
          resend_id: 'resend-no-send',
          daily_email_idempotency_key: expect.stringContaining(`daily-brief:${USER_ID}:`),
        }),
      }),
    ]);
    expect(result.message).toContain('Sent briefs for 1 eligible user.');
    expect(sendDailyDirective).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'owner@example.com',
        userId: USER_ID,
        subject: 'Foldera: Nothing cleared the bar today',
        directives: [
          expect.objectContaining({
            id: 'blocked-1',
            action_type: 'do_nothing',
            directive: 'Nothing cleared the bar today after evaluating 10 candidates.',
            artifact: expect.objectContaining({ type: 'wait_rationale' }),
          }),
        ],
      }),
    );
    expect(mockSupabase.updatedActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'blocked-1',
          payload: expect.objectContaining({
            execution_result: expect.objectContaining({
              daily_brief_sent_at: expect.any(String),
              resend_id: 'resend-no-send',
              daily_email_idempotency_key: expect.stringContaining(`daily-brief:${USER_ID}:`),
            }),
          }),
        }),
      ]),
    );
  });

  it('does not send a second generic no-send email when another same-day row already has send evidence', async () => {
    vi.mocked(getVerifiedDailyBriefRecipientEmail).mockResolvedValue('owner@example.com');
    const earlierSentAt = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    mockSupabase.actionRows = [
      {
        id: 'older-sent-no-send',
        user_id: USER_ID,
        status: 'skipped',
        action_type: 'do_nothing',
        directive_text: 'Nothing cleared the bar today.',
        reason: 'Nothing cleared the bar today.',
        confidence: 45,
        generated_at: earlierSentAt,
        execution_result: {
          outcome_type: 'no_send',
          daily_brief_sent_at: earlierSentAt,
          resend_id: 'resend-old-no-send',
          artifact: {
            type: 'wait_rationale',
            context: 'Foldera checked your recent signals and did not find anything worth interrupting you for.',
            evidence: 'Foldera checked your recent signals and did not find anything worth interrupting you for.',
          },
        },
      },
      {
        id: 'blocked-2',
        user_id: USER_ID,
        status: 'skipped',
        action_type: 'do_nothing',
        directive_text: 'Nothing cleared the bar today after evaluating 4 candidates.',
        reason: 'Nothing cleared the bar today after evaluating 4 candidates.',
        confidence: 45,
        generated_at: new Date().toISOString(),
        execution_result: {
          outcome_type: 'no_send',
          artifact: {
            type: 'wait_rationale',
            context: 'Foldera checked your recent signals and did not find anything worth interrupting you for.',
            evidence: 'Foldera checked your recent signals and did not find anything worth interrupting you for.',
          },
        },
      },
    ];

    const result = await runDailySend({
      userIds: [USER_ID],
      briefInvocationSource: 'settings_run_brief',
    });

    expect(result.results).toEqual([
      expect.objectContaining({
        code: 'email_already_sent',
        success: true,
        meta: expect.objectContaining({
          action_id: 'older-sent-no-send',
          resend_id: 'resend-old-no-send',
          daily_email_idempotency_key: expect.stringContaining(`daily-brief:${USER_ID}:`),
        }),
      }),
    ]);
    expect(sendDailyDirective).not.toHaveBeenCalled();
    expect(mockSupabase.updatedActions).toEqual([]);
  });

  it('sends a newer unsent pending action even when an older row was already emailed today', async () => {
    vi.mocked(getVerifiedDailyBriefRecipientEmail).mockResolvedValue('owner@example.com');
    vi.mocked(sendDailyDirective).mockResolvedValue({ data: { id: 'resend-new' } } as never);
    const olderSentAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    mockSupabase.actionRows = [
      {
        id: 'older-sent-blocker',
        user_id: USER_ID,
        status: 'skipped',
        action_type: 'do_nothing',
        directive_text: 'Older wait rationale already delivered.',
        reason: 'Nothing cleared the bar.',
        confidence: 45,
        generated_at: olderSentAt,
        execution_result: {
          outcome_type: 'no_send',
          daily_brief_sent_at: olderSentAt,
          resend_id: 'resend-old',
          artifact: {
            type: 'wait_rationale',
            context: 'Older context.',
            evidence: 'Older evidence.',
          },
        },
      },
      {
        id: 'pending-new',
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
            to: 'owner@example.com',
            subject: 'Update',
            body: 'Hello',
            draft_type: 'email_compose',
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
          action_id: 'pending-new',
          resend_id: 'resend-new',
        }),
      }),
    ]);
    expect(sendDailyDirective).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'owner@example.com',
        userId: USER_ID,
        directives: [
          expect.objectContaining({
            id: 'pending-new',
            action_type: 'send_message',
          }),
        ],
      }),
    );
    expect(mockSupabase.updatedActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'pending-new',
          payload: expect.objectContaining({
            execution_result: expect.objectContaining({
              daily_brief_sent_at: expect.any(String),
              resend_id: 'resend-new',
            }),
          }),
        }),
      ]),
    );
  });
});

describe('getTriggerResponseStatus', () => {
  it('returns 207 when any stage is partial', () => {
    expect(getTriggerResponseStatus(
      { attempted: 1, errors: [], failed: 0, status: 'ok', succeeded: 1, summary: 'ok' },
      { attempted: 1, errors: ['one failed'], failed: 1, status: 'partial', succeeded: 0, summary: 'partial' },
      { attempted: 1, errors: [], failed: 0, status: 'ok', succeeded: 1, summary: 'ok' },
    )).toBe(207);
  });

  it('returns 500 when any stage fails', () => {
    expect(getTriggerResponseStatus(
      { attempted: 1, errors: [], failed: 0, status: 'ok', succeeded: 1, summary: 'ok' },
      { attempted: 1, errors: ['failed'], failed: 1, status: 'failed', succeeded: 0, summary: 'failed' },
      { attempted: 1, errors: [], failed: 0, status: 'ok', succeeded: 1, summary: 'ok' },
    )).toBe(500);
  });
});
