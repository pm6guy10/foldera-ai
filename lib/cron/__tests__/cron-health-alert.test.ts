import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runPlatformHealthAlert } from '@/lib/cron/cron-health-alert';

const emailsSend = vi.fn();

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: emailsSend };
  },
}));

describe('runPlatformHealthAlert', () => {
  beforeEach(() => {
    emailsSend.mockResolvedValue({});
    vi.stubEnv('DAILY_BRIEF_TO_EMAIL', 'ops@test.example');
    vi.stubEnv('RESEND_API_KEY', 're_test');
    vi.stubEnv('RESEND_FROM_EMAIL', 'Foldera <noreply@test.example>');
    vi.stubEnv('NEXTAUTH_URL', 'https://www.foldera.ai');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('retries fetch and succeeds when a later attempt works', async () => {
    const okBody = { status: 'ok', ts: '2026-01-01T00:00:00.000Z', db: true, env: true };
    global.fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => okBody,
      } as Response);

    const r = await runPlatformHealthAlert();
    expect(r.ok).toBe(true);
    expect(emailsSend).not.toHaveBeenCalled();
    expect(vi.mocked(global.fetch)).toHaveBeenCalledTimes(2);
  });

  it('after retries, marks unreachable and email explains DB/env were not checked', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('fetch failed'));

    const r = await runPlatformHealthAlert();
    expect(r.ok).toBe(false);
    expect(String(r.health.error)).toContain('unreachable');
    expect(emailsSend).toHaveBeenCalledTimes(1);
    const payload = emailsSend.mock.calls[0][0] as { text: string };
    expect(payload.text).toContain('UNKNOWN (endpoint not reached');
    expect(payload.text).not.toMatch(/Database: FAILED/);
  });
});
