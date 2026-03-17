import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth/auth-options';

/**
 * Resolves the authenticated userId for non-cron routes.
 * Session-backed APIs must use session.user.id exclusively.
 *
 * Returns { userId } on success, or a ready-to-return NextResponse on failure.
 */
export async function resolveUser(
  _request: Request,
): Promise<{ userId: string } | NextResponse> {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return { userId: session.user.id };
}

/**
 * Validates Bearer CRON_SECRET and resolves INGEST_USER_ID.
 * Used by cron routes that process the single ingested user's data.
 *
 * Returns { userId } on success, or a ready-to-return NextResponse on failure.
 */
export function resolveCronUser(
  request: Request,
): { userId: string } | NextResponse {
  const authHeader = request.headers.get('authorization') ?? '';
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = process.env.INGEST_USER_ID;
  if (!userId) {
    return NextResponse.json({ error: 'INGEST_USER_ID not configured' }, { status: 500 });
  }

  return { userId };
}

/**
 * Validates Bearer CRON_SECRET for cron routes that don't resolve a specific user
 * (e.g., cleanup jobs that operate across all users).
 *
 * Returns null on success, or a ready-to-return NextResponse on failure.
 */
export function validateCronAuth(
  request: Request,
): NextResponse | null {
  const authHeader = request.headers.get('authorization') ?? '';
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}
