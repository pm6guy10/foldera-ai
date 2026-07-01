import type { SupabaseClient } from '@/lib/db/client';
import { executeAction, type SkipReason } from '@/lib/conviction/execute-action';
import type { DismissReasonValue } from '@/lib/slack/right-now';

/**
 * Maps the 4 Slack-facing dismissal reasons onto the existing `skip_reason` DB enum.
 * `not_now` has no exact analog ("ask again soon" is not a verdict on the content) — it
 * intentionally leaves `skip_reason` unset, same as today's reason-less skip, while the
 * full 4-way fidelity still rides in `execution_result.dismissal` below.
 */
const REASON_TO_SKIP_REASON: Record<DismissReasonValue, SkipReason | undefined> = {
  not_now: undefined,
  never: 'not_relevant',
  wrong_framing: 'wrong_approach',
  already_done: 'already_handled',
};

export type ApplyDismissWithReasonResult =
  | { ok: true; skip_reason: SkipReason | null }
  | { ok: false; error: string };

/**
 * Records the judgment behind a one-tap Slack dismissal on the underlying `tkg_actions`
 * row: always-populated `feedback_weight` (via the existing skip path), `skip_reason` for
 * 3 of 4 reasons, and a richer `execution_result.dismissal` block carrying the mechanism/topic
 * key the row was generated with — so the scorer can later demote matching future judgments
 * without needing the exact row. Reuses `executeAction`'s working skip logic rather than
 * duplicating it; does not touch `workday_presence_state` (the caller still applies the
 * existing 4h dismiss snooze separately).
 */
export async function applyDismissWithReason(
  supabase: SupabaseClient,
  userId: string,
  actionId: string,
  reason: DismissReasonValue,
): Promise<ApplyDismissWithReasonResult> {
  const { data, error } = await supabase
    .from('tkg_actions')
    .select('execution_result')
    .eq('id', actionId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };

  const executionResult = (data?.execution_result as Record<string, unknown> | null) ?? {};
  const inspection = (executionResult.inspection as Record<string, unknown> | undefined) ?? {};
  const mechanismClass = typeof inspection.mechanism_class === 'string' ? inspection.mechanism_class : null;
  const topicKey = typeof inspection.topic_key === 'string' ? inspection.topic_key : null;

  const skipReason = REASON_TO_SKIP_REASON[reason];
  const result = await executeAction({
    userId,
    actionId,
    decision: 'skip',
    ...(skipReason ? { skipReason } : {}),
    extraExecutionResultPatch: {
      dismissal: {
        reason,
        mechanism_class: mechanismClass,
        topic_key: topicKey,
        dismissed_at: new Date().toISOString(),
        dismissed_via: 'slack_overflow',
      },
    },
  });

  if (result.error) return { ok: false, error: result.error };
  return { ok: true, skip_reason: skipReason ?? null };
}
