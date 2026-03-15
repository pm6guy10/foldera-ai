/**
 * GET /api/cron/daily-send
 *
 * Phase 2 of the daily brief: read today's SINGLE highest-confidence directive
 * from tkg_actions (status='generated'), send ONE email, update status.
 *
 * Runs at 7:00 AM UTC. Must complete in <45s (Vercel Hobby 60s limit).
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateCronAuth } from '@/lib/auth/resolve-user';
import { createServerClient } from '@/lib/db/client';
import { sendDailyDirective } from '@/lib/email/resend';
import { apiError } from '@/lib/utils/api-error';
import type { DirectiveItem } from '@/lib/email/resend';

export const dynamic = 'force-dynamic';

const CONFIDENCE_THRESHOLD = 70;

async function handler(request: NextRequest) {
  const authErr = validateCronAuth(request);
  if (authErr) return authErr;

  const to = process.env.DAILY_BRIEF_TO_EMAIL;
  if (!to) return NextResponse.json({ error: 'DAILY_BRIEF_TO_EMAIL is not set' }, { status: 500 });

  const supabase = createServerClient();
  const date = new Date().toISOString().slice(0, 10);

  const todayStart = new Date(); todayStart.setUTCHours(0, 0, 0, 0);
  const { data: entities, error } = await supabase.from('tkg_entities').select('user_id').eq('name', 'self');
  if (error) return apiError(error, 'cron/daily-send');

  const userIds = [...new Set((entities ?? []).map((e: { user_id: string }) => e.user_id))];
  if (userIds.length === 0) return NextResponse.json({ sent: 0, message: 'No users' });

  const results: Array<{ userId: string; success: boolean; error?: string }> = [];

  for (const userId of userIds) {
    try {
      // Check subscription (exempt owner)
      const { data: sub } = await supabase
        .from('user_subscriptions').select('created_at, status').eq('user_id', userId).maybeSingle();
      if (sub?.status === 'expired' && userId !== 'e40b7cd8-4925-42f7-bc99-5022969f1d22') {
        results.push({ userId, success: false, error: 'trial expired' }); continue;
      }

      // Fetch today's generated directives — pick the SINGLE highest confidence
      const { data: actions } = await supabase
        .from('tkg_actions')
        .select('id, action_type, directive_text, reason, confidence')
        .eq('user_id', userId)
        .eq('status', 'generated')
        .gte('generated_at', todayStart.toISOString())
        .order('confidence', { ascending: false })
        .limit(1);

      const action = actions?.[0];

      if (!action) {
        results.push({ userId, success: false, error: 'no generated directives found' });
        continue;
      }

      const confidence = (action.confidence as number) ?? 0;

      // Below threshold → "Nothing today"
      if (confidence < CONFIDENCE_THRESHOLD) {
        await sendDailyDirective({ to, date, subject: 'Foldera: Nothing today', directives: [] });
        results.push({ userId, success: true });
        continue;
      }

      // Build single directive
      const directiveItem: DirectiveItem = {
        id: action.id,
        directive: action.directive_text as string,
        action_type: action.action_type as string,
        confidence,
        reason: ((action.reason as string) ?? '').split('[score=')[0].trim(),
      };

      const words = directiveItem.directive.split(/\s+/).slice(0, 6).join(' ');
      const subject = `Foldera: ${words.length > 50 ? words.slice(0, 47) + '...' : words}`;

      // Send ONE email
      await sendDailyDirective({ to, directives: [directiveItem], date, subject });

      // Update status
      await supabase.from('tkg_actions').update({ status: 'pending_approval' }).eq('id', action.id);

      results.push({ userId, success: true });
      console.log(`[daily-send] ${userId}: directive sent (confidence ${confidence}%)`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[daily-send] failed for ${userId}:`, msg);
      results.push({ userId, success: false, error: msg });
    }
  }

  const sent = results.filter(r => r.success).length;
  return NextResponse.json({ date, sent, total: userIds.length, results });
}

export const GET = handler;
export const POST = handler;
