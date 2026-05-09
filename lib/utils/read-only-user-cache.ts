import { NextResponse } from 'next/server';

export const READ_ONLY_USER_CACHE_CONTROL = 'private, max-age=20, stale-while-revalidate=40';
export const READ_ONLY_USER_CACHE_VARY = 'Cookie';

export function withReadOnlyUserCache(init: ResponseInit = {}): ResponseInit {
  const headers = new Headers(init.headers);
  headers.set('Cache-Control', READ_ONLY_USER_CACHE_CONTROL);
  headers.set('Vary', READ_ONLY_USER_CACHE_VARY);

  return {
    ...init,
    headers,
  };
}

export function jsonWithReadOnlyUserCache(
  payload: unknown,
  init: ResponseInit = { status: 200 },
): NextResponse {
  return NextResponse.json(payload, withReadOnlyUserCache(init));
}
