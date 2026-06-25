import type { SupabaseClient } from '@/lib/db/client';
import type { RightNowMessageActionId } from './message';
import type { WorkdayPresenceState } from './model';

/**
 * Durable tkg_actions receipt for a closed presence loop. Shared by the live
 * Slack interaction route and the test-mode route so both paths leave the
 * same audit trail.
 *
 * view_draft is engagement, not a loop close — no terminal receipt for it.
 *
 * `respondedToSlackTs` is the message_ts of the original Slack card this action
 * answers (Slack puts it on the interaction payload). Stamping it onto the
 * receipt is the join key for the card-precision meter: it links this response
 * row back to the `workday_presence_slack_send` row that fired the card, so we
 * can compute fired → acted. See `card-precision.ts`.
 */
export async function insertPresenceReceipt(
  supabase: SupabaseClient,
  userId: string,
  actionId: RightNowMessageActionId,
  state: WorkdayPresenceState,
  respondedToSlackTs?: string | null,
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
      ...(respondedToSlackTs ? { responded_to_slack_ts: respondedToSlackTs } : {}),
      ...(state.draft ? { draft_title: state.draft.title, draft_action_type: state.draft.action_type } : {}),
    },
  });
  if (error) throw error;
}
