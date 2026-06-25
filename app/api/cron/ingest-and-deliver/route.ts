/**
 * POST /api/cron/ingest-and-deliver
 *
 * Event-driven delivery cycle — runs every 30 min so fresh signals (email_sent,
 * file_modified) produce a Slack card within minutes rather than at the next
 * 11:00 UTC morning cron.
 *
 * Pipeline (owner user only):
 *   1. Sync Microsoft  (Outlook email_sent, OneDrive file_modified)
 *   2. Sync Google     (Gmail sent, Drive file_modified)
 *   3. If new signals > 0: seed-from-scorer (score → directive → seed state)
 *   4. Always: trigger-runner (evaluate triggers → Slack card if warranted)
 *
 * seed-from-scorer is gated on new signals to avoid unnecessary LLM calls when
 * nothing changed. trigger-runner always runs because it handles time-based
 * triggers (commitment lapsing) and has built-in dedup (last_trigger_key +
 * last_signal_cursor) that prevents duplicate Slack cards.
 *
 * Auth: CRON_SECRET Bearer token.
 * Schedule: 0 18 * * * (daily at 18:00 UTC / 11am PT)
 * Note: Vercel Hobby is limited to once-daily crons. Change to every-30-min on Pro.
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateCronAuth } from '@/lib/auth/resolve-user';
import { syncMicrosoft } from '@/lib/sync/microsoft-sync';
import { syncGoogle } from '@/lib/sync/google-sync';
import { POST as runSeedFromScorer } from '@/app/api/workday-presence/seed-from-scorer/route';
import { POST as runTriggerRunner } from '@/app/api/cron/workday-presence-trigger-runner/route';
import { apiErrorForRoute } from '@/lib/utils/api-error';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function makeForwardHeaders(request: NextRequest): Headers {
  const headers = new Headers();
  const authorization = request.headers.get('authorization');
  const cronSecret = request.headers.get('x-cron-secret');
  if (authorization) headers.set('authorization', authorization);
  if (cronSecret) headers.set('x-cron-secret', cronSecret);
  return headers;
}

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
    const forwardHeaders = makeForwardHeaders(request);

    // Stage 3: seed-from-scorer — only when fresh signals arrived.
    // Uses CRON_SECRET auth so resolveAnyUser maps to INGEST_USER_ID (owner).
    let seedResult: unknown = null;
    if (totalNewSignals > 0) {
      const seedRequest = new NextRequest(
        new URL('/api/workday-presence/seed-from-scorer', request.nextUrl.origin),
        { method: 'POST', headers: forwardHeaders },
      );
      const seedResponse = await runSeedFromScorer(seedRequest);
      try {
        seedResult = await seedResponse.json();
      } catch {
        seedResult = { error: 'non-json seed response', status: seedResponse.status };
      }
    }

    // Stage 4: trigger-runner — always runs; built-in dedup prevents duplicate cards.
    // Handles commitment-lapsing and other time-based triggers even without new sync signals.
    const triggerRequest = new NextRequest(
      new URL('/api/cron/workday-presence-trigger-runner', request.nextUrl.origin),
      { method: 'POST', headers: forwardHeaders },
    );
    const triggerResponse = await runTriggerRunner(triggerRequest);
    let triggerResult: unknown = null;
    try {
      triggerResult = await triggerResponse.json();
    } catch {
      triggerResult = { error: 'non-json trigger response', status: triggerResponse.status };
    }

    return NextResponse.json({
      ok: true,
      new_signals: {
        microsoft: microsoftNewSignals,
        google: googleNewSignals,
        total: totalNewSignals,
      },
      ...(microsoftError ? { microsoft_error: microsoftError } : {}),
      ...(googleError ? { google_error: googleError } : {}),
      seed_skipped: totalNewSignals === 0,
      seed_result: seedResult,
      trigger_result: triggerResult,
    });
  } catch (error: unknown) {
    return apiErrorForRoute(error, 'cron/ingest-and-deliver');
  }
}

export const GET = handler;
export const POST = handler;
