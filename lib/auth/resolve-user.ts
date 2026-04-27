import { timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth/auth-options';

/** Standard UUID v4 format check (also accepts nil UUID). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Returns true when the string is a syntactically valid UUID. */
export function isValidUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/**
 * Constant-time secret token comparison.
 * Prevents timing-based brute-force attacks on CRON_SECRET.
 */
function isValidSecretToken(token: string, secret: string): boolean {
  if (token.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(secret));
}

/**
 * Extracts token from Authorization Bearer header.
 * Accepts case-insensitive "bearer" with extra surrounding whitespace.
 */
function extractBearerToken(authHeader: string): string | null {
  const match = authHeader.match(/^\s*Bearer\s+(.+?)\s*$/i);
  return match?.[1] ?? null;
}

/**
 * Checks cron auth via either:
 * - Authorization: Bearer <CRON_SECRET>
 * - x-cron-secret: <CRON_SECRET>
 */
function hasValidCronSecret(request: Request, cronSecret: string): boolean {
  const authorization = request.headers.get('authorization') ?? '';
  const bearerToken = extractBearerToken(authorization);
  if (bearerToken && isValidSecretToken(bearerToken, cronSecret)) {
    return true;
  }

  const headerSecret = request.headers.get('x-cron-secret') ?? '';
  if (headerSecret && isValidSecretToken(headerSecret.trim(), cronSecret)) {
    return true;
  }

  return false;
}

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

  // Guard against corrupted/non-UUID session IDs (e.g. "test-user-..." from bots)
  // that would cause Postgres "invalid input syntax for type uuid" errors.
  if (!isValidUuid(session.user.id)) {
    console.error(`[resolve-user] invalid UUID in session: ${session.user.id}`);
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
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret || !hasValidCronSecret(request, cronSecret)) {
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
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret || !hasValidCronSecret(request, cronSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}
