/**
 * GET /api/cron/sync-google
 *
 * Background sync job — pulls Gmail messages and Google Calendar events
 * into tkg_signals for ALL users with a connected Google token.
 *
 * On first connect (last_synced_at is null): pulls last 90 days.
 * On subsequent runs: pulls since last_synced_at.
 *
 * Auth: CRON_SECRET Bearer token.
 */

import { NextResponse } from 'next/server';
import { validateCronAuth } from '@/lib/auth/resolve-user';
import { getAllUsersWithProvider } from '@/lib/auth/user-tokens';
import { syncGoogle } from '@/lib/sync/google-sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 min — first sync can be slow (30 days)

export async function GET(request: Request) {
  const authError = validateCronAuth(request);
  if (authError) return authError;

  const userIds = await getAllUsersWithProvider('google');
  if (userIds.length === 0) {
    return NextResponse.json({ ok: true, message: 'No users with Google tokens', users: 0 });
  }

  const results: Array<{ userId: string; ok: boolean; gmail_signals?: number; calendar_signals?: number; drive_signals?: number; error?: string }> = [];

  for (const userId of userIds) {
    try {
      const result = await syncGoogle(userId);
      results.push({
        userId,
        ok: !result.error,
        gmail_signals: result.gmail_signals,
        calendar_signals: result.calendar_signals,
        drive_signals: result.drive_signals,
        error: result.error,
      });
    } catch (err: any) {
      console.error(`[sync-google] unexpected error for user ${userId}:`, err.message);
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
