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
import { generateArtifact, getFallbackArtifact } from '@/lib/conviction/artifact-generator';
import { apiError } from '@/lib/utils/api-error';
import { filterDailyBriefEligibleUserIds } from '@/lib/auth/daily-brief-users';
import { extractFromConversation } from '@/lib/extraction/conversation-extractor';
import { processUnextractedSignals } from '@/lib/signals/signal-processor';
import { summarizeSignals } from '@/lib/signals/summarizer';
import type { ConvictionArtifact } from '@/lib/briefing/types';

export const dynamic = 'force-dynamic';

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
          console.log(`[daily-generate] created ${summariesCreated} signal summaries for ${userId.slice(0, 8)}`);
        }
      } catch (sumErr: unknown) {
        console.warn('[daily-generate] signal summarization failed:', sumErr instanceof Error ? sumErr.message : sumErr);
      }

      // Extract entities/commitments/topics from unprocessed sync signals
      try {
        const extraction = await processUnextractedSignals(userId);
        if (extraction.signals_processed > 0) {
          console.log(
            `[daily-generate] signal extraction for ${userId}: ` +
            `${extraction.signals_processed} signals, ${extraction.entities_upserted} entities, ` +
            `${extraction.commitments_created} commitments, ${extraction.topics_merged} topics`,
          );
        }
      } catch (extractErr: unknown) {
        // Non-fatal — directive generation can still proceed with existing data
        console.warn('[daily-generate] signal extraction failed:', extractErr instanceof Error ? extractErr.message : extractErr);
      }

      // Generate ONE directive
      let directive;
      try {
        directive = await generateDirective(userId);
      } catch (genErr: unknown) {
        const msg = genErr instanceof Error ? genErr.message : String(genErr);
        console.error(`[daily-generate] generation failed for ${userId}:`, msg);
        results.push({ userId, success: false, error: msg });
        continue;
      }

      // Check for failure sentinel
      if (directive.directive === '__GENERATION_FAILED__') {
        console.error(`[daily-generate] generation returned failure sentinel for ${userId}`);
        results.push({ userId, success: false, error: 'generation failed' });
        continue;
      }

      // Generate artifact
      let artifact: ConvictionArtifact | null = null;
      try {
        artifact = await generateArtifact(userId, directive);
      } catch (artErr: unknown) {
        console.warn('[daily-generate] artifact failed:', artErr instanceof Error ? artErr.message : artErr);
        artifact = getFallbackArtifact(directive);
      }

      // Validate email artifacts
      if (artifact && (['email', 'drafted_email'].includes((artifact as any).type as string))) {
        const ea = artifact as any;
        const missing: string[] = [];
        if (!ea.to?.trim()) missing.push('recipient');
        if (!ea.subject?.trim()) missing.push('subject');
        if (!ea.body?.trim()) missing.push('body');
        if (missing.length > 0) {
          console.warn(`[daily-generate] Email validation failed: missing ${missing.join(', ')}`);
          // Save as rejected
          await supabase.from('tkg_actions').insert({
            user_id: userId, action_type: directive.action_type, directive_text: directive.directive,
            reason: directive.reason, status: 'draft_rejected', confidence: directive.confidence,
            evidence: directive.evidence, generated_at: new Date().toISOString(),
            execution_result: { generation_error: `Missing: ${missing.join(', ')}` },
          });
          results.push({ userId, success: false, error: 'email validation failed' });
          continue;
        }
      }

      // Save
      const { data: saved, error: saveErr } = await supabase.from('tkg_actions').insert({
        user_id: userId, action_type: directive.action_type, directive_text: directive.directive,
        reason: directive.reason, status: 'generated', confidence: directive.confidence,
        evidence: directive.evidence, generated_at: new Date().toISOString(),
        generation_attempts: 1,
        execution_result: artifact ? { artifact } : null,
      }).select('id').single();

      if (saveErr) console.error('[daily-generate] save failed:', saveErr.message);

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
          console.warn('[daily-generate] self-feed failed:', feedErr.message);
        }
      }

      results.push({ userId, success: true });
      console.log(`[daily-generate] ${userId}: directive generated (confidence ${directive.confidence}%)`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[daily-generate] failed for ${userId}:`, msg);
      results.push({ userId, success: false, error: msg });
    }
  }

  return NextResponse.json({ date, results });
}

export const GET = handler;
export const POST = handler;
