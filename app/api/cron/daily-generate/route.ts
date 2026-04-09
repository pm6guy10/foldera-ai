/**
 * GET /api/cron/daily-generate
 *
 * Phase 1 of the daily brief: generate ONE directive + artifact, save to
 * tkg_actions with status='pending_approval'. No email sent — daily-send handles that.
 *
 * Runs at 6:50 AM UTC. Must complete in <45s (Vercel Hobby 60s limit).
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateCronAuth } from '@/lib/auth/resolve-user';
import { runDailyGenerate, toSafeDailyBriefStageStatus } from '@/lib/cron/daily-brief';
import { apiErrorForRoute } from '@/lib/utils/api-error';

export const dynamic = 'force-dynamic';
/** Signal processing + scoring + directive can exceed default 60s on Hobby. */
export const maxDuration = 120;

async function handler(request: NextRequest) {
  const authErr = validateCronAuth(request);
  if (authErr) return authErr;

  try {
    const result = await runDailyGenerate({ briefInvocationSource: 'cron_daily_generate' });
    const generateStatus = toSafeDailyBriefStageStatus(result);
    const signalStatus = toSafeDailyBriefStageStatus(result.signalProcessing);
    const status =
      generateStatus.status === 'failed' || signalStatus.status === 'failed'
        ? 500
        : (generateStatus.status === 'partial' || signalStatus.status === 'partial' ? 207 : 200);

    return NextResponse.json({
      date: result.date,
      generate: {
        ...generateStatus,
        results: result.results,
      },
      signal_processing: {
        ...signalStatus,
        results: result.signalProcessing.results,
      },
    }, { status });
  } catch (error: unknown) {
    return apiErrorForRoute(error, 'cron/daily-generate');
  }
}

export const GET = handler;
export const POST = handler;
