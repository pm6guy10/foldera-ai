/**
 * Request correlation ID for Node route handlers (reads middleware-set header).
 */

import { headers } from 'next/headers';
import {
  normalizeInboundRequestId,
  REQUEST_ID_HEADER,
  resolveRequestIdForRequest,
} from './request-id-core';

export {
  normalizeInboundRequestId,
  REQUEST_ID_HEADER,
  readRequestIdFromHeaders,
  resolveRequestIdForRequest,
} from './request-id-core';

export function getRequestId(): string | undefined {
  try {
    return resolveRequestIdForRequest(headers().get(REQUEST_ID_HEADER));
  } catch {
    return crypto.randomUUID();
  }
}
