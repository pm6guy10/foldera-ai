// Core of seed-from-scorer, extracted so it can run from ANY caller with just a
// userId — no HTTP/NextRequest/CRON_SECRET plumbing. The route is a thin wrapper
// (auth + auth-failed trace); on-demand callers (sync-now) and the cron pipeline
// both call seedFromScorerForUser(userId) directly.
//
// Runs the real brain: score → decide the move → draft it → seed workday_presence_state,
// or write an honest workday_presence_suppression_trace when no real move clears the bar.
import { createServerClient } from '@/lib/db/client';
import { generateDirective } from '@/lib/briefing/generator';
import { generateArtifact } from '@/lib/conviction/artifact-generator';
import { evaluateBottomGate } from '@/lib/cron/daily-brief-generate';
import { getLastScorerDiagnostics } from '@/lib/briefing/scorer';
import type { ConvictionArtifact, ConvictionDirective } from '@/lib/briefing/types';
import type { WorkdayPresenceState, WorkdayPresenceSuppressionTrace } from '@/lib/workday-presence/model';
import {
  directiveToPresenceState,
  GENERATION_FAILED_SENTINEL,
  isRealMove,
  sendDraftIsGrounded,
} from '@/lib/workday-presence/seed-from-directive';

export interface SeedOutcome {
  seeded: boolean;
  /** Exact JSON-able payload the route returns (external contract preserved). */
  payload: Record<string, unknown>;
  /** The seeded state when seeded === true, else null. */
  state: WorkdayPresenceState | null;
}

function readSelectedCandidate(
  directive: ConvictionDirective,
  diagnostics: ReturnType<typeof getLastScorerDiagnostics>,
): WorkdayPresenceSuppressionTrace['selected_candidate'] {
  const selected =
    directive.generationLog?.candidateDiscovery?.topCandidates?.find((candidate) => candidate.decision === 'selected') ??
    directive.generationLog?.candidateDiscovery?.topCandidates?.[0] ??
    null;

  return {
    title: diagnostics?.finalWinner?.title?.trim() ?? null,
    type: diagnostics?.finalWinner?.type ?? selected?.candidateType ?? null,
    score: diagnostics?.finalWinner?.score ?? selected?.score ?? null,
  };
}

function detectSuppressionShape(input: {
  directive: ConvictionDirective;
  blockerReason: string;
  explicitGate: string;
}): Pick<
  WorkdayPresenceSuppressionTrace,
  'trace_type' | 'gate' | 'generation_failed' | 'ungrounded_send_draft' | 'bottom_gate'
> {
  const normalizedReason = input.blockerReason.toLowerCase();
  const stage = input.directive.generationLog?.stage ?? null;
  const generationFailed =
    input.directive.directive === GENERATION_FAILED_SENTINEL &&
    (stage === 'system' || normalizedReason.includes('generation failed'));
  const ungroundedSendDraft = input.explicitGate === 'ungrounded_send_draft';
  const bottomGate = input.explicitGate === 'bottom_gate';
  const safeSilence =
    input.explicitGate === 'safe_silence' ||
    stage === 'scoring' ||
    input.directive.generationLog?.no_valid_action_blocker === true ||
    input.directive.action_type === 'do_nothing';

  if (generationFailed) {
    return {
      trace_type: 'generation_failed',
      gate: 'generation_failed',
      generation_failed: true,
      ungrounded_send_draft: false,
      bottom_gate: false,
    };
  }

  if (safeSilence) {
    return {
      trace_type: 'safe_silence',
      gate: 'safe_silence',
      generation_failed: false,
      ungrounded_send_draft: false,
      bottom_gate: false,
    };
  }

  return {
    trace_type: 'suppressed_winner',
    gate: input.explicitGate,
    generation_failed: false,
    ungrounded_send_draft: ungroundedSendDraft,
    bottom_gate: bottomGate,
  };
}

function buildSuppressionTrace(input: {
  directive: ConvictionDirective;
  diagnostics: ReturnType<typeof getLastScorerDiagnostics>;
  blockerReason: string;
  explicitGate: string;
  artifact: ConvictionArtifact | null;
}): WorkdayPresenceSuppressionTrace {
  const candidateDiscovery = input.directive.generationLog?.candidateDiscovery ?? null;
  const shape = detectSuppressionShape({
    directive: input.directive,
    blockerReason: input.blockerReason,
    explicitGate: input.explicitGate,
  });

  return {
    ...shape,
    blocker_reason: input.blockerReason,
    scorer_outcome: input.diagnostics?.finalOutcome ?? null,
    action_type: input.directive.action_type ?? null,
    selected_candidate: readSelectedCandidate(input.directive, input.diagnostics),
    candidate_count: candidateDiscovery?.candidateCount ?? null,
    evidence_empty: (input.directive.evidence ?? []).length === 0,
    artifact_exists: input.artifact !== null,
    draft_exists: input.artifact !== null,
    no_send: true,
  };
}

async function persistSuppressionTrace(input: {
  authUserId: string;
  metadata: Record<string, unknown>;
  suppressionTrace: WorkdayPresenceSuppressionTrace;
}) {
  const supabase = createServerClient();
  const updateResult = await supabase.auth.admin.updateUserById(input.authUserId, {
    user_metadata: {
      ...input.metadata,
      workday_presence_suppression_trace: input.suppressionTrace,
    },
  });
  if (updateResult.error) throw updateResult.error;
}

/**
 * Score → decide → draft → seed (or suppress) workday_presence_state for one user.
 * Throws on unhandled errors; callers own the generation_failed trace + HTTP mapping.
 */
export async function seedFromScorerForUser(userId: string): Promise<SeedOutcome> {
  // The real brain: score → decide the move → draft it. skipSpendCap so triggered seeds
  // run; the per-day manual call limit still bounds cost.
  const directive = await generateDirective(userId, { skipSpendCap: true });
  const diagnostics = getLastScorerDiagnostics();
  const winnerTitle =
    diagnostics?.finalWinner?.title?.trim() ||
    directive.directive.slice(0, 120).trim() ||
    'Scored winner';
  const supabase = createServerClient();
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error) throw error;
  const metadata = (data.user?.user_metadata ?? {}) as Record<string, unknown>;

  if (!isRealMove(directive)) {
    const suppressionTrace = buildSuppressionTrace({
      directive,
      diagnostics,
      blockerReason: directive.reason || 'No real move produced.',
      explicitGate: 'safe_silence',
      artifact: null,
    });
    await persistSuppressionTrace({ authUserId: userId, metadata, suppressionTrace });
    return {
      seeded: false,
      state: null,
      payload: {
        seeded: false,
        scorer_outcome: diagnostics?.finalOutcome ?? 'no_valid_action',
        blocker_reason: directive.reason || 'No real move produced.',
        action_type: directive.action_type,
        suppression_trace: suppressionTrace,
      },
    };
  }

  // Draft the artifact behind the move (the thing "View Draft" opens). Best-effort:
  // a real move with no artifact still seeds — the move itself is the value.
  let artifact: ConvictionArtifact | null = null;
  try {
    artifact = await generateArtifact(userId, directive);
  } catch (artifactError) {
    console.warn('[seed-from-scorer] artifact generation failed:', artifactError);
  }

  // Anti-fabrication: an email draft not grounded in a real inbound thread or
  // cited evidence never reaches the card. Stay quiet instead of lying.
  if (directive.action_type === 'send_message' && !sendDraftIsGrounded(directive, artifact)) {
    const blockerReason =
      'ungrounded_send_draft: drafted email has no real inbound thread and the recipient is not in cited evidence — refusing to present fabricated correspondence.';
    const suppressionTrace = buildSuppressionTrace({
      directive,
      diagnostics,
      blockerReason,
      explicitGate: 'ungrounded_send_draft',
      artifact,
    });
    await persistSuppressionTrace({ authUserId: userId, metadata, suppressionTrace });
    return {
      seeded: false,
      state: null,
      payload: {
        seeded: false,
        scorer_outcome: diagnostics?.finalOutcome ?? 'winner_selected',
        blocker_reason: blockerReason,
        action_type: directive.action_type,
        winner_title: winnerTitle,
        suppression_trace: suppressionTrace,
      },
    };
  }

  // Importance bar: reuse the pipeline's bottom gate. A winner with no external
  // target, no concrete ask, or no real pressure is not important enough to ping.
  if (artifact) {
    const gate = evaluateBottomGate(directive, artifact);
    if (!gate.pass) {
      const blockerReason = `bottom_gate: ${gate.blocked_reasons.join(', ')} — winner not important enough to interrupt.`;
      const suppressionTrace = buildSuppressionTrace({
        directive,
        diagnostics,
        blockerReason,
        explicitGate: 'bottom_gate',
        artifact,
      });
      await persistSuppressionTrace({ authUserId: userId, metadata, suppressionTrace });
      return {
        seeded: false,
        state: null,
        payload: {
          seeded: false,
          scorer_outcome: diagnostics?.finalOutcome ?? 'winner_selected',
          blocker_reason: blockerReason,
          action_type: directive.action_type,
          winner_title: winnerTitle,
          suppression_trace: suppressionTrace,
        },
      };
    }
  }

  const nowIso = new Date().toISOString();

  // Persist the move as a pending_approval tkg_actions row so the review-gated Slack
  // send has a real backing id to call executeAction with. Best-effort: if the insert
  // fails, the card still seeds (review-only, no send button) — the move keeps its value.
  let persistedActionId: string | null = null;
  if (artifact) {
    try {
      const { data: savedAction, error: saveActionError } = await supabase
        .from('tkg_actions')
        .insert({
          user_id: userId,
          action_type: directive.action_type,
          directive_text: directive.directive,
          reason: directive.reason,
          status: 'pending_approval',
          confidence: directive.confidence,
          evidence: directive.evidence,
          generated_at: nowIso,
          generation_attempts: 1,
          artifact,
          execution_result: { artifact },
        })
        .select('id')
        .single();
      if (saveActionError || !savedAction?.id) {
        console.warn('[seed-from-scorer] action persist failed:', saveActionError?.message);
      } else {
        persistedActionId = savedAction.id;
      }
    } catch (persistError: unknown) {
      console.warn('[seed-from-scorer] action persist threw:', persistError);
    }
  }

  const state = directiveToPresenceState(directive, winnerTitle, artifact, nowIso, persistedActionId);
  const updateResult = await supabase.auth.admin.updateUserById(userId, {
    user_metadata: {
      ...metadata,
      workday_presence_state: state,
      workday_presence_suppression_trace: null,
    },
  });
  if (updateResult.error) throw updateResult.error;

  return {
    seeded: true,
    state,
    payload: {
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
      suppression_trace: null,
    },
  };
}
