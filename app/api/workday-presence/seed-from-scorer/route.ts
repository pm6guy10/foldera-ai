// Owner-only diagnostic endpoint — seeds workday_presence_state from the scored winner.
// Uses resolveCronUser (CRON_SECRET + INGEST_USER_ID) so it can be called from scripts
// to prove the #226 self-loop surfaces the scoreOpenLoops winner without a live browser session.
// Full automation (cron-driven updates, risk_score/due_confidence computation) is issue #249.
import { NextResponse } from 'next/server';
import { resolveCronUser } from '@/lib/auth/resolve-user';
import { createServerClient } from '@/lib/db/client';
import { scoreOpenLoops } from '@/lib/briefing/scorer';
import type { ScoredLoop } from '@/lib/briefing/scorer';
import type { WorkdayPresenceState } from '@/lib/workday-presence/model';
import { apiErrorForRoute } from '@/lib/utils/api-error';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

function winnerToPresenceState(winner: ScoredLoop, nowIso: string): WorkdayPresenceState {
  const title = winner.title?.trim() || winner.entityName?.trim() || 'Scored winner';
  const goal = winner.matchedGoal?.text?.trim() ?? null;

  return {
    current_focus: title,
    next_move: `Review and take the smallest next step: ${title}`,
    why_it_matters: goal
      ? `Matched goal: "${goal}". Score: ${winner.score.toFixed(2)}.`
      : `Top-scored open loop (score: ${winner.score.toFixed(2)}). No matched goal.`,
    blocker: null,
    do_not_touch: 'Do not auto-send or mutate source systems without review.',
    waiting_on: null,
    last_completed_step: null,
    state_source: 'scored_winner',
    source_trail: (winner.sourceSignals ?? []).slice(0, 3).map((sig) => ({
      table: 'tkg_signals' as const,
      source: String(sig.source ?? 'unknown'),
      type: String(sig.kind ?? 'signal'),
      row_id: sig.id ? String(sig.id) : undefined,
      occurred_at: sig.occurredAt ? String(sig.occurredAt) : undefined,
      redacted_summary: String(sig.summary ?? sig.id ?? 'signal'),
      selection_reason: 'source signal for scored winner',
    })),
    snoozed_until: null,
    interaction_history: [],
    created_at: nowIso,
    updated_at: nowIso,
  };
}

export async function POST(request: Request) {
  const auth = resolveCronUser(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const scored = await scoreOpenLoops(auth.userId, { pipelineDryRun: true });

    if (scored.outcome !== 'winner_selected' || !scored.winner) {
      return NextResponse.json({
        seeded: false,
        scorer_outcome: scored.outcome,
        exact_blocker: scored.exact_blocker,
        top_candidates: scored.topCandidates.slice(0, 3).map((c) => ({
          title: c.title,
          score: c.score,
          type: c.type,
        })),
      });
    }

    const nowIso = new Date().toISOString();
    const state = winnerToPresenceState(scored.winner, nowIso);

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
      scorer_outcome: scored.outcome,
      winner: {
        title: scored.winner.title,
        score: scored.winner.score,
        type: scored.winner.type,
        matched_goal: scored.winner.matchedGoal?.text ?? null,
        top_candidates: scored.topCandidates.slice(0, 3).map((c) => ({
          title: c.title,
          score: c.score,
          type: c.type,
        })),
      },
      state_seeded: {
        current_focus: state.current_focus,
        next_move: state.next_move,
        why_it_matters: state.why_it_matters,
        state_source: state.state_source,
      },
    });
  } catch (error: unknown) {
    return apiErrorForRoute(error, 'workday-presence seed-from-scorer POST');
  }
}
