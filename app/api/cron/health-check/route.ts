/**
 * GET /api/cron/health-check
 *
 * Manual or external trigger (CRON_SECRET). **Not** a Vercel scheduled cron — Hobby
 * limit is satisfied by running `runPlatformHealthAlert()` from `daily-brief` (`finally`).
 * Fetches /api/health; on failure sends alert to DAILY_BRIEF_TO_EMAIL via Resend.
 */

import { NextResponse } from 'next/server';
import { validateCronAuth } from '@/lib/auth/resolve-user';
import { runPlatformHealthAlert } from '@/lib/cron/cron-health-alert';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const authErr = validateCronAuth(request);
  if (authErr) return authErr;

  const result = await runPlatformHealthAlert();
  return NextResponse.json(result);
}
