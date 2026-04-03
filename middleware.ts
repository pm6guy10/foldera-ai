/**
 * Next.js middleware — captures UTM/ref params for growth conversion tracking
 * and applies auth/onboarding routing for session-backed pages.
 */

import { getToken } from 'next-auth/jwt';
import { NextRequest, NextResponse } from 'next/server';
import {
  REQUEST_ID_HEADER,
  resolveRequestIdForRequest,
} from '@/lib/utils/request-id-core';

function applyTrackingCookies(request: NextRequest, response: NextResponse) {
  const ref = request.nextUrl.searchParams.get('ref');
  const utm_source = request.nextUrl.searchParams.get('utm_source');
  const utm_medium = request.nextUrl.searchParams.get('utm_medium');

  const trackingRef = ref ?? utm_source;
  if (!trackingRef) {
    return response;
  }

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

function forwardHeadersWithRequestId(request: NextRequest, requestId: string): Headers {
  const h = new Headers(request.headers);
  h.set(REQUEST_ID_HEADER, requestId);
  return h;
}

export async function middleware(request: NextRequest) {
  const requestId = resolveRequestIdForRequest(request.headers.get(REQUEST_ID_HEADER));
  const forwarded = forwardHeadersWithRequestId(request, requestId);
  const stamp = (res: NextResponse) => {
    res.headers.set(REQUEST_ID_HEADER, requestId);
    return res;
  };

  const { pathname, origin } = request.nextUrl;
  const secret = process.env.NEXTAUTH_SECRET;
  const isProtectedRoute =
    pathname === '/dashboard' ||
    pathname.startsWith('/dashboard/') ||
    pathname === '/onboard' ||
    pathname.startsWith('/onboard/');
  const isAuthEntryRoute =
    pathname === '/login' ||
    pathname.startsWith('/login/') ||
    pathname === '/start' ||
    pathname.startsWith('/start/');

  if (isProtectedRoute || isAuthEntryRoute) {
    // Must match getAuthOptions(): getToken() defaults secureCookie from NEXTAUTH_URL (https → __Secure-
    // cookie name). Local `next start` uses non-__Secure- names when VERCEL is unset — otherwise
    // middleware never sees the session and /dashboard always redirects to /login.
    const useSecureCookies = process.env.NODE_ENV === 'production' && Boolean(process.env.VERCEL);
    const token = await getToken({ req: request, secret, secureCookie: useSecureCookies });
    const hasOnboarded = Boolean((token as { hasOnboarded?: boolean } | null)?.hasOnboarded);

    if (isProtectedRoute && !token) {
      const loginUrl = new URL('/login', origin);
      const callbackPath = `${pathname}${request.nextUrl.search}`;
      loginUrl.searchParams.set('callbackUrl', callbackPath);
      return applyTrackingCookies(request, NextResponse.redirect(loginUrl));
    }

    if (isAuthEntryRoute && token) {
      const destination = hasOnboarded ? '/dashboard' : '/onboard';
      return applyTrackingCookies(
        request,
        stamp(NextResponse.redirect(new URL(destination, origin))),
      );
    }
  }

  return applyTrackingCookies(
    request,
    stamp(NextResponse.next({ request: { headers: forwarded } })),
  );
}

// Public pages, dashboard, and API (request id for correlation; no auth redirect on /api/*)
export const config = {
  matcher: [
    '/',
    '/login',
    '/login/:path*',
    '/try',
    '/try/:path*',
    '/start',
    '/start/:path*',
    '/pricing',
    '/onboard',
    '/onboard/:path*',
    '/dashboard',
    '/dashboard/:path*',
    '/api/:path*',
  ],
};
