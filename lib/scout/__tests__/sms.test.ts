import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createLiveTwilioAdapter,
  createTestSafeSmsAdapter,
  resolveSmsAdapterFromEnv,
} from '../sms';

const TWILIO_ENV_KEYS = [
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_FROM_NUMBER',
  'VERCEL_ENV',
] as const;

function clearTwilioEnv(): void {
  for (const key of TWILIO_ENV_KEYS) delete process.env[key];
}

function okFetch(body: Record<string, unknown>) {
  return vi.fn().mockResolvedValue({ ok: true, json: async () => body });
}

describe('createTestSafeSmsAdapter', () => {
  it('never sends and reports test_safe with no sid', async () => {
    const res = await createTestSafeSmsAdapter().send({ to: '+15551234567', body: 'hi' });
    expect(res).toEqual({ ok: true, mode: 'test_safe', to: '+15551234567', sid: null });
  });
});

describe('createLiveTwilioAdapter', () => {
  it('POSTs form-encoded To/From/Body with basic auth and returns the SID', async () => {
    const fetchMock = okFetch({ sid: 'SM123' });
    const adapter = createLiveTwilioAdapter(
      { accountSid: 'AC9', authToken: 'tok', fromNumber: '+15550000000' },
      fetchMock as unknown as typeof fetch,
    );

    const res = await adapter.send({ to: '+15551234567', body: 'Foldera Scout: review' });

    expect(res).toEqual({ ok: true, mode: 'live', to: '+15551234567', sid: 'SM123' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/Accounts/AC9/Messages.json');
    expect(init.method).toBe('POST');
    expect(init.headers.authorization).toBe(`Basic ${Buffer.from('AC9:tok').toString('base64')}`);
    expect(init.headers['content-type']).toBe('application/x-www-form-urlencoded');
    expect(init.body).toContain('To=%2B15551234567');
    expect(init.body).toContain('From=%2B15550000000');
    expect(init.body).toContain('Body=Foldera+Scout%3A+review');
  });

  it('throws when Twilio returns no SID', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ message: 'bad number', code: 21211 }),
    });
    const adapter = createLiveTwilioAdapter(
      { accountSid: 'AC9', authToken: 'tok', fromNumber: '+1' },
      fetchMock as unknown as typeof fetch,
    );

    await expect(adapter.send({ to: 'x', body: 'y' })).rejects.toThrow(/Twilio send failed: bad number/);
  });
});

describe('resolveSmsAdapterFromEnv', () => {
  beforeEach(() => clearTwilioEnv());
  afterEach(() => clearTwilioEnv());

  it('is test-safe when not on Vercel production even with all secrets', async () => {
    process.env.TWILIO_ACCOUNT_SID = 'AC9';
    process.env.TWILIO_AUTH_TOKEN = 'tok';
    process.env.TWILIO_FROM_NUMBER = '+1';
    // VERCEL_ENV unset (local/sandbox) — must stay test-safe.
    const fetchMock = okFetch({ sid: 'SM123' });

    const res = await resolveSmsAdapterFromEnv(fetchMock as unknown as typeof fetch).send({
      to: '+1',
      body: 'b',
    });

    expect(res.mode).toBe('test_safe');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is test-safe on production when a secret is missing', async () => {
    process.env.VERCEL_ENV = 'production';
    process.env.TWILIO_ACCOUNT_SID = 'AC9';
    process.env.TWILIO_AUTH_TOKEN = 'tok';
    // TWILIO_FROM_NUMBER missing.

    const res = await resolveSmsAdapterFromEnv().send({ to: '+1', body: 'b' });
    expect(res.mode).toBe('test_safe');
  });

  it('goes live only on production with every secret present', async () => {
    process.env.VERCEL_ENV = 'production';
    process.env.TWILIO_ACCOUNT_SID = 'AC9';
    process.env.TWILIO_AUTH_TOKEN = 'tok';
    process.env.TWILIO_FROM_NUMBER = '+15550000000';
    const fetchMock = okFetch({ sid: 'SM999' });

    const res = await resolveSmsAdapterFromEnv(fetchMock as unknown as typeof fetch).send({
      to: '+15551234567',
      body: 'b',
    });

    expect(res.mode).toBe('live');
    expect(res.sid).toBe('SM999');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
