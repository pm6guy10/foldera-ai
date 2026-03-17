/**
 * GET /api/cron/daily-generate
 *
 * Phase 1 of the daily brief: generate ONE directive + artifact, save to
 * tkg_actions with status='generated'. No email sent — daily-send handles that.
 *
 * Runs at 6:50 AM UTC. Must complete in <45s (Vercel Hobby 60s limit).
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateCronAuth } from '@/lib/auth/resolve-user';
import { createServerClient } from '@/lib/db/client';
import { generateDirective } from '@/lib/briefing/generator';
import { generateArtifact } from '@/lib/conviction/artifact-generator';
import { apiError } from '@/lib/utils/api-error';
import { filterDailyBriefEligibleUserIds } from '@/lib/auth/daily-brief-users';
import { extractFromConversation } from '@/lib/extraction/conversation-extractor';
import { processUnextractedSignals } from '@/lib/signals/signal-processor';
import { summarizeSignals } from '@/lib/signals/summarizer';
import { logStructuredEvent } from '@/lib/utils/structured-logger';

export const dynamic = 'force-dynamic';

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

async function handler(request: NextRequest) {
  const authErr = validateCronAuth(request);
  if (authErr) return authErr;

  const supabase = createServerClient();
  const date = new Date().toISOString().slice(0, 10);

  // Expire trials
  const { error: expireError } = await supabase
    .from('user_subscriptions')
    .update({ status: 'expired' })
    .eq('plan', 'trial')
    .eq('status', 'active')
    .lte('current_period_end', new Date().toISOString());
  if (expireError) return apiError(expireError, 'cron/daily-generate');

  const { data: entities, error } = await supabase.from('tkg_entities').select('user_id').eq('name', 'self');
  if (error) return apiError(error, 'cron/daily-generate');

  const userIds = [...new Set((entities ?? []).map((e: { user_id: string }) => e.user_id))];
  if (userIds.length === 0) return NextResponse.json({ generated: 0, message: 'No users with graph data' });
  const eligibleUserIds = await filterDailyBriefEligibleUserIds(userIds, supabase);
  if (eligibleUserIds.length === 0) {
    return NextResponse.json({ generated: 0, message: 'No eligible users with graph data' });
  }

  const results: Array<{ userId: string; success: boolean; error?: string }> = [];

  for (const userId of eligibleUserIds) {
    try {
      // Summarize old signals into weekly digests (before generation so summaries are available as context)
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

      // Extract entities/commitments/topics from unprocessed sync signals
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
        // Non-fatal — directive generation can still proceed with existing data
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

      // Generate ONE directive
      let directive;
      try {
        directive = await generateDirective(userId);
      } catch (genErr: unknown) {
        const msg = genErr instanceof Error ? genErr.message : String(genErr);
        logStructuredEvent({
          event: 'daily_generate_failed',
          level: 'error',
          userId,
          artifactType: null,
          generationStatus: 'generation_failed',
          details: {
            scope: 'daily-generate',
            error: msg,
          },
        });
        results.push({ userId, success: false, error: msg });
        continue;
      }

      // Check for failure sentinel
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
        results.push({ userId, success: false, error: 'generation failed' });
        continue;
      }

      // Generate artifact
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
        results.push({ userId, success: false, error: 'artifact generation failed' });
        continue;
      }

      // Save
      const { data: saved, error: saveErr } = await supabase.from('tkg_actions').insert({
        user_id: userId, action_type: directive.action_type, directive_text: directive.directive,
        reason: directive.reason, status: 'generated', confidence: directive.confidence,
        evidence: directive.evidence, generated_at: new Date().toISOString(),
        generation_attempts: 1,
        execution_result: artifact ? { artifact } : null,
      }).select('id').single();

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
        results.push({ userId, success: false, error: 'directive save failed' });
        continue;
      }

      // Self-feeding
      try {
        const feedText = [
          `[Foldera Directive — ${date}]`,
          `Action: ${directive.action_type}`,
          `Directive: ${directive.directive}`,
        ].join('\n');
        await extractFromConversation(feedText, userId);
      } catch (feedErr: any) {
        if (!feedErr.message?.includes('already ingested')) {
          logStructuredEvent({
            event: 'daily_generate_self_feed_failed',
            level: 'warn',
            userId,
            artifactType: artifactTypeForAction(directive.action_type),
            generationStatus: 'self_feed_failed',
            details: {
              scope: 'daily-generate',
              error: feedErr.message,
            },
          });
        }
      }

      results.push({ userId, success: true });
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
      const msg = err instanceof Error ? err.message : String(err);
      logStructuredEvent({
        event: 'daily_generate_failed',
        level: 'error',
        userId,
        artifactType: null,
        generationStatus: 'failed',
        details: {
          scope: 'daily-generate',
          error: msg,
        },
      });
      results.push({ userId, success: false, error: msg });
    }
  }

  return NextResponse.json({ date, results });
}

export const GET = handler;
export const POST = handler;
