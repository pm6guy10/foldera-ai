import type { SupabaseClient } from '@/lib/db/client';
import type { SlackSendResult } from '@/lib/slack/right-now';
import type { WorkdayPresenceTriggerType } from './triggers';

export async function insertSlackSendReceipt(input: {
  supabase: SupabaseClient;
  userId: string;
  slackResult: SlackSendResult;
  triggerType: WorkdayPresenceTriggerType | 'hidden_op' | 'proactive_winner' | null;
  label: string;
}): Promise<void> {
  const { error } = await input.supabase.from('tkg_actions').insert({
    user_id: input.userId,
    directive_text: `slack_send: ${input.label.slice(0, 200)}`,
    action_type: 'presence_action',
    confidence: 100,
    reason: `Slack Right Now card delivered — trigger_type=${input.triggerType ?? 'unknown'}`,
    evidence: [],
    status: 'executed',
    action_source: 'workday_presence_slack_send',
    execution_result: {
      trigger_type: input.triggerType,
      slack_ok: input.slackResult.ok,
      slack_ts: input.slackResult.message_ts ?? null,
      slack_channel: input.slackResult.channel ?? null,
    },
  });
  if (error) throw error;
}
