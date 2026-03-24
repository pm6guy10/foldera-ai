import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-options';
import { generateDirective } from '@/lib/briefing/generator';
import { scoreOpenLoops, type ScoredLoop } from '@/lib/briefing/scorer';
import { processUnextractedSignals } from '@/lib/signals/signal-processor';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const DEFAULT_ROUNDS = 5;
const MAX_ROUNDS = 20;

type StressTestRequest = {
  rounds?: number;
  user_id?: string;
};

type StressCandidate = {
  entity: string;
  score: number;
  action_type: string;
  reason: string;
};

function clampRounds(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_ROUNDS;
  }

  return Math.min(MAX_ROUNDS, Math.max(1, Math.floor(value)));
}

function getCandidateEntity(candidate: ScoredLoop): string {
  return (
    candidate.title?.trim() ||
    candidate.matchedGoal?.text?.trim() ||
    candidate.sourceSignals?.find((signal) => typeof signal.summary === 'string' && signal.summary.trim())?.summary?.trim() ||
    candidate.id
  );
}

function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  if (process.env.ALLOW_DEV_ROUTES !== 'true') {
    return jsonError('Dev routes are disabled.', 403);
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return jsonError('Authentication required.', 401);
  }

  let body: StressTestRequest = {};
  try {
    if (request.headers.get('content-type')?.includes('application/json')) {
      body = (await request.json()) as StressTestRequest;
    }
  } catch {
    return jsonError('Invalid JSON body.', 400);
  }

  const rounds = clampRounds(body.rounds);
  const userId = typeof body.user_id === 'string' && body.user_id.trim().length > 0
    ? body.user_id.trim()
    : session.user.id;

  const results: Array<{
    round: number;
    top_candidates: StressCandidate[];
    winner: { entity: string; score: number; action_type: string } | null;
    directive: string | null;
    artifact: Record<string, unknown> | null;
    confidence: number | null;
    action_type: string | null;
    rejection_reason: string | null;
    generation_time_ms: number;
  }> = [];

  const actionTypeDistribution: Record<string, number> = {};
  const uniqueEntities = new Set<string>();
  let totalDirectivesGenerated = 0;
  let totalRejected = 0;
  let confidenceSum = 0;
  let confidenceCount = 0;

  for (let round = 1; round <= rounds; round++) {
    await processUnextractedSignals(userId, { dryRun: true });

    const scored = await scoreOpenLoops(userId);
    const startTime = Date.now();
    const directive = await generateDirective(userId, { dryRun: true });
    const generationTimeMs = Date.now() - startTime;

    const topCandidates = scored?.candidateDiscovery.topCandidates.map((candidate) => ({
      entity: candidate.targetGoal?.text ?? candidate.sourceSignals[0]?.summary ?? candidate.id,
      score: candidate.score,
      action_type: candidate.actionType,
      reason: candidate.decisionReason,
    })) ?? [];

    for (const candidate of topCandidates) {
      uniqueEntities.add(candidate.entity);
    }

    const winner = scored?.winner
      ? {
        entity: getCandidateEntity(scored.winner),
        score: Number(scored.winner.score.toFixed(2)),
        action_type: scored.winner.suggestedActionType,
      }
      : null;

    if (winner) {
      uniqueEntities.add(winner.entity);
    }

    const generationLog = directive.generationLog;
    const directiveText = directive.directive === '__GENERATION_FAILED__' ? null : directive.directive;
    const rejectionReason = generationLog?.outcome === 'no_send' ? generationLog.reason : null;
    const directiveActionType = directive.action_type ?? null;
    const embeddedArtifact = (
      directive as typeof directive & { embeddedArtifact?: Record<string, unknown> | null }
    ).embeddedArtifact ?? null;

    if (directiveText && !rejectionReason) {
      totalDirectivesGenerated++;
    } else {
      totalRejected++;
    }

    if (typeof directive.confidence === 'number' && directive.confidence > 0) {
      confidenceSum += directive.confidence;
      confidenceCount++;
    }

    if (directiveActionType) {
      actionTypeDistribution[directiveActionType] = (actionTypeDistribution[directiveActionType] ?? 0) + 1;
    }

    results.push({
      round,
      top_candidates: topCandidates,
      winner,
      directive: directiveText,
      artifact: embeddedArtifact,
      confidence: typeof directive.confidence === 'number' ? directive.confidence : null,
      action_type: directiveActionType,
      rejection_reason: rejectionReason,
      generation_time_ms: generationTimeMs,
    });
  }

  return NextResponse.json({
    rounds_run: rounds,
    results,
    summary: {
      total_directives_generated: totalDirectivesGenerated,
      total_rejected: totalRejected,
      avg_confidence: confidenceCount > 0 ? Number((confidenceSum / confidenceCount).toFixed(2)) : 0,
      unique_entities: uniqueEntities.size,
      action_type_distribution: actionTypeDistribution,
    },
  });
}
