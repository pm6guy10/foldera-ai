/**
 * GET /api/cron/daily-brief
 *
 * Runs every day at 7 AM UTC.
 * Retry: generateDirective + sendDailyDirective each retried once after 30s.
 * Each directive is saved to tkg_actions (gets an ID for email approve deep-links).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type SupabaseClient } from '@/lib/db/client';
import { generateDirective, generateMultipleDirectives } from '@/lib/briefing/generator';
import { generateArtifact, getFallbackArtifact } from '@/lib/conviction/artifact-generator';
import { sendDailyDirective }        from '@/lib/email/resend';
import { apiError }                  from '@/lib/utils/api-error';
import { extractFromConversation }   from '@/lib/extraction/conversation-extractor';
import type { DirectiveItem }        from '@/lib/email/resend';
import type { ConvictionArtifact }   from '@/lib/briefing/types';

export const dynamic = 'force-dynamic';

function getProgressiveConfig(daysSinceSignup: number): { artifactCount: number; subject: string | null } {
  if (daysSinceSignup <= 1) return { artifactCount: 1, subject: 'Your first read from Foldera' };
  if (daysSinceSignup === 2) return { artifactCount: 1, subject: 'Foldera noticed something' };
  if (daysSinceSignup === 3 || daysSinceSignup === 4) return { artifactCount: 2, subject: 'Foldera found a pattern' };
  if (daysSinceSignup === 5 || daysSinceSignup === 6) return { artifactCount: 2, subject: 'Foldera handled something for you' };
  if (daysSinceSignup === 7) return { artifactCount: 1, subject: 'Your first week with Foldera' };
  return { artifactCount: 2, subject: null };
}

async function getWeekStats(supabase: SupabaseClient, userId: string): Promise<string> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from('tkg_actions').select('status').eq('user_id', userId).gte('generated_at', sevenDaysAgo);
  if (!data || data.length === 0) return '';
  const approved = data.filter((r: { status: string }) => r.status === 'executed').length;
  const skipped  = data.filter((r: { status: string }) => r.status === 'skipped' || r.status === 'draft_rejected').length;
  return ` This week: ${data.length} items surfaced, ${approved} approved, ${skipped} skipped.`;
}

async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  delayMs = 30_000,
): Promise<{ value: T; attempts: number } | { error: string; attempts: number }> {
  try {
    return { value: await fn(), attempts: 1 };
  } catch (firstErr: unknown) {
    const msg1 = firstErr instanceof Error ? firstErr.message : String(firstErr);
    console.warn(`[daily-brief] ${label} failed (attempt 1): ${msg1} — retrying in ${delayMs}ms`);
    await new Promise(r => setTimeout(r, delayMs));
    try {
      return { value: await fn(), attempts: 2 };
    } catch (secondErr: unknown) {
      const msg2 = secondErr instanceof Error ? secondErr.message : String(secondErr);
      console.error(`[daily-brief] ${label} failed (attempt 2): ${msg2}`);
      return { error: msg2, attempts: 2 };
    }
  }
}

type GeneratedDirective = Awaited<ReturnType<typeof generateDirective>>;

async function saveDirectiveAction(
  supabase: SupabaseClient,
  userId: string,
  d: GeneratedDirective,
  attempts: number,
  lastError?: string,
): Promise<string | null> {
  const base = {
    user_id: userId, action_type: d.action_type, directive_text: d.directive,
    reason: d.reason, status: 'pending_approval', confidence: d.confidence,
    evidence: d.evidence, generated_at: new Date().toISOString(),
    execution_result: lastError ? { last_error: lastError, generation_attempts: attempts } : null,
  };
  const { data, error } = await supabase
    .from('tkg_actions')
    .insert({ ...base, generation_attempts: attempts, last_error: lastError ?? null })
    .select('id').single();
  if (!error) return data?.id ?? null;
  const { data: d2 } = await supabase.from('tkg_actions').insert(base).select('id').single();
  return d2?.id ?? null;
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
    default:
      return undefined;
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
    default:
      return undefined;
  }
}

async function handler(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const to = process.env.DAILY_BRIEF_TO_EMAIL;
  if (!to) return NextResponse.json({ error: 'DAILY_BRIEF_TO_EMAIL is not set' }, { status: 500 });

  const date = new Date().toISOString().slice(0, 10);
  const supabase = createServerClient();

  await supabase.from('user_subscriptions').update({ status: 'expired' })
    .eq('plan', 'trial').eq('status', 'active').lte('current_period_end', new Date().toISOString());

  const { data: entities, error } = await supabase.from('tkg_entities').select('user_id').eq('name', 'self');
  if (error) {
    return apiError(error, 'cron/daily-brief');
  }

  const userIds = [...new Set((entities ?? []).map((e: { user_id: string }) => e.user_id))];
  if (userIds.length === 0) return NextResponse.json({ sent: 0, message: 'No users with graph data' });

  const results: Array<{ userId: string; success: boolean; error?: string }> = [];

  for (const userId of userIds) {
    try {
      const { data: sub } = await supabase
        .from('user_subscriptions').select('created_at, status').eq('user_id', userId).maybeSingle();
      if (sub?.status === 'expired') { results.push({ userId, success: false, error: 'trial expired' }); continue; }

      // Check for stale graph (no ingest in 48+ hours) and surface a DraftQueue warning once per day
      const { data: latestSignal } = await supabase
        .from('tkg_signals')
        .select('created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestSignal?.created_at) {
        const hoursSinceIngest = (Date.now() - new Date(latestSignal.created_at).getTime()) / (1000 * 60 * 60);
        if (hoursSinceIngest > 48) {
          const daysSinceIngest = Math.floor(hoursSinceIngest / 24);
          // Only add the warning if there isn't already a health_alert from today
          const todayStart = new Date();
          todayStart.setUTCHours(0, 0, 0, 0);
          const { data: existingAlert } = await supabase
            .from('tkg_actions')
            .select('id')
            .eq('user_id', userId)
            .eq('draft_type', 'health_alert')
            .eq('status', 'draft')
            .gte('generated_at', todayStart.toISOString())
            .limit(1)
            .maybeSingle();

          if (!existingAlert) {
            await supabase.from('tkg_actions').insert({
              user_id: userId,
              action_type: 'do_nothing',
              draft_type: 'health_alert',
              directive_text: `Your graph hasn't been updated in ${daysSinceIngest} day${daysSinceIngest !== 1 ? 's' : ''}. Foldera's reads are based on older data. Ingest recent conversations to improve accuracy.`,
              reason: `Last signal ingested ${daysSinceIngest} day${daysSinceIngest !== 1 ? 's' : ''} ago. Export your recent Claude conversations as text files and run: node scripts/ingest-recent.mjs ./conversations/`,
              status: 'draft',
              confidence: 100,
              evidence: [],
              generated_at: new Date().toISOString(),
            });
            console.log(`[daily-brief] Stale graph alert added for ${userId} (${daysSinceIngest}d since last ingest)`);
          }
        }
      }

      let daysSinceSignup = 999;
      if (sub?.created_at) {
        daysSinceSignup = Math.floor((Date.now() - new Date(sub.created_at).getTime()) / (1000 * 60 * 60 * 24));
      }

      const { artifactCount: progressiveCount, subject: progressiveSubject } = getProgressiveConfig(daysSinceSignup);
      // Generate 3 directives per cycle (or progressive count for first week)
      const directiveCount = daysSinceSignup <= 7 ? progressiveCount : 3;
      const directiveItems: DirectiveItem[] = [];
      let generationFailed = false;

      for (let i = 0; i < directiveCount; i++) {
        const result = await withRetry(() => generateDirective(userId), `generateDirective[${i}]`);
        if ('error' in result) {
          await saveDirectiveAction(supabase, userId,
            { directive: 'Generation failed', action_type: 'research', confidence: 0, reason: result.error, evidence: [] },
            result.attempts, result.error);
          generationFailed = true; break;
        }
        const actionId = await saveDirectiveAction(supabase, userId, result.value, result.attempts);

        // Generate the artifact — the finished work product; on failure attach fallback so approve still runs
        let artifact: ConvictionArtifact | null = null;
        try {
          artifact = await generateArtifact(userId, result.value);
        } catch (artErr: unknown) {
          console.warn(`[daily-brief] artifact generation failed for directive ${i}:`, artErr instanceof Error ? artErr.message : artErr);
          artifact = getFallbackArtifact(result.value);
        }
        if (actionId && artifact) {
          await supabase
            .from('tkg_actions')
            .update({ execution_result: { artifact } })
            .eq('id', actionId);
        }

        directiveItems.push({
          id: actionId ?? undefined,
          directive: result.value.directive,
          action_type: result.value.action_type,
          confidence: result.value.confidence,
          reason: result.value.reason,
          summary: artifactSummary(artifact),
          artifactPreview: artifactEmailPreview(artifact),
        });

        // Self-feeding loop: pipe the directive back through extraction
        // so future directives can build on past outputs.
        try {
          const d = result.value;
          const feedText = [
            `[Foldera Directive — ${new Date().toISOString().slice(0, 10)}]`,
            `Action: ${d.action_type}`,
            `Directive: ${d.directive}`,
            `Reason: ${d.reason}`,
            d.evidence?.length ? `Evidence: ${d.evidence.map((e: any) => e.description).join('; ')}` : null,
          ].filter(Boolean).join('\n');
          await extractFromConversation(feedText, userId);
        } catch (feedErr: any) {
          if (!feedErr.message?.includes('already ingested')) {
            console.warn('[daily-brief] self-feed extraction failed:', feedErr.message);
          }
        }
      }

      // ── Outcome follow-ups: check for actions approved 7+ days ago ──────────
      try {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const { data: pendingOutcomes } = await supabase
          .from('tkg_actions')
          .select('id, directive_text, action_type, executed_at, execution_result')
          .eq('user_id', userId)
          .eq('status', 'executed')
          .lte('executed_at', sevenDaysAgo)
          .limit(3);

        for (const action of pendingOutcomes ?? []) {
          const execResult = (action.execution_result as Record<string, unknown>) ?? {};
          // Skip if outcome already confirmed
          if (execResult.outcome) continue;

          // Add outcome follow-up as a directive item; isOutcomeFollowUp → email uses "It worked" / "Didn't work" links
          directiveItems.push({
            id: action.id,
            directive: `7 days ago you approved: "${action.directive_text}". Did it work?`,
            action_type: 'confirm_outcome' as any,
            confidence: 100,
            reason: `Executed on ${new Date(action.executed_at).toLocaleDateString()}. Tap to close the loop.`,
            isOutcomeFollowUp: true,
          });
        }
      } catch (outcomeErr: any) {
        console.warn('[daily-brief] outcome check failed:', outcomeErr.message);
      }

      if (generationFailed || directiveItems.length === 0) {
        results.push({ userId, success: false, error: 'generation failed after retry' }); continue;
      }

      let subject = progressiveSubject;
      if (!subject) {
        const first = directiveItems[0];
        subject = directiveItems.length > 1
          ? `${directiveItems.length} items ready for your review`
          : (first.directive.length > 60 ? first.directive.slice(0, 57) + '...' : first.directive);
      }

      if (daysSinceSignup === 7) {
        const weekStats = await getWeekStats(supabase, userId);
        if (weekStats && directiveItems[0]) directiveItems[0].reason += weekStats;
      }

      const sendResult = await withRetry(
        () => sendDailyDirective({ to, directives: directiveItems, date, subject }),
        `sendDailyDirective for ${userId}`,
      );
      if ('error' in sendResult) {
        results.push({ userId, success: false, error: `email send failed: ${sendResult.error}` }); continue;
      }

      results.push({ userId, success: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[daily-brief] failed for ${userId}:`, msg);
      results.push({ userId, success: false, error: msg });
    }
  }

  const sent = results.filter(r => r.success).length;
  const errors = results.filter(r => !r.success);
  console.log(`[daily-brief] ${date} — sent ${sent}/${userIds.length}`);
  return NextResponse.json({ date, sent, total: userIds.length, errors });
}

export const GET  = handler;
export const POST = handler;
