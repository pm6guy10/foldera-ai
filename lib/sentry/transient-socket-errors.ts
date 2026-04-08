/**
 * Node / undici stream errors when the client closes the connection before the
 * response finishes (tab close, navigation, timeout). Not actionable in Sentry.
 */

import type { ErrorEvent, EventHint } from '@sentry/core';

const TRANSIENT_CODES = new Set(['EPIPE', 'ECONNRESET', 'ECONNABORTED']);

function walkCauses(err: unknown, visit: (e: unknown) => boolean): boolean {
  let current: unknown = err;
  const seen = new Set<unknown>();
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);
    if (visit(current)) return true;
    if ('cause' in current) {
      current = (current as { cause: unknown }).cause;
    } else {
      break;
    }
  }
  return false;
}

function matchOne(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const rec = err as Record<string, unknown>;
  const code = typeof rec.code === 'string' ? rec.code : '';
  if (code && TRANSIENT_CODES.has(code)) return true;

  const msg =
    typeof rec.message === 'string'
      ? rec.message
      : err instanceof Error
        ? err.message
        : '';
  if (!msg) return false;

  if (/^(read ECONNRESET|write EPIPE|socket hang up)$/i.test(msg.trim())) return true;
  if (/\bECONNRESET\b/i.test(msg) && /\bread\b/i.test(msg)) return true;
  if (/\bEPIPE\b/i.test(msg) && /\bwrite\b/i.test(msg)) return true;
  return false;
}

/** True if this error (or any nested .cause) is a client-disconnect stream/socket noise. */
export function isTransientSocketError(err: unknown): boolean {
  return walkCauses(err, matchOne);
}

/**
 * Drop transient socket errors before they are sent to Sentry (server + browser).
 */
export function sentryDropTransientSocketEvents(
  event: ErrorEvent,
  hint: EventHint,
): ErrorEvent | null {
  if (isTransientSocketError(hint.originalException)) return null;
  return event;
}

/** Strings passed to Sentry ignoreErrors (partial message match). */
export const SENTRY_TRANSIENT_SOCKET_IGNORE_MESSAGES = [
  'ECONNRESET',
  'EPIPE',
  'write EPIPE',
  'read ECONNRESET',
  'socket hang up',
] as const;
