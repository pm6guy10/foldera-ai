// DEV ONLY — owner-gated diagnostic endpoint. Not user-facing, not part of the product.

import { NextResponse } from 'next/server';
import { resolveUser } from '@/lib/auth/resolve-user';
import { OWNER_USER_ID } from '@/lib/auth/constants';
import { createServerClient } from '@/lib/db/client';
import { runDailyGenerate, isSendWorthy } from '@/lib/cron/daily-brief-generate';
import { getDecisionEnforcementIssues } from '@/lib/briefing/generator';
import { getLastScorerDiagnostics } from '@/lib/briefing/scorer';
import { apiError } from '@/lib/utils/api-error';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

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

    // Retrieve the full scorer diagnostics populated during scoreOpenLoops()
    const scorerDiagnostics = getLastScorerDiagnostics();

    const ownerResult = generate.results.find((row) => row.userId === auth.userId) ?? null;

    const supabase = createServerClient();
    const { data: latestAction } = await supabase
      .from('tkg_actions')
      .select('id, generated_at, action_type, directive_text, reason, confidence, evidence, artifact, execution_result')
      .eq('user_id', auth.userId)
      .gte('generated_at', startedAt)
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Build artifact text
    let artifactText: string | null = null;
    if (latestAction) {
      const artifact =
        latestAction.artifact && typeof latestAction.artifact === 'object'
          ? (latestAction.artifact as Record<string, unknown>)
          : {};
      const executionResult =
        latestAction.execution_result && typeof latestAction.execution_result === 'object'
          ? (latestAction.execution_result as Record<string, unknown>)
          : {};
      const erArtifact =
        executionResult.artifact && typeof executionResult.artifact === 'object'
          ? (executionResult.artifact as Record<string, unknown>)
          : {};
      const merged = { ...erArtifact, ...artifact };
      artifactText = (merged.body ?? merged.text ?? merged.content ?? merged.subject ?? null) as string | null;

      // Send-worthiness check
      const decisionIssues = getDecisionEnforcementIssues({
        actionType: latestAction.action_type ?? '',
        directiveText: latestAction.directive_text ?? '',
        reason: latestAction.reason ?? '',
        artifact: merged,
      });
      const sendWorthiness = isSendWorthy(
        {
          directive: latestAction.directive_text ?? '',
          action_type: (latestAction.action_type ?? 'do_nothing') as 'send_message' | 'write_document' | 'do_nothing' | 'schedule' | 'make_decision' | 'research',
          confidence: typeof latestAction.confidence === 'number' ? latestAction.confidence : 0,
          reason: latestAction.reason ?? '',
          evidence: Array.isArray(latestAction.evidence) ? latestAction.evidence as Array<{ description: string; type: 'signal' | 'commitment' | 'goal' | 'pattern' }> : [],
        },
        merged as never,
      );

      return NextResponse.json({
        ok: true,
        started_at: startedAt,
        // ── SCORER DIAGNOSTICS (the full drop receipt) ────────────────────
        scorer_diagnostics: scorerDiagnostics,
        // ── FINAL OUTPUT ──────────────────────────────────────────────────
        final_action: {
          action_id: latestAction.id,
          action_type: latestAction.action_type,
          confidence: latestAction.confidence,
          directive_text: latestAction.directive_text,
          reason: latestAction.reason,
        },
        full_artifact_text: artifactText,
        decision_enforcement: {
          passed: decisionIssues.length === 0,
          issues: decisionIssues,
        },
        send_worthiness: sendWorthiness,
        generate_stage_result: ownerResult,
      });
    }

    // No action persisted — return diagnostics anyway
    return NextResponse.json({
      ok: false,
      started_at: startedAt,
      blocker: 'no_fresh_action_persisted',
      scorer_diagnostics: scorerDiagnostics,
      generate_stage_result: ownerResult,
    });
  } catch (error: unknown) {
    // Even on error, try to return whatever diagnostics were captured
    const scorerDiagnostics = getLastScorerDiagnostics();
    const baseError = apiError(error, 'dev/brain-receipt');
    const errorBody = error instanceof Error ? error.message : String(error);
    return NextResponse.json({
      ok: false,
      error: errorBody,
      scorer_diagnostics: scorerDiagnostics,
    }, { status: 500 });
  }
}
