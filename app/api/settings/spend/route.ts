/**
 * GET /api/settings/spend
 * Returns daily and monthly API spend for the settings page.
 * Auth required — returns data for any authenticated session (single-user app).
 */

import { NextResponse } from 'next/server';
import { getSpendSummary } from '@/lib/utils/api-tracker';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const summary = await getSpendSummary();
    return NextResponse.json(summary);
  } catch (err) {
    console.error('[settings/spend] failed:', err);
    return NextResponse.json({ todayUSD: 0, monthUSD: 0, dailyCapUSD: 1.50, capPct: 0 });
  }
}
