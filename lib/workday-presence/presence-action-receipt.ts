import type { SupabaseClient } from '@/lib/db/client';
import type { RightNowMessageActionId } from './message';
import type { WorkdayPresenceState } from './model';

/**
 * Durable tkg_actions receipt for a closed presence loop. Shared by the live
 * Slack interaction route and the test-mode route so both paths leave the
 * same audit trail.
 *
 * view_draft is engagement, not a loop close — no terminal receipt for it.
 */
export async function insertPresenceReceipt(
  supabase: SupabaseClient,
  userId: string,
  actionId: RightNowMessageActionId,
  state: WorkdayPresenceState,
): Promise<void> {
  if (actionId === 'view_draft') return;
  const status = actionId === 'done' || actionId === 'break_smaller' ? 'approved' : 'draft_rejected';
  const { error } = await supabase.from('tkg_actions').insert({
    user_id: userId,
    directive_text: `${actionId}: ${state.current_focus ?? 'workday presence action'}`,
    action_type: 'presence_action',
    confidence: 100,
    reason: `Workday presence loop closed — action_id=${actionId}`,
    evidence: [],
    status,
    action_source: 'workday_presence',
    execution_result: {
      action_id: actionId,
      current_focus: state.current_focus,
      next_move: state.next_move,
      state_source: state.state_source,
      ...(state.draft ? { draft_title: state.draft.title, draft_action_type: state.draft.action_type } : {}),
    },
  });
  if (error) throw error;
}
