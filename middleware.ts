/**
 * Next.js middleware — captures UTM/ref params for growth conversion tracking.
 *
 * Note: Auth guard for /dashboard/* was removed because edge middleware processes
 * the redirect from /api/auth/callback before the browser stores the session cookie,
 * creating a sign-in loop. Dashboard auth is handled client-side in page.tsx instead.
 */

import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  // ── UTM / REF TRACKING ──
  const ref = request.nextUrl.searchParams.get('ref');
  const utm_source = request.nextUrl.searchParams.get('utm_source');
  const utm_medium = request.nextUrl.searchParams.get('utm_medium');

  const trackingRef = ref ?? utm_source;
  if (!trackingRef) {
    return NextResponse.next();
  }

  const response = NextResponse.next();

  response.cookies.set('foldera_ref', trackingRef, {
    maxAge:   30 * 24 * 60 * 60,
    path:     '/',
    httpOnly: false,
    sameSite: 'lax',
    secure:   process.env.NODE_ENV === 'production',
  });

  if (utm_source || utm_medium) {
    const utmData = JSON.stringify({
      source: utm_source ?? '',
      medium: utm_medium ?? '',
      ref:    ref ?? '',
    });
    response.cookies.set('foldera_utm', utmData, {
      maxAge:   30 * 24 * 60 * 60,
      path:     '/',
      httpOnly: false,
      sameSite: 'lax',
      secure:   process.env.NODE_ENV === 'production',
    });
  }

  return response;
}

// Run on public pages + dashboard routes (not API routes or static assets)
export const config = {
  matcher: [
    '/',
    '/try',
    '/try/:path*',
    '/start',
    '/start/:path*',
    '/pricing',
    '/dashboard',
    '/dashboard/:path*',
  ],
};
