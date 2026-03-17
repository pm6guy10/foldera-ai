/**
 * GET /api/cron/daily-generate
 *
 * Phase 1 of the daily brief: generate ONE directive + artifact, save to
 * tkg_actions with status='generated'. No email sent — daily-send handles that.
 *
 * Runs at 6:50 AM UTC. Must complete in <45s (Vercel Hobby 60s limit).
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateCronAuth } from '@/lib/auth/resolve-user';
import { runDailyGenerate, toSafeDailyBriefStageStatus } from '@/lib/cron/daily-brief';
import { apiError } from '@/lib/utils/api-error';

export const dynamic = 'force-dynamic';

async function handler(request: NextRequest) {
  const authErr = validateCronAuth(request);
  if (authErr) return authErr;

  try {
    const result = await runDailyGenerate();
    return NextResponse.json({
      date: result.date,
      generated: result.succeeded,
      total: result.total,
      status: toSafeDailyBriefStageStatus(result),
    });
  } catch (error: unknown) {
    return apiError(error, 'cron/daily-generate');
  }
}

export const GET = handler;
export const POST = handler;
