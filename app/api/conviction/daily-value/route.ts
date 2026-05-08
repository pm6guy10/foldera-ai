/**
 * GET /api/conviction/daily-value
 *
 * Returns a safe, no-paid dashboard projection from the deterministic current
 * winner replay. This is separate from /api/conviction/latest so the normal
 * pending-artifact route stays narrow and cheap.
 */

import { NextResponse } from 'next/server';
import { resolveUser } from '@/lib/auth/resolve-user';
import { buildDailyUtilitySlateFromWinnerTruth } from '@/lib/briefing/daily-utility-slate';
import { getWinnerTruthReport } from '@/lib/system/winner-truth';
import { apiErrorForRoute } from '@/lib/utils/api-error';

export const dynamic = 'force-dynamic';

const NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
  Pragma: 'no-cache',
} as const;

export async function GET(request: Request) {
  const auth = await resolveUser(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const report = await getWinnerTruthReport(auth.userId);
    const dailyUtilitySlate = buildDailyUtilitySlateFromWinnerTruth(report);

    return NextResponse.json(
      {
        daily_utility_slate: dailyUtilitySlate,
      },
      { status: 200, headers: NO_STORE_HEADERS },
    );
  } catch (error: unknown) {
    return apiErrorForRoute(error, 'conviction/daily-value GET');
  }
}
