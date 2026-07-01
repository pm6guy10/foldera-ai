import { NextResponse } from 'next/server';
import { resolveAnyUser } from '@/lib/auth/resolve-user';
import { createServerClient } from '@/lib/db/client';
import { resolveCommandState } from '@/lib/workday-presence/command-state-resolver';
import { buildRightNowCardForLiveLoop } from '@/lib/workday-presence/live-loop-presentation';
import {
  normalizeWorkdayPresenceState,
  normalizeWorkdayPresenceSuppressionTrace,
  rightNowHasPreparedObject,
  buildStateFromPrompt,
  type WorkdayPresenceState,
} from '@/lib/workday-presence/model';
import {
  checkFreshSignalTriggerOverride,
  normalizeWorkdayPresenceTriggerRunnerCursor,
} from '@/lib/workday-presence/trigger-runner';
import { loadAllClearEvidence } from '@/lib/workday-presence/all-clear';
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

function readStoredSuppressionTrace(metadata: Record<string, unknown> | null | undefined) {
  return normalizeWorkdayPresenceSuppressionTrace(metadata?.workday_presence_suppression_trace);
}

export async function GET(request: Request) {
  const auth = await resolveAnyUser(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const supabase = createServerClient();
    const { data, error } = await supabase.auth.admin.getUserById(auth.userId);
    if (error) throw error;
    const metadata = (data.user?.user_metadata ?? {}) as Record<string, unknown>;
    let state = readStoredState(metadata);
    const suppressionTrace = readStoredSuppressionTrace(metadata);

    // M1 backend-lock: always-present state. Generate a default state if none exists
    // and no suppression trace is present (suppression traces override default state).
    if (!state && !suppressionTrace) {
      state = buildStateFromPrompt({
        prompt: 'What are you working on now?',
      });
    }

    // Fresh-load trust gap fix: if state exists, check whether signals newer than
    // the last trigger cursor would fire a trigger override. Pure eval — no Slack,
    // no DB write. Result only affects the card returned in THIS response.
    if (state) {
      const cursor = normalizeWorkdayPresenceTriggerRunnerCursor(
        metadata.workday_presence_trigger_runner,
      );
      const signalWindowStart =
        cursor.last_signal_cursor ?? new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
      const { data: freshSignals, error: freshSignalsError } = await supabase
        .from('tkg_signals')
        .select('*')
        .eq('user_id', auth.userId)
        .gte('ingested_at', signalWindowStart)
        .order('ingested_at', { ascending: false })
        .limit(50);
      if (freshSignalsError) throw freshSignalsError;
      if (freshSignals?.length) {
        const overridden = checkFreshSignalTriggerOverride({ signals: freshSignals, state });
        if (overridden) state = overridden;
      }
    }

    const resolution = resolveCommandState({ state });
    const surfaceState =
      state && rightNowHasPreparedObject(state)
        ? 'active_move'
        : suppressionTrace?.trace_type === 'safe_silence'
          ? 'clear'
          : suppressionTrace
            ? 'suppressed_winner'
            : 'setup_needed';
    // Quiet-day closure: back the "clear" surface with real run evidence (checked N
    // at <time>) so silence reads as a finished survey, not absence. Null keeps the
    // surface exactly as quiet as before — additive key, never fabricated.
    const allClear = surfaceState === 'clear' ? await loadAllClearEvidence(supabase, auth.userId) : null;
    return NextResponse.json({
      surface_state: surfaceState,
      state,
      suppression_trace: suppressionTrace,
      resolution,
      card: buildRightNowCardForLiveLoop(state, resolution),
      all_clear: allClear,
    });
  } catch (error: unknown) {
    return apiErrorForRoute(error, 'workday-presence GET');
  }
}

export async function PUT(request: Request) {
  const auth = await resolveAnyUser(request);
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
      snoozed_until: currentState?.snoozed_until ?? null,
      interaction_history: currentState?.interaction_history ?? [],
      created_at: currentState?.created_at ?? nowIso,
      updated_at: nowIso,
    });
    if (!nextState) return badRequest('Invalid workday presence payload');

    const updateResult = await supabase.auth.admin.updateUserById(auth.userId, {
      user_metadata: {
        ...metadata,
        // This is MVP Auth metadata storage. Before production Slack/cron use, migrate to a first-class workday_presence_state table with RLS/history.
        workday_presence_state: nextState,
        workday_presence_suppression_trace: null,
      },
    });
    if (updateResult.error) throw updateResult.error;

    const resolution = resolveCommandState({ state: nextState });
    return NextResponse.json({
      surface_state: 'active_move',
      state: nextState,
      suppression_trace: null,
      resolution,
      card: buildRightNowCardForLiveLoop(nextState, resolution),
    });
  } catch (error: unknown) {
    return apiErrorForRoute(error, 'workday-presence PUT');
  }
}
