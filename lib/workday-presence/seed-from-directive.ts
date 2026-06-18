// Shared seed-mapping: turn a REAL generated move (directive + artifact) into a
// workday_presence_state, with the drafted artifact behind "View Draft".
//
// This logic was originally private to app/api/workday-presence/seed-from-scorer/route.ts
// (the explicit "Generate now" / owner self-loop path). It is extracted here so the
// daily-brief pipeline can seed the SAME state at generation time — the moment a winner
// is persisted, when we know exactly which artifact belongs to which move. That retires
// the post-hoc fuzzy recycle (#394) for the brief path: no 48h window, no title-overlap
// matching. The recycle stays as a fallback for states seeded by other paths.
import { BUDGET_CAP_DIRECTIVE_SENTINEL } from '@/lib/briefing/generator';
import type { createServerClient } from '@/lib/db/client';
import type { ConvictionArtifact, ConvictionDirective } from '@/lib/briefing/types';
import {
  normalizeWorkdayPresenceState,
  type WorkdayPresenceDraft,
  type WorkdayPresenceSourceTrailEntry,
  type WorkdayPresenceState,
} from './model';

export const GENERATION_FAILED_SENTINEL = '__GENERATION_FAILED__';

/** A directive that doesn't represent a real, reviewable move the user can act on. */
export function isRealMove(directive: ConvictionDirective): boolean {
  const text = directive.directive?.trim() ?? '';
  if (directive.action_type === 'do_nothing') return false;
  if (!text) return false;
  if (text === GENERATION_FAILED_SENTINEL || text === BUDGET_CAP_DIRECTIVE_SENTINEL) return false;
  return true;
}

/** One-line, recognizable preview of the drafted artifact for the "View Draft" surface. */
export function draftFromArtifact(
  directive: ConvictionDirective,
  artifact: ConvictionArtifact | null,
): WorkdayPresenceDraft | null {
  if (!artifact) return null;
  const record = artifact as unknown as Record<string, unknown>;
  const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

  const title =
    str(record.subject) ||
    str(record.title) ||
    str(record.recommendation) ||
    directive.directive.slice(0, 120);
  const body =
    str(record.body) ||
    str(record.content) ||
    str(record.findings) ||
    str(record.recommendation) ||
    str(record.context);
  const to = str(record.to);

  return {
    action_type: directive.action_type,
    title: title.slice(0, 160),
    preview: body.replace(/\s+/g, ' ').slice(0, 240),
    ...(to ? { to } : {}),
    ...(body ? { body: body.slice(0, 2000) } : {}),
  };
}

/**
 * Anti-fabrication gate for email drafts. A send_message draft may only ship
 * when it is grounded in reality: it replies in a real inbound thread
 * (gmail_thread_id / in_reply_to), or the recipient verifiably appears in the
 * evidence the generator cited. A drafted reply to an email that never
 * happened must never reach the card — quiet beats fabricated.
 */
export function sendDraftIsGrounded(
  directive: ConvictionDirective,
  artifact: ConvictionArtifact | null,
): boolean {
  if (!artifact) return false;
  const record = artifact as unknown as Record<string, unknown>;
  const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

  if (str(record.gmail_thread_id) || str(record.in_reply_to)) return true;

  const to = str(record.to).toLowerCase();
  if (!to.includes('@')) return false;
  return (directive.evidence ?? []).some((ev) =>
    (ev.description ?? '').toLowerCase().includes(to),
  );
}

/** Evidence the generator grounded the move in — surfaced as the card's source trail. */
export function sourceTrailFromDirective(
  directive: ConvictionDirective,
): WorkdayPresenceSourceTrailEntry[] {
  return (directive.evidence ?? []).slice(0, 3).map((ev) => ({
    table: ev.type === 'commitment' ? ('tkg_commitments' as const) : ('tkg_signals' as const),
    source: 'generator_evidence',
    type: ev.type,
    occurred_at: ev.date,
    redacted_summary: (ev.description ?? '').slice(0, 200),
    selection_reason: 'evidence grounding the generated move',
  }));
}

export function directiveToPresenceState(
  directive: ConvictionDirective,
  winnerTitle: string,
  artifact: ConvictionArtifact | null,
  nowIso: string,
): WorkdayPresenceState {
  return {
    current_focus: winnerTitle,
    next_move: directive.directive,
    why_it_matters: directive.reason || `Confidence ${directive.confidence}/100.`,
    blocker: null,
    do_not_touch: 'Do not auto-send or mutate source systems without review.',
    waiting_on: null,
    last_completed_step: null,
    state_source: 'scored_winner',
    source_trail: sourceTrailFromDirective(directive),
    draft: draftFromArtifact(directive, artifact),
    snoozed_until: null,
    interaction_history: [],
    created_at: nowIso,
    updated_at: nowIso,
  };
}

/**
 * Seed workday_presence_state from a winner the daily brief just persisted.
 *
 * Called at generation time — the moment we know exactly which artifact belongs to
 * which scored move — so the guardian has finished work to present without the
 * after-the-fact recycle heuristic (#394). Best-effort and conservative:
 *   - only a real, reviewable move becomes a card (isRealMove);
 *   - a send_message draft must be grounded in a real thread or evidenced recipient,
 *     else stay quiet (never seed a fabricated reply);
 *   - an existing, still-active snooze is PRESERVED — an automatic reseed must never
 *     wake a card the user explicitly silenced.
 *
 * Returns {seeded, reason}. Throws only on a hard Supabase error so callers can log;
 * the daily brief wraps this so seeding can never break generation.
 */
export async function seedWorkdayPresenceStateFromBrief(input: {
  supabase: ReturnType<typeof createServerClient>;
  userId: string;
  directive: ConvictionDirective;
  artifact: ConvictionArtifact | null;
  winnerTitle?: string | null;
  nowIso?: string;
}): Promise<{ seeded: boolean; reason: string }> {
  const { supabase, userId, directive, artifact } = input;
  const nowIso = input.nowIso ?? new Date().toISOString();

  if (!isRealMove(directive)) {
    return { seeded: false, reason: 'not_a_real_move' };
  }
  if (directive.action_type === 'send_message' && !sendDraftIsGrounded(directive, artifact)) {
    return { seeded: false, reason: 'ungrounded_send_draft' };
  }

  const winnerTitle =
    input.winnerTitle?.trim() ||
    directive.directive.slice(0, 120).trim() ||
    'Scored winner';

  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error) throw error;
  const metadata = (data.user?.user_metadata ?? {}) as Record<string, unknown>;

  // Preserve an existing snooze so an automatic reseed never wakes a silenced card.
  const existingSnooze =
    normalizeWorkdayPresenceState(metadata.workday_presence_state)?.snoozed_until ?? null;

  const state: WorkdayPresenceState = {
    ...directiveToPresenceState(directive, winnerTitle, artifact, nowIso),
    snoozed_until: existingSnooze,
  };

  const updateResult = await supabase.auth.admin.updateUserById(userId, {
    user_metadata: {
      ...metadata,
      workday_presence_state: state,
      workday_presence_suppression_trace: null,
    },
  });
  if (updateResult.error) throw updateResult.error;

  return { seeded: true, reason: '' };
}
