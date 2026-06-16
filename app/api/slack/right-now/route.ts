import { NextResponse } from 'next/server';
import { resolveUser } from '@/lib/auth/resolve-user';
import { createServerClient } from '@/lib/db/client';
import { buildSlackRightNowMessage, requireSlackChannel, resolveSlackAdapterFromEnv } from '@/lib/slack/right-now';
import { redactSlackSecret } from '@/lib/slack/redaction';
import { buildRightNowMessagePayload } from '@/lib/workday-presence/message';
import { normalizeWorkdayPresenceState } from '@/lib/workday-presence/model';
import { pickTriggerReceiptActionType } from '@/lib/workday-presence/trigger-receipt';
import { apiErrorForRoute, badRequest } from '@/lib/utils/api-error';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const auth = await resolveUser(request);
  if (auth instanceof NextResponse) return auth;
  const selfUserId = process.env.FOLDERA_SELF_USER_ID;
  if (!selfUserId || auth.userId !== selfUserId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const channel = requireSlackChannel();
    const supabase = createServerClient();
    const { data, error } = await supabase.auth.admin.getUserById(auth.userId);
    if (error) throw error;

    const metadata = (data.user?.user_metadata ?? {}) as Record<string, unknown>;
    const state = normalizeWorkdayPresenceState(metadata.workday_presence_state);
    if (!state) return badRequest('No active workday presence state');

    const payload = buildRightNowMessagePayload(state);

    const evidence = state.source_trail?.slice(0, 2).map((entry) => ({
      table: entry.table,
      source: entry.source,
      type: entry.type,
      source_id: entry.source_id ?? null,
      summary: entry.redacted_summary,
      selection_reason: entry.selection_reason,
    })) ?? [];

    const { error: insertError } = await supabase.from('tkg_actions').insert({
      user_id: auth.userId,
      directive_text: state.next_move,
      action_type: pickTriggerReceiptActionType(state),
      confidence: 100,
      reason: `Workday presence right-now command posted one card`,
      evidence,
      action_source: 'workday_presence_trigger',
      execution_result: {
        trigger_type: 'right_now_post',
        current_focus: state.current_focus,
        next_move: state.next_move,
        blocker: state.blocker,
        state_source: state.state_source,
      },
    });
    if (insertError) throw insertError;

    const slackMessage = buildSlackRightNowMessage(payload, channel);
    const sendResult = await resolveSlackAdapterFromEnv().postMessage(slackMessage);

    return NextResponse.json(
      redactSlackSecret({
        acknowledged: true,
        live_slack_ready: sendResult.mode === 'live',
        state,
        payload,
        slack: {
          channel: sendResult.channel,
          message_ts: sendResult.message_ts,
          mode: sendResult.mode,
          response: sendResult.response,
        },
        receipt: {
          before_state: state,
          slack_send: sendResult,
          paid_model_call_required: false,
          inline_full_state_recompute: false,
        },
      }),
    );
  } catch (error: unknown) {
    return apiErrorForRoute(error, 'slack right-now POST');
  }
}

