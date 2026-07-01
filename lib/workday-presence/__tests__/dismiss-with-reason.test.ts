import { describe, it, expect, vi, beforeEach } from 'vitest';
import { applyDismissWithReason } from '../dismiss-with-reason';

const mockExecuteAction = vi.fn();
vi.mock('@/lib/conviction/execute-action', () => ({ executeAction: (...args: unknown[]) => mockExecuteAction(...args) }));

const USER_ID = 'user-1';
const ACTION_ID = 'action-1';

function buildSupabase(executionResult: Record<string, unknown> | null) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { execution_result: executionResult },
              error: null,
            }),
          })),
        })),
      })),
    })),
  };
}

describe('applyDismissWithReason', () => {
  beforeEach(() => {
    mockExecuteAction.mockReset();
    mockExecuteAction.mockResolvedValue({ status: 'skipped', action_id: ACTION_ID });
  });

  it('maps "never" to the not_relevant skip_reason and carries mechanism/topic into the dismissal block', async () => {
    const supabase = buildSupabase({ inspection: { mechanism_class: 'avoidance_pattern', topic_key: 'sig-1:*' } });
    const result = await applyDismissWithReason(supabase as any, USER_ID, ACTION_ID, 'never');

    expect(result).toEqual({ ok: true, skip_reason: 'not_relevant' });
    expect(mockExecuteAction).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        actionId: ACTION_ID,
        decision: 'skip',
        skipReason: 'not_relevant',
        extraExecutionResultPatch: expect.objectContaining({
          dismissal: expect.objectContaining({
            reason: 'never',
            mechanism_class: 'avoidance_pattern',
            topic_key: 'sig-1:*',
            dismissed_via: 'slack_overflow',
          }),
        }),
      }),
    );
  });

  it('maps "wrong_framing" to wrong_approach', async () => {
    const supabase = buildSupabase(null);
    const result = await applyDismissWithReason(supabase as any, USER_ID, ACTION_ID, 'wrong_framing');
    expect(result).toEqual({ ok: true, skip_reason: 'wrong_approach' });
    expect(mockExecuteAction).toHaveBeenCalledWith(expect.objectContaining({ skipReason: 'wrong_approach' }));
  });

  it('maps "already_done" to already_handled', async () => {
    const supabase = buildSupabase(null);
    const result = await applyDismissWithReason(supabase as any, USER_ID, ACTION_ID, 'already_done');
    expect(result).toEqual({ ok: true, skip_reason: 'already_handled' });
    expect(mockExecuteAction).toHaveBeenCalledWith(expect.objectContaining({ skipReason: 'already_handled' }));
  });

  it('leaves skip_reason unset for "not_now" but still records the dismissal block', async () => {
    const supabase = buildSupabase(null);
    const result = await applyDismissWithReason(supabase as any, USER_ID, ACTION_ID, 'not_now');
    expect(result).toEqual({ ok: true, skip_reason: null });
    const callArgs = mockExecuteAction.mock.calls[0][0];
    expect(callArgs.skipReason).toBeUndefined();
    expect(callArgs.extraExecutionResultPatch.dismissal.reason).toBe('not_now');
  });

  it('reads null mechanism/topic safely when the row has no inspection block', async () => {
    const supabase = buildSupabase(null);
    await applyDismissWithReason(supabase as any, USER_ID, ACTION_ID, 'never');
    const callArgs = mockExecuteAction.mock.calls[0][0];
    expect(callArgs.extraExecutionResultPatch.dismissal.mechanism_class).toBeNull();
    expect(callArgs.extraExecutionResultPatch.dismissal.topic_key).toBeNull();
  });

  it('returns ok:false when the lookup query errors', async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } }),
            })),
          })),
        })),
      })),
    };
    const result = await applyDismissWithReason(supabase as any, USER_ID, ACTION_ID, 'never');
    expect(result).toEqual({ ok: false, error: 'boom' });
    expect(mockExecuteAction).not.toHaveBeenCalled();
  });

  it('returns ok:false when executeAction reports an error', async () => {
    mockExecuteAction.mockResolvedValue({ status: 'skipped', action_id: ACTION_ID, error: 'Action already claimed by another request or not found' });
    const supabase = buildSupabase(null);
    const result = await applyDismissWithReason(supabase as any, USER_ID, ACTION_ID, 'never');
    expect(result).toEqual({ ok: false, error: 'Action already claimed by another request or not found' });
  });
});
