/**
 * Centralized API error handling.
 * - Logs the real error server-side (with optional context).
 * - Returns generic JSON to the client; never sends error.message or stack.
 * Use in every API route for 500/404 and for any catch that returns to the client.
 */

import * as Sentry from '@sentry/nextjs';
import { NextResponse } from 'next/server';
import { getRequestId, REQUEST_ID_HEADER } from './request-id';

const GENERIC_MESSAGE = 'Internal server error';
const NOT_FOUND_MESSAGE = 'Not found';

function getMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  // Supabase errors are plain objects with a .message property, not instanceof Error
  if (err && typeof err === 'object' && 'message' in err && typeof (err as Record<string, unknown>).message === 'string') {
    return (err as { message: string }).message;
  }
  return String(err);
}

function toError(err: unknown, message: string): Error {
  if (err instanceof Error) return err;
  const e = new Error(message);
  if (err && typeof err === 'object') {
    // Preserve Supabase error fields (code, details, hint) as extra context
    Object.assign(e, err);
  }
  return e;
}

/**
 * Log the error and return a 500 response with generic body.
 * Call in catch blocks instead of returning { error: err.message }.
 */
export function apiError(
  err: unknown,
  context?: string,
  requestId?: string,
): NextResponse {
  const message = getMessage(err);
  const logLine = context
    ? `[${context}] ${message}`
    : message;
  Sentry.captureException(toError(err, message), {
    tags: {
      context: context ?? 'unknown',
      ...(requestId ? { request_id: requestId } : {}),
    },
    extra: { requestId },
  });
  if (requestId) {
    console.error(logLine, { requestId });
  } else {
    console.error(logLine);
  }
  const resHeaders = requestId ? { [REQUEST_ID_HEADER]: requestId } : undefined;
  const body = requestId
    ? { error: GENERIC_MESSAGE, requestId }
    : { error: GENERIC_MESSAGE };
  return NextResponse.json(body, { status: 500, headers: resHeaders });
}

/**
 * Same as apiError but reads x-request-id from the current request (set in middleware).
 */
export function apiErrorForRoute(err: unknown, context?: string): NextResponse {
  return apiError(err, context, getRequestId());
}

/**
 * Return 400 with a safe user-facing message (validation, bad request).
 * Only use for messages that are safe to show to the client.
 */
export function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}

/**
 * Return 404 with generic body.
 */
export function notFound(): NextResponse {
  return NextResponse.json({ error: NOT_FOUND_MESSAGE }, { status: 404 });
}

/**
 * Return 400 for validation failure. Use only safe, user-facing messages.
 */
export function validationError(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}
