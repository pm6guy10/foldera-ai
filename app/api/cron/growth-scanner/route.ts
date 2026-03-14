/**
 * GET /api/cron/growth-scanner
 *
 * Daily at 8am Pacific (15:00 UTC) — 1 hour after daily-brief.
 * Scans Reddit, Twitter/X, and Hacker News for pain signal posts.
 * Top signals stored in tkg_signals where they compete in tomorrow's
 * conviction engine scorer alongside personal signals.
 *
 * The growth goal in tkg_goals ("Acquire first 10 paying users", priority 5)
 * matches these signals via keyword overlap. The EV math is identical to
 * personal signals. No special cases.
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateCronAuth } from '@/lib/auth/resolve-user';
import { scanGrowthSignals } from '@/lib/growth/signal-scanner';

export const dynamic = 'force-dynamic';

async function handler(request: NextRequest) {
  const authErr = validateCronAuth(request);
  if (authErr) return authErr;

  const userId = process.env.INGEST_USER_ID;
  if (!userId) {
    return NextResponse.json({ error: 'INGEST_USER_ID not set' }, { status: 500 });
  }

  try {
    const result = await scanGrowthSignals(userId);
    console.log(`[growth-scanner] Complete:`, JSON.stringify(result));
    return NextResponse.json({ date: new Date().toISOString().slice(0, 10), ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[growth-scanner] Failed:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const GET  = handler;
export const POST = handler;
