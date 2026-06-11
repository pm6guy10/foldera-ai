import { NextResponse } from 'next/server';
import { resolveAnyUser } from '@/lib/auth/resolve-user';
import { createServerClient } from '@/lib/db/client';
import { normalizeWorkdayPresenceState, type WorkdayPresenceState } from '@/lib/workday-presence/model';
import { buildRightNowMessagePayload, type RightNowMessageActionId } from '@/lib/workday-presence/message';
import {
  applyInteractionHistoryToState,
  appendWorkdayPresenceInteractionHistory,
} from '@/lib/workday-presence/actions';
import { buildSlackTestModeRightNowMessage } from '@/lib/slack-test-mode/right-now';
import {
  buildPresenceLoopReceipt,
  type PresenceLoopReceipt,
} from '@/lib/workday-presence/presence-loop-receipt';
import { apiErrorForRoute, badRequest } from '@/lib/utils/api-error';

export const dynamic = 'force-dynamic';

type InteractionBody = {
  action_id?: RightNowMessageActionId;
  blocker?: string;
};

async function persistState(
  userId: string,
  metadata: Record<string, unknown>,
  nextState: WorkdayPresenceState,
  actionId: RightNowMessageActionId,
): Promise<WorkdayPresenceState> {
  const stateWithHistory = applyInteractionHistoryToState(
    metadata,
    actionId,
    nextState,
    nextState.updated_at,
  );
  const supabase = createServerClient();
  const nextMetadata = appendWorkdayPresenceInteractionHistory(
    metadata,
    actionId,
    stateWithHistory,
    nextState.updated_at,
  );
  const updateResult = await supabase.auth.admin.updateUserById(userId, {
    user_metadata: nextMetadata,
  });
  if (updateResult.error) throw updateResult.error;
  return stateWithHistory;
}

export async function POST(request: Request) {
  const auth = await resolveAnyUser(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const payload = (await request.json().catch(() => ({}))) as InteractionBody;
    const actionId = payload.action_id;
    if (!actionId) return badRequest('action_id is required');
    if (!['done', 'stuck', 'break_smaller', 'snooze'].includes(actionId)) {
      return badRequest('Invalid action_id');
    }

    const supabase = createServerClient();
    const { data, error } = await supabase.auth.admin.getUserById(auth.userId);
    if (error) throw error;

    const metadata = (data.user?.user_metadata ?? {}) as Record<string, unknown>;
    const currentState = normalizeWorkdayPresenceState(metadata.workday_presence_state);
    if (!currentState) return badRequest('No active workday presence state');

    const nowIso = new Date().toISOString();
    let receipt: PresenceLoopReceipt;
    try {
      receipt = buildPresenceLoopReceipt(currentState, {
        action_id: actionId,
        blocker: payload.blocker,
        nowIso,
      });
    } catch (error) {
      return badRequest(error instanceof Error ? error.message : 'Invalid interaction payload');
    }

    const nextState = receipt.after_state;
    const persistedState = await persistState(auth.userId, metadata, nextState, actionId);

    const nextPayload = buildRightNowMessagePayload(persistedState);
    return NextResponse.json({
      acknowledged: true,
      action_id: actionId,
      state: persistedState,
      payload: nextPayload,
      slack_test_mode: buildSlackTestModeRightNowMessage(nextPayload),
      receipt: {
        ...receipt,
        after_state: persistedState,
      },
    });
  } catch (error: unknown) {
    return apiErrorForRoute(error, 'slack test-mode interaction POST');
  }
}

