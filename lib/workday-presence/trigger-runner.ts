import {
  selectSingleInterventionFromConnectorEvidence,
  type SimulatedConnectorEvidenceEvent,
} from '@/lib/connectors/test-mode/evidence-adapters';
import {
  buildSlackRightNowMessage,
  createLiveSlackAdapter,
  requireSlackChannel,
  type SlackAdapter,
  type SlackSendResult,
} from '@/lib/slack/right-now';
import { createServerClient } from '@/lib/db/client';
import { normalizeWorkdayPresenceState, type WorkdayPresenceState } from './model';
import {
  evaluateWorkdayPresenceTrigger,
  type WorkdayPresenceTriggerContext,
  type WorkdayPresenceTriggerResult,
} from './triggers';

type FreshSignalRow = Record<string, unknown>;

export type WorkdayPresenceTriggerRunnerCursor = {
  last_signal_cursor: string | null;
  last_trigger_key: string | null;
  last_pinged_at: string | null;
  last_run_at: string | null;
};

export type WorkdayPresenceTriggerRunnerResult = {
  outcome: 'intervention' | 'quiet' | 'dedup_suppressed';
  reason: string;
  cursor: WorkdayPresenceTriggerRunnerCursor;
  selected_context: WorkdayPresenceTriggerContext | null;
  trigger_result: WorkdayPresenceTriggerResult | null;
  slack_result: SlackSendResult | null;
  fresh_event_count: number;
};

export type MaybeTriggerRunnerResult =
  | { started: false; reason: string }
  | ({ started: true; user_id: string } & WorkdayPresenceTriggerRunnerResult);

function clean(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  return null;
}

function readObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function latestSignalCursor(signals: FreshSignalRow[]): string | null {
  return signals
    .map((signal) => clean(signal.ingested_at) ?? clean(signal.occurred_at) ?? clean(signal.created_at))
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => b.localeCompare(a))[0] ?? null;
}

function normalizeSummary(signal: FreshSignalRow): string | null {
  return (
    clean(signal.redacted_summary) ??
    clean(signal.safe_summary) ??
    clean(signal.summary) ??
    clean(signal.subject) ??
    clean(signal.title) ??
    clean(signal.thread_subject)
  );
}

function signalMetadata(signal: FreshSignalRow): Record<string, unknown> {
  return readObject(signal.metadata) ?? {};
}

function signalThreadId(signal: FreshSignalRow): string | null {
  const metadata = signalMetadata(signal);
  return (
    clean(signal.thread_id) ??
    clean(signal.source_thread_id) ??
    clean(metadata.thread_id) ??
    clean(metadata.gmail_thread_id)
  );
}

function signalStartsAtIso(signal: FreshSignalRow): string | null {
  const metadata = signalMetadata(signal);
  return clean(signal.starts_at_iso) ?? clean(metadata.starts_at_iso) ?? clean(metadata.start_time);
}

function signalRequiresPrep(signal: FreshSignalRow): boolean {
  const metadata = signalMetadata(signal);
  return readBoolean(signal.requires_prep) === true || readBoolean(metadata.requires_prep) === true;
}

function signalPrepMove(signal: FreshSignalRow): string | null {
  const metadata = signalMetadata(signal);
  return clean(signal.prep_move) ?? clean(metadata.prep_move);
}

function signalReplyNeeded(signal: FreshSignalRow): boolean {
  const metadata = signalMetadata(signal);
  return readBoolean(signal.reply_needed) === true || readBoolean(metadata.reply_needed) === true;
}

function signalChanged(signal: FreshSignalRow): boolean {
  const metadata = signalMetadata(signal);
  return readBoolean(signal.changed) === true || readBoolean(metadata.changed) === true;
}

function adaptSignalToFreshEvent(signal: FreshSignalRow): SimulatedConnectorEvidenceEvent | null {
  const source = clean(signal.source)?.toLowerCase() ?? '';
  const summary = normalizeSummary(signal);
  const threadId = signalThreadId(signal);
  const occurredAt =
    clean(signal.ingested_at) ?? clean(signal.occurred_at) ?? clean(signal.created_at) ?? new Date().toISOString();

  if (source === 'calendar') {
    const title = clean(signal.title) ?? clean(signal.subject) ?? summary;
    const startsAtIso = signalStartsAtIso(signal);
    if (!title || !startsAtIso) return null;
    return {
      kind: 'calendar',
      event_id: clean(signal.id) ?? `${title}:${startsAtIso}`,
      title,
      starts_at_iso: startsAtIso,
      requires_prep: signalRequiresPrep(signal),
      ...(signalPrepMove(signal) ? { prep_move: signalPrepMove(signal) ?? undefined } : {}),
    };
  }

  if (source === 'gmail' || source === 'email') {
    if (!threadId || !summary) return null;
    return {
      kind: 'gmail',
      message_id: clean(signal.id) ?? `${threadId}:${occurredAt}`,
      thread_id: threadId,
      from: clean(signal.author) ?? clean(signal.sender) ?? 'unknown',
      subject: clean(signal.subject) ?? summary,
      snippet: summary,
      received_at_iso: occurredAt,
      reply_needed: signalReplyNeeded(signal),
    };
  }

  if (source === 'slack') {
    if (!threadId || !summary) return null;
    return {
      kind: 'slack',
      event_id: clean(signal.id) ?? `${threadId}:${occurredAt}`,
      thread_id: threadId,
      summary,
      reply_needed: signalReplyNeeded(signal),
      changed: signalChanged(signal),
    };
  }

  return null;
}

function buildTriggerKey(
  context: WorkdayPresenceTriggerContext,
  state: WorkdayPresenceState | null,
): string {
  if (context.trigger_type === 'mention_reply_needed') {
    return [
      'mention_reply_needed',
      context.signal.thread_id,
      context.signal.summary,
      state?.updated_at ?? 'no-state',
    ].join('|');
  }

  if (context.trigger_type === 'waiting_on_changed') {
    return [
      'waiting_on_changed',
      context.changed.thread_id,
      context.changed.summary,
      state?.updated_at ?? 'no-state',
    ].join('|');
  }

  if (context.trigger_type === 'pre_meeting') {
    return [
      'pre_meeting',
      context.event.starts_at_iso,
      context.event.title,
      state?.updated_at ?? 'no-state',
    ].join('|');
  }

  return [context.trigger_type, state?.updated_at ?? 'no-state'].join('|');
}

function nextCursor(
  cursor: WorkdayPresenceTriggerRunnerCursor,
  nowIso: string,
  updates: Partial<WorkdayPresenceTriggerRunnerCursor> = {},
): WorkdayPresenceTriggerRunnerCursor {
  return {
    ...cursor,
    last_run_at: nowIso,
    ...updates,
  };
}

export function normalizeWorkdayPresenceTriggerRunnerCursor(
  input: unknown,
): WorkdayPresenceTriggerRunnerCursor {
  const row = readObject(input) ?? {};
  return {
    last_signal_cursor: clean(row.last_signal_cursor),
    last_trigger_key: clean(row.last_trigger_key),
    last_pinged_at: clean(row.last_pinged_at),
    last_run_at: clean(row.last_run_at),
  };
}

function requireTriggerRunnerEnv() {
  const ownerUserId = process.env.FOLDERA_SELF_USER_ID?.trim();
  const signingSecret = process.env.SLACK_SIGNING_SECRET?.trim();
  const slackBotToken = process.env.SLACK_BOT_TOKEN?.trim();
  const channel = requireSlackChannel();

  if (!ownerUserId) throw new Error('Missing FOLDERA_SELF_USER_ID for workday presence trigger-runner');
  if (!signingSecret) throw new Error('Missing SLACK_SIGNING_SECRET for workday presence trigger-runner');
  if (!slackBotToken) throw new Error('Missing SLACK_BOT_TOKEN for workday presence trigger-runner');

  return {
    ownerUserId,
    signingSecret,
    slackBotToken,
    channel,
  };
}

export async function maybeRunWorkdayPresenceTriggerRunnerForUser(
  userId: string,
): Promise<MaybeTriggerRunnerResult> {
  const { ownerUserId, channel, slackBotToken } = requireTriggerRunnerEnv();
  if (userId !== ownerUserId) {
    return { started: false, reason: 'non_owner_user' };
  }

  const supabase = createServerClient();
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error) throw error;

  const metadata = (data.user?.user_metadata ?? {}) as Record<string, unknown>;
  const cursor = normalizeWorkdayPresenceTriggerRunnerCursor(
    metadata.workday_presence_trigger_runner,
  );
  const signalWindowStart =
    cursor.last_signal_cursor ??
    new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();

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

  return {
    started: true,
    user_id: userId,
    ...result,
  };
}

export async function runWorkdayPresenceTriggerRunner(input: {
  channel: string;
  cursor: unknown;
  nowIso?: string;
  signals: FreshSignalRow[];
  slack: Pick<SlackAdapter, 'postMessage'>;
  state: unknown;
}): Promise<WorkdayPresenceTriggerRunnerResult> {
  const state = normalizeWorkdayPresenceState(input.state);
  const cursor = normalizeWorkdayPresenceTriggerRunnerCursor(input.cursor);
  const nowIso = input.nowIso ?? new Date().toISOString();
  const signalCursor = latestSignalCursor(input.signals);
  const freshEvents = input.signals
    .map(adaptSignalToFreshEvent)
    .filter((event): event is SimulatedConnectorEvidenceEvent => Boolean(event));

  if (!state) {
    return {
      outcome: 'quiet',
      reason: 'quiet: no saved workday presence state to interrupt from',
      cursor: nextCursor(cursor, nowIso, {
        last_signal_cursor: signalCursor ?? cursor.last_signal_cursor,
        last_trigger_key: null,
      }),
      selected_context: null,
      trigger_result: null,
      slack_result: null,
      fresh_event_count: freshEvents.length,
    };
  }

  if (state.snoozed_until && Date.parse(state.snoozed_until) > Date.parse(nowIso)) {
    return {
      outcome: 'quiet',
      reason: 'quiet: state is snoozed, so runner stays silent',
      cursor: nextCursor(cursor, nowIso, {
        last_signal_cursor: signalCursor ?? cursor.last_signal_cursor,
        last_trigger_key: null,
      }),
      selected_context: null,
      trigger_result: null,
      slack_result: null,
      fresh_event_count: freshEvents.length,
    };
  }

  const selection = selectSingleInterventionFromConnectorEvidence(freshEvents);
  if (!selection.selected) {
    return {
      outcome: 'quiet',
      reason: selection.reason,
      cursor: nextCursor(cursor, nowIso, {
        last_signal_cursor: signalCursor ?? cursor.last_signal_cursor,
        last_trigger_key: null,
      }),
      selected_context: null,
      trigger_result: null,
      slack_result: null,
      fresh_event_count: freshEvents.length,
    };
  }

  const triggerResult = evaluateWorkdayPresenceTrigger(selection.selected, state);
  if (triggerResult.outcome !== 'intervention') {
    return {
      outcome: 'quiet',
      reason: triggerResult.reason,
      cursor: nextCursor(cursor, nowIso, {
        last_signal_cursor: signalCursor ?? cursor.last_signal_cursor,
        last_trigger_key: null,
      }),
      selected_context: selection.selected,
      trigger_result: triggerResult,
      slack_result: null,
      fresh_event_count: freshEvents.length,
    };
  }

  const triggerKey = buildTriggerKey(selection.selected, state);
  if (
    cursor.last_trigger_key === triggerKey &&
    cursor.last_signal_cursor === (signalCursor ?? cursor.last_signal_cursor)
  ) {
    return {
      outcome: 'dedup_suppressed',
      reason: 'dedup: unchanged trigger already pinged for this signal cursor',
      cursor: nextCursor(cursor, nowIso),
      selected_context: selection.selected,
      trigger_result: triggerResult,
      slack_result: null,
      fresh_event_count: freshEvents.length,
    };
  }

  const slackResult = await input.slack.postMessage(
    buildSlackRightNowMessage(triggerResult.payload, input.channel),
  );

  return {
    outcome: 'intervention',
    reason: triggerResult.reason,
    cursor: nextCursor(cursor, nowIso, {
      last_signal_cursor: signalCursor ?? cursor.last_signal_cursor,
      last_trigger_key: triggerKey,
      last_pinged_at: nowIso,
    }),
    selected_context: selection.selected,
    trigger_result: triggerResult,
    slack_result: slackResult,
    fresh_event_count: freshEvents.length,
  };
}
