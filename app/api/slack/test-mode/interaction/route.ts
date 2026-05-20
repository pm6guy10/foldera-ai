import { NextResponse } from 'next/server';
import { resolveUser } from '@/lib/auth/resolve-user';
import { createServerClient } from '@/lib/db/client';
import { normalizeWorkdayPresenceState, type WorkdayPresenceState } from '@/lib/workday-presence/model';
import { buildRightNowMessagePayload, type RightNowMessageActionId } from '@/lib/workday-presence/message';
import { applyWorkdayPresenceAction } from '@/lib/workday-presence/actions';
import { buildSlackTestModeRightNowMessage } from '@/lib/slack-test-mode/right-now';
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
) {
  const supabase = createServerClient();
  const updateResult = await supabase.auth.admin.updateUserById(userId, {
    user_metadata: {
      ...metadata,
      workday_presence_state: nextState,
    },
  });
  if (updateResult.error) throw updateResult.error;
}

export async function POST(request: Request) {
  const auth = await resolveUser(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const payload = (await request.json().catch(() => ({}))) as InteractionBody;
    const actionId = payload.action_id;
    if (!actionId) return badRequest('action_id is required');

    const supabase = createServerClient();
    const { data, error } = await supabase.auth.admin.getUserById(auth.userId);
    if (error) throw error;

    const metadata = (data.user?.user_metadata ?? {}) as Record<string, unknown>;
    const applied = applyWorkdayPresenceAction(metadata.workday_presence_state, actionId, {
      blocker: payload.blocker,
    });
    if (!applied.ok) return badRequest(applied.error);

    const currentState = normalizeWorkdayPresenceState(metadata.workday_presence_state);
    if (!currentState) return badRequest('No active workday presence state');

    const nextState = applied.nextState;
    if (actionId !== 'snooze') {
      await persistState(auth.userId, metadata, nextState);
    }

    const nextPayload = buildRightNowMessagePayload(nextState);
    return NextResponse.json({
      action_id: actionId,
      state: nextState,
      payload: nextPayload,
      slack_test_mode: buildSlackTestModeRightNowMessage(nextPayload),
    });
  } catch (error: unknown) {
    return apiErrorForRoute(error, 'slack test-mode interaction POST');
  }
}

