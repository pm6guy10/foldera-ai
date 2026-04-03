/**
 * Request ID helpers safe for Edge (middleware). No next/headers import.
 */

export const REQUEST_ID_HEADER = 'x-request-id' as const;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeInboundRequestId(raw: string | null): string | undefined {
  if (raw == null) return undefined;
  const t = raw.trim();
  if (t.length === 0 || t.length > 128) return undefined;
  if (!UUID_RE.test(t)) return undefined;
  return t;
}

export function resolveRequestIdForRequest(inbound: string | null): string {
  return normalizeInboundRequestId(inbound) ?? crypto.randomUUID();
}

export function readRequestIdFromHeaders(h: Headers): string | undefined {
  return normalizeInboundRequestId(h.get(REQUEST_ID_HEADER));
}
