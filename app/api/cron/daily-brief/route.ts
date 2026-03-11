/**
 * GET /api/cron/daily-brief
 *
 * Runs every day at 7 AM UTC.
 * Retry: generateDirective + sendDailyDirective each retried once after 30s.
 * Each directive is saved to tkg_actions (gets an ID for email approve deep-links).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient }              from '@supabase/supabase-js';
import { generateDirective }         from '@/lib/briefing/generator';
import { sendDailyDirective }        from '@/lib/email/resend';
import type { DirectiveItem }        from '@/lib/email/resend';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function getProgressiveConfig(daysSinceSignup: number): { artifactCount: number; subject: string | null } {
  if (daysSinceSignup <= 1) return { artifactCount: 1, subject: 'Your first read from Foldera' };
  if (daysSinceSignup === 2) return { artifactCount: 1, subject: 'Foldera noticed something' };
  if (daysSinceSignup === 3 || daysSinceSignup === 4) return { artifactCount: 2, subject: 'Foldera found a pattern' };
  if (daysSinceSignup === 5 || daysSinceSignup === 6) return { artifactCount: 2, subject: 'Foldera handled something for you' };
  if (daysSinceSignup === 7) return { artifactCount: 1, subject: 'Your first week with Foldera' };
  return { artifactCount: 2, subject: null };
}

async function getWeekStats(supabase: ReturnType<typeof getSupabase>, userId: string): Promise<string> {
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
  supabase: ReturnType<typeof getSupabase>,
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

async function handler(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const to = process.env.DAILY_BRIEF_TO_EMAIL;
  if (!to) return NextResponse.json({ error: 'DAILY_BRIEF_TO_EMAIL is not set' }, { status: 500 });

  const date = new Date().toISOString().slice(0, 10);
  const supabase = getSupabase();

  await supabase.from('user_subscriptions').update({ status: 'expired' })
    .eq('plan', 'trial').eq('status', 'active').lte('current_period_end', new Date().toISOString());

  const { data: entities, error } = await supabase.from('tkg_entities').select('user_id').eq('name', 'self');
  if (error) {
    console.error('[daily-brief] tkg_entities query failed:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const userIds = [...new Set((entities ?? []).map((e: { user_id: string }) => e.user_id))];
  if (userIds.length === 0) return NextResponse.json({ sent: 0, message: 'No users with graph data' });

  const results: Array<{ userId: string; success: boolean; error?: string }> = [];

  for (const userId of userIds) {
    try {
      const { data: sub } = await supabase
        .from('user_subscriptions').select('created_at, status').eq('user_id', userId).maybeSingle();
      if (sub?.status === 'expired') { results.push({ userId, success: false, error: 'trial expired' }); continue; }

      let daysSinceSignup = 999;
      if (sub?.created_at) {
        daysSinceSignup = Math.floor((Date.now() - new Date(sub.created_at).getTime()) / (1000 * 60 * 60 * 24));
      }

      const { artifactCount, subject: progressiveSubject } = getProgressiveConfig(daysSinceSignup);
      const directiveItems: DirectiveItem[] = [];
      let generationFailed = false;

      for (let i = 0; i < artifactCount; i++) {
        const result = await withRetry(() => generateDirective(userId), `generateDirective[${i}]`);
        if ('error' in result) {
          await saveDirectiveAction(supabase, userId,
            { directive: 'Generation failed', action_type: 'research', confidence: 0, reason: result.error, evidence: [] },
            result.attempts, result.error);
          generationFailed = true; break;
        }
        const actionId = await saveDirectiveAction(supabase, userId, result.value, result.attempts);
        directiveItems.push({
          id: actionId ?? undefined,
          directive: result.value.directive,
          action_type: result.value.action_type,
          confidence: result.value.confidence,
          reason: result.value.reason,
        });
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
