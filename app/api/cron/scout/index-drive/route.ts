/**
 * GET /api/cron/scout/index-drive
 *
 * Scout lane (issue #486): resumable full-Drive index. Processes one bounded
 * batch per tick (the crawl resumes from a stored page token), embedding Drive
 * content into scout_drive_chunks for retrieval.
 *
 * Inert unless SCOUT_RAG_ENABLED and a Voyage key are configured — returns a
 * skipped response otherwise, so registering the cron is safe before the lane
 * is turned on.
 *
 * Auth: CRON_SECRET Bearer token.
 */

import { NextResponse } from 'next/server';
import { validateCronAuth } from '@/lib/auth/resolve-user';
import { getAllUsersWithProvider } from '@/lib/auth/user-tokens';
import { isScoutRagEnabled, isScoutEmbeddingsConfigured } from '@/lib/config/prelaunch-spend';
import { indexDriveForUser } from '@/lib/scout/drive-index';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 min — one resumable batch per tick.

export async function GET(request: Request) {
  const authError = validateCronAuth(request);
  if (authError) return authError;

  if (!isScoutRagEnabled() || !isScoutEmbeddingsConfigured()) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: 'SCOUT_RAG_ENABLED and a Voyage key are required',
    });
  }

  const userIds = await getAllUsersWithProvider('google');
  if (userIds.length === 0) {
    return NextResponse.json({ ok: true, message: 'No users with Google tokens', users: 0 });
  }

  const results: Array<{ userId: string } & Awaited<ReturnType<typeof indexDriveForUser>>> = [];
  for (const userId of userIds) {
    try {
      const result = await indexDriveForUser(userId);
      results.push({ userId, ...result });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[scout-index] unexpected error for user ${userId}:`, message);
      results.push({
        userId,
        status: 'error',
        filesProcessed: 0,
        filesSkipped: 0,
        chunksUpserted: 0,
        done: false,
        error: message,
      });
    }
  }

  const failed = results.filter((r) => r.status === 'error').length;
  return NextResponse.json({ ok: failed === 0, users: userIds.length, failed, results });
}
