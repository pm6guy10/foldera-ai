/**
 * GET /api/cron/daily-send
 *
 * Phase 2 of the daily brief: read today's SINGLE highest-confidence directive
 * from tkg_actions (status='pending_approval'), send ONE email, and mark the action as emailed.
 *
 * Runs at 11:00 UTC (nightly-ops / send stage). Must complete in <45s (Vercel Hobby 60s limit).
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateCronAuth } from '@/lib/auth/resolve-user';
import { runDailySend, toSafeDailyBriefStageStatus } from '@/lib/cron/daily-brief';
import { apiErrorForRoute } from '@/lib/utils/api-error';
import type { DailyBriefRunResult, DailyBriefUserResult } from '@/lib/cron/daily-brief-types';

export const dynamic = 'force-dynamic';

/** Expected silence — not a cron crash (e.g. user not verified, nothing to send yet). */
const SEND_SOFT_FAILURE_CODES = new Set<DailyBriefUserResult['code']>([
  'no_verified_email',
  'no_generated_directive',
]);

function resolveDailySendHttpStatus(result: DailyBriefRunResult): number {
  const sendStatus = toSafeDailyBriefStageStatus(result);
  if (sendStatus.status === 'failed') {
    const outcomes = result.results;
    const onlySoft =
      outcomes.length > 0 &&
      outcomes.every((r) => r.success || SEND_SOFT_FAILURE_CODES.has(r.code));
    if (onlySoft) return 200;
    return 500;
  }
  return sendStatus.status === 'partial' ? 207 : 200;
}

async function handler(request: NextRequest) {
  const authErr = validateCronAuth(request);
  if (authErr) return authErr;

  try {
    const result = await runDailySend();
    const status = resolveDailySendHttpStatus(result);
    const sendStatus = toSafeDailyBriefStageStatus(result);

    return NextResponse.json({
      date: result.date,
      send: {
        ...sendStatus,
        results: result.results,
      },
    }, { status });
  } catch (error: unknown) {
    return apiErrorForRoute(error, 'cron/daily-send');
  }
}

export const GET = handler;
export const POST = handler;
