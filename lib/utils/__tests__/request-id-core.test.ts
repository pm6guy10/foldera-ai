import { describe, expect, it } from 'vitest';
import {
  normalizeInboundRequestId,
  readRequestIdFromHeaders,
  REQUEST_ID_HEADER,
  resolveRequestIdForRequest,
} from '../request-id-core';

describe('request-id-core', () => {
  it('normalizeInboundRequestId accepts valid UUID', () => {
    const id = '550e8400-e29b-41d4-a716-446655440000';
    expect(normalizeInboundRequestId(id)).toBe(id);
    expect(normalizeInboundRequestId(`  ${id}  `)).toBe(id);
  });

  it('normalizeInboundRequestId rejects non-UUID and oversized', () => {
    expect(normalizeInboundRequestId('not-a-uuid')).toBeUndefined();
    expect(normalizeInboundRequestId('')).toBeUndefined();
    expect(normalizeInboundRequestId(null)).toBeUndefined();
    expect(normalizeInboundRequestId('a'.repeat(200))).toBeUndefined();
  });

  it('resolveRequestIdForRequest keeps valid inbound id', () => {
    const id = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
    expect(resolveRequestIdForRequest(id)).toBe(id);
  });

  it('resolveRequestIdForRequest allocates when missing or invalid', () => {
    const a = resolveRequestIdForRequest(null);
    const b = resolveRequestIdForRequest('bad');
    expect(a).toMatch(/^[0-9a-f-]{36}$/i);
    expect(b).toMatch(/^[0-9a-f-]{36}$/i);
    expect(a).not.toBe(b);
  });

  it('readRequestIdFromHeaders reads header', () => {
    const id = '6ba7b811-9dad-11d1-80b4-00c04fd430c8';
    const h = new Headers({ [REQUEST_ID_HEADER]: id });
    expect(readRequestIdFromHeaders(h)).toBe(id);
  });
});
