/**
 * GET /api/cron/daily-brief
 *
 * Runs every day at 7 AM UTC (see vercel.json).
 * Protected by Authorization: Bearer CRON_SECRET.
 *
 * For each user with a self entity in tkg_entities:
 *   1. generateDirective(userId)
 *   2. sendDailyDirective() via Resend
 *
 * Required env vars:
 *   CRON_SECRET          — set in Vercel dashboard; Vercel passes it automatically
 *   RESEND_API_KEY       — from resend.com dashboard
 *   RESEND_FROM_EMAIL    — verified sender address
 *   DAILY_BRIEF_TO_EMAIL — recipient address (single-user app)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient }              from '@supabase/supabase-js';
import { generateDirective }         from '@/lib/briefing/generator';
import { sendDailyDirective }        from '@/lib/email/resend';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function handler(request: NextRequest) {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const auth = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const to = process.env.DAILY_BRIEF_TO_EMAIL;
  if (!to) {
    return NextResponse.json(
      { error: 'DAILY_BRIEF_TO_EMAIL is not set' },
      { status: 500 },
    );
  }

  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  // ── Find all users with graph data ──────────────────────────────────────────
  const supabase = getSupabase();
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

  // ── Generate + send for each user ───────────────────────────────────────────
  const results: Array<{ userId: string; success: boolean; error?: string }> = [];

  for (const userId of userIds) {
    try {
      const directive = await generateDirective(userId);

      await sendDailyDirective({
        to,
        directive:   directive.directive,
        action_type: directive.action_type,
        confidence:  directive.confidence,
        reason:      directive.reason,
        date,
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
