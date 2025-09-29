import { NextResponse } from 'next/server';
import { google } from 'googleapis';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_BASE_URL}/instant-audit?error=oauth_failed`);
  }

  try {
    // Exchange code for tokens
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${process.env.NEXT_PUBLIC_BASE_URL}/api/auth/google/callback-instant-audit`
    );

    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Run instant audit
    const auditResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/instant-audit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: tokens.access_token }),
    });

    const auditResult = await auditResponse.json();

    // Redirect back to instant-audit page with results
    const auditData = encodeURIComponent(JSON.stringify(auditResult));
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_BASE_URL}/instant-audit?audit=${auditData}`);

  } catch (error: any) {
    console.error('OAuth callback error:', error);
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_BASE_URL}/instant-audit?error=${encodeURIComponent(error.message)}`);
  }
}
