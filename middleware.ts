/**
 * Next.js middleware — captures UTM/ref params for growth conversion tracking
 * and applies auth/onboarding routing for session-backed pages.
 */

import { getToken } from 'next-auth/jwt';
import { NextRequest, NextResponse } from 'next/server';

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

export async function middleware(request: NextRequest) {
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
    const token = await getToken({ req: request, secret });

    if (isProtectedRoute && !token) {
      const loginUrl = new URL('/login', origin);
      const callbackPath = `${pathname}${request.nextUrl.search}`;
      loginUrl.searchParams.set('callbackUrl', callbackPath);
      return applyTrackingCookies(request, NextResponse.redirect(loginUrl));
    }

    if (isAuthEntryRoute && token) {
      try {
        const onboardCheckUrl = new URL('/api/onboard/check', origin);
        const onboardResponse = await fetch(onboardCheckUrl, {
          headers: {
            cookie: request.headers.get('cookie') ?? '',
          },
        });

        if (onboardResponse.ok) {
          const { hasOnboarded } = await onboardResponse.json();
          const destination = hasOnboarded ? '/dashboard' : '/onboard';
          return applyTrackingCookies(
            request,
            NextResponse.redirect(new URL(destination, origin)),
          );
        }

        if (onboardResponse.status === 401) {
          const loginUrl = new URL('/login', origin);
          return applyTrackingCookies(request, NextResponse.redirect(loginUrl));
        }
      } catch {
        // If onboarding status cannot be determined, allow the route to render.
      }
    }
  }

  return applyTrackingCookies(request, NextResponse.next());
}

// Run on public pages + dashboard routes (not API routes or static assets)
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
  ],
};
