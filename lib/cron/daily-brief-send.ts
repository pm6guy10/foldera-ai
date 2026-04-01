/**
 * Send stage for the daily brief pipeline.
 * Owns: email delivery, already-sent guard, health summary, runDailySend.
 */

import { createServerClient } from '@/lib/db/client';
import { sendDailyDirective } from '@/lib/email/resend';
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

      // Guard: if any action today was already emailed, do not send again.
      const { data: todayActions } = await supabase
        .from('tkg_actions')
        .select('id, execution_result')
        .eq('user_id', userId)
        .gte('generated_at', todayStart)
        .limit(50);
      const alreadySentAction = (todayActions ?? []).find((row: Record<string, unknown>) => {
        const er =
          row.execution_result && typeof row.execution_result === 'object'
            ? (row.execution_result as Record<string, unknown>)
            : null;
        return typeof er?.daily_brief_sent_at === 'string';
      });
      if (alreadySentAction) {
        results.push({
          code: 'email_already_sent',
          meta: { action_id: alreadySentAction.id as string },
          success: true,
          userId,
        });
        continue;
      }

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
        if (noSendBlocker.id) {
          results.push({
            code: 'no_send_blocker_persisted',
            detail: noSendBlocker.reason ?? 'A no-send blocker was already persisted for today.',
            meta: { action_id: noSendBlocker.id },
            success: true,
            userId,
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
          meta: { action_id: action.id, resend_id: existingResendId },
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
        artifact: extractArtifact(action.execution_result),
      };

      const words = directiveItem.directive.split(/\s+/).slice(0, 6).join(' ');
      const subject = `Foldera: ${words.length > 50 ? `${words.slice(0, 47)}...` : words}`;

      let delivery: unknown;
      try {
        delivery = await sendDailyDirective({ to, directives: [directiveItem], date, subject, userId });
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
          artifact_type: directiveItem.artifact?.type ?? null,
          resend_id: deliveryId,
        },
        success: true,
        userId,
      });
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

  return buildRunResult(date, buildSendMessage(results, eligibleUserIds.length), results);
}
