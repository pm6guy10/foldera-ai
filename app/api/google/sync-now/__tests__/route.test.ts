import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const syncGoogle = vi.fn();
const rateLimit = vi.fn();

vi.mock('next-auth', () => ({
  getServerSession,
}));

vi.mock('@/lib/auth/auth-options', () => ({
  getAuthOptions: vi.fn(() => ({})),
}));

vi.mock('@/lib/sync/google-sync', () => ({
  syncGoogle,
}));

vi.mock('@/lib/utils/rate-limit', () => ({
  rateLimit,
}));

describe('POST /api/google/sync-now', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: 'user-1' } });
    rateLimit.mockResolvedValue({ success: true, remaining: 2, resetAt: new Date(Date.now() + 60_000) });
  });

  it('blocks manual sync during egress emergency mode without operator secret', async () => {
    vi.stubEnv('FOLDERA_EGRESS_EMERGENCY_MODE', 'true');
    vi.stubEnv('CRON_SECRET', 'operator-secret');
    const { POST } = await import('../route');

    const response = await POST(new Request('http://localhost/api/google/sync-now', { method: 'POST' }));

    expect(response.status).toBe(423);
    expect(getServerSession).not.toHaveBeenCalled();
    expect(syncGoogle).not.toHaveBeenCalled();
  });

  it('allows operator-secret sync attempts during egress emergency mode', async () => {
    vi.stubEnv('FOLDERA_EGRESS_EMERGENCY_MODE', 'true');
    vi.stubEnv('CRON_SECRET', 'operator-secret');
    syncGoogle.mockResolvedValue({
      gmail_signals: 1,
      calendar_signals: 0,
      drive_signals: 0,
      is_first_sync: false,
    });
    const { POST } = await import('../route');

    const response = await POST(new Request('http://localhost/api/google/sync-now', {
      method: 'POST',
      headers: { 'x-cron-secret': 'operator-secret' },
    }));

    expect(response.status).toBe(200);
    expect(syncGoogle).toHaveBeenCalled();
  });

  it('returns unauthorized without a session user', async () => {
    getServerSession.mockResolvedValue(null);
    const { POST } = await import('../route');
    const response = await POST(new Request('http://localhost/api/google/sync-now', { method: 'POST' }));
    expect(response.status).toBe(401);
  });

  it('includes drive_signals in total', async () => {
    syncGoogle.mockResolvedValue({
      gmail_signals: 2,
      calendar_signals: 3,
      drive_signals: 4,
      is_first_sync: false,
    });
    const { POST } = await import('../route');
    const response = await POST(new Request('http://localhost/api/google/sync-now', { method: 'POST' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.total).toBe(9);
  });

  it('uses a bounded 7 day lookback for manual sync', async () => {
    syncGoogle.mockResolvedValue({
      gmail_signals: 1,
      calendar_signals: 0,
      drive_signals: 0,
      is_first_sync: false,
    });
    const { POST } = await import('../route');
    const response = await POST(new Request('http://localhost/api/google/sync-now', { method: 'POST' }));

    expect(response.status).toBe(200);
    expect(syncGoogle).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        maxLookbackMs: 7 * 24 * 60 * 60 * 1000,
      }),
    );
  });

  it('returns 400 when Google is not connected', async () => {
    syncGoogle.mockResolvedValue({
      gmail_signals: 0,
      calendar_signals: 0,
      drive_signals: 0,
      is_first_sync: false,
      error: 'no_token',
    });
    const { POST } = await import('../route');
    const response = await POST(new Request('http://localhost/api/google/sync-now', { method: 'POST' }));

    expect(response.status).toBe(400);
  });
});
