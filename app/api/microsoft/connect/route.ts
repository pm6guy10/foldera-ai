/**
 * GET /api/microsoft/connect
 *
 * Standalone Microsoft OAuth flow — redirects the user to the Microsoft
 * consent screen. Requires an active NextAuth session so that the callback
 * can save tokens under the existing user ID (account linking).
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth/auth-options';
import { randomBytes } from 'crypto';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

const SCOPES = [
  'openid',
  'profile',
  'email',
  'User.Read',
  'Mail.Read',
  'Mail.ReadWrite',
  'Mail.Send',
  'Calendars.Read',
  'Calendars.ReadWrite',
  'Files.Read',
  'Tasks.Read',
  'offline_access',
].join(' ');

export async function GET() {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL('/login', process.env.NEXTAUTH_URL!));
  }

  const clientId = process.env.AZURE_AD_CLIENT_ID;
  const baseUrl = process.env.NEXTAUTH_URL;
  const tenantId = process.env.AZURE_AD_TENANT_ID || 'common';

  if (!clientId || !baseUrl) {
    return NextResponse.json(
      { error: 'Microsoft OAuth not configured' },
      { status: 500 },
    );
  }

  // Azure only has https://www.foldera.ai/api/microsoft/callback registered.
  // Normalize: if baseUrl is https://foldera.ai, rewrite to https://www.foldera.ai
  const normalizedBase = baseUrl.replace(
    /^(https:\/\/)foldera\.ai/,
    '$1www.foldera.ai',
  );
  const redirectUri = `${normalizedBase}/api/microsoft/callback`;

  // CSRF protection: random state stored in httpOnly cookie
  const state = randomBytes(32).toString('hex');
  const cookieStore = await cookies();
  cookieStore.set('microsoft_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  });

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: SCOPES,
    state,
    prompt: 'consent',
    response_mode: 'query',
  });

  const authUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params.toString()}`;

  return NextResponse.redirect(authUrl);
}
