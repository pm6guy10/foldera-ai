import { describe, expect, it, vi } from 'vitest';
import { insertPresenceReceipt } from '../presence-action-receipt';
import type { WorkdayPresenceState } from '../model';

const dummyState: WorkdayPresenceState = {
  current_focus: 'Verify Acme deal status',
  next_move: 'Review signed contract',
  why_it_matters: 'Deal is set to close today',
  blocker: null,
  do_not_touch: null,
  waiting_on: null,
  last_completed_step: null,
  state_source: 'manual_anchor',
  source_trail: [],
  snoozed_until: null,
  interaction_history: [],
  created_at: '2026-05-20T12:00:00Z',
  updated_at: '2026-05-20T12:10:00Z',
};

describe('presence action receipt inserts', () => {
  it('skips insert for view_draft', async () => {
    const mockInsert = vi.fn().mockResolvedValue({ error: null });
    const mockSupabase = {
      from: vi.fn().mockReturnValue({ insert: mockInsert }),
    } as any;

    await insertPresenceReceipt(mockSupabase, 'user-123', 'view_draft', dummyState);
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it('inserts approved action status for done and break_smaller', async () => {
    const mockInsert = vi.fn().mockResolvedValue({ error: null });
    const mockSupabase = {
      from: vi.fn().mockReturnValue({ insert: mockInsert }),
    } as any;

    await insertPresenceReceipt(mockSupabase, 'user-123', 'done', dummyState);
    expect(mockSupabase.from).toHaveBeenCalledWith('tkg_actions');
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-123',
        status: 'approved',
        action_source: 'workday_presence',
      }),
    );
  });

  it('inserts draft_rejected action status for dismiss or snooze', async () => {
    const mockInsert = vi.fn().mockResolvedValue({ error: null });
    const mockSupabase = {
      from: vi.fn().mockReturnValue({ insert: mockInsert }),
    } as any;

    await insertPresenceReceipt(mockSupabase, 'user-123', 'dismiss', dummyState);
    expect(mockSupabase.from).toHaveBeenCalledWith('tkg_actions');
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-123',
        status: 'draft_rejected',
        action_source: 'workday_presence',
      }),
    );
  });
});
