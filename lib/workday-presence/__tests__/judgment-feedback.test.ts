import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { WorkdayPresenceState } from '../model';

const mockExecuteAction = vi.fn();
vi.mock('@/lib/conviction/execute-action', () => ({
  executeAction: (...args: unknown[]) => mockExecuteAction(...args),
}));

import { recordDismissJudgment } from '../judgment-feedback';

const USER_ID = '11111111-1111-4111-8111-111111111111';

function stateWithDraft(actionId?: string | null): WorkdayPresenceState {
  return {
    current_focus: 'Close ACME renewal decision',
    next_move: 'Send owner confirmation note',
    why_it_matters: 'The renewal window closes at 4 PM PT.',
    blocker: null,
    do_not_touch: null,
    waiting_on: null,
    last_completed_step: null,
    state_source: 'scored_winner',
    source_trail: [],
    draft: {
      action_type: 'send_message',
      title: 'Owner confirmation note',
      preview: 'Confirming the renewal decision.',
      ...(actionId ? { action_id: actionId } : {}),
    },
    snoozed_until: null,
    interaction_history: [],
    created_at: '2026-06-30T12:00:00.000Z',
    updated_at: '2026-06-30T12:00:00.000Z',
  };
}

describe('recordDismissJudgment — the dismiss half of the judgment ratchet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips the backing row through the same executeAction path the dashboard uses', async () => {
    mockExecuteAction.mockResolvedValue({ status: 'skipped', action_id: 'act-1' });

    const result = await recordDismissJudgment(USER_ID, stateWithDraft('act-1'), 'slack_dismiss');

    expect(mockExecuteAction).toHaveBeenCalledWith({
      userId: USER_ID,
      actionId: 'act-1',
      decision: 'skip',
      skipReason: 'slack_dismiss',
    });
    expect(result).toEqual({ recorded: true, reason: 'skipped' });
  });

  it('teaches nothing when there is no backing action row (manual anchors, legacy cards)', async () => {
    const result = await recordDismissJudgment(USER_ID, stateWithDraft(null), 'dashboard_dismiss');

    expect(mockExecuteAction).not.toHaveBeenCalled();
    expect(result).toEqual({ recorded: false, reason: 'no_backing_action' });

    const noState = await recordDismissJudgment(USER_ID, null, 'dashboard_dismiss');
    expect(noState).toEqual({ recorded: false, reason: 'no_backing_action' });
  });

  it('reports an already-claimed row honestly (dismiss after send is a no-op, the earlier decision stands)', async () => {
    mockExecuteAction.mockResolvedValue({
      status: 'skipped',
      action_id: 'act-1',
      error: 'Action already claimed by another request or not found',
    });

    const result = await recordDismissJudgment(USER_ID, stateWithDraft('act-1'), 'slack_dismiss');

    expect(result.recorded).toBe(false);
    expect(result.reason).toContain('already claimed');
  });

  it('never throws — a learning-write failure must not break the card interaction', async () => {
    mockExecuteAction.mockRejectedValue(new Error('db down'));

    const result = await recordDismissJudgment(USER_ID, stateWithDraft('act-1'), 'slack_dismiss');

    expect(result).toEqual({ recorded: false, reason: 'db down' });
  });
});
