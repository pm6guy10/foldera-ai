import { NextResponse } from 'next/server';
import { resolveUser } from '@/lib/auth/resolve-user';
import { createServerClient } from '@/lib/db/client';
import {
  normalizeWorkdayPresenceState,
  type WorkdayPresenceState,
} from '@/lib/workday-presence/model';
import {
  buildRightNowMessagePayload,
  RIGHT_NOW_ACTION_IDS,
  type RightNowMessageActionId,
} from '@/lib/workday-presence/message';
import {
  applyInteractionHistoryToState,
  appendWorkdayPresenceInteractionHistory,
  applyWorkdayPresenceAction,
} from '@/lib/workday-presence/actions';
import { insertPresenceReceipt } from '@/lib/workday-presence/presence-action-receipt';
import { apiErrorForRoute, badRequest } from '@/lib/utils/api-error';

export const dynamic = 'force-dynamic';

type ActionPayload = {
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
  const auth = await resolveUser(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const payload = (await request.json().catch(() => ({}))) as ActionPayload;
    const actionId = payload.action_id;
    if (!actionId) return badRequest('action_id is required');
    if (!(RIGHT_NOW_ACTION_IDS as readonly string[]).includes(actionId)) {
      return badRequest('Invalid action_id');
    }

    const supabase = createServerClient();
    const { data, error } = await supabase.auth.admin.getUserById(auth.userId);
    if (error) throw error;

    const metadata = (data.user?.user_metadata ?? {}) as Record<string, unknown>;
    const applied = applyWorkdayPresenceAction(metadata.workday_presence_state, actionId, {
      blocker: payload.blocker,
    });
    if (!applied.ok) return badRequest(applied.error);

    const nextState = applied.nextState;
    const currentState = normalizeWorkdayPresenceState(metadata.workday_presence_state);
    if (!currentState) return badRequest('No active workday presence state');

    const persistedState = await persistState(auth.userId, metadata, nextState, actionId);
    await insertPresenceReceipt(supabase, auth.userId, actionId, persistedState);

    return NextResponse.json({
      state: persistedState,
      payload: buildRightNowMessagePayload(persistedState),
    });
  } catch (error: unknown) {
    return apiErrorForRoute(error, 'workday-presence message-action POST');
  }
}

