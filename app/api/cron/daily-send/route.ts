/**
 * GET /api/cron/daily-send
 *
 * Phase 2 of the daily brief: read today's generated directives from tkg_actions
 * (status='generated'), send the email, update status to 'sent'.
 *
 * Runs at 7:00 AM UTC (midnight Pacific, or 2:00 PM UTC per existing config).
 * Must complete in <45s (Vercel Hobby 60s limit with margin).
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateCronAuth } from '@/lib/auth/resolve-user';
import { createServerClient, type SupabaseClient } from '@/lib/db/client';
import { sendDailyDirective } from '@/lib/email/resend';
import { apiError } from '@/lib/utils/api-error';
import type { DirectiveItem, CuttingRoomFloorItem } from '@/lib/email/resend';
import type { ConvictionArtifact } from '@/lib/briefing/types';

export const dynamic = 'force-dynamic';

function getProgressiveSubject(daysSinceSignup: number): string | null {
  if (daysSinceSignup <= 1) return 'Your first read from Foldera';
  if (daysSinceSignup === 2) return 'Foldera noticed something';
  if (daysSinceSignup === 3 || daysSinceSignup === 4) return 'Foldera found a pattern';
  if (daysSinceSignup === 5 || daysSinceSignup === 6) return 'Foldera handled something for you';
  if (daysSinceSignup === 7) return 'Your first week with Foldera';
  return null;
}

function artifactSummary(artifact: ConvictionArtifact | null): string | undefined {
  if (!artifact) return undefined;
  switch (artifact.type) {
    case 'email':
      return `Email to ${artifact.to}: "${artifact.subject}"`;
    case 'document':
      return `Document: "${artifact.title}"`;
    case 'calendar_event':
      return `Event: "${artifact.title}" on ${new Date(artifact.start).toLocaleDateString()}`;
    case 'research_brief':
      return artifact.recommended_action || 'Research brief ready';
    case 'decision_frame':
      return artifact.recommendation || 'Decision frame ready';
    case 'affirmation':
      return artifact.context.slice(0, 100) || 'No action needed right now';
    default: {
      const a = artifact as any;
      if (a.type === 'growth_reply') {
        return `Reply on ${a.platform}: "${(a.reply_text ?? '').slice(0, 80)}..."`;
      }
      return undefined;
    }
  }
}

function artifactEmailPreview(artifact: ConvictionArtifact | null): string | undefined {
  if (!artifact) return undefined;
  switch (artifact.type) {
    case 'email':
      return `To: ${artifact.to} | Subject: ${artifact.subject}`;
    case 'document':
      return `"${artifact.title}" — ${artifact.content.slice(0, 120)}${artifact.content.length > 120 ? '...' : ''}`;
    case 'calendar_event':
      return `${artifact.title} — ${new Date(artifact.start).toLocaleDateString()} ${new Date(artifact.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    case 'research_brief':
      return artifact.findings.slice(0, 150) + (artifact.findings.length > 150 ? '...' : '');
    case 'decision_frame':
      return artifact.options.slice(0, 2).map(o => o.option).join(' vs ');
    case 'affirmation':
      return artifact.context.slice(0, 150);
    default: {
      const a = artifact as any;
      if (a.type === 'growth_reply') {
        return `${a.platform} reply to @${a.post_author}: ${(a.reply_text ?? '').slice(0, 120)}`;
      }
      return undefined;
    }
  }
}

async function getWeekStats(supabase: SupabaseClient, userId: string): Promise<string> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from('tkg_actions').select('status').eq('user_id', userId).gte('generated_at', sevenDaysAgo);
  if (!data || data.length === 0) return '';
  const approved = data.filter((r: { status: string }) => r.status === 'executed').length;
  const skipped = data.filter((r: { status: string }) => r.status === 'skipped' || r.status === 'draft_rejected').length;
  return ` This week: ${data.length} items surfaced, ${approved} approved, ${skipped} skipped.`;
}

async function handler(request: NextRequest) {
  const authErr = validateCronAuth(request);
  if (authErr) return authErr;

  const to = process.env.DAILY_BRIEF_TO_EMAIL;
  if (!to) return NextResponse.json({ error: 'DAILY_BRIEF_TO_EMAIL is not set' }, { status: 500 });

  const supabase = createServerClient();
  const date = new Date().toISOString().slice(0, 10);

  // Find all 'generated' actions from today (created by daily-generate)
  const todayStart = new Date(); todayStart.setUTCHours(0, 0, 0, 0);
  const { data: entities, error } = await supabase.from('tkg_entities').select('user_id').eq('name', 'self');
  if (error) return apiError(error, 'cron/daily-send');

  const userIds = [...new Set((entities ?? []).map((e: { user_id: string }) => e.user_id))];
  if (userIds.length === 0) return NextResponse.json({ sent: 0, message: 'No users' });

  const results: Array<{ userId: string; success: boolean; error?: string }> = [];

  for (const userId of userIds) {
    try {
      // Check subscription
      const { data: sub } = await supabase
        .from('user_subscriptions').select('created_at, status').eq('user_id', userId).maybeSingle();
      if (sub?.status === 'expired') { results.push({ userId, success: false, error: 'trial expired' }); continue; }

      // Fetch today's generated directives
      const { data: actions } = await supabase
        .from('tkg_actions')
        .select('id, action_type, directive_text, reason, confidence, execution_result')
        .eq('user_id', userId)
        .eq('status', 'generated')
        .gte('generated_at', todayStart.toISOString())
        .order('generated_at', { ascending: true });

      if (!actions || actions.length === 0) {
        results.push({ userId, success: false, error: 'no generated directives found' });
        continue;
      }

      // Build DirectiveItems from stored data
      let cuttingRoomFloor: CuttingRoomFloorItem[] = [];
      const directiveItems: DirectiveItem[] = [];

      for (const action of actions) {
        const execResult = (action.execution_result as Record<string, unknown>) ?? {};
        const artifact = (execResult.artifact as ConvictionArtifact) ?? null;

        // Capture cutting room floor from first action
        if (directiveItems.length === 0 && Array.isArray(execResult.cutting_room_floor)) {
          cuttingRoomFloor = execResult.cutting_room_floor as CuttingRoomFloorItem[];
        }

        directiveItems.push({
          id: action.id,
          directive: action.directive_text as string,
          action_type: action.action_type as string,
          confidence: action.confidence as number,
          reason: (action.reason as string)?.split('[score=')[0] ?? '',
          summary: artifactSummary(artifact),
          artifactPreview: artifactEmailPreview(artifact),
        });
      }

      // Progressive subject line
      let daysSinceSignup = 999;
      if (sub?.created_at) {
        daysSinceSignup = Math.floor((Date.now() - new Date(sub.created_at).getTime()) / (1000 * 60 * 60 * 24));
      }

      let subject = getProgressiveSubject(daysSinceSignup);
      if (!subject) {
        const first = directiveItems[0];
        const subjectBase = first.summary ?? first.directive;
        subject = `Foldera: ${subjectBase.length > 55 ? subjectBase.slice(0, 52) + '...' : subjectBase}`;
      }

      // Week 1 day 7: append stats
      if (daysSinceSignup === 7) {
        const weekStats = await getWeekStats(supabase, userId);
        if (weekStats && directiveItems[0]) directiveItems[0].reason += weekStats;
      }

      // Outcome follow-up: check for non-email directives approved ~48h ago
      let outcomeCheckLine: string | undefined;
      try {
        const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
        const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
        const { data: pendingOutcomes } = await supabase
          .from('tkg_actions')
          .select('id, directive_text, action_type, executed_at, execution_result')
          .eq('user_id', userId).eq('status', 'executed')
          .neq('action_type', 'send_message')
          .lte('executed_at', fortyEightHoursAgo).gte('executed_at', fiveDaysAgo)
          .limit(5);

        for (const action of pendingOutcomes ?? []) {
          const execResult = (action.execution_result as Record<string, unknown>) ?? {};
          if (execResult.outcome_closed || execResult.outcome_check_sent) continue;
          const truncated = (action.directive_text as string ?? '').slice(0, 120);
          outcomeCheckLine = `Two days ago I suggested: "${truncated}". Did it help? Reply YES or NO.`;
          await supabase.from('tkg_actions').update({
            execution_result: { ...execResult, outcome_check_sent: true, outcome_check_sent_at: new Date().toISOString() },
          }).eq('id', action.id);
          break;
        }
      } catch (outcomeErr: any) {
        console.warn('[daily-send] outcome check failed:', outcomeErr.message);
      }

      // Learning signal: approval rate
      let learningSignal: string | undefined;
      try {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const { data: allActions } = await supabase
          .from('tkg_actions').select('action_type, status').eq('user_id', userId)
          .gte('generated_at', thirtyDaysAgo).in('status', ['executed', 'skipped', 'draft_rejected']);

        if (allActions && allActions.length >= 5) {
          const executed = allActions.filter((a: any) => a.status === 'executed');
          const total = allActions.length;
          const rate = Math.round((executed.length / total) * 100);
          const typeStats: Record<string, { approved: number; total: number }> = {};
          for (const a of allActions) {
            const t = a.action_type as string;
            if (!typeStats[t]) typeStats[t] = { approved: 0, total: 0 };
            typeStats[t].total++;
            if (a.status === 'executed') typeStats[t].approved++;
          }
          let bestType = '', bestRate = 0;
          for (const [t, s] of Object.entries(typeStats)) {
            if (s.total >= 3) { const r = s.approved / s.total; if (r > bestRate) { bestRate = r; bestType = t; } }
          }
          const typeLabel: Record<string, string> = {
            send_message: 'email drafts', write_document: 'documents',
            make_decision: 'decision frames', do_nothing: 'wait calls',
            schedule: 'calendar events', research: 'research briefs',
          };
          if (bestType && bestRate > 0.5) {
            learningSignal = `Your overall approval rate: ${rate}%. ${typeLabel[bestType] ?? bestType} land ${Math.round(bestRate * 100)}% of the time — I'm weighting those higher.`;
          } else if (rate > 0) {
            learningSignal = `${executed.length} of ${total} items approved (${rate}%). Every approve and skip teaches me what to surface next.`;
          }
        }
      } catch (lsErr: any) {
        console.warn('[daily-send] learning signal failed:', lsErr.message);
      }

      // Send the email
      await sendDailyDirective({
        to, directives: directiveItems, date, subject,
        outcomeCheck: outcomeCheckLine,
        cuttingRoomFloor: cuttingRoomFloor.length > 0 ? cuttingRoomFloor : undefined,
        learningSignal,
      });

      // Update generated → pending_approval so approve/skip deep-links work
      const actionIds = actions.map(a => a.id);
      await supabase.from('tkg_actions').update({ status: 'pending_approval' }).in('id', actionIds);

      results.push({ userId, success: true });
      console.log(`[daily-send] ${userId}: ${actionIds.length} directives sent`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[daily-send] failed for ${userId}:`, msg);
      results.push({ userId, success: false, error: msg });
    }
  }

  // TTL cleanup: delete signals older than 7 days
  let ttlDeleted = 0;
  try {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { error: ttlErr, count } = await supabase.from('tkg_signals').delete({ count: 'exact' }).lt('created_at', cutoff);
    if (ttlErr) console.error('[daily-send] ttl-cleanup failed:', ttlErr.message);
    else { ttlDeleted = count ?? 0; if (ttlDeleted > 0) console.log(`[daily-send] ttl-cleanup: deleted ${ttlDeleted} signals`); }
  } catch (ttlEx: unknown) {
    console.error('[daily-send] ttl-cleanup threw:', ttlEx instanceof Error ? ttlEx.message : ttlEx);
  }

  const sent = results.filter(r => r.success).length;
  return NextResponse.json({ date, sent, total: userIds.length, results, ttlDeleted });
}

export const GET = handler;
export const POST = handler;
