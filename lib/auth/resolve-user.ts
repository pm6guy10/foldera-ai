import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth/auth-options';

/**
 * Resolves the authenticated userId for routes that accept either:
 *   1. x-ingest-secret header  → INGEST_USER_ID
 *   2. NextAuth session         → INGEST_USER_ID ?? session.user.id
 *
 * Returns { userId } on success, or a ready-to-return NextResponse on failure.
 */
export async function resolveUser(
  request: Request,
): Promise<{ userId: string } | NextResponse> {
  const ingestSecret = request.headers.get('x-ingest-secret');
  if (ingestSecret) {
    if (ingestSecret !== process.env.INGEST_API_KEY) {
      return NextResponse.json({ error: 'Invalid ingest secret' }, { status: 401 });
    }
    const userId = process.env.INGEST_USER_ID;
    if (!userId) {
      return NextResponse.json({ error: 'User ID not resolved' }, { status: 500 });
    }
    return { userId };
  }

  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = process.env.INGEST_USER_ID ?? session.user.id;
  return { userId };
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
