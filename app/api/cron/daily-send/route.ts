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
import {
  filterDailyBriefEligibleUserIds,
  getVerifiedDailyBriefRecipientEmail,
} from '@/lib/auth/daily-brief-users';
import type { DirectiveItem } from '@/lib/email/resend';

export const dynamic = 'force-dynamic';

const CONFIDENCE_THRESHOLD = 70;

async function handler(request: NextRequest) {
  const authErr = validateCronAuth(request);
  if (authErr) return authErr;

  const supabase = createServerClient();
  const date = new Date().toISOString().slice(0, 10);

  const todayStart = new Date(); todayStart.setUTCHours(0, 0, 0, 0);
  const { data: entities, error } = await supabase.from('tkg_entities').select('user_id').eq('name', 'self');
  if (error) return apiError(error, 'cron/daily-send');

  const userIds = [...new Set((entities ?? []).map((e: { user_id: string }) => e.user_id))];
  const eligibleUserIds = await filterDailyBriefEligibleUserIds(userIds, supabase);
  if (eligibleUserIds.length === 0) {
    return NextResponse.json({ sent: 0, message: 'No eligible users' });
  }

  const results: Array<{ userId: string; success: boolean; error?: string }> = [];

  for (const userId of eligibleUserIds) {
    try {
      const to = await getVerifiedDailyBriefRecipientEmail(userId, supabase);
      if (!to) {
        results.push({ userId, success: false, error: 'no verified email' });
        continue;
      }

      // Fetch today's generated directives — pick the SINGLE highest confidence
      const { data: actions, error: actionsError } = await supabase
        .from('tkg_actions')
        .select('id, action_type, directive_text, reason, confidence')
        .eq('user_id', userId)
        .eq('status', 'generated')
        .gte('generated_at', todayStart.toISOString())
        .order('confidence', { ascending: false })
        .limit(1);

      if (actionsError) {
        results.push({ userId, success: false, error: actionsError.message });
        continue;
      }

      const action = actions?.[0];

      if (!action) {
        results.push({ userId, success: false, error: 'no generated directives found' });
        continue;
      }

      const confidence = (action.confidence as number) ?? 0;

      // Below threshold → "Nothing today"
      if (confidence < CONFIDENCE_THRESHOLD) {
        await sendDailyDirective({
          to,
          date,
          subject: 'Foldera: Nothing today',
          directives: [],
          userId,
        });
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
      await sendDailyDirective({ to, directives: [directiveItem], date, subject, userId });

      // Update status
      const { error: updateError } = await supabase
        .from('tkg_actions')
        .update({ status: 'pending_approval' })
        .eq('id', action.id);

      if (updateError) {
        results.push({ userId, success: false, error: updateError.message });
        continue;
      }

      results.push({ userId, success: true });
      console.log(`[daily-send] ${userId}: directive sent (confidence ${confidence}%)`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[daily-send] failed for ${userId}:`, msg);
      results.push({ userId, success: false, error: msg });
    }
  }

  const sent = results.filter(r => r.success).length;
  return NextResponse.json({ date, sent, total: eligibleUserIds.length, results });
}

export const GET = handler;
export const POST = handler;
