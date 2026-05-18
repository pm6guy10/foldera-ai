/**
 * Node / undici stream errors when the client closes the connection before the
 * response finishes (tab close, navigation, timeout). Not actionable in Sentry.
 */

import type { ErrorEvent, EventHint } from '@sentry/core';

const TRANSIENT_CODES = new Set(['EPIPE', 'ECONNRESET', 'ECONNABORTED']);
const LOCAL_HOST_PATTERNS = ['127.0.0.1', 'localhost', '[::1]'] as const;
const LOCAL_SERVER_NAME_PATTERN = /(localhost|local|laptop|desktop|runner)/i;
const LOCAL_BROWSER_PATTERN = /(HeadlessChrome|Playwright)/i;
const LOCAL_SUPABASE_ENV_MESSAGE = 'Supabase env vars not configured';

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
  if (isNonProductionLocalNoiseEvent(event)) return null;
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

function isProductionSentryEnvironment(): boolean {
  const explicit = process.env.SENTRY_ENVIRONMENT?.trim().toLowerCase();
  if (explicit) return explicit === 'production';

  const vercelEnv = process.env.VERCEL_ENV?.trim().toLowerCase();
  if (vercelEnv) return vercelEnv === 'production';

  return false;
}

function hasLocalHost(url: string): boolean {
  const lower = url.toLowerCase();
  return LOCAL_HOST_PATTERNS.some((segment) => lower.includes(segment));
}

function isLocalBrowser(userAgent: string): boolean {
  return LOCAL_BROWSER_PATTERN.test(userAgent);
}

export function isNonProductionLocalNoiseEvent(event: ErrorEvent): boolean {
  if (isProductionSentryEnvironment()) return false;

  const requestUrl = event.request?.url ?? '';
  const userAgent = event.request?.headers?.['User-Agent'] ?? event.request?.headers?.['user-agent'] ?? '';
  const serverName = event.server_name ?? '';
  const message = typeof event.message === 'string' ? event.message : '';

  if (requestUrl && hasLocalHost(requestUrl)) return true;
  if (userAgent && isLocalBrowser(userAgent)) return true;
  if (serverName && LOCAL_SERVER_NAME_PATTERN.test(serverName)) return true;
  if (message.includes(LOCAL_SUPABASE_ENV_MESSAGE)) return true;

  return false;
}
