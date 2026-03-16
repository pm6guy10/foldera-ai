/**
 * GET /api/cron/sync-microsoft
 *
 * Background sync job — pulls Outlook mail, calendar events, OneDrive files,
 * and To Do tasks into tkg_signals. Runs daily at 3am UTC via Vercel cron.
 *
 * On first connect (last_synced_at is null): pulls last 30 days.
 * On subsequent runs: pulls since last_synced_at.
 *
 * Auth: CRON_SECRET Bearer token.
 */

import { NextResponse } from 'next/server';
import { resolveCronUser } from '@/lib/auth/resolve-user';
import { syncMicrosoft } from '@/lib/sync/microsoft-sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 min — first sync can be slow (30 days)

export async function GET(request: Request) {
  const auth = resolveCronUser(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const result = await syncMicrosoft(userId);

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (err: any) {
    console.error('[sync-microsoft] unexpected error:', err);
    return NextResponse.json(
      { ok: false, error: err.message },
      { status: 500 },
    );
  }
}
