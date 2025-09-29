import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';

function getSupabaseClient() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');

  if (!code) {
    return NextResponse.json({ error: 'Google OAuth code not found.' }, { status: 400 });
  }

  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${process.env.NEXT_PUBLIC_BASE_URL}/api/auth/google/calendar/callback`
    );

    const { tokens } = await oauth2Client.getToken(code);
    const accessToken = tokens.access_token;
    const refreshToken = tokens.refresh_token;

    if (!accessToken) {
      return NextResponse.json({ error: 'Failed to get Google access token.' }, { status: 500 });
    }

    // For demo purposes, we'll redirect back with success
    // In production, store tokens in Supabase and redirect to dashboard
    const redirectUrl = new URL(`${process.env.NEXT_PUBLIC_BASE_URL}/connectors`);
    redirectUrl.searchParams.set('connected', 'calendar');
    redirectUrl.searchParams.set('success', 'true');

    return NextResponse.redirect(redirectUrl);

  } catch (error: any) {
    console.error('Google OAuth callback error:', error);
    const redirectUrl = new URL(`${process.env.NEXT_PUBLIC_BASE_URL}/connectors`);
    redirectUrl.searchParams.set('error', encodeURIComponent(error.message));
    return NextResponse.redirect(redirectUrl);
  }
}
