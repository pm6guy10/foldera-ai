/**
 * Send stage for the daily brief pipeline.
 * Owns: email delivery, already-sent guard, health summary, runDailySend.
 */

import { createServerClient } from '@/lib/db/client';
import {
  isInternalFailureText,
  NO_SEND_BODY_TEXT,
  NO_SEND_DIRECTIVE_TEXT,
  NO_SEND_SUBJECT,
  sanitizeDirectiveForDelivery,
  sendDailyDirective,
  sendDailyDeliverySkipAlert,
} from '@/lib/email/resend';
import type { DirectiveItem } from '@/lib/email/resend';
import { getVerifiedDailyBriefRecipientEmail } from '@/lib/auth/daily-brief-users';
import { logStructuredEvent } from '@/lib/utils/structured-logger';
import type {
  DailyBriefRunResult,
  DailyBriefSignalWindowOptions,
  DailyBriefUserResult,
  QuietHoldReceipt,
} from './daily-brief-types';
import { buildRunResult, buildSendMessage } from './daily-brief-status';
import {
  artifactTypeForAction,
  extractArtifact,
  extractSentAt,
  findPersistedNoSendBlocker,
  ptDayStartIso,
  resolveDailyBriefUserIds,
} from './daily-brief-generate';
import { listConnectedUserIds } from '@/lib/auth/user-tokens';
import { mergePipelineRunDelivery } from '@/lib/observability/pipeline-run';
import { evaluateArtifactQualityGate } from '@/lib/briefing/artifact-quality-gate';
import type { ActionType, EvidenceItem } from '@/lib/briefing/types';

function buildDailyEmailIdempotencyKey(userId: string, ptDayIso: string): string {
  return `daily-brief:${userId}:${ptDayIso.slice(0, 10)}`;
}

function extractResendId(executionResult: Record<string, unknown> | null): string | null {
  return executionResult && typeof executionResult.resend_id === 'string'
    ? executionResult.resend_id
    : null;
}

function extractDailyEmailIdempotencyKey(executionResult: Record<string, unknown> | null): string | null {
  return executionResult && typeof executionResult.daily_email_idempotency_key === 'string'
    ? executionResult.daily_email_idempotency_key
    : null;
}

function isGenericNoSendText(value: string | null | undefined): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  return (
    trimmed === NO_SEND_DIRECTIVE_TEXT ||
    trimmed.startsWith('Nothing cleared the bar today') ||
    trimmed === NO_SEND_BODY_TEXT ||
    isInternalFailureText(trimmed)
  );
}

function readObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function normalizeQuietHoldReason(reason: unknown): string | null {
  if (typeof reason !== 'string') return null;
  const trimmed = reason.trim();
  if (!trimmed) return null;

  if (
    isGenericNoSendText(trimmed) ||
    isInternalFailureText(trimmed) ||
    /\b(batch:\s*\d+|invalid_request_error|request_id|api usage limits|quota|llm_failed|candidate_blocked|all candidates blocked)\b/i.test(trimmed) ||
    /\breq_[A-Za-z0-9]+\b/.test(trimmed)
  ) {
    return 'no_finished_artifact_available';
  }

  if (trimmed.startsWith('blocked_marker:')) {
    return 'interview_prep_marker';
  }

  const codeLike = trimmed.match(/^[a-z0-9_:-]+$/i);
  if (codeLike) return trimmed;

  return trimmed.length > 120 ? `${trimmed.slice(0, 117)}...` : trimmed;
}

function inferCandidatesEvaluated(executionResult: Record<string, unknown>): number | undefined {
  const generationLog = readObject(executionResult.generation_log);
  const direct =
    typeof generationLog?.candidates_evaluated === 'number'
      ? generationLog.candidates_evaluated
      : typeof generationLog?.candidatesEvaluated === 'number'
        ? generationLog.candidatesEvaluated
        : undefined;
  if (typeof direct === 'number' && Number.isFinite(direct)) return direct;

  const candidateDiscovery = readObject(generationLog?.candidateDiscovery);
  const discoveryValue =
    typeof candidateDiscovery?.candidates_evaluated === 'number'
      ? candidateDiscovery.candidates_evaluated
      : typeof candidateDiscovery?.candidatesEvaluated === 'number'
        ? candidateDiscovery.candidatesEvaluated
        : undefined;
  if (typeof discoveryValue === 'number' && Number.isFinite(discoveryValue)) {
    return discoveryValue;
  }

  const topCandidates = Array.isArray(candidateDiscovery?.topCandidates)
    ? candidateDiscovery.topCandidates.length
    : undefined;
  return topCandidates && topCandidates > 0 ? topCandidates : undefined;
}

function buildQuietHoldReceipt(input: {
  executionResult?: Record<string, unknown>;
  checkedAt?: string;
  blockedReasons?: unknown[];
  fallbackReason?: unknown;
  candidatesEvaluated?: number;
}): QuietHoldReceipt {
  const executionResult = input.executionResult ?? {};
  const generationLog = readObject(executionResult.generation_log);
  const noSend = readObject(executionResult.no_send);
  const reasons = [
    ...(input.blockedReasons ?? []),
    input.fallbackReason,
    noSend?.reason,
    generationLog?.reason,
    ...readStringArray(generationLog?.candidateFailureReasons),
  ]
    .map(normalizeQuietHoldReason)
    .filter((reason): reason is string => Boolean(reason));
  const inferredCandidatesEvaluated = inferCandidatesEvaluated(executionResult);

  return {
    status: 'held_no_finished_artifact',
    checked_at: input.checkedAt ?? new Date().toISOString(),
    ...(typeof input.candidatesEvaluated === 'number'
      ? { candidates_evaluated: input.candidatesEvaluated }
      : typeof inferredCandidatesEvaluated === 'number'
        ? { candidates_evaluated: inferredCandidatesEvaluated }
        : {}),
    blocked_reasons_summary: [...new Set(reasons.length > 0 ? reasons : ['no_finished_artifact_available'])],
    next_retry_trigger: 'next_scheduled_daily_send',
    delivery: 'silent',
  };
}

function hasValidEmailArtifact(
  artifact: ReturnType<typeof extractArtifact>,
): artifact is Extract<NonNullable<ReturnType<typeof extractArtifact>>, { type: 'email' }> {
  if (!artifact || artifact.type !== 'email') return false;
  const to = typeof artifact.to === 'string' ? artifact.to.trim() : '';
  const subject = typeof artifact.subject === 'string' ? artifact.subject.trim() : '';
  const body = typeof artifact.body === 'string' ? artifact.body.trim() : '';
  return to.includes('@') && subject.length > 0 && body.length > 0;
}

function hasValidDocumentArtifact(
  artifact: ReturnType<typeof extractArtifact>,
): artifact is Extract<NonNullable<ReturnType<typeof extractArtifact>>, { type: 'document' }> {
  if (!artifact || artifact.type !== 'document') return false;
  const title = typeof artifact.title === 'string' ? artifact.title.trim() : '';
  const content = typeof artifact.content === 'string' ? artifact.content.trim() : '';
  return title.length > 0 && content.length > 0;
}

function hasRealDeliverableArtifact(
  actionType: string | null | undefined,
  artifact: ReturnType<typeof extractArtifact>,
): boolean {
  const normalized = typeof actionType === 'string' ? actionType.trim().toLowerCase() : '';
  if (normalized === 'send_message') {
    return hasValidEmailArtifact(artifact);
  }
  if (normalized === 'write_document') {
    return hasValidDocumentArtifact(artifact);
  }
  return false;
}

const INTERVIEW_BAD_ARTIFACT_PATTERNS = [
  /\binterview prep\b/i,
  /\bQ1:/i,
  /\bQ2:/i,
  /\bQ3:/i,
  /\bQ4:/i,
  /THREE THINGS TO KEEP COMING BACK TO/i,
  /\bAsk them:/i,
  /generic bullet-answer prep format/i,
  /prepare examples/i,
  /prep checklist/i,
  /\bSTAR\b(?:\s+as\s+a\s+framework)?/i,
  /\baction items\b/i,
  /dress code/i,
  /business casual/i,
  /what to wear/i,
  /review the website/i,
  /generic coaching/i,
  /checklist framing/i,
];

function isLikelyInterviewDocumentText(text: string): boolean {
  return /\b(interview|recruitment|hiring|role-fit|phone screen|technician interview|answer packet)\b/i.test(text);
}

function hasFinishedInterviewDocumentPurpose(text: string): boolean {
  return /\b(role-fit answer|hiring fit answer packet|role fit answer|interview answer packet|finished answer packet)\b/i.test(text);
}

function hasUsableFirstPersonAnswer(text: string): boolean {
  return /First-person answer:\s*I\b[\s\S]{80,}/i.test(text) ||
    /\bI (?:am|have|can|would|bring|built|led|handled|solve|support)\b[\s\S]{120,}/i.test(text);
}

function hasSourceGrounding(text: string): boolean {
  return /\bSOURCE\b/i.test(text) ||
    /\bSource Email:/i.test(text) ||
    /\bContact \/ thread:/i.test(text) ||
    /\bsource\/context\b/i.test(text) ||
    /\bevidence\b/i.test(text);
}

function getInterviewDocumentSuppressionReasons(
  actionType: string | null | undefined,
  artifact: ReturnType<typeof extractArtifact>,
  directiveText: string | null | undefined,
  reason: string | null | undefined,
): string[] {
  const normalizedAction = typeof actionType === 'string' ? actionType.trim().toLowerCase() : '';
  if (normalizedAction !== 'write_document' || !artifact || artifact.type !== 'document') {
    return [];
  }

  const title = typeof artifact.title === 'string' ? artifact.title : '';
  const content = typeof artifact.content === 'string' ? artifact.content : '';
  const documentPurpose =
    'document_purpose' in artifact && typeof artifact.document_purpose === 'string'
      ? artifact.document_purpose
      : '';
  const text = [
    title,
    documentPurpose,
    content,
    typeof directiveText === 'string' ? directiveText : '',
    typeof reason === 'string' ? reason : '',
  ].join('\n');

  if (!isLikelyInterviewDocumentText(text)) {
    return [];
  }

  const reasons = INTERVIEW_BAD_ARTIFACT_PATTERNS
    .filter((pattern) => pattern.test(text))
    .map((pattern) => `blocked_marker:${pattern.source}`);

  if (!hasFinishedInterviewDocumentPurpose(text)) {
    reasons.push('missing_finished_interview_document_purpose');
  }
  if (!hasUsableFirstPersonAnswer(text)) {
    reasons.push('missing_usable_first_person_answer');
  }
  if (!hasSourceGrounding(text)) {
    reasons.push('missing_source_context_grounding');
  }

  return reasons;
}

function shouldAllowExplicitNoSendEmail(options: DailyBriefSignalWindowOptions): boolean {
  return false;
}

async function findExistingSameDayEmailDelivery(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
  todayStart: string,
  currentActionId: string,
  idempotencyKey: string,
): Promise<{
  actionId: string;
  dailyBriefSentAt: string | null;
  resendId: string | null;
  dailyEmailIdempotencyKey: string | null;
} | null> {
  const { data, error } = await supabase
    .from('tkg_actions')
    .select('id, execution_result, generated_at')
    .eq('user_id', userId)
    .gte('generated_at', todayStart)
    .order('generated_at', { ascending: false })
    .limit(25);

  if (error) return null;

  for (const row of data ?? []) {
    if (row.id === currentActionId) continue;
    const executionResult =
      row.execution_result && typeof row.execution_result === 'object'
        ? (row.execution_result as Record<string, unknown>)
        : null;
    const sentAt = extractSentAt(executionResult ?? {});
    const resendId = extractResendId(executionResult);
    if (!sentAt && !resendId) continue;

    const existingKey = extractDailyEmailIdempotencyKey(executionResult);
    if (existingKey && existingKey !== idempotencyKey) continue;

    return {
      actionId: row.id as string,
      dailyBriefSentAt: sentAt,
      resendId,
      dailyEmailIdempotencyKey: existingKey,
    };
  }

  return null;
}

export async function runDailySend(
  options: DailyBriefSignalWindowOptions = {},
): Promise<DailyBriefRunResult> {
  const supabase = createServerClient();
  const date = new Date().toISOString().slice(0, 10);
  // Use PT-anchored day boundary (08:00 UTC) so evening test/manual sends
  // don't block the 11:00 UTC (4 AM PT) cron from delivering the morning email.
  const todayStart = ptDayStartIso();

  const eligibleUserIds = await resolveDailyBriefUserIds(options.userIds);
  if (eligibleUserIds.length === 0) {
    return buildRunResult(date, 'No eligible users.', []);
  }

  const results: DailyBriefUserResult[] = [];

  for (const userId of eligibleUserIds) {
    try {
      const to = await getVerifiedDailyBriefRecipientEmail(userId, supabase);
      if (!to) {
        results.push({ code: 'no_verified_email', success: false, userId });
        continue;
      }
      const dailyEmailIdempotencyKey = buildDailyEmailIdempotencyKey(userId, todayStart);

      const { data: actions, error: actionsError } = await supabase
        .from('tkg_actions')
        .select('id, action_type, directive_text, reason, confidence, evidence, execution_result, generated_at')
        .eq('user_id', userId)
        .eq('status', 'pending_approval')
        .gte('generated_at', todayStart)
        .order('confidence', { ascending: false })
        .limit(10);

      if (actionsError) {
        results.push({
          code: 'directive_lookup_failed',
          detail: actionsError.message,
          success: false,
          userId,
        });
        continue;
      }

      const action = actions?.find((candidate) => {
        const executionResult =
          candidate.execution_result && typeof candidate.execution_result === 'object'
            ? (candidate.execution_result as Record<string, unknown>)
            : null;
        return extractArtifact(executionResult) !== null;
      });

      if (!action) {
        const noSendBlocker = await findPersistedNoSendBlocker(supabase, userId, todayStart);
        if (noSendBlocker.error) {
          results.push({
            code: 'directive_lookup_failed',
            detail: noSendBlocker.error.message,
            success: false,
            userId,
          });
          continue;
        }

        if (noSendBlocker.blocker) {
          const blocker = noSendBlocker.blocker;
          const blockerExecutionResult = blocker.executionResult ?? {};
          const blockerSentAt = extractSentAt(blockerExecutionResult);
          if (blockerSentAt) {
            results.push({
              code: 'email_already_sent',
              meta: {
                action_id: blocker.id,
                daily_brief_sent_at: blockerSentAt,
                daily_email_idempotency_key:
                  extractDailyEmailIdempotencyKey(blockerExecutionResult) ?? dailyEmailIdempotencyKey,
              },
              success: true,
              userId,
            });
            continue;
          }

          const blockerResendId = extractResendId(blockerExecutionResult);
          if (blockerResendId) {
            results.push({
              code: 'email_already_sent',
              meta: {
                action_id: blocker.id,
                resend_id: blockerResendId,
                daily_email_idempotency_key:
                  extractDailyEmailIdempotencyKey(blockerExecutionResult) ?? dailyEmailIdempotencyKey,
              },
              success: true,
              userId,
            });
            continue;
          }

          const existingSameDayDelivery = await findExistingSameDayEmailDelivery(
            supabase,
            userId,
            todayStart,
            blocker.id,
            dailyEmailIdempotencyKey,
          );
          if (existingSameDayDelivery) {
            results.push({
              code: 'email_already_sent',
              meta: {
                action_id: existingSameDayDelivery.actionId,
                ...(existingSameDayDelivery.dailyBriefSentAt
                  ? { daily_brief_sent_at: existingSameDayDelivery.dailyBriefSentAt }
                  : {}),
                ...(existingSameDayDelivery.resendId
                  ? { resend_id: existingSameDayDelivery.resendId }
                  : {}),
                daily_email_idempotency_key:
                  existingSameDayDelivery.dailyEmailIdempotencyKey ?? dailyEmailIdempotencyKey,
              },
              success: true,
              userId,
            });
            continue;
          }

          if (!shouldAllowExplicitNoSendEmail(options)) {
            const quietHoldReceipt = buildQuietHoldReceipt({
              executionResult: blockerExecutionResult,
              blockedReasons: ['generic_no_send_suppressed'],
              fallbackReason: blocker.reason ?? blocker.directiveText,
            });
            const { error: updateError } = await supabase
              .from('tkg_actions')
              .update({
                execution_result: {
                  ...blockerExecutionResult,
                  quiet_hold_receipt: quietHoldReceipt,
                },
              })
              .eq('id', blocker.id);

            if (updateError) {
              results.push({
                code: 'status_update_failed',
                detail: updateError.message,
                success: false,
                userId,
              });
              continue;
            }

            results.push({
              code: 'no_send_blocker_persisted',
              detail: 'Generic no-send blocker persisted without email delivery.',
              meta: {
                action_id: blocker.id,
                daily_email_idempotency_key: dailyEmailIdempotencyKey,
                generic_no_send_suppressed: true,
                quiet_hold_receipt: quietHoldReceipt,
              },
              success: true,
              userId,
            });
            continue;
          }

          const directiveText =
            typeof blocker.directiveText === 'string' && blocker.directiveText.trim().length > 0
              ? blocker.directiveText.trim()
              : 'Nothing cleared the bar today.';

          const blockerArtifact = extractArtifact(blockerExecutionResult);
          const directiveItem: DirectiveItem = {
            id: blocker.id,
            directive: directiveText,
            action_type: blocker.actionType ?? 'do_nothing',
            confidence: blocker.confidence ?? 45,
            reason: (blocker.reason ?? '').split('[score=')[0].trim(),
            artifact: blockerArtifact,
          };
          const safeDirectiveItem = sanitizeDirectiveForDelivery(directiveItem);

          const subject = NO_SEND_SUBJECT;

          let delivery: unknown;
          try {
            delivery = await sendDailyDirective({
              to,
              directives: [safeDirectiveItem],
              date,
              subject,
              userId,
            });
          } catch (sendErr: unknown) {
            logStructuredEvent({
              event: 'daily_send_failed',
              level: 'error',
              userId,
              artifactType: artifactTypeForAction(directiveItem.action_type),
              generationStatus: 'failed',
              details: {
                scope: 'daily-send',
                action_id: blocker.id,
                no_send_blocker: true,
                error: sendErr instanceof Error ? sendErr.message : String(sendErr),
              },
            });
            results.push({
              code: 'email_send_failed',
              detail: sendErr instanceof Error ? sendErr.message : String(sendErr),
              success: false,
              userId,
            });
            continue;
          }

          const deliveryId =
            delivery &&
            typeof delivery === 'object' &&
            'data' in (delivery as Record<string, unknown>) &&
            typeof (delivery as { data?: { id?: unknown } }).data?.id === 'string'
              ? ((delivery as { data?: { id?: string } }).data?.id ?? null)
              : null;

          const { error: updateError } = await supabase
            .from('tkg_actions')
            .update({
              execution_result: {
                ...blockerExecutionResult,
                daily_brief_sent_at: new Date().toISOString(),
                daily_email_idempotency_key: dailyEmailIdempotencyKey,
                ...(deliveryId ? { resend_id: deliveryId } : {}),
              },
            })
            .eq('id', blocker.id);

          if (updateError) {
            results.push({
              code: 'status_update_failed',
              detail: updateError.message,
              success: false,
              userId,
            });
            continue;
          }

          results.push({
            code: 'email_sent',
              meta: {
                action_id: blocker.id,
                artifact_type: safeDirectiveItem.artifact?.type ?? null,
                resend_id: deliveryId,
                daily_email_idempotency_key: dailyEmailIdempotencyKey,
                no_send_blocker: true,
            },
            success: true,
            userId,
          });
          if (options.cronInvocationId) {
            void mergePipelineRunDelivery({
              userId,
              cronInvocationId: options.cronInvocationId,
              delivery: {
                action_id: blocker.id,
                directive_generated_at: blocker.generatedAt,
                email_dispatch_at: new Date().toISOString(),
                resend_id: deliveryId,
                send_result: deliveryId ? 'resend_accepted' : 'resend_no_id_in_response',
              },
            });
          }
          logStructuredEvent({
            event: 'daily_send_complete',
            userId,
            artifactType: artifactTypeForAction(safeDirectiveItem.action_type),
            generationStatus: 'sent',
            details: { scope: 'daily-send', action_id: blocker.id, no_send_blocker: true },
          });
          continue;
        }

        results.push({ code: 'no_generated_directive', success: false, userId });
        continue;
      }

      const executionResult =
        action.execution_result && typeof action.execution_result === 'object'
          ? (action.execution_result as Record<string, unknown>)
          : {};
      const actionArtifact = extractArtifact(action.execution_result);
      if (
        !shouldAllowExplicitNoSendEmail(options) &&
        (
          !hasRealDeliverableArtifact(action.action_type as string, actionArtifact) ||
          isGenericNoSendText(action.directive_text as string | null | undefined) ||
          isGenericNoSendText(action.reason as string | null | undefined)
        )
      ) {
        const quietHoldReceipt = buildQuietHoldReceipt({
          executionResult,
          blockedReasons: ['generic_no_send_suppressed'],
          fallbackReason: action.reason ?? action.directive_text,
        });
        const { error: updateError } = await supabase
          .from('tkg_actions')
          .update({
            execution_result: {
              ...executionResult,
              quiet_hold_receipt: quietHoldReceipt,
            },
          })
          .eq('id', action.id);

        if (updateError) {
          results.push({
            code: 'status_update_failed',
            detail: updateError.message,
            success: false,
            userId,
          });
          continue;
        }

        results.push({
          code: 'no_send_blocker_persisted',
          detail: 'Generic no-send blocker persisted without email delivery.',
          meta: {
            action_id: action.id,
            daily_email_idempotency_key: dailyEmailIdempotencyKey,
            generic_no_send_suppressed: true,
            quiet_hold_receipt: quietHoldReceipt,
          },
          success: true,
          userId,
        });
        continue;
      }
      const interviewSuppressionReasons = !shouldAllowExplicitNoSendEmail(options)
        ? getInterviewDocumentSuppressionReasons(
            action.action_type as string | null | undefined,
            actionArtifact,
            action.directive_text as string | null | undefined,
            action.reason as string | null | undefined,
          )
        : [];
      if (interviewSuppressionReasons.length > 0) {
        const quietHoldReceipt = buildQuietHoldReceipt({
          executionResult,
          blockedReasons: ['interview_write_document_quality_blocked', ...interviewSuppressionReasons],
          fallbackReason: action.reason,
        });
        const suppression = {
          code: 'interview_write_document_quality_blocked',
          suppressed_at: new Date().toISOString(),
          reasons: interviewSuppressionReasons,
          daily_email_idempotency_key: dailyEmailIdempotencyKey,
        };
        const { error: updateError } = await supabase
          .from('tkg_actions')
          .update({
            execution_result: {
              ...executionResult,
              daily_send_suppression: suppression,
              quiet_hold_receipt: quietHoldReceipt,
            },
          })
          .eq('id', action.id);

        if (updateError) {
          results.push({
            code: 'status_update_failed',
            detail: updateError.message,
            success: false,
            userId,
          });
          continue;
        }

        results.push({
          code: 'no_send_blocker_persisted',
          detail: 'Interview write_document suppressed at send time because it failed the finished-work email bar.',
          meta: {
            action_id: action.id,
            daily_email_idempotency_key: dailyEmailIdempotencyKey,
            interview_write_document_suppressed: true,
            suppression_code: suppression.code,
            suppression_reasons: interviewSuppressionReasons,
            quiet_hold_receipt: quietHoldReceipt,
          },
          success: true,
          userId,
        });
        continue;
      }
      if (!shouldAllowExplicitNoSendEmail(options) && actionArtifact) {
        const artifactQualityGate = evaluateArtifactQualityGate({
          directive: {
            action_type: (action.action_type as ActionType | null) ?? 'do_nothing',
            directive: typeof action.directive_text === 'string' ? action.directive_text : '',
            reason: typeof action.reason === 'string' ? action.reason : '',
            evidence: Array.isArray((action as { evidence?: unknown }).evidence)
              ? ((action as { evidence?: unknown }).evidence as EvidenceItem[])
              : [],
          },
          artifact: actionArtifact,
        });

        if (!artifactQualityGate.passes) {
          const quietHoldReceipt = buildQuietHoldReceipt({
            executionResult,
            blockedReasons: ['artifact_quality_gate_blocked', ...artifactQualityGate.reasons],
            fallbackReason: action.reason,
          });
          const suppression = {
            code: 'artifact_quality_gate_blocked',
            suppressed_at: new Date().toISOString(),
            category: artifactQualityGate.category,
            reasons: artifactQualityGate.reasons,
            daily_email_idempotency_key: dailyEmailIdempotencyKey,
          };
          const { error: updateError } = await supabase
            .from('tkg_actions')
            .update({
              execution_result: {
                ...executionResult,
                daily_send_suppression: suppression,
                quiet_hold_receipt: quietHoldReceipt,
              },
            })
            .eq('id', action.id);

          if (updateError) {
            results.push({
              code: 'status_update_failed',
              detail: updateError.message,
              success: false,
              userId,
            });
            continue;
          }

          logStructuredEvent({
            event: 'artifact_quality_gate_blocked',
            level: 'warn',
            userId,
            artifactType: artifactTypeForAction(action.action_type as string | null | undefined),
            generationStatus: 'send_suppressed',
            details: {
              scope: 'daily-send',
              action_id: action.id,
              category: artifactQualityGate.category,
              reasons: artifactQualityGate.reasons,
            },
          });

          results.push({
            code: 'no_send_blocker_persisted',
            detail: 'Persisted artifact suppressed at send time because it failed the artifact quality gate.',
            meta: {
              action_id: action.id,
              daily_email_idempotency_key: dailyEmailIdempotencyKey,
              artifact_quality_gate_suppressed: true,
              suppression_code: suppression.code,
              suppression_reasons: artifactQualityGate.reasons,
              suppression_category: artifactQualityGate.category,
              quiet_hold_receipt: quietHoldReceipt,
            },
            success: true,
            userId,
          });
          continue;
        }
      }
      const sentAt = extractSentAt(executionResult);
      if (sentAt) {
        results.push({
          code: 'email_already_sent',
          meta: { action_id: action.id, daily_brief_sent_at: sentAt },
          success: true,
          userId,
        });
        continue;
      }

      // Idempotency guard: if a resend_id is already stored, the email was sent in a previous
      // run that may have crashed after delivery but before the sent_at update. Skip re-sending.
      const existingResendId = typeof executionResult.resend_id === 'string' ? executionResult.resend_id : null;
      if (existingResendId) {
        results.push({
          code: 'email_already_sent',
          meta: {
            action_id: action.id,
            resend_id: existingResendId,
            daily_email_idempotency_key:
              extractDailyEmailIdempotencyKey(executionResult) ?? dailyEmailIdempotencyKey,
          },
          success: true,
          userId,
        });
        continue;
      }

      const directiveItem: DirectiveItem = {
        id: action.id,
        directive: action.directive_text as string,
        action_type: action.action_type as string,
        confidence: (action.confidence as number) ?? 0,
        reason: ((action.reason as string) ?? '').split('[score=')[0].trim(),
        artifact: actionArtifact,
      };
      const safeDirectiveItem = sanitizeDirectiveForDelivery(directiveItem);

      const words = safeDirectiveItem.directive.split(/\s+/).slice(0, 6).join(' ');
      const subject = `Foldera: ${words.length > 50 ? `${words.slice(0, 47)}...` : words}`;

      let delivery: unknown;
      try {
        delivery = await sendDailyDirective({ to, directives: [safeDirectiveItem], date, subject, userId });
      } catch (sendErr: unknown) {
        logStructuredEvent({
          event: 'daily_send_failed',
          level: 'error',
          userId,
          artifactType: artifactTypeForAction(action.action_type as string | null | undefined),
          generationStatus: 'failed',
          details: {
            scope: 'daily-send',
            error: sendErr instanceof Error ? sendErr.message : String(sendErr),
          },
        });
        results.push({
          code: 'email_send_failed',
          detail: sendErr instanceof Error ? sendErr.message : String(sendErr),
          success: false,
          userId,
        });
        continue;
      }

      const deliveryId =
        delivery &&
        typeof delivery === 'object' &&
        'data' in (delivery as Record<string, unknown>) &&
        typeof (delivery as { data?: { id?: unknown } }).data?.id === 'string'
          ? ((delivery as { data?: { id?: string } }).data?.id ?? null)
          : null;

      const { error: updateError } = await supabase
        .from('tkg_actions')
        .update({
          execution_result: {
            ...executionResult,
            daily_brief_sent_at: new Date().toISOString(),
            daily_email_idempotency_key: dailyEmailIdempotencyKey,
            ...(deliveryId ? { resend_id: deliveryId } : {}),
          },
        })
        .eq('id', action.id);

      if (updateError) {
        results.push({
          code: 'status_update_failed',
          detail: updateError.message,
          success: false,
          userId,
        });
        continue;
      }

      results.push({
        code: 'email_sent',
        meta: {
          action_id: action.id,
          artifact_type: safeDirectiveItem.artifact?.type ?? null,
          resend_id: deliveryId,
          daily_email_idempotency_key: dailyEmailIdempotencyKey,
        },
        success: true,
        userId,
      });
      if (options.cronInvocationId) {
        void mergePipelineRunDelivery({
          userId,
          cronInvocationId: options.cronInvocationId,
          delivery: {
            action_id: action.id,
            directive_generated_at:
              typeof action.generated_at === 'string' ? action.generated_at : null,
            email_dispatch_at: new Date().toISOString(),
            resend_id: deliveryId,
            send_result: deliveryId ? 'resend_accepted' : 'resend_no_id_in_response',
          },
        });
      }
      logStructuredEvent({
        event: 'daily_send_complete',
        userId,
        artifactType: artifactTypeForAction(action.action_type as string | null | undefined),
        generationStatus: 'sent',
        details: { scope: 'daily-send', action_id: action.id },
      });
    } catch (err: unknown) {
      logStructuredEvent({
        event: 'daily_send_failed',
        level: 'error',
        userId,
        artifactType: null,
        generationStatus: 'failed',
        details: {
          scope: 'daily-send',
          error: err instanceof Error ? err.message : String(err),
        },
      });
      results.push({
        code: 'email_send_failed',
        detail: err instanceof Error ? err.message : String(err),
        success: false,
        userId,
      });
    }
  }

  const totalConnectedUsers = (await listConnectedUserIds(supabase)).length;
  const emailsSent = results.filter((r) => r.code === 'email_sent').length;
  const gotEmailOrAlready = new Set(['email_sent', 'email_already_sent', 'no_send_blocker_persisted']);
  const skips = results
    .filter((r) => r.userId && !gotEmailOrAlready.has(r.code))
    .map((r) => ({
      userId: r.userId as string,
      code: r.code,
      detail: typeof r.detail === 'string' ? r.detail : undefined,
    }));

  if (skips.length > 0) {
    try {
      await sendDailyDeliverySkipAlert({
        date,
        totalConnectedUsers,
        batchUserCount: eligibleUserIds.length,
        emailsSent,
        skips,
      });
    } catch (auditErr: unknown) {
      console.error(
        '[daily-send] delivery audit email failed:',
        auditErr instanceof Error ? auditErr.message : String(auditErr),
      );
    }
  }

  return buildRunResult(date, buildSendMessage(results, eligibleUserIds.length), results);
}
