/**
 * GET /api/google/connect
 *
 * Standalone Google OAuth flow — redirects the user to Google consent screen
 * requesting gmail.readonly + calendar.readonly scopes.
 *
 * Requires an active NextAuth session (user must be signed in via Microsoft or Google).
 * Does NOT touch NextAuth config.
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth/auth-options';
import { google } from 'googleapis';
import { randomBytes } from 'crypto';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
];

export async function GET() {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL('/login', process.env.NEXTAUTH_URL!));
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const baseUrl = process.env.NEXTAUTH_URL;

  if (!clientId || !clientSecret || !baseUrl) {
    return NextResponse.json(
      { error: 'Google OAuth not configured' },
      { status: 500 },
    );
  }

  const redirectUri = `${baseUrl}/api/google/callback`;

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  // CSRF protection: random state stored in httpOnly cookie
  const state = randomBytes(32).toString('hex');
  const cookieStore = await cookies();
  cookieStore.set('google_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600, // 10 minutes
    path: '/',
  });

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    state,
  });

  return NextResponse.redirect(authUrl);
}
