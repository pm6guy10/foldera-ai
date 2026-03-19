/**
 * POST /api/debug/generate — one-off diagnostic. Delete after use.
 * Runs the full daily-brief generate flow for the owner and returns all state.
 */
import { NextResponse } from 'next/server';
import { validateCronAuth } from '@/lib/auth/resolve-user';
import { generateDirective, validateDirectiveForPersistence } from '@/lib/briefing/generator';
import { generateArtifact } from '@/lib/conviction/artifact-generator';
import { scoreOpenLoops } from '@/lib/briefing/scorer';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(request: Request) {
  const authError = validateCronAuth(request);
  if (authError) return authError;

  const userId = 'e40b7cd8-4925-42f7-bc99-5022969f1d22';
  const diag: Record<string, unknown> = { userId, startedAt: new Date().toISOString() };

  try {
    // Step 1: Score
    const scored = await scoreOpenLoops(userId);
    diag.candidateCount = scored?.candidateDiscovery.candidateCount ?? 0;
    diag.winner = scored ? {
      id: scored.winner.id,
      type: scored.winner.type,
      action: scored.winner.suggestedActionType,
      score: scored.winner.score,
      breakdown: scored.winner.breakdown,
      title: scored.winner.title,
      goal: scored.winner.matchedGoal?.text ?? null,
    } : null;

    // Step 2: Generate directive
    const directive = await generateDirective(userId);
    diag.directive = {
      text: directive.directive,
      action_type: directive.action_type,
      confidence: directive.confidence,
      reason: directive.reason,
    };
    diag.generationLog = directive.generationLog;

    if (directive.directive === '__GENERATION_FAILED__') {
      diag.outcome = 'generation_failed';
      diag.finishedAt = new Date().toISOString();
      return NextResponse.json(diag);
    }

    // Step 3: Artifact
    let artifact: Record<string, unknown> | null = null;
    try {
      const art = await generateArtifact(userId, directive);
      artifact = art as Record<string, unknown> | null;
      diag.artifact = artifact;
    } catch (e: any) {
      diag.artifactError = e.message;
    }

    // Step 4: Validate
    const issues = validateDirectiveForPersistence({ userId, directive, artifact });
    diag.validationIssues = issues;
    diag.validationPassed = issues.length === 0;
    diag.outcome = issues.length === 0 ? 'ready_to_persist' : 'validation_failed';
    diag.finishedAt = new Date().toISOString();
    return NextResponse.json(diag);
  } catch (e: any) {
    diag.error = e.message;
    diag.finishedAt = new Date().toISOString();
    return NextResponse.json(diag, { status: 500 });
  }
}
