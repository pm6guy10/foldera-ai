import { NextResponse } from 'next/server';
import { resolveUser } from '@/lib/auth/resolve-user';
import { createServerClient } from '@/lib/db/client';
import {
  buildRightNowCard,
  normalizeWorkdayPresenceState,
  type WorkdayPresenceState,
} from '@/lib/workday-presence/model';
import { apiErrorForRoute, badRequest } from '@/lib/utils/api-error';

export const dynamic = 'force-dynamic';

type PartialStateInput = Partial<
  Pick<
    WorkdayPresenceState,
    | 'current_focus'
    | 'next_move'
    | 'why_it_matters'
    | 'blocker'
    | 'do_not_touch'
    | 'waiting_on'
    | 'last_completed_step'
    | 'state_source'
  >
>;

function readStoredState(metadata: Record<string, unknown> | null | undefined): WorkdayPresenceState | null {
  return normalizeWorkdayPresenceState(metadata?.workday_presence_state);
}

export async function GET(request: Request) {
  const auth = await resolveUser(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const supabase = createServerClient();
    const { data, error } = await supabase.auth.admin.getUserById(auth.userId);
    if (error) throw error;
    const metadata = (data.user?.user_metadata ?? {}) as Record<string, unknown>;
    const state = readStoredState(metadata);
    return NextResponse.json({ state, card: buildRightNowCard(state) });
  } catch (error: unknown) {
    return apiErrorForRoute(error, 'workday-presence GET');
  }
}

export async function PUT(request: Request) {
  const auth = await resolveUser(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const payload = (await request.json().catch(() => ({}))) as PartialStateInput;
    if (!payload.current_focus || !payload.next_move || !payload.why_it_matters) {
      return badRequest('current_focus, next_move, and why_it_matters are required');
    }

    const supabase = createServerClient();
    const { data, error } = await supabase.auth.admin.getUserById(auth.userId);
    if (error) throw error;

    const metadata = (data.user?.user_metadata ?? {}) as Record<string, unknown>;
    const currentState = readStoredState(metadata);
    const nowIso = new Date().toISOString();
    const nextState = normalizeWorkdayPresenceState({
      current_focus: payload.current_focus,
      next_move: payload.next_move,
      why_it_matters: payload.why_it_matters,
      blocker: payload.blocker ?? null,
      do_not_touch: payload.do_not_touch ?? null,
      waiting_on: payload.waiting_on ?? null,
      last_completed_step: payload.last_completed_step ?? null,
      state_source: payload.state_source ?? currentState?.state_source ?? 'manual_anchor',
      created_at: currentState?.created_at ?? nowIso,
      updated_at: nowIso,
    });
    if (!nextState) return badRequest('Invalid workday presence payload');

    const updateResult = await supabase.auth.admin.updateUserById(auth.userId, {
      user_metadata: {
        ...metadata,
        workday_presence_state: nextState,
      },
    });
    if (updateResult.error) throw updateResult.error;

    return NextResponse.json({ state: nextState, card: buildRightNowCard(nextState) });
  } catch (error: unknown) {
    return apiErrorForRoute(error, 'workday-presence PUT');
  }
}
