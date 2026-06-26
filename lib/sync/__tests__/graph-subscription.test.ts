import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildClientState,
  authenticateClientState,
  buildSubscriptionBody,
} from '../graph-subscription';

describe('graph-subscription clientState (self-authenticating per-user token)', () => {
  const ORIGINAL = process.env.GRAPH_WEBHOOK_SECRET;

  beforeEach(() => {
    process.env.GRAPH_WEBHOOK_SECRET = 'test-secret-value';
  });

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.GRAPH_WEBHOOK_SECRET;
    else process.env.GRAPH_WEBHOOK_SECRET = ORIGINAL;
  });

  it('builds a `${userId}.${hmac}` clientState that round-trips to the userId', () => {
    const cs = buildClientState('user-a');
    expect(cs.startsWith('user-a.')).toBe(true);
    expect(cs.length).toBeLessThanOrEqual(128); // Graph clientState cap
    expect(authenticateClientState(cs)).toBe('user-a');
  });

  it('is stable and user-specific', () => {
    expect(buildClientState('user-a')).toBe(buildClientState('user-a'));
    expect(buildClientState('user-a')).not.toBe(buildClientState('user-b'));
  });

  it('rejects a tampered or forged clientState', () => {
    const cs = buildClientState('user-a');
    // swap the userId but keep user-a's signature → must fail
    const forged = `user-b.${cs.split('.')[1]}`;
    expect(authenticateClientState(forged)).toBe(null);
    expect(authenticateClientState('user-a.deadbeef')).toBe(null);
    expect(authenticateClientState('user-a')).toBe(null); // no separator
    expect(authenticateClientState('')).toBe(null);
    expect(authenticateClientState(null)).toBe(null);
    expect(authenticateClientState(undefined)).toBe(null);
  });

  it('recovers userIds that themselves contain dots (uses last separator)', () => {
    const cs = buildClientState('tenant.user-a');
    expect(authenticateClientState(cs)).toBe('tenant.user-a');
  });

  it('fails closed when the secret is unset', () => {
    delete process.env.GRAPH_WEBHOOK_SECRET;
    expect(() => buildClientState('user-a')).toThrow(/GRAPH_WEBHOOK_SECRET/);
    expect(authenticateClientState('user-a.anything')).toBe(null);
  });

  it('buildSubscriptionBody targets the inbox, created-only, with a future expiry', () => {
    const nowMs = Date.parse('2026-06-25T00:00:00.000Z');
    const body = buildSubscriptionBody('user-a', nowMs);
    expect(body.changeType).toBe('created');
    expect(body.resource).toBe("/me/mailFolders('inbox')/messages");
    expect(body.notificationUrl).toMatch(/\/api\/webhooks\/graph$/);
    expect(body.clientState).toBe(buildClientState('user-a'));
    const expMs = Date.parse(body.expirationDateTime);
    expect(expMs).toBeGreaterThan(nowMs);
    expect(expMs - nowMs).toBeLessThanOrEqual(70.5 * 60 * 60 * 1000);
  });
});
