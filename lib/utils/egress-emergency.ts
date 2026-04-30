import { timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';

const EMERGENCY_RETRY_SECONDS = 3600;

export function isEgressEmergencyMode(): boolean {
  return process.env.FOLDERA_EGRESS_EMERGENCY_MODE === 'true';
}

export function isProductionRuntime(): boolean {
  return process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
}

function safeSecretEquals(candidate: string, expected: string): boolean {
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(candidate), Buffer.from(expected));
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization') ?? '';
  const match = header.match(/^\s*Bearer\s+(.+?)\s*$/i);
  return match?.[1] ?? null;
}

export function hasOperatorSecret(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;

  const bearer = bearerToken(request);
  if (bearer && safeSecretEquals(bearer.trim(), secret)) {
    return true;
  }

  const cronHeader = request.headers.get('x-cron-secret')?.trim();
  return Boolean(cronHeader && safeSecretEquals(cronHeader, secret));
}

export function blockManualSyncDuringEgressEmergency(
  request: Request,
  provider: 'google' | 'microsoft',
): NextResponse | null {
  if (!isEgressEmergencyMode() || hasOperatorSecret(request)) {
    return null;
  }

  return NextResponse.json(
    {
      error: 'Sync temporarily paused during Supabase egress emergency mode',
      provider,
      retry_after_seconds: EMERGENCY_RETRY_SECONDS,
    },
    {
      status: 423,
      headers: { 'Retry-After': String(EMERGENCY_RETRY_SECONDS) },
    },
  );
}

export function blockDevRouteDuringEgressEmergency(request: Request): NextResponse | null {
  if (!isEgressEmergencyMode() || !isProductionRuntime() || hasOperatorSecret(request)) {
    return null;
  }

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}
