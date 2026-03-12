/**
 * GET /api/health
 *
 * Checks Supabase connectivity and required env vars.
 * Used by monitoring, Playwright tests, and post-deploy verification.
 *
 * Returns: { status: 'ok' | 'degraded', db: boolean, env: boolean, ts: string }
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const REQUIRED_ENV_VARS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'NEXTAUTH_SECRET',
];

export async function GET() {
  const envOk = REQUIRED_ENV_VARS.every(k => !!process.env[k]);

  let dbOk = false;
  try {
    const { createServerClient } = await import('@/lib/db/client');
    const supabase = createServerClient();
    const { error } = await supabase
      .from('tkg_signals')
      .select('id')
      .limit(1);
    dbOk = !error;
  } catch {
    dbOk = false;
  }

  const status = envOk && dbOk ? 'ok' : 'degraded';

  return NextResponse.json(
    { status, db: dbOk, env: envOk, ts: new Date().toISOString() },
    { status: status === 'ok' ? 200 : 503 }
  );
}
