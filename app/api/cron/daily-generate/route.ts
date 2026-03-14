/**
 * GET /api/cron/daily-generate
 *
 * Phase 1 of the daily brief: generate directives + artifacts, save to tkg_actions
 * with status='generated'. No email sent here — daily-send handles that.
 *
 * Runs at 6:50 AM UTC (11:50 PM Pacific previous day).
 * Must complete in <45s (Vercel Hobby 60s limit with margin).
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateCronAuth } from '@/lib/auth/resolve-user';
import { createServerClient, type SupabaseClient } from '@/lib/db/client';
import { generateDirective } from '@/lib/briefing/generator';
import { generateArtifact, getFallbackArtifact } from '@/lib/conviction/artifact-generator';
import { apiError } from '@/lib/utils/api-error';
import { extractFromConversation } from '@/lib/extraction/conversation-extractor';
import type { ConvictionArtifact } from '@/lib/briefing/types';

export const dynamic = 'force-dynamic';

function getProgressiveCount(daysSinceSignup: number): number {
  if (daysSinceSignup <= 2) return 1;
  if (daysSinceSignup <= 6) return 2;
  if (daysSinceSignup === 7) return 1;
  return 2; // post-first-week: 2 directives
}

type GeneratedDirective = Awaited<ReturnType<typeof generateDirective>>;

async function saveDirectiveAction(
  supabase: SupabaseClient,
  userId: string,
  d: GeneratedDirective,
  artifact: ConvictionArtifact | null,
  extra: Record<string, unknown> = {},
): Promise<string | null> {
  const row = {
    user_id: userId,
    action_type: d.action_type,
    directive_text: d.directive,
    reason: d.reason,
    status: 'generated',
    confidence: d.confidence,
    evidence: d.evidence,
    generated_at: new Date().toISOString(),
    generation_attempts: 1,
    execution_result: artifact ? { artifact, ...extra } : extra.cutting_room_floor ? extra : null,
  };
  const { data, error } = await supabase
    .from('tkg_actions')
    .insert(row)
    .select('id')
    .single();
  if (error) {
    console.error('[daily-generate] insert failed:', error.message);
    // Retry without extra columns
    const { data: d2 } = await supabase.from('tkg_actions').insert({
      user_id: userId, action_type: d.action_type, directive_text: d.directive,
      reason: d.reason, status: 'generated', confidence: d.confidence,
      evidence: d.evidence, generated_at: new Date().toISOString(),
      execution_result: artifact ? { artifact } : null,
    }).select('id').single();
    return d2?.id ?? null;
  }
  return data?.id ?? null;
}

async function handler(request: NextRequest) {
  const authErr = validateCronAuth(request);
  if (authErr) return authErr;

  const supabase = createServerClient();
  const date = new Date().toISOString().slice(0, 10);

  // Expire trials
  await supabase.from('user_subscriptions').update({ status: 'expired' })
    .eq('plan', 'trial').eq('status', 'active').lte('current_period_end', new Date().toISOString());

  // Find users with graph data
  const { data: entities, error } = await supabase.from('tkg_entities').select('user_id').eq('name', 'self');
  if (error) return apiError(error, 'cron/daily-generate');

  const userIds = [...new Set((entities ?? []).map((e: { user_id: string }) => e.user_id))];
  if (userIds.length === 0) return NextResponse.json({ generated: 0, message: 'No users with graph data' });

  const results: Array<{ userId: string; success: boolean; count?: number; error?: string }> = [];

  for (const userId of userIds) {
    try {
      const { data: sub } = await supabase
        .from('user_subscriptions').select('created_at, status').eq('user_id', userId).maybeSingle();
      if (sub?.status === 'expired') { results.push({ userId, success: false, error: 'trial expired' }); continue; }

      // Stale graph alert (48h+ since last ingest)
      const { data: latestSignal } = await supabase
        .from('tkg_signals').select('created_at').eq('user_id', userId)
        .order('created_at', { ascending: false }).limit(1).maybeSingle();

      if (latestSignal?.created_at) {
        const hoursSinceIngest = (Date.now() - new Date(latestSignal.created_at).getTime()) / (1000 * 60 * 60);
        if (hoursSinceIngest > 48) {
          const daysSinceIngest = Math.floor(hoursSinceIngest / 24);
          const todayStart = new Date(); todayStart.setUTCHours(0, 0, 0, 0);
          const { data: existingAlert } = await supabase
            .from('tkg_actions').select('id').eq('user_id', userId).eq('draft_type', 'health_alert')
            .eq('status', 'draft').gte('generated_at', todayStart.toISOString()).limit(1).maybeSingle();
          if (!existingAlert) {
            await supabase.from('tkg_actions').insert({
              user_id: userId, action_type: 'do_nothing', draft_type: 'health_alert',
              directive_text: `Your graph hasn't been updated in ${daysSinceIngest} day${daysSinceIngest !== 1 ? 's' : ''}. Foldera's reads are based on older data. Ingest recent conversations to improve accuracy.`,
              reason: `Last signal ingested ${daysSinceIngest} day${daysSinceIngest !== 1 ? 's' : ''} ago. Export your recent Claude conversations as text files and run: node scripts/ingest-recent.mjs ./conversations/`,
              status: 'draft', confidence: 100, evidence: [], generated_at: new Date().toISOString(),
            });
            console.log(`[daily-generate] Stale graph alert for ${userId} (${daysSinceIngest}d)`);
          }
        }
      }

      let daysSinceSignup = 999;
      if (sub?.created_at) {
        daysSinceSignup = Math.floor((Date.now() - new Date(sub.created_at).getTime()) / (1000 * 60 * 60 * 24));
      }

      const directiveCount = daysSinceSignup <= 7 ? getProgressiveCount(daysSinceSignup) : 3;
      let generated = 0;

      for (let i = 0; i < directiveCount; i++) {
        let directive: GeneratedDirective;
        try {
          directive = await generateDirective(userId);
        } catch (genErr: unknown) {
          const msg = genErr instanceof Error ? genErr.message : String(genErr);
          console.error(`[daily-generate] directive ${i} failed:`, msg);
          break;
        }

        // Capture cutting room floor from first directive
        const extra: Record<string, unknown> = {};
        if (i === 0 && (directive as any).cutting_room_floor?.length > 0) {
          extra.cutting_room_floor = (directive as any).cutting_room_floor;
        }

        // Generate artifact
        let artifact: ConvictionArtifact | null = null;
        try {
          artifact = await generateArtifact(userId, directive);
        } catch (artErr: unknown) {
          console.warn(`[daily-generate] artifact ${i} failed:`, artErr instanceof Error ? artErr.message : artErr);
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
            continue;
          }
        }

        const actionId = await saveDirectiveAction(supabase, userId, directive, artifact, extra);
        if (actionId) generated++;

        // Self-feeding: pipe directive back through extraction
        try {
          const feedText = [
            `[Foldera Directive — ${date}]`,
            `Action: ${directive.action_type}`,
            `Directive: ${directive.directive}`,
            `Reason: ${directive.reason}`,
            directive.evidence?.length ? `Evidence: ${directive.evidence.map((e: any) => e.description).join('; ')}` : null,
          ].filter(Boolean).join('\n');
          await extractFromConversation(feedText, userId);
        } catch (feedErr: any) {
          if (!feedErr.message?.includes('already ingested')) {
            console.warn('[daily-generate] self-feed failed:', feedErr.message);
          }
        }
      }

      results.push({ userId, success: generated > 0, count: generated });
      console.log(`[daily-generate] ${userId}: ${generated} directives generated`);
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
