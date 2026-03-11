/**
 * GET /api/cron/daily-brief
 *
 * Runs every day at 7 AM UTC (see vercel.json).
 * Protected by Authorization: Bearer CRON_SECRET.
 *
 * Progressive discovery (first 7 days after trial signup):
 *   Day 1: 1 directive  — "Your first read from Foldera"
 *   Day 2: 1 directive  — "Foldera noticed something"
 *   Day 3: 2 directives — "Foldera found a pattern"
 *   Day 5: 2 directives — "Foldera handled something for you"
 *   Day 7: 1 directive  — "Your first week with Foldera" (week-in-review context)
 *   Day 8+: 2 directives with auto-generated subject line
 *
 * Also marks expired trials (plan='trial', current_period_end < now → status='expired').
 *
 * Required env vars:
 *   CRON_SECRET, RESEND_API_KEY, RESEND_FROM_EMAIL, DAILY_BRIEF_TO_EMAIL
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

// ── Progressive discovery config ──────────────────────────────────────────────

function getProgressiveConfig(daysSinceSignup: number): {
  artifactCount: number;
  subject:       string | null; // null = auto-generate from first directive
} {
  if (daysSinceSignup <= 1) {
    return { artifactCount: 1, subject: 'Your first read from Foldera' };
  }
  if (daysSinceSignup === 2) {
    return { artifactCount: 1, subject: 'Foldera noticed something' };
  }
  if (daysSinceSignup === 3 || daysSinceSignup === 4) {
    return { artifactCount: 2, subject: 'Foldera found a pattern' };
  }
  if (daysSinceSignup === 5 || daysSinceSignup === 6) {
    return { artifactCount: 2, subject: 'Foldera handled something for you' };
  }
  if (daysSinceSignup === 7) {
    return { artifactCount: 1, subject: 'Your first week with Foldera' };
  }
  // Day 8+: normal 2 directives, subject auto-generated
  return { artifactCount: 2, subject: null };
}

// ── Week-in-review stats for day 7 context ────────────────────────────────────

async function getWeekStats(
  supabase: ReturnType<typeof getSupabase>,
  userId: string,
): Promise<string> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from('tkg_actions')
    .select('status')
    .eq('user_id', userId)
    .gte('generated_at', sevenDaysAgo);

  if (!data || data.length === 0) return '';

  const surfaced = data.length;
  const approved = data.filter(r => r.status === 'executed').length;
  const skipped  = data.filter(r => r.status === 'skipped' || r.status === 'draft_rejected').length;

  return ` This week: ${surfaced} items surfaced, ${approved} approved, ${skipped} skipped.`;
}

// ─────────────────────────────────────────────────────────────────────────────

async function handler(request: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const auth = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const to = process.env.DAILY_BRIEF_TO_EMAIL;
  if (!to) {
    return NextResponse.json({ error: 'DAILY_BRIEF_TO_EMAIL is not set' }, { status: 500 });
  }

  const date    = new Date().toISOString().slice(0, 10);
  const supabase = getSupabase();

  // ── Expire stale trials ───────────────────────────────────────────────────
  const now = new Date().toISOString();
  await supabase
    .from('user_subscriptions')
    .update({ status: 'expired' })
    .eq('plan', 'trial')
    .eq('status', 'active')
    .lte('current_period_end', now);

  // ── Find all users with graph data ────────────────────────────────────────
  const { data: entities, error } = await supabase
    .from('tkg_entities')
    .select('user_id')
    .eq('name', 'self');

  if (error) {
    console.error('[daily-brief] tkg_entities query failed:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const userIds = [...new Set((entities ?? []).map(e => e.user_id as string))];

  if (userIds.length === 0) {
    return NextResponse.json({ sent: 0, message: 'No users with graph data' });
  }

  // ── Generate + send for each user ─────────────────────────────────────────
  const results: Array<{ userId: string; success: boolean; error?: string }> = [];

  for (const userId of userIds) {
    try {
      // Look up trial signup date for progressive discovery
      const { data: sub } = await supabase
        .from('user_subscriptions')
        .select('created_at, status')
        .eq('user_id', userId)
        .maybeSingle();

      // Skip users with expired trials
      if (sub?.status === 'expired') {
        results.push({ userId, success: false, error: 'trial expired — skipping' });
        continue;
      }

      // Determine how many days since signup
      let daysSinceSignup = 999; // default: established user
      if (sub?.created_at) {
        const signupMs = new Date(sub.created_at).getTime();
        daysSinceSignup = Math.floor((Date.now() - signupMs) / (1000 * 60 * 60 * 24));
      }

      const { artifactCount, subject: progressiveSubject } = getProgressiveConfig(daysSinceSignup);

      // Generate directives (1 or 2 depending on day)
      const directiveItems: DirectiveItem[] = [];
      for (let i = 0; i < artifactCount; i++) {
        const d = await generateDirective(userId);
        directiveItems.push({
          directive:   d.directive,
          action_type: d.action_type,
          confidence:  d.confidence,
          reason:      d.reason,
        });
      }

      // Auto-generate subject for day 8+ from first directive
      let subject = progressiveSubject;
      if (!subject) {
        const first = directiveItems[0];
        const count = directiveItems.length;
        if (count > 1) {
          subject = `${count} items ready for review`;
        } else {
          // Truncate directive to ~50 chars for subject
          subject = first.directive.length > 55
            ? first.directive.slice(0, 52) + '...'
            : first.directive;
        }
      }

      // Append week-in-review stats to reason on day 7
      if (daysSinceSignup === 7) {
        const weekStats = await getWeekStats(supabase, userId);
        if (weekStats && directiveItems[0]) {
          directiveItems[0].reason = directiveItems[0].reason + weekStats;
        }
      }

      await sendDailyDirective({
        to,
        directives: directiveItems,
        date,
        subject,
      });

      results.push({ userId, success: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[daily-brief] failed for ${userId}:`, msg);
      results.push({ userId, success: false, error: msg });
    }
  }

  const sent   = results.filter(r => r.success).length;
  const errors = results.filter(r => !r.success);

  console.log(`[daily-brief] ${date} — sent ${sent}/${userIds.length}`);

  return NextResponse.json({ date, sent, total: userIds.length, errors });
}

export const GET  = handler;
export const POST = handler;
