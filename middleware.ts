/**
 * Next.js middleware — auth guard for /dashboard/* + UTM/ref tracking.
 *
 * 1. For /dashboard/* routes: checks for NextAuth session cookie. If missing,
 *    redirects to /login with callbackUrl preserving the original URL.
 * 2. For all matched routes: captures UTM/ref params for growth tracking.
 */

import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // ── AUTH GUARD for /dashboard/* ──
  // Check for NextAuth session token cookie (handles both __Secure- and non-secure prefix)
  if (pathname.startsWith('/dashboard')) {
    const hasSession =
      request.cookies.has('__Secure-next-auth.session-token') ||
      request.cookies.has('next-auth.session-token');

    if (!hasSession) {
      const callbackUrl = `${pathname}${search}`;
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('callbackUrl', callbackUrl);
      return NextResponse.redirect(loginUrl);
    }
  }

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
