/**
 * POST /api/debug/generate
 *
 * Diagnostic-only route: runs the full directive generation pipeline
 * for the owner and returns all intermediate state.
 * Protected by CRON_SECRET. DELETE after debugging.
 */

import { NextResponse } from 'next/server';
import { validateCronAuth } from '@/lib/auth/resolve-user';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(request: Request) {
  const authError = validateCronAuth(request);
  if (authError) return authError;

  const userId = 'e40b7cd8-4925-42f7-bc99-5022969f1d22';
  const diag: Record<string, unknown> = { userId, startedAt: new Date().toISOString() };

  try {
    // Step 1: Score open loops
    console.log('[debug/generate] Step 1: scoring');
    diag.step = 'scoring';
    const { scoreOpenLoops } = await import('@/lib/briefing/scorer');
    const scorerResult = await scoreOpenLoops(userId);

    if (!scorerResult) {
      diag.scorerResult = null;
      diag.outcome = 'no_candidates';
      diag.finishedAt = new Date().toISOString();
      return NextResponse.json(diag);
    }

    diag.winner = {
      id: scorerResult.winner.id,
      type: scorerResult.winner.type,
      suggestedActionType: scorerResult.winner.suggestedActionType,
      score: scorerResult.winner.score,
      breakdown: scorerResult.winner.breakdown,
      matchedGoal: scorerResult.winner.matchedGoal
        ? {
            text: scorerResult.winner.matchedGoal.text,
            priority: scorerResult.winner.matchedGoal.priority,
            category: scorerResult.winner.matchedGoal.category,
          }
        : null,
      sourceSignals: scorerResult.winner.sourceSignals?.slice(0, 5),
      title: scorerResult.winner.title,
    };
    diag.candidateDiscovery = scorerResult.candidateDiscovery;
    diag.deprioritizedCount = scorerResult.deprioritized.length;
    diag.deprioritizedTop3 = scorerResult.deprioritized.slice(0, 3).map((d) => ({
      title: d.title,
      killReason: d.killReason,
      killExplanation: d.killExplanation,
    }));

    // Step 2: Run full generation (this re-scores internally but produces the directive)
    console.log('[debug/generate] Step 2: generating directive');
    diag.step = 'generation';
    const { generateDirective } = await import('@/lib/briefing/generator');
    const directive = await generateDirective(userId);

    diag.directive = {
      directive: directive.directive,
      action_type: directive.action_type,
      confidence: directive.confidence,
      reason: directive.reason,
      requires_search: directive.requires_search,
      evidenceCount: directive.evidence?.length ?? 0,
    };
    diag.generationLog = directive.generationLog;

    // Check for generation failure sentinel
    if (directive.directive === '__GENERATION_FAILED__') {
      diag.outcome = 'generation_failed';
      diag.finishedAt = new Date().toISOString();
      return NextResponse.json(diag);
    }

    // Step 3: Try artifact generation
    console.log('[debug/generate] Step 3: generating artifact');
    diag.step = 'artifact';
    let artifact: Record<string, unknown> | null = null;
    try {
      const { generateArtifact } = await import('@/lib/conviction/artifact-generator');
      const artResult = await generateArtifact(userId, directive);
      artifact = artResult as Record<string, unknown> | null;
      diag.artifact = artifact
        ? {
            type: (artifact as any).type,
            hasTo: !!(artifact as any).to,
            hasSubject: !!(artifact as any).subject,
            hasBody: !!(artifact as any).body,
            hasTitle: !!(artifact as any).title,
            hasContent: !!(artifact as any).content,
            bodyLength: ((artifact as any).body ?? (artifact as any).content ?? '').length,
          }
        : null;
    } catch (artErr: any) {
      diag.artifactError = artErr.message;
    }

    // Step 4: Validate directive for persistence
    console.log('[debug/generate] Step 4: validating for persistence');
    diag.step = 'validation';
    try {
      const { validateDirectiveForPersistence } = await import('@/lib/briefing/generator');
      const issues = validateDirectiveForPersistence({
        userId,
        directive,
        artifact: artifact ?? null,
      });
      diag.validationIssues = issues;
      diag.validationPassed = issues.length === 0;
    } catch (valErr: any) {
      diag.validationError = valErr.message;
    }

    diag.outcome = 'completed';
    diag.finishedAt = new Date().toISOString();
    console.log('[debug/generate] Done:', JSON.stringify({ outcome: diag.outcome, validationPassed: diag.validationPassed }));
    return NextResponse.json(diag);
  } catch (err: any) {
    diag.error = err.message;
    diag.stack = err.stack?.split('\n').slice(0, 5);
    diag.finishedAt = new Date().toISOString();
    console.error('[debug/generate] Error:', err.message);
    return NextResponse.json(diag, { status: 500 });
  }
}
