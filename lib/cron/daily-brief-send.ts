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

function shouldAllowExplicitNoSendEmail(options: DailyBriefSignalWindowOptions): boolean {
  return Boolean(options.userIds?.length) && options.briefInvocationSource !== 'cron_daily_brief';
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
        .select('id, action_type, directive_text, reason, confidence, execution_result, generated_at')
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
            results.push({
              code: 'no_send_blocker_persisted',
              detail: 'Generic no-send blocker persisted without email delivery.',
              meta: {
                action_id: blocker.id,
                daily_email_idempotency_key: dailyEmailIdempotencyKey,
                generic_no_send_suppressed: true,
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
        results.push({
          code: 'no_send_blocker_persisted',
          detail: 'Generic no-send blocker persisted without email delivery.',
          meta: {
            action_id: action.id,
            daily_email_idempotency_key: dailyEmailIdempotencyKey,
            generic_no_send_suppressed: true,
          },
          success: true,
          userId,
        });
        continue;
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
