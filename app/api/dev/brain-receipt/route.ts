import { NextResponse } from 'next/server';
import { resolveUser } from '@/lib/auth/resolve-user';
import { OWNER_USER_ID } from '@/lib/auth/constants';
import { createServerClient } from '@/lib/db/client';
import { runDailyGenerate, isSendWorthy } from '@/lib/cron/daily-brief-generate';
import { getDecisionEnforcementIssues } from '@/lib/briefing/generator';
import { apiError } from '@/lib/utils/api-error';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const STALE_ACTION_ID = '2e3a92ac-f93e-42b4-a978-bedd3dcee4d6';

function extractCandidateNovelty(candidate: Record<string, unknown>): string {
  const reasons: string[] = [];
  const breakdown =
    candidate.scoreBreakdown && typeof candidate.scoreBreakdown === 'object'
      ? (candidate.scoreBreakdown as Record<string, unknown>)
      : {};
  const freshness = typeof breakdown.freshness === 'number' ? breakdown.freshness : null;
  const entityPenalty = typeof breakdown.entityPenalty === 'number' ? breakdown.entityPenalty : null;
  const decisionReason = typeof candidate.decisionReason === 'string' ? candidate.decisionReason : '';
  if (freshness !== null && freshness > 0.8) reasons.push('fresh supporting evidence');
  if (entityPenalty !== null && entityPenalty >= 0) reasons.push('not recently rejected');
  if (decisionReason) reasons.push(decisionReason);
  return reasons.join('; ').trim() || 'No explicit novelty note was logged.';
}

function parseFullContextCausalDiagnosis(fullContext: string | null): { mechanism: string; why_exists_now: string } | null {
  if (!fullContext) return null;
  const whyMatch = fullContext.match(/why_exists_now:\s*(.+)/i);
  const mechanismMatch = fullContext.match(/mechanism:\s*(.+)/i);
  if (!whyMatch || !mechanismMatch) return null;
  return {
    why_exists_now: whyMatch[1].trim(),
    mechanism: mechanismMatch[1].trim(),
  };
}

export async function POST(request: Request) {
  const auth = await resolveUser(request);
  if (auth instanceof NextResponse) return auth;
  if (auth.userId !== OWNER_USER_ID) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const startedAt = new Date().toISOString();
    const generate = await runDailyGenerate({
      userIds: [auth.userId],
      skipStaleGate: true,
      skipSpendCap: true,
      forceFreshRun: true,
    });

    const ownerResult = generate.results.find((row) => row.userId === auth.userId) ?? null;
    const reused = ownerResult?.code === 'pending_approval_reused';
    const reusedActionId = ownerResult?.meta?.['action_id'];
    if (reused || reusedActionId === STALE_ACTION_ID) {
      return NextResponse.json({
        ok: false,
        started_at: startedAt,
        blocker: 'stale_pending_action_reuse_not_blocked',
        reused_code: ownerResult?.code ?? null,
        reused_action_id: reusedActionId ?? null,
      }, { status: 409 });
    }

    const supabase = createServerClient();
    const { data: latestAction, error } = await supabase
      .from('tkg_actions')
      .select('id, generated_at, action_type, directive_text, reason, confidence, evidence, artifact, execution_result')
      .eq('user_id', auth.userId)
      .gte('generated_at', startedAt)
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!latestAction) {
      return NextResponse.json({ ok: false, started_at: startedAt, blocker: 'no_fresh_action_persisted' }, { status: 500 });
    }

    const executionResult =
      latestAction.execution_result && typeof latestAction.execution_result === 'object'
        ? (latestAction.execution_result as Record<string, unknown>)
        : {};
    const generationLog =
      executionResult.generation_log && typeof executionResult.generation_log === 'object'
        ? (executionResult.generation_log as Record<string, unknown>)
        : {};
    const candidateDiscovery =
      generationLog.candidateDiscovery && typeof generationLog.candidateDiscovery === 'object'
        ? (generationLog.candidateDiscovery as Record<string, unknown>)
        : {};
    const topCandidatesRaw = Array.isArray(candidateDiscovery.topCandidates)
      ? candidateDiscovery.topCandidates as Array<Record<string, unknown>>
      : [];
    const topCandidates = topCandidatesRaw.slice(0, 5).map((candidate) => ({
      candidate_id: candidate.id ?? null,
      candidate_type: candidate.candidateType ?? null,
      candidate_text: candidate.decisionReason ?? null,
      action_type: candidate.actionType ?? null,
      raw_score: candidate.score ?? null,
      score_components: candidate.scoreBreakdown ?? null,
      viability_ranking_adjustments: {
        decision: candidate.decision ?? null,
        decision_reason: candidate.decisionReason ?? null,
      },
      evidence_snippets_used: candidate.sourceSignals ?? [],
      non_obvious_reason: extractCandidateNovelty(candidate),
    }));

    const inspection =
      executionResult.inspection && typeof executionResult.inspection === 'object'
        ? (executionResult.inspection as Record<string, unknown>)
        : {};
    const winnerTrace =
      inspection.winner_selection_trace && typeof inspection.winner_selection_trace === 'object'
        ? (inspection.winner_selection_trace as Record<string, unknown>)
        : {};
    const acceptedCausalDiagnosis =
      inspection.accepted_causal_diagnosis && typeof inspection.accepted_causal_diagnosis === 'object'
        ? inspection.accepted_causal_diagnosis
        : parseFullContextCausalDiagnosis(typeof latestAction.directive_text === 'string' ? latestAction.directive_text : null);

    const artifact =
      latestAction.artifact && typeof latestAction.artifact === 'object'
        ? (latestAction.artifact as Record<string, unknown>)
        : (executionResult.artifact && typeof executionResult.artifact === 'object'
          ? (executionResult.artifact as Record<string, unknown>)
          : {});
    const decisionIssues = getDecisionEnforcementIssues({
      actionType: latestAction.action_type ?? '',
      directiveText: latestAction.directive_text ?? '',
      reason: latestAction.reason ?? '',
      artifact,
    });
    const sendWorthiness = isSendWorthy(
      {
        directive: latestAction.directive_text ?? '',
        action_type: (latestAction.action_type ?? 'do_nothing') as 'send_message' | 'write_document' | 'do_nothing' | 'schedule' | 'make_decision' | 'research',
        confidence: typeof latestAction.confidence === 'number' ? latestAction.confidence : 0,
        reason: latestAction.reason ?? '',
        evidence: Array.isArray(latestAction.evidence) ? latestAction.evidence as Array<{ description: string; type: 'signal' | 'commitment' | 'goal' | 'pattern' }> : [],
      },
      artifact as never,
    );

    const topScorerId = typeof winnerTrace.scorerTopId === 'string' ? winnerTrace.scorerTopId : topCandidatesRaw[0]?.id ?? null;
    const finalWinnerId = typeof winnerTrace.finalWinnerId === 'string' ? winnerTrace.finalWinnerId : topScorerId;

    return NextResponse.json({
      ok: true,
      started_at: startedAt,
      fresh_receipt: {
        action_id: latestAction.id,
        generated_at: latestAction.generated_at,
      },
      fresh_run_proof: {
        force_fresh_run: true,
        stale_action_not_reused: latestAction.id !== STALE_ACTION_ID,
        stale_action_id: STALE_ACTION_ID,
      },
      top_5_candidates: topCandidates,
      final_winner: {
        candidate_id: finalWinnerId,
        candidate_type: winnerTrace.finalWinnerType ?? topCandidatesRaw.find((c) => c.id === finalWinnerId)?.candidateType ?? null,
        action_type: latestAction.action_type,
        winner_reason: winnerTrace.finalWinnerReason ?? null,
      },
      accepted_causal_diagnosis: acceptedCausalDiagnosis,
      causal_diagnosis_source: inspection.causal_diagnosis_source ?? null,
      full_generated_artifact: artifact,
      decision_enforcement_result: {
        passed: decisionIssues.length === 0,
        issues: decisionIssues,
      },
      persistence_send_worthiness_result: sendWorthiness,
      top_scorer_displacement: {
        top_scorer_candidate_id: topScorerId,
        final_winner_candidate_id: finalWinnerId,
        downgraded_or_blocked: topScorerId !== finalWinnerId,
        reason:
          topScorerId !== finalWinnerId
            ? (winnerTrace.scorerTopDisplacementReason ?? 'No explicit displacement reason recorded.')
            : null,
      },
      generate_stage_result: ownerResult ?? null,
    });
  } catch (error: unknown) {
    return apiError(error, 'dev/brain-receipt');
  }
}
