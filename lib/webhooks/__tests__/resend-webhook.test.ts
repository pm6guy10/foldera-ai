import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { handleResendWebhookPost } from '../resend-webhook';

/** Svix `Webhook` ctor requires `whsec_` + valid base64 payload. */
const testWhsec = () =>
  `whsec_${Buffer.from('unit-test-webhook-secret-32b!').toString('base64')}`;

describe('handleResendWebhookPost', () => {
  let secret: string;

  beforeEach(() => {
    secret = testWhsec();
    vi.stubEnv('RESEND_WEBHOOK_SECRET', secret);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 400 for empty body', async () => {
    const req = new NextRequest('http://localhost/api/resend/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '',
    });
    const res = await handleResendWebhookPost(req);
    expect(res.status).toBe(400);
    const j = (await res.json()) as { error?: string };
    expect(j.error).toMatch(/empty/i);
  });

  it('returns 401 when Svix headers are missing (unsigned payload)', async () => {
    const req = new NextRequest('http://localhost/api/resend/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'email.bounced', data: {} }),
    });
    const res = await handleResendWebhookPost(req);
    expect(res.status).toBe(401);
  });
});
