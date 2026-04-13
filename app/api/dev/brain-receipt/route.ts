// DEV ONLY — owner-gated diagnostic endpoint
// Not user-facing, not part of the product

import { NextResponse } from 'next/server';
import { resolveUser } from '@/lib/auth/resolve-user';
import { OWNER_USER_ID } from '@/lib/auth/constants';
import { createServerClient } from '@/lib/db/client';
import {
  runDailyGenerate,
  isSendWorthy,
  evaluateBottomGate,
  effectiveDiscrepancyClassForGates,
} from '@/lib/cron/daily-brief-generate';
import { getDecisionEnforcementIssues } from '@/lib/briefing/generator';
import {
  directiveLooksLikeScheduleConflict,
  scheduleConflictArtifactHasResolutionShape,
  scheduleConflictArtifactIsMessageShaped,
  scheduleConflictArtifactIsOwnerProcedure,
} from '@/lib/briefing/schedule-conflict-guards';
import { getLastScorerDiagnostics } from '@/lib/briefing/scorer';
import type { ActionType, ConvictionArtifact, ConvictionDirective, GenerationRunLog } from '@/lib/briefing/types';
import { apiError } from '@/lib/utils/api-error';
import { getRequestId, REQUEST_ID_HEADER } from '@/lib/utils/request-id';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(request: Request) {
  const auth = await resolveUser(request);
  if (auth instanceof NextResponse) return auth;
  if (auth.userId !== OWNER_USER_ID) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    let verificationStubPersist = false;
    let verificationGoldenPathWriteDocument = true;
    try {
      const ct = request.headers.get('content-type') ?? '';
      if (ct.includes('application/json')) {
        const body = (await request.json()) as Record<string, unknown>;
        verificationStubPersist = body.verification_stub_persist === true;
        if (body.verification_golden_path_write_document === false) {
          verificationGoldenPathWriteDocument = false;
        }
      }
    } catch {
      verificationStubPersist = false;
    }

    const startedAt = new Date().toISOString();
    const generate = await runDailyGenerate({
      userIds: [auth.userId],
      skipStaleGate: true,
      skipSpendCap: true,
      skipManualCallLimit: true,
      forceFreshRun: true,
      briefInvocationSource: verificationStubPersist
        ? 'dev_brain_receipt_verification'
        : 'dev_brain_receipt',
      verificationStubPersist,
      ...(verificationStubPersist ? { verificationGoldenPathWriteDocument } : {}),
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
      const generationLog: GenerationRunLog | undefined =
        executionResult.generation_log && typeof executionResult.generation_log === 'object'
          ? (executionResult.generation_log as GenerationRunLog)
          : undefined;

      const directiveForGates = {
        directive: latestAction.directive_text ?? '',
        action_type: (latestAction.action_type ?? 'do_nothing') as ActionType,
        confidence: typeof latestAction.confidence === 'number' ? latestAction.confidence : 0,
        reason: latestAction.reason ?? '',
        evidence: Array.isArray(latestAction.evidence)
          ? (latestAction.evidence as Array<{ description: string; type: 'signal' | 'commitment' | 'goal' | 'pattern' }>)
          : [],
        generationLog,
      };
      const discrepancyClassResolved = effectiveDiscrepancyClassForGates(directiveForGates);
      const directiveForGatesWithClass: ConvictionDirective = {
        ...directiveForGates,
        ...(discrepancyClassResolved
          ? { discrepancyClass: discrepancyClassResolved as NonNullable<ConvictionDirective['discrepancyClass']> }
          : {}),
      };

      const decisionIssues = getDecisionEnforcementIssues({
        actionType: latestAction.action_type ?? '',
        directiveText: latestAction.directive_text ?? '',
        reason: latestAction.reason ?? '',
        artifact: merged,
        discrepancyClass: discrepancyClassResolved,
      });

      const sendWorthiness = isSendWorthy(directiveForGatesWithClass, merged as never);

      const bottomGate = evaluateBottomGate(directiveForGatesWithClass, merged as unknown as ConvictionArtifact);

      const titlePart = typeof merged.title === 'string' ? merged.title : '';
      const contentPart = typeof merged.content === 'string' ? merged.content : '';
      const finishedWorkBody = `${titlePart}\n${contentPart}`.trim();
      const topCandidateType =
        generationLog?.candidateDiscovery?.topCandidates?.[0]?.candidateType;
      const isDiscrepancyWinner = topCandidateType === 'discrepancy' || topCandidateType === 'insight';

      const scheduleConflictFinishedWorkApplies =
        latestAction.action_type === 'write_document' &&
        directiveLooksLikeScheduleConflict(directiveForGatesWithClass);
      const discrepancyFinishedWorkApplies =
        isDiscrepancyWinner &&
        (latestAction.action_type === 'write_document' || latestAction.action_type === 'send_message');

      const finishedWorkApplies =
        scheduleConflictFinishedWorkApplies || discrepancyFinishedWorkApplies;

      const scheduleConflictFinishedWorkFailed =
        scheduleConflictFinishedWorkApplies &&
        (scheduleConflictArtifactIsOwnerProcedure(finishedWorkBody) ||
          scheduleConflictArtifactIsMessageShaped(finishedWorkBody) ||
          !scheduleConflictArtifactHasResolutionShape(finishedWorkBody));
      const discrepancyFinishedWorkFailed =
        discrepancyFinishedWorkApplies &&
        bottomGate.blocked_reasons.includes('FINISHED_WORK_REQUIRED');

      const finishedWorkFailed =
        scheduleConflictFinishedWorkFailed || discrepancyFinishedWorkFailed;

      const inspection =
        executionResult.inspection && typeof executionResult.inspection === 'object'
          ? (executionResult.inspection as Record<string, unknown>)
          : null;
      const winnerSelectionTrace = inspection?.winner_selection_trace ?? null;
      const activeGoalsFromLog =
        generationLog?.brief_context_debug?.active_goals ?? null;

      const ownerMeta =
        ownerResult?.meta && typeof ownerResult.meta === 'object'
          ? (ownerResult.meta as Record<string, unknown>)
          : null;

      return NextResponse.json({
        ok: true,
        started_at: startedAt,
        verification_stub_persist: verificationStubPersist,
        verification_golden_path_write_document: verificationStubPersist
          ? verificationGoldenPathWriteDocument
          : null,
        ...(ownerMeta?.pipeline_run_id || ownerMeta?.cron_invocation_id
          ? {
              pipeline_run: {
                pipeline_run_id: ownerMeta.pipeline_run_id ?? null,
                cron_invocation_id: ownerMeta.cron_invocation_id ?? null,
              },
            }
          : {}),
        // ── SCORER DIAGNOSTICS (the full drop receipt) ────────────────────
        scorer_diagnostics: scorerDiagnostics,
        // ── PERSISTED GENERATION TRACE (same row the email preview uses) ─
        generation_log: generationLog ?? null,
        winner_selection_trace: winnerSelectionTrace,
        inspection,
        active_goals: activeGoalsFromLog,
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
        bottom_gate: bottomGate,
        finished_work_gate: {
          applies: finishedWorkApplies,
          failed: finishedWorkFailed,
          blocked_reason: finishedWorkFailed ? 'FINISHED_WORK_REQUIRED' : null,
          aligns_with_bottom_gate:
            !finishedWorkApplies ||
            finishedWorkFailed === bottomGate.blocked_reasons.includes('FINISHED_WORK_REQUIRED'),
        },
        generate_stage_result: ownerResult,
      });
    }

    // No action persisted — return diagnostics anyway
    const failMeta =
      ownerResult?.meta && typeof ownerResult.meta === 'object'
        ? (ownerResult.meta as Record<string, unknown>)
        : null;
    return NextResponse.json({
      ok: false,
      started_at: startedAt,
      verification_stub_persist: verificationStubPersist,
      verification_golden_path_write_document: verificationStubPersist
        ? verificationGoldenPathWriteDocument
        : null,
      ...(failMeta?.pipeline_run_id || failMeta?.cron_invocation_id
        ? {
            pipeline_run: {
              pipeline_run_id: failMeta.pipeline_run_id ?? null,
              cron_invocation_id: failMeta.cron_invocation_id ?? null,
            },
          }
        : {}),
      blocker: 'no_fresh_action_persisted',
      scorer_diagnostics: scorerDiagnostics,
      generate_stage_result: ownerResult,
    });
  } catch (error: unknown) {
    const scorerDiagnostics = getLastScorerDiagnostics();
    const requestId = getRequestId();
    void apiError(error, 'dev/brain-receipt', requestId);
    const errorBody = error instanceof Error ? error.message : String(error);
    const hdrs = requestId ? { [REQUEST_ID_HEADER]: requestId } : undefined;
    return NextResponse.json({
      ok: false,
      error: errorBody,
      scorer_diagnostics: scorerDiagnostics,
      ...(requestId ? { requestId } : {}),
    }, { status: 500, headers: hdrs });
  }
}
