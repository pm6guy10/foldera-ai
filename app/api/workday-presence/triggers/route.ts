import { NextResponse } from 'next/server';
import { resolveUser } from '@/lib/auth/resolve-user';
import { createServerClient } from '@/lib/db/client';
import { normalizeWorkdayPresenceState } from '@/lib/workday-presence/model';
import {
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

    return NextResponse.json({ result });
  } catch (error: unknown) {
    return apiErrorForRoute(error, 'workday-presence triggers POST');
  }
}

