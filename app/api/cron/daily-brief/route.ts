/**
 * GET/POST /api/cron/daily-brief
 *
 * Dedicated cron for daily brief generate + send so LLM work gets a full serverless
 * window (separate from nightly-ops ingest/sync).
 *
 * Auth: CRON_SECRET Bearer token.
 * Schedule: 10 11 * * * (4:10am PT / 11:10 UTC), 10 minutes after nightly-ops.
 */

import * as Sentry from '@sentry/nextjs';
import { NextRequest, NextResponse } from 'next/server';
import { validateCronAuth } from '@/lib/auth/resolve-user';
import { checkApiCreditCanary } from '@/lib/cron/acceptance-gate';
import { runBriefLifecycle } from '@/lib/cron/brief-service';
import { resolveDailyBriefUserIds } from '@/lib/cron/daily-brief-generate';
import { getTriggerResponseStatus } from '@/lib/cron/daily-brief';
import { createServerClient } from '@/lib/db/client';
import { TEST_USER_ID } from '@/lib/config/constants';
import { apiError } from '@/lib/utils/api-error';

export const dynamic = 'force-dynamic';
/** Hobby ceiling; this route only runs generate+send (not full nightly pipeline). */
export const maxDuration = 60;

function resolveSignalCreatedAtGte(request: NextRequest): string | null {
  const raw = request.nextUrl.searchParams.get('signalCreatedAtGte');
  if (!raw) {
    return null;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

async function handler(request: NextRequest) {
  const authErr = validateCronAuth(request);
  if (authErr) return authErr;

  const startTime = Date.now();

  try {
    const signalCreatedAtGte = resolveSignalCreatedAtGte(request);
    const briefOptions = {
      signalCreatedAtGte: signalCreatedAtGte ?? undefined,
    };

    const eligibleUserIds = (await resolveDailyBriefUserIds()).filter((id) => id !== TEST_USER_ID);

    if (eligibleUserIds.length === 0) {
      return NextResponse.json(
        {
          ok: true,
          skipped: true,
          reason: 'no_eligible_users',
          duration_ms: Date.now() - startTime,
        },
        { status: 200 },
      );
    }

    // Double-fire guard — same pattern as former nightly-ops brief stage.
    const supabase = createServerClient();
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const { data: todayActions } = await supabase
      .from('tkg_actions')
      .select('user_id, execution_result')
      .gte('generated_at', todayStart.toISOString())
      .in('user_id', eligibleUserIds);

    const usersAlreadySent = new Set(
      (todayActions ?? [])
        .filter((a) => {
          const er = a.execution_result as Record<string, unknown> | null;
          return er?.daily_brief_sent_at;
        })
        .map((a) => a.user_id as string),
    );

    if (eligibleUserIds.every((uid) => usersAlreadySent.has(uid))) {
      return NextResponse.json(
        {
          ok: true,
          skipped: true,
          reason: 'already_ran_today',
          duration_ms: Date.now() - startTime,
        },
        { status: 200 },
      );
    }

    try {
      const canary = await checkApiCreditCanary();
      if (!canary.pass) {
        console.log(JSON.stringify({ event: 'daily_brief_cron', stage: 'credit_canary', pass: false }));
        return NextResponse.json(
          {
            ok: false,
            skipped: true,
            reason: 'credit_canary_failed',
            credit_canary: { ok: false, ...canary },
            duration_ms: Date.now() - startTime,
          },
          { status: 200 },
        );
      }
    } catch (err: unknown) {
      Sentry.captureException(err);
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json(
        {
          ok: false,
          skipped: true,
          reason: 'credit_canary_error',
          error: message,
          duration_ms: Date.now() - startTime,
        },
        { status: 200 },
      );
    }

    const { result } = await runBriefLifecycle({
      ...briefOptions,
      userIds: eligibleUserIds,
    });
    const duration_ms = Date.now() - startTime;

    return NextResponse.json(
      {
        ...result,
        duration_ms,
      },
      {
        status: getTriggerResponseStatus(
          result.signal_processing,
          result.generate,
          result.send,
        ),
      },
    );
  } catch (error: unknown) {
    return apiError(error, 'cron/daily-brief');
  }
}

export const GET = handler;
export const POST = handler;
