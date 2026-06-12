import { createServerClient } from '@/lib/db/client';
import {
  normalizeWorkdayPresenceState,
  type WorkdayPresenceDraft,
  type WorkdayPresenceState,
} from './model';

/**
 * Command State Resolver v0 (issue #276, contract locked by issue #274).
 *
 * Collapses connected truth — the user's saved workday presence state — into
 * exactly one verdict. The allowed surface is finite and closed:
 *
 *   - MERGE_READY: a reviewable prepared object exists and nothing the user
 *     recorded contradicts acting on it. The one move is to review/ship it.
 *   - FIX_FIRST: the user recorded a concrete blocker. Fixing it comes before
 *     everything else, including a prepared draft.
 *   - WAIT: the next move is not the user's right now — the state is snoozed
 *     or an external party owns it. Justified quiet is a real win.
 *   - CLEAR: no justified command exists. Absent, malformed, or weak truth
 *     collapses here — never into an action-ready verdict.
 *
 * Precedence (deterministic, conservative):
 *   1. no usable state            -> CLEAR  (no_saved_state)
 *   2. snoozed_until in future    -> WAIT   (snoozed_state)
 *   3. named blocker              -> FIX_FIRST (named_blocker)
 *   4. reviewable prepared draft  -> MERGE_READY (prepared_draft)
 *   5. named external wait        -> WAIT   (external_wait)
 *   6. otherwise                  -> CLEAR  (no_justified_command)
 *
 * Why a blocker beats a draft: the blocker is user-recorded truth. The most
 * action-ready verdict must never override what the user said is blocking
 * them. Why an unreviewable draft does not count: a title with no content is
 * a label, not a prepared object — fake readiness is worse than honest CLEAR.
 * A scored winner with nothing prepared behind it carries no draft, blocker,
 * or wait, so it collapses to CLEAR — the same no-homework standard enforced
 * by rightNowHasPreparedObject in ./model.
 */

export const COMMAND_STATE_VERDICTS = Object.freeze([
  'MERGE_READY',
  'FIX_FIRST',
  'WAIT',
  'CLEAR',
] as const);

export type CommandStateVerdict = (typeof COMMAND_STATE_VERDICTS)[number];

export function isCommandStateVerdict(value: unknown): value is CommandStateVerdict {
  return (
    typeof value === 'string' &&
    (COMMAND_STATE_VERDICTS as readonly string[]).includes(value)
  );
}

export type CommandStateResolutionRule =
  | 'no_saved_state'
  | 'snoozed_state'
  | 'named_blocker'
  | 'prepared_draft'
  | 'external_wait'
  | 'no_justified_command';

export type CommandStateResolution = {
  kind: 'command_state_resolution';
  verdict: CommandStateVerdict;
  /** Which precedence rule produced the verdict. Stable, machine-checkable. */
  rule: CommandStateResolutionRule;
  /** Honest, rule-prefixed explanation of the evidence basis. */
  reason: string;
  /** Redacted working-state strings that back the verdict. Never raw source content. */
  evidence: string[];
  /** Number of source-trail entries behind the state, for proof display. */
  source_trail_count: number;
  state_source: string | null;
  resolved_at: string;
};

export type CommandStateResolverInput = {
  /** Raw saved state (e.g. user_metadata.workday_presence_state). Unknown on purpose. */
  state: unknown;
  nowIso?: string;
};

function resolution(input: {
  verdict: CommandStateVerdict;
  rule: CommandStateResolutionRule;
  reason: string;
  evidence: string[];
  state: WorkdayPresenceState | null;
  nowIso: string;
}): CommandStateResolution {
  return {
    kind: 'command_state_resolution',
    verdict: input.verdict,
    rule: input.rule,
    reason: input.reason,
    evidence: input.evidence.filter((entry) => entry.trim().length > 0).slice(0, 4),
    source_trail_count: input.state?.source_trail.length ?? 0,
    state_source: input.state?.state_source ?? null,
    resolved_at: input.nowIso,
  };
}

/**
 * A prepared object must carry reviewable content. A draft that is only a
 * label (no body, no preview) must not produce the most action-ready verdict.
 */
function draftIsReviewable(draft: WorkdayPresenceDraft): boolean {
  const body = draft.body?.trim() ?? '';
  const preview = draft.preview?.trim() ?? '';
  return body.length > 0 || preview.length > 0;
}

function isSnoozed(state: WorkdayPresenceState, nowIso: string): boolean {
  if (!state.snoozed_until) return false;
  const snoozedUntil = Date.parse(state.snoozed_until);
  if (Number.isNaN(snoozedUntil)) return false;
  return snoozedUntil > Date.parse(nowIso);
}

export function resolveCommandState(input: CommandStateResolverInput): CommandStateResolution {
  const nowIso = input.nowIso ?? new Date().toISOString();
  const state = normalizeWorkdayPresenceState(input.state);

  if (!state) {
    return resolution({
      verdict: 'CLEAR',
      rule: 'no_saved_state',
      reason: 'clear: no usable saved workday presence state — absent truth never becomes fake confidence',
      evidence: [],
      state,
      nowIso,
    });
  }

  if (isSnoozed(state, nowIso)) {
    return resolution({
      verdict: 'WAIT',
      rule: 'snoozed_state',
      reason: `wait: state is snoozed until ${state.snoozed_until} — user-recorded deferral beats every other verdict`,
      evidence: [state.current_focus, `Snoozed until ${state.snoozed_until}`],
      state,
      nowIso,
    });
  }

  if (state.blocker) {
    return resolution({
      verdict: 'FIX_FIRST',
      rule: 'named_blocker',
      reason: `fix_first: recorded blocker "${state.blocker}" gates progress on "${state.current_focus}"`,
      evidence: [state.blocker, state.current_focus],
      state,
      nowIso,
    });
  }

  if (state.draft && draftIsReviewable(state.draft)) {
    return resolution({
      verdict: 'MERGE_READY',
      rule: 'prepared_draft',
      reason: `merge_ready: prepared ${state.draft.action_type} "${state.draft.title}" is reviewable and nothing recorded blocks it`,
      evidence: [
        `Draft ready (${state.draft.action_type}): ${state.draft.title}`,
        state.current_focus,
      ],
      state,
      nowIso,
    });
  }

  if (state.waiting_on) {
    return resolution({
      verdict: 'WAIT',
      rule: 'external_wait',
      reason: `wait: next move on "${state.current_focus}" is owned externally — ${state.waiting_on}`,
      evidence: [state.waiting_on, state.current_focus],
      state,
      nowIso,
    });
  }

  const unreviewableDraftNote = state.draft
    ? ` — stored draft "${state.draft.title}" has no reviewable content and does not count as prepared`
    : '';
  return resolution({
    verdict: 'CLEAR',
    rule: 'no_justified_command',
    reason: `clear: no prepared object, no recorded blocker, no external wait behind "${state.current_focus}"${unreviewableDraftNote}`,
    evidence: [state.current_focus],
    state,
    nowIso,
  });
}

/**
 * Connected-truth wrapper: resolves the verdict from the user's saved
 * workday presence state in Supabase auth metadata — the same row the
 * trigger-runner and Slack loop read. Mirrors the pure-core/impure-wrapper
 * shape of maybeRunWorkdayPresenceTriggerRunnerForUser.
 */
export async function resolveCommandStateForUser(
  userId: string,
): Promise<CommandStateResolution & { user_id: string }> {
  const supabase = createServerClient();
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error) throw error;

  const metadata = (data.user?.user_metadata ?? {}) as Record<string, unknown>;
  const resolved = resolveCommandState({ state: metadata.workday_presence_state });

  return {
    ...resolved,
    user_id: userId,
  };
}
