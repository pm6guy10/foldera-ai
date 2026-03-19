/**
 * GET /api/cron/sync-microsoft
 *
 * Background sync job — pulls Outlook mail, calendar events, OneDrive files,
 * and To Do tasks into tkg_signals for ALL users with a connected Microsoft token.
 *
 * On first connect (last_synced_at is null): pulls last 30 days.
 * On subsequent runs: pulls since last_synced_at.
 *
 * Auth: CRON_SECRET Bearer token.
 */

import { NextResponse } from 'next/server';
import { validateCronAuth } from '@/lib/auth/resolve-user';
import { getAllUsersWithProvider } from '@/lib/auth/user-tokens';
import { syncMicrosoft } from '@/lib/sync/microsoft-sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 min — first sync can be slow (30 days)

export async function GET(request: Request) {
  const authError = validateCronAuth(request);
  if (authError) return authError;

  const userIds = await getAllUsersWithProvider('microsoft');
  if (userIds.length === 0) {
    return NextResponse.json({ ok: true, message: 'No users with Microsoft tokens', users: 0 });
  }

  const results: Array<{ userId: string; ok: boolean; mail_signals?: number; calendar_signals?: number; error?: string }> = [];

  for (const userId of userIds) {
    try {
      const result = await syncMicrosoft(userId);
      results.push({
        userId,
        ok: !result.error,
        mail_signals: result.mail_signals,
        calendar_signals: result.calendar_signals,
        error: result.error,
      });
    } catch (err: any) {
      console.error(`[sync-microsoft] unexpected error for user ${userId}:`, err.message);
      results.push({ userId, ok: false, error: err.message });
    }
  }

  const succeeded = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;

  return NextResponse.json({
    ok: failed === 0,
    users: userIds.length,
    succeeded,
    failed,
    results,
  });
}
