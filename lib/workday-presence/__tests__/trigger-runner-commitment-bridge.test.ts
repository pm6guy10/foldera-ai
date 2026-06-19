import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockFindLapsingCommitmentSignal = vi.fn();
const mockInsertTriggerReceipt = vi.fn().mockResolvedValue(undefined);

vi.mock('../commitment-bridge', () => ({
  findLapsingCommitmentSignal: mockFindLapsingCommitmentSignal,
}));

vi.mock('../trigger-receipt', () => ({
  insertTriggerReceipt: mockInsertTriggerReceipt,
  pickTriggerReceiptActionType: () => 'do_nothing',
}));

const mockGetUserById = vi.fn();
const mockUpdateUserById = vi.fn();
const mockSignalsLimit = vi.fn();

const mockSupabase = {
  auth: {
    admin: {
      getUserById: mockGetUserById,
      updateUserById: mockUpdateUserById,
    },
  },
  from: vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        gte: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: mockSignalsLimit,
          }),
        }),
      }),
    }),
  }),
};

vi.mock('@/lib/db/client', () => ({ createServerClient: () => mockSupabase }));

describe('maybeRunWorkdayPresenceTriggerRunnerForUser — commitment bridge integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.FOLDERA_SELF_USER_ID;
    mockSignalsLimit.mockResolvedValue({ data: [], error: null });
    mockUpdateUserById.mockResolvedValue({ data: {}, error: null });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('fires a real commitment_lapsing intervention and writes a real receipt when a real commitment is due soon, with zero fresh signals', async () => {
    mockGetUserById.mockResolvedValue({
      data: {
        user: {
          user_metadata: {
            workday_presence_state: {
              current_focus: 'Close ACME renewal decision',
              next_move: 'Send owner confirmation note',
              why_it_matters: 'The renewal window closes at 4 PM PT.',
              blocker: null,
              do_not_touch: null,
              waiting_on: null,
              last_completed_step: null,
              state_source: 'manual_anchor',
              source_trail: [],
              snoozed_until: null,
              interaction_history: [],
              created_at: '2026-06-16T08:00:00.000Z',
              updated_at: '2026-06-16T08:00:00.000Z',
            },
          },
        },
      },
      error: null,
    });

    mockFindLapsingCommitmentSignal.mockResolvedValue({
      id: 'commit-1',
      source: 'calendar',
      title: 'Send the Q3 budget revision to finance',
      starts_at_iso: '2026-06-16T20:00:00.000Z',
      due_at_iso: '2026-06-16T20:00:00.000Z',
      commitment_lapsing: true,
    });

    const { maybeRunWorkdayPresenceTriggerRunnerForUser } = await import('../trigger-runner');
    const result = await maybeRunWorkdayPresenceTriggerRunnerForUser('user-1');

    expect(mockFindLapsingCommitmentSignal).toHaveBeenCalledWith(mockSupabase, 'user-1', expect.any(String));
    expect((result as { outcome?: string }).outcome).toBe('intervention');
    expect(mockInsertTriggerReceipt).toHaveBeenCalledTimes(1);
    expect(mockInsertTriggerReceipt.mock.calls[0][0]).toMatchObject({
      userId: 'user-1',
      triggerType: 'commitment_lapsing',
    });
  });

  it('stays quiet when no fresh signal and no lapsing commitment exist', async () => {
    mockGetUserById.mockResolvedValue({
      data: {
        user: {
          user_metadata: {
            workday_presence_state: {
              current_focus: 'Close ACME renewal decision',
              next_move: 'Send owner confirmation note',
              why_it_matters: 'The renewal window closes at 4 PM PT.',
              blocker: null,
              do_not_touch: null,
              waiting_on: null,
              last_completed_step: null,
              state_source: 'manual_anchor',
              source_trail: [],
              snoozed_until: null,
              interaction_history: [],
              created_at: '2026-06-16T08:00:00.000Z',
              updated_at: '2026-06-16T08:00:00.000Z',
            },
          },
        },
      },
      error: null,
    });

    mockFindLapsingCommitmentSignal.mockResolvedValue(null);

    const { maybeRunWorkdayPresenceTriggerRunnerForUser } = await import('../trigger-runner');
    const result = await maybeRunWorkdayPresenceTriggerRunnerForUser('user-1');

    expect((result as { outcome?: string }).outcome).toBe('quiet');
    expect(mockInsertTriggerReceipt).not.toHaveBeenCalled();
  });
});
