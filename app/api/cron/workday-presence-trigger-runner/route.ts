import { NextRequest, NextResponse } from 'next/server';
import { validateCronAuth } from '@/lib/auth/resolve-user';
import {
  maybeRunWorkdayPresenceTriggerRunnerForUser,
} from '@/lib/workday-presence/trigger-runner';
import { apiErrorForRoute } from '@/lib/utils/api-error';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function handler(request: NextRequest) {
  const authError = validateCronAuth(request);
  if (authError) return authError;

  try {
    const userId = process.env.FOLDERA_SELF_USER_ID?.trim();
    if (!userId) {
      throw new Error('Missing FOLDERA_SELF_USER_ID for workday presence trigger-runner');
    }
    const result = await maybeRunWorkdayPresenceTriggerRunnerForUser(userId);

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error: unknown) {
    return apiErrorForRoute(error, 'cron/workday-presence-trigger-runner');
  }
}

export const GET = handler;
export const POST = handler;
