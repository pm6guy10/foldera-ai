/**
 * GET /api/google/callback
 *
 * Handles the OAuth callback from Google after the user grants consent.
 * Exchanges the authorization code for tokens, stores them in
 * `user_tokens` table, and redirects to /dashboard/settings.
 *
 * Does NOT touch NextAuth config.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth/auth-options';
import { google } from 'googleapis';
import { saveUserToken } from '@/lib/auth/user-tokens';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

function getGoogleCallbackBaseUrl(baseUrl: string): string {
  // Google only has https://www.foldera.ai/api/google/callback registered.
  // Normalize apex production host to the registered www callback host.
  return baseUrl.replace(
    /^(https:\/\/)foldera\.ai/,
    '$1www.foldera.ai',
  );
}

export async function GET(request: NextRequest) {
  const baseUrl = process.env.NEXTAUTH_URL!;
  const settingsUrl = `${baseUrl}/dashboard/settings`;

  // 1. Verify session
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL('/login', baseUrl));
  }

  // Session-backed route: never fall back to INGEST_USER_ID.
  const userId = session.user.id;

  // 2. Check for errors from Google
  const { searchParams } = request.nextUrl;
  const error = searchParams.get('error');
  if (error) {
    console.error(`[google/callback] OAuth error: ${error}`);
    return NextResponse.redirect(`${settingsUrl}?google_error=${encodeURIComponent(error)}`);
  }

  // 3. Validate state (CSRF protection)
  const state = searchParams.get('state');
  const cookieStore = await cookies();
  const storedState = cookieStore.get('google_oauth_state')?.value;

  if (!state || !storedState || state !== storedState) {
    console.error('[google/callback] State mismatch — possible CSRF');
    return NextResponse.redirect(`${settingsUrl}?google_error=state_mismatch`);
  }

  // Clear the state cookie
  cookieStore.delete('google_oauth_state');

  // 4. Exchange code for tokens
  const code = searchParams.get('code');
  if (!code) {
    return NextResponse.redirect(`${settingsUrl}?google_error=no_code`);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID!;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
  const redirectUri = `${getGoogleCallbackBaseUrl(baseUrl)}/api/google/callback`;

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  let tokens;
  try {
    const response = await oauth2Client.getToken(code);
    tokens = response.tokens;
  } catch (err: any) {
    console.error('[google/callback] Token exchange failed:', err.message);
    return NextResponse.redirect(`${settingsUrl}?google_error=token_exchange_failed`);
  }

  if (!tokens.access_token) {
    console.error('[google/callback] No access_token in response');
    return NextResponse.redirect(`${settingsUrl}?google_error=no_access_token`);
  }

  // 5. Get user email from Google
  let googleEmail: string | undefined;
  try {
    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    googleEmail = userInfo.data.email ?? undefined;
  } catch (err: any) {
    console.warn('[google/callback] Failed to fetch user email:', err.message);
  }

  // 6. Save to user_tokens table (single source of truth for OAuth tokens)
  try {
    await saveUserToken(userId, 'google', {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? '',
      expires_at: tokens.expiry_date ?? Date.now() + 3_600_000,
      email: googleEmail,
      scopes: tokens.scope ?? '',
    });
  } catch (err: any) {
    console.error('[google/callback] saveUserToken failed:', err.message);
    return NextResponse.redirect(`${settingsUrl}?google_error=save_failed`);
  }

  console.log(`[google/callback] Google connected for user ${userId} (${googleEmail ?? 'no email'})`);

  // 7. Redirect back to settings
  return NextResponse.redirect(`${settingsUrl}?google_connected=true`);
}
