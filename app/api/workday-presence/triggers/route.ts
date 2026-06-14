import { NextResponse } from 'next/server';
import { resolveUser } from '@/lib/auth/resolve-user';
import { createServerClient } from '@/lib/db/client';
import { normalizeWorkdayPresenceState } from '@/lib/workday-presence/model';
import { insertTriggerReceipt } from '@/lib/workday-presence/trigger-receipt';
import {
  buildTriggeredWorkdayPresenceState,
  evaluateWorkdayPresenceTrigger,
  type WorkdayPresenceTriggerContext,
  type WorkdayPresenceTriggerType,
} from '@/lib/workday-presence/triggers';
import { apiErrorForRoute, badRequest } from '@/lib/utils/api-error';

export const dynamic = 'force-dynamic';

type TriggerRequestBody = {
  trigger_type?: WorkdayPresenceTriggerType;
  event?: {
    title?: string;
    starts_at_iso?: string;
    requires_prep?: boolean;
    prep_move?: string;
  };
  changed?: {
    thread_id?: string;
    summary?: string;
  };
  signal?: {
    source?: 'slack' | 'email';
    thread_id?: string;
    summary?: string;
    reply_needed?: boolean;
  };
  cleared?: {
    blocker?: string;
    summary?: string;
  };
  commitment?: {
    title?: string;
    due_at_iso?: string;
    summary?: string;
  };
  thread?: {
    thread_id?: string;
    summary?: string;
  };
  shift?: {
    title?: string;
    starts_at_iso?: string;
    summary?: string;
  };
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function buildContext(body: TriggerRequestBody): WorkdayPresenceTriggerContext | null {
  const triggerType = body.trigger_type;
  if (!triggerType) return null;

  if (triggerType === 'morning_anchor') return { trigger_type: 'morning_anchor' };
  if (triggerType === 'end_of_day') return { trigger_type: 'end_of_day' };

  if (triggerType === 'pre_meeting') {
    const event = body.event ?? {};
    if (!isNonEmptyString(event.title)) return null;
    if (!isNonEmptyString(event.starts_at_iso)) return null;
    if (typeof event.requires_prep !== 'boolean') return null;
    return {
      trigger_type: 'pre_meeting',
      event: {
        title: event.title,
        starts_at_iso: event.starts_at_iso,
        requires_prep: event.requires_prep,
        prep_move: isNonEmptyString(event.prep_move) ? event.prep_move : undefined,
      },
    };
  }

  if (triggerType === 'waiting_on_changed') {
    const changed = body.changed ?? {};
    if (!isNonEmptyString(changed.thread_id)) return null;
    if (!isNonEmptyString(changed.summary)) return null;
    return {
      trigger_type: 'waiting_on_changed',
      changed: { thread_id: changed.thread_id, summary: changed.summary },
    };
  }

  if (triggerType === 'mention_reply_needed') {
    const signal = body.signal ?? {};
    if (signal.source !== 'slack' && signal.source !== 'email') return null;
    if (!isNonEmptyString(signal.thread_id)) return null;
    if (!isNonEmptyString(signal.summary)) return null;
    if (typeof signal.reply_needed !== 'boolean') return null;
    return {
      trigger_type: 'mention_reply_needed',
      signal: {
        source: signal.source,
        thread_id: signal.thread_id,
        summary: signal.summary,
        reply_needed: signal.reply_needed,
      },
    };
  }

  if (triggerType === 'blocker_cleared') {
    const cleared = body.cleared ?? {};
    if (!isNonEmptyString(cleared.blocker)) return null;
    if (!isNonEmptyString(cleared.summary)) return null;
    return {
      trigger_type: 'blocker_cleared',
      cleared: {
        blocker: cleared.blocker,
        summary: cleared.summary,
      },
    };
  }

  if (triggerType === 'commitment_lapsing') {
    const commitment = body.commitment ?? {};
    if (!isNonEmptyString(commitment.title)) return null;
    if (!isNonEmptyString(commitment.due_at_iso)) return null;
    if (!isNonEmptyString(commitment.summary)) return null;
    return {
      trigger_type: 'commitment_lapsing',
      commitment: {
        title: commitment.title,
        due_at_iso: commitment.due_at_iso,
        summary: commitment.summary,
      },
    };
  }

  if (triggerType === 'owed_thread_gone_cold') {
    const thread = body.thread ?? {};
    if (!isNonEmptyString(thread.thread_id)) return null;
    if (!isNonEmptyString(thread.summary)) return null;
    return {
      trigger_type: 'owed_thread_gone_cold',
      thread: {
        thread_id: thread.thread_id,
        summary: thread.summary,
      },
    };
  }

  if (triggerType === 'timing_shift') {
    const shift = body.shift ?? {};
    if (!isNonEmptyString(shift.title)) return null;
    if (!isNonEmptyString(shift.starts_at_iso)) return null;
    if (!isNonEmptyString(shift.summary)) return null;
    return {
      trigger_type: 'timing_shift',
      shift: {
        title: shift.title,
        starts_at_iso: shift.starts_at_iso,
        summary: shift.summary,
      },
    };
  }

  return null;
}

export async function POST(request: Request) {
  const auth = await resolveUser(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const payload = (await request.json().catch(() => ({}))) as TriggerRequestBody;
    const context = buildContext(payload);
    if (!context) {
      return badRequest('Invalid trigger request payload');
    }

    const supabase = createServerClient();
    const { data, error } = await supabase.auth.admin.getUserById(auth.userId);
    if (error) throw error;

    const metadata = (data.user?.user_metadata ?? {}) as Record<string, unknown>;
    const state = normalizeWorkdayPresenceState(metadata.workday_presence_state);
    const result = evaluateWorkdayPresenceTrigger(context, state);
    if (result.outcome !== 'intervention') {
      return NextResponse.json({ result });
    }

    const nextState = buildTriggeredWorkdayPresenceState(context, state);
    if (!nextState) {
      return NextResponse.json({ result });
    }

    const updateResult = await supabase.auth.admin.updateUserById(auth.userId, {
      user_metadata: {
        ...metadata,
        workday_presence_state: nextState,
      },
    });
    if (updateResult.error) throw updateResult.error;

    await insertTriggerReceipt({
      supabase,
      userId: auth.userId,
      triggerType: context.trigger_type,
      state: nextState,
    });

    return NextResponse.json({ result, state: nextState });
  } catch (error: unknown) {
    return apiErrorForRoute(error, 'workday-presence triggers POST');
  }
}

