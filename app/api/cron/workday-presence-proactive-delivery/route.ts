/**
 * GET /api/cron/workday-presence-proactive-delivery
 *
 * Cron-callable wrapper around maybeDeliverProactiveWinner (#567 Phase B) — the
 * heartbeat-only fallback that posts a freshly seeded, draft-backed scored_winner to
 * Slack when there is no fresh inbound signal for trigger-runner to react to. Run as a
 * stage in morning-pipeline AFTER seed_from_scorer and trigger_runner so it always sees
 * the latest seeded state and never double-posts over a reactive trigger-runner card.
 *
 * Auth: CRON_SECRET Bearer token.
 */
import { NextRequest, NextResponse } from 'next/server';
import { validateCronAuth } from '@/lib/auth/resolve-user';
import { maybeDeliverProactiveWinner } from '@/lib/workday-presence/proactive-delivery';
import { apiErrorForRoute } from '@/lib/utils/api-error';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function handler(request: NextRequest) {
  const authError = validateCronAuth(request);
  if (authError) return authError;

  try {
    const userId = process.env.FOLDERA_SELF_USER_ID?.trim();
    if (!userId) {
      throw new Error('Missing FOLDERA_SELF_USER_ID for workday presence proactive delivery');
    }
    const result = await maybeDeliverProactiveWinner(userId);

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error: unknown) {
    return apiErrorForRoute(error, 'cron/workday-presence-proactive-delivery');
  }
}

export const GET = handler;
export const POST = handler;
