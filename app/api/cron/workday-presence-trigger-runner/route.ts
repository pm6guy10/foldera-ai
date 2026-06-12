import { NextRequest, NextResponse } from 'next/server';
import { validateCronAuth } from '@/lib/auth/resolve-user';
import { createServerClient } from '@/lib/db/client';
import {
  createLiveSlackAdapter,
  requireSlackChannel,
} from '@/lib/slack/right-now';
import {
  normalizeWorkdayPresenceTriggerRunnerCursor,
  runWorkdayPresenceTriggerRunner,
} from '@/lib/workday-presence/trigger-runner';
import { apiErrorForRoute } from '@/lib/utils/api-error';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const INITIAL_SIGNAL_LOOKBACK_MS = 6 * 60 * 60 * 1000;

function requireRunnerConfig() {
  const userId = process.env.FOLDERA_SELF_USER_ID?.trim();
  const signingSecret = process.env.SLACK_SIGNING_SECRET?.trim();
  const slackBotToken = process.env.SLACK_BOT_TOKEN?.trim();
  const channel = requireSlackChannel();

  if (!signingSecret) {
    throw new Error('Missing SLACK_SIGNING_SECRET for workday presence trigger-runner');
  }
  if (!userId) {
    throw new Error('Missing FOLDERA_SELF_USER_ID for workday presence trigger-runner');
  }
  if (!slackBotToken) {
    throw new Error('Missing SLACK_BOT_TOKEN for live workday presence trigger-runner');
  }

  return { userId, channel, slackBotToken };
}

async function handler(request: NextRequest) {
  const authError = validateCronAuth(request);
  if (authError) return authError;

  try {
    const { userId, channel, slackBotToken } = requireRunnerConfig();
    const supabase = createServerClient();
    const { data, error } = await supabase.auth.admin.getUserById(userId);
    if (error) throw error;

    const metadata = (data.user?.user_metadata ?? {}) as Record<string, unknown>;
    const cursor = normalizeWorkdayPresenceTriggerRunnerCursor(
      metadata.workday_presence_trigger_runner,
    );
    const signalWindowStart =
      cursor.last_signal_cursor ??
      new Date(Date.now() - INITIAL_SIGNAL_LOOKBACK_MS).toISOString();

    const { data: signals, error: signalsError } = await supabase
      .from('tkg_signals')
      .select('*')
      .eq('user_id', userId)
      .gte('ingested_at', signalWindowStart)
      .order('ingested_at', { ascending: false })
      .limit(50);
    if (signalsError) throw signalsError;

    const result = await runWorkdayPresenceTriggerRunner({
      channel,
      cursor,
      signals: Array.isArray(signals) ? signals : [],
      slack: createLiveSlackAdapter(slackBotToken),
      state: metadata.workday_presence_state,
    });

    const updateResult = await supabase.auth.admin.updateUserById(userId, {
      user_metadata: {
        ...metadata,
        workday_presence_trigger_runner: result.cursor,
      },
    });
    if (updateResult.error) throw updateResult.error;

    return NextResponse.json({
      ok: result.outcome === 'intervention' || result.outcome === 'dedup_suppressed' || result.outcome === 'quiet',
      user_id: userId,
      outcome: result.outcome,
      reason: result.reason,
      fresh_event_count: result.fresh_event_count,
      selected_context: result.selected_context,
      trigger_result: result.trigger_result,
      slack_result: result.slack_result,
      cursor: result.cursor,
      signal_window_start: signalWindowStart,
    });
  } catch (error: unknown) {
    return apiErrorForRoute(error, 'cron/workday-presence-trigger-runner');
  }
}

export const GET = handler;
export const POST = handler;
