import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConvictionDirective, GenerationRunLog } from '@/lib/briefing/types';
import { getTriggerResponseStatus, runDailyGenerate, runDailySend } from '../daily-brief';
import { generateDirective, validateDirectiveForPersistence } from '@/lib/briefing/generator';
import { generateArtifact, getArtifactPersistenceIssues } from '@/lib/conviction/artifact-generator';
import { extractFromConversation } from '@/lib/extraction/conversation-extractor';
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

  from(table: string) {
    const self = this;

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
      return {
        select() {
          const query = {
            eq() {
              return query;
            },
            lt() {
              return Promise.resolve({
                count: 0,
                error: null,
              });
            },
          };

          return query;
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

vi.mock('@/lib/extraction/conversation-extractor', () => ({
  extractFromConversation: vi.fn().mockResolvedValue(undefined),
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
  sendDailyDirective: vi.fn().mockResolvedValue(undefined),
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
    directive: 'Draft the reference follow-up email to Holly today.',
    action_type: 'send_message',
    confidence: 82,
    reason: 'Reference prep is the highest-leverage move before the final MAS3 selection window closes.',
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
    vi.mocked(generateDirective).mockReset();
    vi.mocked(validateDirectiveForPersistence).mockReset();
    vi.mocked(generateArtifact).mockReset();
    vi.mocked(getArtifactPersistenceIssues).mockReset();
    vi.mocked(extractFromConversation).mockClear();
    vi.mocked(countUnprocessedSignals).mockReset();
    mockResolveSignalBacklogMode.mockClear();
    vi.mocked(processUnextractedSignals).mockClear();
    vi.mocked(summarizeSignals).mockClear();
    vi.mocked(getVerifiedDailyBriefRecipientEmail).mockReset();
    vi.mocked(sendDailyDirective).mockClear();
    vi.mocked(validateDirectiveForPersistence).mockReturnValue([]);
    vi.mocked(getArtifactPersistenceIssues).mockReturnValue([]);
    vi.mocked(countUnprocessedSignals).mockResolvedValue(0);
  });

  it('persists top candidate discovery on successful directive generation', async () => {
    vi.mocked(generateDirective).mockResolvedValue(buildDirective());
    vi.mocked(generateArtifact).mockResolvedValue({
      type: 'email',
      to: 'holly@example.com',
      subject: 'Reference talking points for MAS3',
      body: 'Hi Holly,\n\nCould you send the two strongest reference talking points for MAS3?\n\nThanks,\nBrandon',
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

  it('logs high nightly-ops signal mode during manual brief runs when all-source backlog is at least 100', async () => {
    vi.mocked(countUnprocessedSignals)
      .mockImplementation(async (_userId: string, options?: { includeAllSources?: boolean }) => (
        options?.includeAllSources ? 831 : 0
      ));
    vi.mocked(generateDirective).mockResolvedValue(buildDirective());
    vi.mocked(generateArtifact).mockResolvedValue({
      type: 'email',
      to: 'holly@example.com',
      subject: 'Reference talking points for MAS3',
      body: 'Hi Holly,\n\nCould you send the two strongest reference talking points for MAS3?\n\nThanks,\nBrandon',
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
    expect(mockSupabase.insertedActions.some((row) => row.status === 'pending_approval')).toBe(false);
  });

  it('does not persist pending_approval when artifact structural validation fails', async () => {
    vi.mocked(generateDirective).mockResolvedValue(buildDirective());
    vi.mocked(generateArtifact).mockResolvedValue({
      type: 'email',
      to: 'holly@example.com',
      subject: 'Reference talking points for MAS3',
      body: 'Hi Holly,\n\nCould you send the two strongest reference talking points for MAS3?\n\nThanks,\nBrandon',
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
    expect(mockSupabase.insertedActions.some((row) => row.status === 'pending_approval')).toBe(false);
    expect(mockSupabase.insertedActions.some((row) => row.status === 'skipped')).toBe(true);
  });

  it('persists explicit no-send outcomes when fewer than 3 candidates were evaluated', async () => {
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

    expect(result.results).toEqual([
      expect.objectContaining({
        code: 'no_send_persisted',
        detail: 'Acceptance gate blocked send because fewer than 3 candidates were evaluated.',
        success: true,
      }),
    ]);
    expect(generateArtifact).not.toHaveBeenCalled();
    const saved = mockSupabase.insertedActions[0];
    expect(saved.status).toBe('skipped');
    expect((saved.execution_result as Record<string, any>).generation_log.candidateDiscovery.topCandidates).toHaveLength(2);
    expect((saved.execution_result as Record<string, any>).generation_log.reason).toBe(
      'Acceptance gate blocked send because fewer than 3 candidates were evaluated.',
    );
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

  it('surfaces a persisted no-send blocker during send when no pending action exists', async () => {
    vi.mocked(getVerifiedDailyBriefRecipientEmail).mockResolvedValue('owner@example.com');
    mockSupabase.actionRows = [
      {
        id: 'blocked-1',
        user_id: USER_ID,
        status: 'skipped',
        action_type: 'do_nothing',
        directive_text: 'No directive sent today.',
        reason: 'Generation validation failed: drafted_email recipient must be a real email address',
        confidence: 0,
        generated_at: new Date().toISOString(),
        execution_result: {
          outcome_type: 'no_send',
          generation_log: {
            reason: 'Generation validation failed: drafted_email recipient must be a real email address',
          },
        },
      },
    ];

    const result = await runDailySend();

    expect(result.results).toEqual([
      expect.objectContaining({
        code: 'no_send_blocker_persisted',
        detail: 'Generation validation failed: drafted_email recipient must be a real email address',
        success: true,
      }),
    ]);
    expect(result.message).toContain('No brief email was sent for 1 user');
    expect(result.message).toContain('drafted_email recipient must be a real email address');
    expect(sendDailyDirective).not.toHaveBeenCalled();
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
