/**
 * GET /api/health
 *
 * Deep health check. No auth required.
 * Checks:
 *   1. Microsoft token — can we get a valid token? Attempts refresh if near expiry.
 *   2. Google token — same check.
 *   3. Last directive — is the most recent tkg_actions row younger than 26 hours?
 *   4. DB connectivity and env vars.
 *
 * Returns:
 *   { status, db, env, microsoft, google, last_directive, last_directive_age_hours, ts }
 */

import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/db/client';
import { getAllUsersWithProvider, getUserToken } from '@/lib/auth/user-tokens';

export const dynamic = 'force-dynamic';

const REQUIRED_ENV_VARS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'NEXTAUTH_SECRET',
];

const STALE_DIRECTIVE_HOURS = 26;

type TokenStatus = 'ok' | 'refresh_failed' | 'no_token' | 'no_users';

async function checkProviderToken(provider: 'google' | 'microsoft'): Promise<TokenStatus> {
  const userIds = await getAllUsersWithProvider(provider);
  if (userIds.length === 0) return 'no_users';

  // Check the first user's token (primary/owner)
  const token = await getUserToken(userIds[0], provider);
  if (!token) return 'no_token';

  const nowSec = Math.floor(Date.now() / 1000);
  // If token expires within 30 minutes, attempt refresh
  if (token.expires_at && token.expires_at < nowSec + 30 * 60) {
    if (!token.refresh_token) return 'refresh_failed';

    try {
      if (provider === 'microsoft') {
        const response = await fetch(
          'https://login.microsoftonline.com/common/oauth2/v2.0/token',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              client_id: process.env.AZURE_AD_CLIENT_ID || '',
              client_secret: process.env.AZURE_AD_CLIENT_SECRET || '',
              refresh_token: token.refresh_token,
              grant_type: 'refresh_token',
              scope: 'openid profile email offline_access User.Read Mail.Read',
            }),
          },
        );
        if (!response.ok) return 'refresh_failed';
        // Persist the refreshed token
        const data = await response.json();
        const { saveUserToken } = await import('@/lib/auth/user-tokens');
        await saveUserToken(userIds[0], 'microsoft', {
          access_token: data.access_token,
          refresh_token: data.refresh_token || token.refresh_token,
          expires_at: Math.floor(Date.now() / 1000) + (data.expires_in ?? 3600),
        });
        return 'ok';
      } else {
        const response = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: process.env.GOOGLE_CLIENT_ID || '',
            client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
            grant_type: 'refresh_token',
            refresh_token: token.refresh_token,
          }),
        });
        if (!response.ok) return 'refresh_failed';
        const data = await response.json();
        const { saveUserToken } = await import('@/lib/auth/user-tokens');
        await saveUserToken(userIds[0], 'google', {
          access_token: data.access_token,
          refresh_token: data.refresh_token || token.refresh_token,
          expires_at: Math.floor(Date.now() / 1000) + (data.expires_in ?? 3600),
        });
        return 'ok';
      }
    } catch {
      return 'refresh_failed';
    }
  }

  return 'ok';
}

async function checkLastDirective(): Promise<{ status: 'ok' | 'stale'; ageHours: number }> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('tkg_actions')
    .select('generated_at')
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data?.generated_at) {
    return { status: 'stale', ageHours: -1 };
  }

  const ageMs = Date.now() - new Date(data.generated_at).getTime();
  const ageHours = Math.round((ageMs / (1000 * 60 * 60)) * 10) / 10;

  return {
    status: ageHours > STALE_DIRECTIVE_HOURS ? 'stale' : 'ok',
    ageHours,
  };
}

export async function GET() {
  const envOk = REQUIRED_ENV_VARS.every((k) => !!process.env[k]);

  let dbOk = false;
  try {
    const supabase = createServerClient();
    const { error } = await supabase.from('tkg_signals').select('id').limit(1);
    dbOk = !error;
  } catch {
    dbOk = false;
  }

  const [microsoft, google, directive] = await Promise.all([
    checkProviderToken('microsoft').catch(() => 'refresh_failed' as TokenStatus),
    checkProviderToken('google').catch(() => 'refresh_failed' as TokenStatus),
    checkLastDirective().catch(() => ({ status: 'stale' as const, ageHours: -1 })),
  ]);

  const allOk =
    envOk &&
    dbOk &&
    (microsoft === 'ok' || microsoft === 'no_users') &&
    (google === 'ok' || google === 'no_users') &&
    directive.status === 'ok';

  return NextResponse.json(
    {
      status: allOk ? 'ok' : 'degraded',
      db: dbOk,
      env: envOk,
      microsoft,
      google,
      last_directive: directive.status,
      last_directive_age_hours: directive.ageHours,
      ts: new Date().toISOString(),
    },
    { status: allOk ? 200 : 503 },
  );
}
