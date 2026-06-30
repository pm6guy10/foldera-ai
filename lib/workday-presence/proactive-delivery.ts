// Proactive delivery for a heartbeat-seeded, draft-backed winner (#567 Phase B).
//
// seedFromScorerForUser evaluates the full pool on every heartbeat tick and can produce a
// real, draft-backed scored_winner — but that winner had NO path to Slack on its own.
// trigger-runner (lib/workday-presence/trigger-runner.ts) only posts when a FRESH inbound
// signal trips a reactive trigger type (mention_reply_needed, pre_meeting, ...). A
// proactive winner with no fresh inbound signal just sat in workday_presence_state
// forever — the exact gap a live owner run on 2026-06-30 exposed: a draft-backed
// `write_document` winner seeded, but the last real Slack card was from the day before.
//
// This module closes that gap WITHOUT inventing a new card shape: it reuses the SAME
// buildRightNowMessagePayload -> buildSlackRightNowMessage -> postMessage pipeline the
// manual "Post to Slack" button (app/api/slack/right-now/route.ts) already uses, so the
// proactive and manual paths can never drift apart — see deliver-now.ts's header for why
// "two hand-duplicated paths" is the documented failure mode in this codebase.
//
// The #394 finished-work gate is enforced for free: buildRightNowMessagePayload returns
// mode 'silent' for any scored_winner with no reviewable draft, so a winner-only state
// (no draft) NEVER reaches Slack from this path either. SAFE_SILENCE stays the honest
// default; this only ever ADDS delivery for an already-finished, already-gated object.
import { createServerClient } from '@/lib/db/client';
import {
  buildSlackRightNowMessage,
  createLiveSlackAdapter,
  type SlackAdapter,
  type SlackSendResult,
} from '@/lib/slack/right-now';
import { buildRightNowMessagePayload } from './message';
import { normalizeWorkdayPresenceState, type WorkdayPresenceState } from './model';
import { insertSlackSendReceipt } from './slack-send-receipt';

export type ProactiveDeliveryCursor = {
  last_winner_key: string | null;
  last_pinged_at: string | null;
};

export type ProactiveDeliveryOutcome =
  | { delivered: false; reason: string; cursor: ProactiveDeliveryCursor }
  | {
      delivered: true;
      reason: 'new_winner_delivered';
      winner_key: string;
      slack_result: SlackSendResult;
      cursor: ProactiveDeliveryCursor;
    };

function clean(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeProactiveDeliveryCursor(input: unknown): ProactiveDeliveryCursor {
  const row = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  return {
    last_winner_key: clean(row.last_winner_key),
    last_pinged_at: clean(row.last_pinged_at),
  };
}

/**
 * Stable identity for "this exact recommendation" — content, not timestamp or row id.
 * seedFromScorerForUser persists a NEW tkg_actions row id and a NEW state.updated_at on
 * every successful heartbeat seed, even when the winner is the same recommendation as
 * last time, so neither can be used as the dedup key without re-pinging an unchanged
 * winner on every single heartbeat tick (morning-pipeline + ingest-and-deliver + any
 * manual sync-now, potentially several times a day).
 */
export function proactiveWinnerKey(state: WorkdayPresenceState): string {
  return [
    state.next_move,
    state.draft?.action_type ?? '',
    state.draft?.title ?? '',
    state.draft?.to ?? '',
  ].join('|');
}

// trigger-runner and proactive-delivery run back to back within the same heartbeat tick
// (in-process for deliver-now.ts; sequential stages within one function invocation for
// morning-pipeline). A window this wide can only ever catch "trigger-runner posted a
// reactive card moments ago in THIS tick" — heartbeat ticks are scheduled hours apart, so
// it can never wrongly straddle two different ticks and suppress a legitimately new ping.
const RECENT_REACTIVE_PING_WINDOW_MS = 5 * 60 * 1000;

// A proactive winner must come from THIS tick's seed call, never stale leftover state.
// seedFromScorerForUser only overwrites workday_presence_state on a SUCCESSFUL seed — it
// is skipped entirely on safe_silence, generation_failed, the daily manual-call-limit, an
// ungrounded send, or the bottom gate. So whenever a seed call is blocked for any of those
// reasons, workday_presence_state silently keeps whatever was last written, possibly hours
// or days old — and, the first time this module ran in production, possibly written
// BEFORE the #567 Phase A goal-primacy fix even existed. Without this check,
// proactive-delivery treats that stale leftover as "the heartbeat's fresh winner" and
// delivers it: exactly what happened on 2026-06-30 (a 3.5h-old pre-fix homework card got
// posted live because this was the module's first run and had no dedup history yet).
// state.updated_at is stamped to nowIso by seedFromScorerForUser on every successful seed
// — it is the authoritative freshness signal already on hand; no new plumbing needed.
const STATE_FRESHNESS_WINDOW_MS = 10 * 60 * 1000;

/**
 * Pure decision core (#567 Phase B). Given the current state, the proactive-delivery
 * cursor, and the trigger-runner's last reactive ping time, decide whether to proactively
 * post the state to Slack — and do so via the injected adapter if so.
 *
 * The reactive trigger-runner always wins: if it just posted a card in this same tick,
 * this proactive fallback stays quiet rather than double-posting two cards for one tick.
 *
 * The state must also be FRESH — written by THIS tick's seed call (state.updated_at
 * within STATE_FRESHNESS_WINDOW_MS of nowIso) — never stale leftover state from a seed
 * call hours/days ago that this tick's own seed attempt failed to refresh.
 */
export async function evaluateProactiveDelivery(input: {
  rawState: unknown;
  cursor: unknown;
  nowIso: string;
  channel: string | null;
  slack: Pick<SlackAdapter, 'postMessage'> | null;
  triggerRunnerLastPingedAt: string | null;
}): Promise<ProactiveDeliveryOutcome> {
  const cursor = normalizeProactiveDeliveryCursor(input.cursor);

  if (!input.channel || !input.slack) {
    return { delivered: false, reason: 'slack_not_configured', cursor };
  }

  if (input.triggerRunnerLastPingedAt) {
    const ageMs = Date.parse(input.nowIso) - Date.parse(input.triggerRunnerLastPingedAt);
    if (Number.isFinite(ageMs) && ageMs >= 0 && ageMs < RECENT_REACTIVE_PING_WINDOW_MS) {
      return { delivered: false, reason: 'reactive_trigger_already_posted_this_tick', cursor };
    }
  }

  const state = normalizeWorkdayPresenceState(input.rawState);
  if (!state) return { delivered: false, reason: 'no_state', cursor };

  const stateAgeMs = Date.parse(input.nowIso) - Date.parse(state.updated_at);
  if (!Number.isFinite(stateAgeMs) || stateAgeMs < 0 || stateAgeMs >= STATE_FRESHNESS_WINDOW_MS) {
    // Stale leftover state — not produced by this tick's seed call. Never treat old state
    // as a fresh proactive winner, no matter how "active" its payload looks.
    return { delivered: false, reason: 'state_not_freshly_seeded', cursor };
  }

  const payload = buildRightNowMessagePayload(state, input.nowIso);
  if (payload.mode !== 'active') {
    // 'silent' = no reviewable draft (#394 homework guard) — SAFE_SILENCE, not a bug.
    // 'setup' = no usable state. 'dismissed' = owner just dismissed; honor the snooze.
    return { delivered: false, reason: `payload_mode_${payload.mode}`, cursor };
  }

  const winnerKey = proactiveWinnerKey(state);
  if (cursor.last_winner_key === winnerKey) {
    return { delivered: false, reason: 'already_delivered_this_winner', cursor };
  }

  const message = buildSlackRightNowMessage(payload, input.channel);
  const slackResult = await input.slack.postMessage(message);

  return {
    delivered: true,
    reason: 'new_winner_delivered',
    winner_key: winnerKey,
    slack_result: slackResult,
    cursor: { last_winner_key: winnerKey, last_pinged_at: input.nowIso },
  };
}

export type MaybeProactiveDeliveryResult =
  | { started: false; reason: string }
  | ({ started: true; user_id: string } & ProactiveDeliveryOutcome);

/**
 * Impure wrapper: resolve owner/Slack/env + the current state + the trigger-runner's
 * cursor from Supabase, run the pure decision core, and persist the result (cursor +
 * receipt) when it delivers. Mirrors maybeRunWorkdayPresenceTriggerRunnerForUser's
 * pure-core/impure-wrapper split in trigger-runner.ts.
 *
 * Owner-only and production-only, same boundary trigger-runner enforces — multi-user
 * proactive delivery is out of scope here (Guardian looks inward at the owner's own
 * world; see AGENTS.md "The Guardian looks inward, not outward").
 */
export async function maybeDeliverProactiveWinner(userId: string): Promise<MaybeProactiveDeliveryResult> {
  const ownerUserId = process.env.FOLDERA_SELF_USER_ID?.trim();
  const isOwner = Boolean(ownerUserId && userId === ownerUserId);
  if (!isOwner) {
    return { started: false, reason: 'not_owner' };
  }

  let slackAdapter: Pick<SlackAdapter, 'postMessage'> | null = null;
  const channel = process.env.FOLDERA_SLACK_SELF_CHANNEL_ID?.trim() ?? null;
  const slackBotToken = process.env.SLACK_BOT_TOKEN?.trim();
  const isProduction = process.env.VERCEL_ENV === 'production' || !process.env.VERCEL_ENV;
  if (slackBotToken && channel && isProduction) {
    slackAdapter = createLiveSlackAdapter(slackBotToken);
  }

  const supabase = createServerClient();
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error) throw error;
  const metadata = (data.user?.user_metadata ?? {}) as Record<string, unknown>;

  const nowIso = new Date().toISOString();
  const triggerCursor = metadata.workday_presence_trigger_runner as
    | { last_pinged_at?: unknown }
    | undefined;
  const triggerRunnerLastPingedAt =
    typeof triggerCursor?.last_pinged_at === 'string' ? triggerCursor.last_pinged_at : null;

  const outcome = await evaluateProactiveDelivery({
    rawState: metadata.workday_presence_state,
    cursor: metadata.workday_presence_proactive_delivery,
    nowIso,
    channel,
    slack: slackAdapter,
    triggerRunnerLastPingedAt,
  });

  if (outcome.delivered) {
    try {
      await insertSlackSendReceipt({
        supabase,
        userId,
        slackResult: outcome.slack_result,
        triggerType: 'proactive_winner',
        label: outcome.winner_key.slice(0, 200),
      });
    } catch {
      // Receipt persistence is best-effort — never fail delivery because of it.
    }

    const updateResult = await supabase.auth.admin.updateUserById(userId, {
      user_metadata: {
        ...metadata,
        workday_presence_proactive_delivery: outcome.cursor,
      },
    });
    if (updateResult.error) throw updateResult.error;
  }

  return { started: true, user_id: userId, ...outcome };
}
