// Seeds workday_presence_state from the REAL generated move — not just the scored title.
//
// Why this exists: scoring alone produces a title ("Commitment due in 0d: ..."). Wrapping
// that title in "Review and take the smallest next step: <title>" is not a move — it's the
// title echoed back. The brain's actual job is to decide WHAT TO DO and draft it. So this
// route runs the full generator (score → directive → artifact) and seeds the card with the
// real plain-English move + grounded reason + the drafted artifact behind "View Draft".
//
// resolveAnyUser: CRON_SECRET callers resolve to INGEST_USER_ID (owner self-loop via script);
// browser-session callers resolve to their own userId (non-owner paid loop — issue #259).
import { NextResponse } from 'next/server';
import { resolveAnyUser } from '@/lib/auth/resolve-user';
import { createServerClient } from '@/lib/db/client';
import {
  BUDGET_CAP_DIRECTIVE_SENTINEL,
  generateDirective,
} from '@/lib/briefing/generator';
import { generateArtifact } from '@/lib/conviction/artifact-generator';
import { getLastScorerDiagnostics } from '@/lib/briefing/scorer';
import type { ConvictionArtifact, ConvictionDirective } from '@/lib/briefing/types';
import type {
  WorkdayPresenceDraft,
  WorkdayPresenceSourceTrailEntry,
  WorkdayPresenceState,
} from '@/lib/workday-presence/model';
import { apiErrorForRoute } from '@/lib/utils/api-error';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const GENERATION_FAILED_SENTINEL = '__GENERATION_FAILED__';

/** A directive that doesn't represent a real, reviewable move the user can act on. */
function isRealMove(directive: ConvictionDirective): boolean {
  const text = directive.directive?.trim() ?? '';
  if (directive.action_type === 'do_nothing') return false;
  if (!text) return false;
  if (text === GENERATION_FAILED_SENTINEL || text === BUDGET_CAP_DIRECTIVE_SENTINEL) return false;
  return true;
}

/** One-line, recognizable preview of the drafted artifact for the "View Draft" surface. */
function draftFromArtifact(
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

  return {
    action_type: directive.action_type,
    title: title.slice(0, 160),
    preview: body.replace(/\s+/g, ' ').slice(0, 240),
  };
}

/** Evidence the generator grounded the move in — surfaced as the card's source trail. */
function sourceTrailFromDirective(directive: ConvictionDirective): WorkdayPresenceSourceTrailEntry[] {
  return (directive.evidence ?? []).slice(0, 3).map((ev) => ({
    table: ev.type === 'commitment' ? ('tkg_commitments' as const) : ('tkg_signals' as const),
    source: 'generator_evidence',
    type: ev.type,
    occurred_at: ev.date,
    redacted_summary: (ev.description ?? '').slice(0, 200),
    selection_reason: 'evidence grounding the generated move',
  }));
}

function directiveToPresenceState(
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

export async function POST(request: Request) {
  const auth = await resolveAnyUser(request);
  if (auth instanceof NextResponse) return auth;

  try {
    // The real brain: score → decide the move → draft it. skipSpendCap so triggered seeds
    // run; the per-day manual call limit still bounds cost.
    const directive = await generateDirective(auth.userId, { skipSpendCap: true });
    const diagnostics = getLastScorerDiagnostics();
    const winnerTitle =
      diagnostics?.finalWinner?.title?.trim() ||
      directive.directive.slice(0, 120).trim() ||
      'Scored winner';

    if (!isRealMove(directive)) {
      return NextResponse.json({
        seeded: false,
        scorer_outcome: diagnostics?.finalOutcome ?? 'no_valid_action',
        blocker_reason: directive.reason || 'No real move produced.',
        action_type: directive.action_type,
      });
    }

    // Draft the artifact behind the move (the thing "View Draft" opens). Best-effort:
    // a real move with no artifact still seeds — the move itself is the value.
    let artifact: ConvictionArtifact | null = null;
    try {
      artifact = await generateArtifact(auth.userId, directive);
    } catch (artifactError) {
      console.warn('[seed-from-scorer] artifact generation failed:', artifactError);
    }

    const nowIso = new Date().toISOString();
    const state = directiveToPresenceState(directive, winnerTitle, artifact, nowIso);

    const supabase = createServerClient();
    const { data, error } = await supabase.auth.admin.getUserById(auth.userId);
    if (error) throw error;

    const metadata = (data.user?.user_metadata ?? {}) as Record<string, unknown>;
    const updateResult = await supabase.auth.admin.updateUserById(auth.userId, {
      user_metadata: { ...metadata, workday_presence_state: state },
    });
    if (updateResult.error) throw updateResult.error;

    return NextResponse.json({
      seeded: true,
      scorer_outcome: diagnostics?.finalOutcome ?? 'winner_selected',
      winner: {
        title: winnerTitle,
        score: diagnostics?.finalWinner?.score ?? null,
        type: diagnostics?.finalWinner?.type ?? null,
        matched_goal: diagnostics?.finalWinner?.matchedGoal ?? null,
        action_type: directive.action_type,
        confidence: directive.confidence,
      },
      state_seeded: {
        current_focus: state.current_focus,
        next_move: state.next_move,
        why_it_matters: state.why_it_matters,
        state_source: state.state_source,
        draft: state.draft,
      },
    });
  } catch (error: unknown) {
    return apiErrorForRoute(error, 'workday-presence seed-from-scorer POST');
  }
}
