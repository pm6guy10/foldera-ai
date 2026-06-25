/**
 * POST /api/cron/ingest-and-deliver
 *
 * Throttled fallback heartbeat for the event-driven delivery pipeline. The real
 * product is on-demand: a fresh signal or an explicit "sync now" runs the same
 * seed → trigger pipeline (lib/workday-presence/deliver-now.ts) within seconds.
 * This cron exists only because Vercel Hobby caps us at one scheduled tick/day —
 * it is a safety net, never "the schedule the card waits for".
 *
 * Pipeline (owner user only):
 *   1. Sync Microsoft  (Outlook email_sent, OneDrive file_modified)
 *   2. Sync Google     (Gmail sent, Drive file_modified)
 *   3. deliverWorkdayPresence: seed-from-scorer (always) → trigger-runner
 *
 * deliverWorkdayPresence is the SAME function the sync-now routes call, so the
 * cron and on-demand paths can never drift apart (the seed-gate bug existed
 * precisely because those two paths were hand-duplicated).
 *
 * It also re-arms the owner's Microsoft Graph push subscription (Stage 0). On Vercel
 * Hobby the cron count is capped at 2, so the dedicated renew-graph-subscriptions cron
 * is not scheduled here; folding the owner's renewal into this daily tick keeps Outlook
 * push armed with zero new cron entries. (On Pro, schedule the dedicated renewer for
 * all-user coverage.)
 *
 * Auth: CRON_SECRET Bearer token.
 * Schedule: 0 18 * * * (daily at 18:00 UTC / 11am PT)
 * Note: Vercel Hobby is limited to once-daily crons. Change to every-30-min on Pro.
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateCronAuth } from '@/lib/auth/resolve-user';
import { syncMicrosoft } from '@/lib/sync/microsoft-sync';
import { syncGoogle } from '@/lib/sync/google-sync';
import { deliverWorkdayPresence } from '@/lib/workday-presence/deliver-now';
import { ensureGraphSubscription } from '@/lib/sync/graph-subscription';
import { apiErrorForRoute } from '@/lib/utils/api-error';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function handler(request: NextRequest) {
  const authErr = validateCronAuth(request);
  if (authErr) return authErr;

  const userId = process.env.FOLDERA_SELF_USER_ID?.trim();
  if (!userId) {
    return NextResponse.json(
      { ok: false, error: 'Missing FOLDERA_SELF_USER_ID' },
      { status: 500 },
    );
  }

  try {
    // Stage 0: re-arm the owner's Graph push subscription so Outlook change-notifications
    // keep firing /api/webhooks/graph (the real, event-driven delivery path). Best-effort.
    let graphSubscription: unknown = null;
    try {
      graphSubscription = await ensureGraphSubscription(userId);
    } catch (err: unknown) {
      graphSubscription = { error: err instanceof Error ? err.message : String(err) };
    }

    // Stage 1: Sync Microsoft (picks up Outlook email_sent, OneDrive file_modified)
    let microsoftNewSignals = 0;
    let microsoftError: string | undefined;
    try {
      const msResult = await syncMicrosoft(userId);
      microsoftNewSignals =
        msResult.mail_signals +
        msResult.calendar_signals +
        msResult.file_signals +
        msResult.task_signals;
      if (msResult.error) microsoftError = msResult.error;
    } catch (err: unknown) {
      microsoftError = err instanceof Error ? err.message : String(err);
    }

    // Stage 2: Sync Google (picks up Gmail, Drive file_modified)
    let googleNewSignals = 0;
    let googleError: string | undefined;
    try {
      const googleResult = await syncGoogle(userId);
      googleNewSignals =
        googleResult.gmail_signals +
        googleResult.calendar_signals +
        googleResult.drive_signals;
      if (googleResult.error) googleError = googleResult.error;
    } catch (err: unknown) {
      googleError = err instanceof Error ? err.message : String(err);
    }

    const totalNewSignals = microsoftNewSignals + googleNewSignals;

    // Stage 3: deliver — seed-from-scorer (always) → trigger-runner. Same pipeline
    // the on-demand sync-now routes call.
    const delivery = await deliverWorkdayPresence(userId);

    return NextResponse.json({
      ok: true,
      new_signals: {
        microsoft: microsoftNewSignals,
        google: googleNewSignals,
        total: totalNewSignals,
      },
      ...(microsoftError ? { microsoft_error: microsoftError } : {}),
      ...(googleError ? { google_error: googleError } : {}),
      graph_subscription: graphSubscription,
      seed_result: delivery.seed,
      trigger_result: delivery.trigger,
    });
  } catch (error: unknown) {
    return apiErrorForRoute(error, 'cron/ingest-and-deliver');
  }
}

export const GET = handler;
export const POST = handler;
