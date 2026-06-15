import type { SupabaseClient } from '@/lib/db/client';
import { type WorkdayPresenceState } from './model';
import { type WorkdayPresenceTriggerType } from './triggers';

const ALLOWED_ACTION_TYPES = new Set([
  'send_message',
  'write_document',
  'schedule',
  'schedule_block',
  'do_nothing',
  'make_decision',
  'research',
  'wait_rationale',
]);

export function pickTriggerReceiptActionType(state: WorkdayPresenceState): string {
  const actionType = state.draft?.action_type?.trim();
  if (!actionType) return 'do_nothing';
  return ALLOWED_ACTION_TYPES.has(actionType) ? actionType : 'do_nothing';
}

export async function insertTriggerReceipt(input: {
  supabase: SupabaseClient;
  userId: string;
  triggerType: WorkdayPresenceTriggerType;
  state: WorkdayPresenceState;
}) {
  const evidence = input.state.source_trail.slice(0, 2).map((entry) => ({
    table: entry.table,
    source: entry.source,
    type: entry.type,
    source_id: entry.source_id ?? null,
    summary: entry.redacted_summary,
    selection_reason: entry.selection_reason,
  }));

  const { error } = await input.supabase.from('tkg_actions').insert({
    user_id: input.userId,
    directive_text: input.state.next_move,
    action_type: pickTriggerReceiptActionType(input.state),
    confidence: 100,
    reason: `Workday presence trigger emitted one Right Now card — trigger_type=${input.triggerType}`,
    evidence,
    action_source: 'workday_presence_trigger',
    execution_result: {
      trigger_type: input.triggerType,
      current_focus: input.state.current_focus,
      next_move: input.state.next_move,
      blocker: input.state.blocker,
      state_source: input.state.state_source,
    },
  });
  if (error) throw error;
}
