import { NextResponse } from 'next/server';
import { resolveUser } from '@/lib/auth/resolve-user';
import { createServerClient } from '@/lib/db/client';
import {
  normalizeWorkdayPresenceState,
  type WorkdayPresenceState,
} from '@/lib/workday-presence/model';
import {
  buildRightNowMessagePayload,
  type RightNowMessageActionId,
} from '@/lib/workday-presence/message';
import { apiErrorForRoute, badRequest } from '@/lib/utils/api-error';

export const dynamic = 'force-dynamic';

type ActionPayload = {
  action_id?: RightNowMessageActionId;
  blocker?: string;
};

function clean(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function applyDone(state: WorkdayPresenceState, nowIso: string): WorkdayPresenceState {
  return {
    ...state,
    blocker: null,
    last_completed_step: state.next_move,
    next_move: `Write the next smallest step to move "${state.current_focus}" forward.`,
    updated_at: nowIso,
  };
}

function applyStuck(state: WorkdayPresenceState, blocker: string, nowIso: string): WorkdayPresenceState {
  return {
    ...state,
    blocker,
    updated_at: nowIso,
  };
}

function applyBreakSmaller(state: WorkdayPresenceState, nowIso: string): WorkdayPresenceState {
  return {
    ...state,
    next_move: `Break it smaller: write the smallest concrete step that moves "${state.current_focus}" forward and can be finished in 10 minutes.`,
    updated_at: nowIso,
  };
}

async function persistState(
  userId: string,
  metadata: Record<string, unknown>,
  nextState: WorkdayPresenceState,
) {
  const supabase = createServerClient();
  const updateResult = await supabase.auth.admin.updateUserById(userId, {
    user_metadata: {
      ...metadata,
      // This stays in Auth metadata for MVP portability. A first-class table with RLS/history comes later.
      workday_presence_state: nextState,
    },
  });
  if (updateResult.error) throw updateResult.error;
}

export async function POST(request: Request) {
  const auth = await resolveUser(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const payload = (await request.json().catch(() => ({}))) as ActionPayload;
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
    if (!currentState) {
      return badRequest('No active workday presence state');
    }

    if (actionId === 'snooze') {
      return NextResponse.json({
        acknowledged: true,
        payload: buildRightNowMessagePayload(currentState),
      });
    }

    const nowIso = new Date().toISOString();
    let nextState: WorkdayPresenceState = currentState;
    if (actionId === 'done') {
      nextState = applyDone(currentState, nowIso);
    }
    if (actionId === 'stuck') {
      const blocker = currentState.blocker ?? clean(payload.blocker);
      if (!blocker) return badRequest('blocker is required for stuck');
      nextState = applyStuck(currentState, blocker, nowIso);
    }
    if (actionId === 'break_smaller') {
      nextState = applyBreakSmaller(currentState, nowIso);
    }

    await persistState(auth.userId, metadata, nextState);

    return NextResponse.json({
      state: nextState,
      payload: buildRightNowMessagePayload(nextState),
    });
  } catch (error: unknown) {
    return apiErrorForRoute(error, 'workday-presence message-action POST');
  }
}

