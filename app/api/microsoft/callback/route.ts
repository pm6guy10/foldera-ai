/**
 * GET /api/microsoft/callback
 *
 * Handles the OAuth callback from Microsoft after the user grants consent.
 * Exchanges the authorization code for tokens, stores them in
 * `user_tokens` table under the active session's user ID.
 *
 * This ensures account linking: if a user signed in with Google first and
 * then connects Microsoft, both tokens share the same Supabase user ID.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth/auth-options';
import { saveUserToken } from '@/lib/auth/user-tokens';
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

export async function GET(request: NextRequest) {
  const baseUrl = process.env.NEXTAUTH_URL!;
  const settingsUrl = `${baseUrl}/dashboard/settings`;

  // 1. Verify session — account linking requires an active session
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL('/login', baseUrl));
  }

  const userId = session.user.id;

  // 2. Check for errors from Microsoft
  const { searchParams } = request.nextUrl;
  const error = searchParams.get('error');
  if (error) {
    const desc = searchParams.get('error_description') || error;
    console.error(`[microsoft/callback] OAuth error: ${desc}`);
    return NextResponse.redirect(`${settingsUrl}?microsoft_error=${encodeURIComponent(error)}`);
  }

  // 3. Validate state (CSRF protection)
  const state = searchParams.get('state');
  const cookieStore = await cookies();
  const storedState = cookieStore.get('microsoft_oauth_state')?.value;

  if (!state || !storedState || state !== storedState) {
    console.error('[microsoft/callback] State mismatch — possible CSRF');
    return NextResponse.redirect(`${settingsUrl}?microsoft_error=state_mismatch`);
  }

  cookieStore.delete('microsoft_oauth_state');

  // 4. Exchange code for tokens
  const code = searchParams.get('code');
  if (!code) {
    return NextResponse.redirect(`${settingsUrl}?microsoft_error=no_code`);
  }

  const clientId = process.env.AZURE_AD_CLIENT_ID!;
  const clientSecret = process.env.AZURE_AD_CLIENT_SECRET!;
  const tenantId = process.env.AZURE_AD_TENANT_ID || 'common';
  // Must match the redirect_uri sent in /api/microsoft/connect.
  // Azure only has https://www.foldera.ai/api/microsoft/callback registered.
  const normalizedBase = baseUrl.replace(
    /^(https:\/\/)foldera\.ai/,
    '$1www.foldera.ai',
  );
  const redirectUri = `${normalizedBase}/api/microsoft/callback`;

  let tokenData: any;
  try {
    const res = await fetch(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
          scope: SCOPES,
        }),
      },
    );

    tokenData = await res.json();
    if (!res.ok) {
      console.error('[microsoft/callback] Token exchange failed:', tokenData);
      return NextResponse.redirect(`${settingsUrl}?microsoft_error=token_exchange_failed`);
    }
  } catch (err: any) {
    console.error('[microsoft/callback] Token exchange threw:', err.message);
    return NextResponse.redirect(`${settingsUrl}?microsoft_error=token_exchange_failed`);
  }

  if (!tokenData.access_token) {
    console.error('[microsoft/callback] No access_token in response');
    return NextResponse.redirect(`${settingsUrl}?microsoft_error=no_access_token`);
  }

  // 5. Get user email from Microsoft Graph
  let msEmail: string | undefined;
  try {
    const meRes = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (meRes.ok) {
      const me = await meRes.json();
      msEmail = me.mail || me.userPrincipalName || undefined;
    }
  } catch (err: any) {
    console.warn('[microsoft/callback] Failed to fetch user email:', err.message);
  }

  const expiresAt = Math.floor(Date.now() / 1000) + (tokenData.expires_in ?? 3600);

  // 6. Save to user_tokens table (single source of truth for OAuth tokens)
  try {
    await saveUserToken(userId, 'microsoft', {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token ?? '',
      expires_at: expiresAt,
      email: msEmail,
      scopes: tokenData.scope ?? '',
    });
  } catch (err: any) {
    console.error('[microsoft/callback] saveUserToken failed:', err.message);
    return NextResponse.redirect(`${settingsUrl}?microsoft_error=save_failed`);
  }

  console.log(`[microsoft/callback] Microsoft connected for user ${userId} (${msEmail ?? 'no email'})`);

  // 7. Redirect back to settings
  return NextResponse.redirect(`${settingsUrl}?microsoft_connected=true`);
}
