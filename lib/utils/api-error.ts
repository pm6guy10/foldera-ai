/**
 * Centralized API error handling.
 * - Logs the real error server-side (with optional context).
 * - Returns generic JSON to the client; never sends error.message or stack.
 * Use in every API route for 500/404 and for any catch that returns to the client.
 */

import { NextResponse } from 'next/server';

const GENERIC_MESSAGE = 'Internal server error';
const NOT_FOUND_MESSAGE = 'Not found';

function getMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return String(err);
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
  if (requestId) {
    console.error(logLine, { requestId });
  } else {
    console.error(logLine);
  }
  return NextResponse.json(
    { error: GENERIC_MESSAGE },
    { status: 500 },
  );
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
