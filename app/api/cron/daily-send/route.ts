/**
 * GET /api/cron/daily-send
 *
 * Phase 2 of the daily brief: read today's SINGLE highest-confidence directive
 * from tkg_actions (status='pending_approval'), send ONE email, and mark the action as emailed.
 *
 * Runs at 7:00 AM UTC. Must complete in <45s (Vercel Hobby 60s limit).
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateCronAuth } from '@/lib/auth/resolve-user';
import { runDailySend, toSafeDailyBriefStageStatus } from '@/lib/cron/daily-brief';
import { apiError } from '@/lib/utils/api-error';

export const dynamic = 'force-dynamic';

async function handler(request: NextRequest) {
  const authErr = validateCronAuth(request);
  if (authErr) return authErr;

  try {
    const result = await runDailySend();
    return NextResponse.json({
      date: result.date,
      send: {
        ...toSafeDailyBriefStageStatus(result),
        results: result.results,
      },
    });
  } catch (error: unknown) {
    return apiError(error, 'cron/daily-send');
  }
}

export const GET = handler;
export const POST = handler;
