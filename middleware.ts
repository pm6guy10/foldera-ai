/**
 * Next.js middleware — captures UTM/ref params for growth conversion tracking.
 *
 * Runs at the edge on every request. Lightweight: only acts when ?ref= is present.
 * Stores the ref param in a cookie so downstream pages can read it and log
 * the visit as a growth signal.
 *
 * Also fires a non-blocking fetch to /api/growth/visit to log the visit
 * as a tkg_signal immediately.
 */

import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  const ref = request.nextUrl.searchParams.get('ref');
  const utm_source = request.nextUrl.searchParams.get('utm_source');
  const utm_medium = request.nextUrl.searchParams.get('utm_medium');

  // Only act when there's a referral or UTM param
  const trackingRef = ref ?? utm_source;
  if (!trackingRef) {
    return NextResponse.next();
  }

  const response = NextResponse.next();

  // Set a cookie so the /try and /start pages can read it
  // Expires in 30 days — covers the full conversion window
  response.cookies.set('foldera_ref', trackingRef, {
    maxAge:   30 * 24 * 60 * 60,  // 30 days
    path:     '/',
    httpOnly: false,  // Readable by client-side code
    sameSite: 'lax',
    secure:   process.env.NODE_ENV === 'production',
  });

  // Also store UTM details if present
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

// Only run middleware on public pages, not API routes or static assets
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
