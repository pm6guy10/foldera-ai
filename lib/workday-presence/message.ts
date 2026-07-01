import {
  buildRightNowCard,
  draftIsReviewable,
  rightNowHasPreparedObject,
  WORKDAY_PRESENCE_INTERACTION_TYPES,
  type RightNowCard,
  type WorkdayPresenceInteractionType,
  type WorkdayPresenceState,
} from './model';
import { describeAttachments } from '@/lib/email/attachments';

/**
 * Inbound action vocabulary. Cards render only View Draft + Dismiss; the four
 * legacy ids remain accepted so taps on previously posted Slack messages
 * still resolve instead of failing.
 */
export type RightNowMessageActionId = WorkdayPresenceInteractionType;

export const RIGHT_NOW_ACTION_IDS = WORKDAY_PRESENCE_INTERACTION_TYPES;

/**
 * Slack-only button that opens the review-gated send modal. It is deliberately NOT a
 * WorkdayPresenceInteractionType: it never mutates presence state on its own. The Slack
 * interaction route intercepts it, opens the review modal, and only the explicit modal
 * sign-off (view_submission) executes the send. Kept off the dashboard's two-button
 * contract — Slack-first per the indispensability pass.
 */
export const RIGHT_NOW_SEND_ACTION_ID = 'review_send' as const;
export type RightNowSendActionId = typeof RIGHT_NOW_SEND_ACTION_ID;

/** Any button id that can ride a Right Now message (state actions + the Slack send button). */
export type RightNowMessageButtonId = RightNowMessageActionId | RightNowSendActionId;

export type RightNowMessageAction = {
  id: RightNowMessageButtonId;
  label: string;
};

export type RightNowMessagePayload = {
  kind: 'right_now';
  /**
   * 'dismissed' and 'silent' exist only on this Slack message layer — the
   * dashboard card union (RightNowCard) stays setup|active so other surfaces are
   * unaffected. 'silent' is SAFE_SILENCE: a selected move with no prepared object
   * behind it (e.g. a scored winner with no draft) stays quiet instead of
   * rendering a winner-backed homework card.
   */
  mode: RightNowCard['mode'] | 'dismissed' | 'silent';
  text: string;
  actions: RightNowMessageAction[];
};

function formatSourceTrail(state: WorkdayPresenceState | null): string {
  if (!state?.source_trail.length) return `Source trail: ${state?.state_source ?? 'manual_anchor'}`;
  const trail = state.source_trail
    .map((entry) => {
      const id = entry.source_id ?? entry.row_id ?? 'stored_row';
      const at = entry.occurred_at ?? entry.ingested_at ?? 'time_unknown';
      return `${entry.table}/${entry.source}/${entry.type} ${id} at ${at}: ${entry.redacted_summary} (${entry.selection_reason})`;
    })
    .join(' | ');
  return `Source trail: ${trail}`;
}

/**
 * The card IS the draft. When the brain prepared a reviewable artifact, lead with the
 * ready-to-send object itself — recipient, subject, full body inline — so the user reads
 * a finished message and taps once, never a "next move: go write a check-in" homework
 * assignment. The single quiet `_Why now_` footer is the only framing; the return-here /
 * next-move / why-this-matters / source-trail scaffolding is deliberately dropped from
 * this surface (it lives in the source_line + review modal for anyone who wants the trail).
 */
function formatDraftLedText(state: WorkdayPresenceState): string {
  const draft = state.draft!;
  const to = draft.to?.trim();
  const body = (draft.body || draft.preview || '').trim();
  const attachments = draft.attachments ?? [];

  // 'Draft' is normalizeDraft's placeholder for a missing subject — treat it as no
  // real subject so the headline reads as the act ("Reply to sarah@…") not a label.
  const subjectRaw = draft.title?.trim();
  const subject = subjectRaw && subjectRaw.toLowerCase() !== 'draft' ? subjectRaw : '';
  const headline = subject || (to ? `Reply to ${to}` : 'Ready to send');
  const lines: string[] = [`*${headline}*`];
  if (to) lines.push(`To: ${to}`);
  if (attachments.length > 0) {
    lines.push(`:paperclip: ${attachments.length} attached (${describeAttachments(attachments)})`);
  }
  lines.push('', body);

  // Quiet decision-closure footer: why → continuity → coverage. One block, never a
  // stack of competing items — coverage-assurance, not coverage-display. These are the
  // override-killers: they answer "did it see the rest?" and "did this change?" before
  // the user goes and re-checks. See decision-closure.ts.
  const footers: string[] = [];
  const why = state.why_it_matters?.trim();
  if (why) footers.push(`_Why now: ${why}_`);
  const continuity = state.continuity_line?.trim();
  if (continuity) footers.push(`_${continuity}_`);
  // Conviction ("ranked against X · beat Y") REPLACES the bare coverage count when the
  // scorer proved the comparison — same closing slot, one line, never both.
  const closing = state.conviction_line?.trim() || state.coverage_line?.trim();
  if (closing) footers.push(`_${closing}_`);
  if (footers.length) lines.push('', ...footers);
  return lines.join('\n');
}

function formatCardText(card: RightNowCard, state: WorkdayPresenceState | null): string {
  if (card.mode === 'setup') {
    return [card.prompt, card.verdict_line].filter(Boolean).join('\n');
  }

  // Draft-led: the prepared object is the card. No homework scaffolding.
  if (state?.draft && draftIsReviewable(state.draft)) {
    return formatDraftLedText(state);
  }

  // No drafted artifact (a manual re-entry anchor / source-backed focus). Keep the
  // compact focus note — it is itself the reviewable object the user typed, not a
  // buried-draft homework card.
  const lines: string[] = [
    card.heading,
    card.return_here,
    card.next_move,
    card.why_this_matters,
    ...(card.verdict_line ? [card.verdict_line] : []),
    formatSourceTrail(state),
  ];
  if (card.last_interaction) lines.push(card.last_interaction);
  if (card.do_not_touch) lines.push(card.do_not_touch);
  lines.push(card.stop_when_done);
  return lines.join('\n');
}

function cardActions(
  card: RightNowCard,
  state: WorkdayPresenceState | null,
): RightNowMessageAction[] {
  // Setup prompt and dismissed cards take no further button input.
  if (card.mode !== 'active') return [];
  const actions: RightNowMessageAction[] = [];
  // Approve & Send: only when the move is a send_message backed by a real persisted
  // action row. Without action_id there is nothing safe to execute, so no send button.
  // The tap opens the review-gated modal (pre-filled, editable) — submit IS the send
  // authorization; nothing leaves the mailbox on its own.
  if (state?.draft?.action_type === 'send_message' && state.draft.action_id) {
    actions.push({ id: RIGHT_NOW_SEND_ACTION_ID, label: 'Approve & Send' });
  }
  // No "View Draft" button: the draft body is rendered inline on the card now, so
  // there is nothing left to expand. (The legacy view_draft id is still accepted on
  // older posted messages — see RIGHT_NOW_ACTION_IDS — it just isn't offered here.)
  actions.push({ id: 'dismiss', label: 'Dismiss' });
  return actions;
}

export function buildRightNowMessagePayload(
  state: WorkdayPresenceState | null,
  nowIso = new Date().toISOString(),
): RightNowMessagePayload {
  const lastInteraction = state?.interaction_history[state.interaction_history.length - 1] ?? null;
  const isDismissSnoozeActive = Boolean(
    state?.snoozed_until && Date.parse(state.snoozed_until) > Date.parse(nowIso),
  );
  // Dismiss is a 4h hold (applyDismiss), not a permanent state. Once
  // snoozed_until passes, this surface must agree with the dashboard card
  // (which only checks snoozed_until) instead of treating "last action was
  // dismiss" as dismissed forever — that mismatch is F-dismiss (issue #354).
  if (state && lastInteraction?.interaction_type === 'dismiss' && isDismissSnoozeActive) {
    return {
      kind: 'right_now',
      mode: 'dismissed',
      text: 'Dismissed. Staying quiet until something new matters.',
      actions: [],
    };
  }

  // Acceptance standard: a selected move with no prepared object behind it (a
  // scored winner with no draft) is winner-backed homework. Stay SAFE_SILENT —
  // no card, no buttons — until the brain produces a reviewable object.
  if (state && !rightNowHasPreparedObject(state)) {
    return {
      kind: 'right_now',
      mode: 'silent',
      text: 'Nothing prepared to act on yet — staying quiet until there is a reviewable move.',
      actions: [],
    };
  }

  const card = buildRightNowCard(state, nowIso);

  return {
    kind: 'right_now',
    mode: card.mode,
    text: formatCardText(card, state),
    actions: cardActions(card, state),
  };
}
