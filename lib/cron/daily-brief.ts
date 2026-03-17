import { createServerClient } from '@/lib/db/client';
import { generateDirective } from '@/lib/briefing/generator';
import { generateArtifact } from '@/lib/conviction/artifact-generator';
import { extractFromConversation } from '@/lib/extraction/conversation-extractor';
import { processUnextractedSignals } from '@/lib/signals/signal-processor';
import { summarizeSignals } from '@/lib/signals/summarizer';
import { sendDailyDirective } from '@/lib/email/resend';
import type { DirectiveItem } from '@/lib/email/resend';
import type { ConvictionArtifact } from '@/lib/briefing/types';
import {
  filterDailyBriefEligibleUserIds,
  getVerifiedDailyBriefRecipientEmail,
} from '@/lib/auth/daily-brief-users';
import { logStructuredEvent } from '@/lib/utils/structured-logger';

type DailyBriefFailureCode =
  | 'generation_failed'
  | 'artifact_generation_failed'
  | 'directive_persist_failed'
  | 'no_verified_email'
  | 'directive_lookup_failed'
  | 'no_generated_directive'
  | 'email_send_failed'
  | 'status_update_failed';

type DailyBriefSuccessCode = 'generated' | 'sent' | 'nothing_today';

export interface DailyBriefUserResult {
  code: DailyBriefFailureCode | DailyBriefSuccessCode;
  success: boolean;
}

export interface DailyBriefRunResult {
  date: string;
  message: string;
  results: DailyBriefUserResult[];
  succeeded: number;
  total: number;
}

export interface SafeDailyBriefStageStatus {
  attempted: number;
  errors: string[];
  failed: number;
  status: 'ok' | 'partial' | 'failed' | 'skipped';
  succeeded: number;
  summary: string;
}

const CONFIDENCE_THRESHOLD = 70;

const SAFE_ERROR_MESSAGES: Record<DailyBriefFailureCode, string> = {
  generation_failed: 'Directive generation failed.',
  artifact_generation_failed: 'Artifact generation failed.',
  directive_persist_failed: 'Directive save failed.',
  no_verified_email: 'No verified recipient email was available.',
  directive_lookup_failed: 'Generated brief lookup failed.',
  no_generated_directive: 'No generated brief was available to send.',
  email_send_failed: 'Email delivery failed.',
  status_update_failed: 'Action status update failed.',
};

function artifactTypeForAction(actionType: string | null | undefined): string | null {
  switch (actionType) {
    case 'send_message':
      return 'drafted_email';
    case 'make_decision':
      return 'decision_frame';
    case 'do_nothing':
      return 'wait_rationale';
    default:
      return null;
  }
}

function extractArtifact(executionResult: unknown): ConvictionArtifact | null {
  if (!executionResult || typeof executionResult !== 'object') {
    return null;
  }

  const artifact = (executionResult as Record<string, unknown>).artifact;
  if (!artifact || typeof artifact !== 'object') {
    return null;
  }

  return artifact as ConvictionArtifact;
}

async function getEligibleDailyBriefUserIds(): Promise<string[]> {
  const supabase = createServerClient();
  const { data: entities, error } = await supabase
    .from('tkg_entities')
    .select('user_id')
    .eq('name', 'self');

  if (error) {
    throw error;
  }

  const userIds = [...new Set((entities ?? []).map((entity: { user_id: string }) => entity.user_id))];
  if (userIds.length === 0) {
    return [];
  }

  return filterDailyBriefEligibleUserIds(userIds, supabase);
}

export async function runDailyGenerate(): Promise<DailyBriefRunResult> {
  const supabase = createServerClient();
  const date = new Date().toISOString().slice(0, 10);

  const { error: expireError } = await supabase
    .from('user_subscriptions')
    .update({ status: 'expired' })
    .eq('plan', 'trial')
    .eq('status', 'active')
    .lte('current_period_end', new Date().toISOString());

  if (expireError) {
    throw expireError;
  }

  const eligibleUserIds = await getEligibleDailyBriefUserIds();
  if (eligibleUserIds.length === 0) {
    return {
      date,
      message: 'No eligible users with graph data.',
      results: [],
      succeeded: 0,
      total: 0,
    };
  }

  const results: DailyBriefUserResult[] = [];

  for (const userId of eligibleUserIds) {
    try {
      try {
        const summariesCreated = await summarizeSignals(userId);
        if (summariesCreated > 0) {
          logStructuredEvent({
            event: 'daily_generate_summary',
            userId,
            artifactType: null,
            generationStatus: 'summary_complete',
            details: {
              scope: 'daily-generate',
              summaries_created: summariesCreated,
            },
          });
        }
      } catch (sumErr: unknown) {
        logStructuredEvent({
          event: 'daily_generate_summary_failed',
          level: 'warn',
          userId,
          artifactType: null,
          generationStatus: 'summary_failed',
          details: {
            scope: 'daily-generate',
            error: sumErr instanceof Error ? sumErr.message : String(sumErr),
          },
        });
      }

      try {
        const extraction = await processUnextractedSignals(userId);
        if (extraction.signals_processed > 0) {
          logStructuredEvent({
            event: 'daily_generate_extraction',
            userId,
            artifactType: null,
            generationStatus: 'signal_extraction_complete',
            details: {
              scope: 'daily-generate',
              signals_processed: extraction.signals_processed,
              entities_upserted: extraction.entities_upserted,
              commitments_created: extraction.commitments_created,
              topics_merged: extraction.topics_merged,
            },
          });
        }
      } catch (extractErr: unknown) {
        logStructuredEvent({
          event: 'daily_generate_extraction_failed',
          level: 'warn',
          userId,
          artifactType: null,
          generationStatus: 'signal_extraction_failed',
          details: {
            scope: 'daily-generate',
            error: extractErr instanceof Error ? extractErr.message : String(extractErr),
          },
        });
      }

      let directive;
      try {
        directive = await generateDirective(userId);
      } catch (genErr: unknown) {
        const message = genErr instanceof Error ? genErr.message : String(genErr);
        logStructuredEvent({
          event: 'daily_generate_failed',
          level: 'error',
          userId,
          artifactType: null,
          generationStatus: 'generation_failed',
          details: {
            scope: 'daily-generate',
            error: message,
          },
        });
        results.push({ code: 'generation_failed', success: false });
        continue;
      }

      if (directive.directive === '__GENERATION_FAILED__') {
        logStructuredEvent({
          event: 'daily_generate_failed',
          level: 'error',
          userId,
          artifactType: null,
          generationStatus: 'generation_failed',
          details: {
            scope: 'daily-generate',
            error: 'generation returned failure sentinel',
          },
        });
        results.push({ code: 'generation_failed', success: false });
        continue;
      }

      let artifact = null;
      try {
        artifact = await generateArtifact(userId, directive);
      } catch (artErr: unknown) {
        logStructuredEvent({
          event: 'daily_generate_failed',
          level: 'warn',
          userId,
          artifactType: artifactTypeForAction(directive.action_type),
          generationStatus: 'artifact_failed',
          details: {
            scope: 'daily-generate',
            error: artErr instanceof Error ? artErr.message : String(artErr),
          },
        });
      }

      if (!artifact) {
        results.push({ code: 'artifact_generation_failed', success: false });
        continue;
      }

      const { data: saved, error: saveErr } = await supabase
        .from('tkg_actions')
        .insert({
          user_id: userId,
          action_type: directive.action_type,
          directive_text: directive.directive,
          reason: directive.reason,
          status: 'pending_approval',
          confidence: directive.confidence,
          evidence: directive.evidence,
          generated_at: new Date().toISOString(),
          generation_attempts: 1,
          execution_result: {
            artifact,
            brief_origin: 'daily_cron',
          },
        })
        .select('id')
        .single();

      if (saveErr || !saved?.id) {
        logStructuredEvent({
          event: 'daily_generate_failed',
          level: 'error',
          userId,
          artifactType: artifactTypeForAction(directive.action_type),
          generationStatus: 'persist_failed',
          details: {
            scope: 'daily-generate',
            error: saveErr?.message ?? 'Missing inserted action id',
          },
        });
        results.push({ code: 'directive_persist_failed', success: false });
        continue;
      }

      try {
        const feedText = [
          `[Foldera Directive — ${date}]`,
          `Action: ${directive.action_type}`,
          `Directive: ${directive.directive}`,
        ].join('\n');
        await extractFromConversation(feedText, userId);
      } catch (feedErr: unknown) {
        const message = feedErr instanceof Error ? feedErr.message : String(feedErr);
        if (!message.includes('already ingested')) {
          logStructuredEvent({
            event: 'daily_generate_self_feed_failed',
            level: 'warn',
            userId,
            artifactType: artifactTypeForAction(directive.action_type),
            generationStatus: 'self_feed_failed',
            details: {
              scope: 'daily-generate',
              error: message,
            },
          });
        }
      }

      results.push({ code: 'generated', success: true });
      logStructuredEvent({
        event: 'daily_generate_complete',
        userId,
        artifactType: artifactTypeForAction(directive.action_type),
        generationStatus: 'generated',
        details: {
          scope: 'daily-generate',
          action_id: saved.id,
        },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logStructuredEvent({
        event: 'daily_generate_failed',
        level: 'error',
        userId,
        artifactType: null,
        generationStatus: 'failed',
        details: {
          scope: 'daily-generate',
          error: message,
        },
      });
      results.push({ code: 'generation_failed', success: false });
    }
  }

  const succeeded = results.filter((result) => result.success).length;

  return {
    date,
    message:
      succeeded === eligibleUserIds.length
        ? `Generated briefs for ${succeeded} eligible user${succeeded === 1 ? '' : 's'}.`
        : `Generated briefs for ${succeeded} of ${eligibleUserIds.length} eligible user${eligibleUserIds.length === 1 ? '' : 's'}.`,
    results,
    succeeded,
    total: eligibleUserIds.length,
  };
}

export async function runDailySend(): Promise<DailyBriefRunResult> {
  const supabase = createServerClient();
  const date = new Date().toISOString().slice(0, 10);
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const eligibleUserIds = await getEligibleDailyBriefUserIds();
  if (eligibleUserIds.length === 0) {
    return {
      date,
      message: 'No eligible users.',
      results: [],
      succeeded: 0,
      total: 0,
    };
  }

  const results: DailyBriefUserResult[] = [];

  for (const userId of eligibleUserIds) {
    try {
      const to = await getVerifiedDailyBriefRecipientEmail(userId, supabase);
      if (!to) {
        results.push({ code: 'no_verified_email', success: false });
        continue;
      }

      const { data: actions, error: actionsError } = await supabase
        .from('tkg_actions')
        .select('id, action_type, directive_text, reason, confidence, execution_result')
        .eq('user_id', userId)
        .eq('status', 'pending_approval')
        .gte('generated_at', todayStart.toISOString())
        .order('confidence', { ascending: false })
        .limit(10);

      if (actionsError) {
        results.push({ code: 'directive_lookup_failed', success: false });
        continue;
      }

      const action = actions?.find((candidate) => {
        const executionResult =
          candidate.execution_result && typeof candidate.execution_result === 'object'
            ? (candidate.execution_result as Record<string, unknown>)
            : null;
        const artifact = extractArtifact(executionResult);

        return typeof executionResult?.daily_brief_sent_at !== 'string' && artifact !== null;
      });
      if (!action) {
        results.push({ code: 'no_generated_directive', success: false });
        continue;
      }

      const confidence = (action.confidence as number) ?? 0;
      if (confidence < CONFIDENCE_THRESHOLD) {
        await sendDailyDirective({
          to,
          date,
          subject: 'Foldera: Nothing today',
          directives: [],
          userId,
        });
        results.push({ code: 'nothing_today', success: true });
        continue;
      }

      const directiveItem: DirectiveItem = {
        id: action.id,
        directive: action.directive_text as string,
        action_type: action.action_type as string,
        confidence,
        reason: ((action.reason as string) ?? '').split('[score=')[0].trim(),
        artifact: extractArtifact(action.execution_result),
      };

      const words = directiveItem.directive.split(/\s+/).slice(0, 6).join(' ');
      const subject = `Foldera: ${words.length > 50 ? `${words.slice(0, 47)}...` : words}`;

      try {
        await sendDailyDirective({ to, directives: [directiveItem], date, subject, userId });
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
        results.push({ code: 'email_send_failed', success: false });
        continue;
      }

      const executionResult =
        action.execution_result && typeof action.execution_result === 'object'
          ? (action.execution_result as Record<string, unknown>)
          : {};
      const { error: updateError } = await supabase
        .from('tkg_actions')
        .update({
          execution_result: {
            ...executionResult,
            daily_brief_sent_at: new Date().toISOString(),
          },
        })
        .eq('id', action.id);

      if (updateError) {
        results.push({ code: 'status_update_failed', success: false });
        continue;
      }

      results.push({ code: 'sent', success: true });
      logStructuredEvent({
        event: 'daily_send_complete',
        userId,
        artifactType: artifactTypeForAction(action.action_type as string | null | undefined),
        generationStatus: 'sent',
        details: {
          scope: 'daily-send',
          action_id: action.id,
        },
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
      results.push({ code: 'email_send_failed', success: false });
    }
  }

  const succeeded = results.filter((result) => result.success).length;

  return {
    date,
    message:
      succeeded === eligibleUserIds.length
        ? `Sent briefs for ${succeeded} eligible user${succeeded === 1 ? '' : 's'}.`
        : `Sent briefs for ${succeeded} of ${eligibleUserIds.length} eligible user${eligibleUserIds.length === 1 ? '' : 's'}.`,
    results,
    succeeded,
    total: eligibleUserIds.length,
  };
}

export function toSafeDailyBriefStageStatus(result: DailyBriefRunResult): SafeDailyBriefStageStatus {
  const attempted = result.total;
  const failed = result.results.filter((entry) => !entry.success).length;
  const errors = [
    ...new Set(
      result.results
        .filter((entry): entry is DailyBriefUserResult & { code: DailyBriefFailureCode } => !entry.success)
        .map((entry) => SAFE_ERROR_MESSAGES[entry.code]),
    ),
  ];

  let status: SafeDailyBriefStageStatus['status'] = 'ok';
  if (attempted === 0) {
    status = 'skipped';
  } else if (failed === attempted) {
    status = 'failed';
  } else if (failed > 0) {
    status = 'partial';
  }

  return {
    attempted,
    errors,
    failed,
    status,
    succeeded: result.succeeded,
    summary: result.message,
  };
}

export function getTriggerResponseStatus(
  generate: SafeDailyBriefStageStatus,
  send: SafeDailyBriefStageStatus,
): number {
  if (
    (generate.status === 'ok' || generate.status === 'skipped') &&
    (send.status === 'ok' || send.status === 'skipped')
  ) {
    return 200;
  }

  return 500;
}
