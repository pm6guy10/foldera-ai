import { describe, expect, it } from 'vitest';
import {
  isNonProductionLocalNoiseEvent,
  isTransientSocketError,
  sentryDropTransientSocketEvents,
} from '../transient-socket-errors';

describe('isTransientSocketError', () => {
  it('matches EPIPE by code', () => {
    const e = new Error('x');
    Object.assign(e, { code: 'EPIPE' });
    expect(isTransientSocketError(e)).toBe(true);
  });

  it('matches write EPIPE message', () => {
    expect(isTransientSocketError(new Error('write EPIPE'))).toBe(true);
  });

  it('matches ECONNRESET by code', () => {
    const e = new Error('x');
    Object.assign(e, { code: 'ECONNRESET' });
    expect(isTransientSocketError(e)).toBe(true);
  });

  it('matches read ECONNRESET message', () => {
    expect(isTransientSocketError(new Error('read ECONNRESET'))).toBe(true);
  });

  it('matches socket hang up', () => {
    expect(isTransientSocketError(new Error('socket hang up'))).toBe(true);
  });

  it('walks error.cause', () => {
    const inner = new Error('read ECONNRESET');
    const outer = new Error('wrap');
    (outer as Error & { cause?: Error }).cause = inner;
    expect(isTransientSocketError(outer)).toBe(true);
  });

  it('does not match unrelated errors', () => {
    expect(isTransientSocketError(new Error('column foo does not exist'))).toBe(false);
    expect(isTransientSocketError(null)).toBe(false);
  });
});

describe('sentryDropTransientSocketEvents', () => {
  it('returns null for transient originalException', () => {
    expect(
      sentryDropTransientSocketEvents(
        { event_id: '1' } as Parameters<typeof sentryDropTransientSocketEvents>[0],
        { originalException: new Error('write EPIPE') },
      ),
    ).toBeNull();
  });

  it('returns event otherwise', () => {
    const ev = { event_id: '2' } as Parameters<typeof sentryDropTransientSocketEvents>[0];
    expect(
      sentryDropTransientSocketEvents(ev, { originalException: new Error('real bug') }),
    ).toBe(ev);
  });

  it('drops localhost api events outside production', () => {
    const ev = {
      event_id: '3',
      request: { url: 'http://127.0.0.1:3000/api/source-readiness' },
    } as Parameters<typeof sentryDropTransientSocketEvents>[0];
    expect(
      sentryDropTransientSocketEvents(ev, { originalException: new Error('real bug') }),
    ).toBeNull();
  });
});

describe('isNonProductionLocalNoiseEvent', () => {
  it('matches headless browser user agent in non-production', () => {
    const ev = {
      request: {
        headers: { 'user-agent': 'Mozilla/5.0 HeadlessChrome/123.0.0.0' },
      },
    } as Parameters<typeof isNonProductionLocalNoiseEvent>[0];
    expect(isNonProductionLocalNoiseEvent(ev)).toBe(true);
  });

  it('does not match production events', () => {
    const previous = process.env.VERCEL_ENV;
    try {
      process.env.VERCEL_ENV = 'production';
      const ev = {
        request: { url: 'http://127.0.0.1:3000/api/source-readiness' },
      } as Parameters<typeof isNonProductionLocalNoiseEvent>[0];
      expect(isNonProductionLocalNoiseEvent(ev)).toBe(false);
    } finally {
      if (previous === undefined) {
        delete process.env.VERCEL_ENV;
      } else {
        process.env.VERCEL_ENV = previous;
      }
    }
  });
});
