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
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: 'user-1' } });
    rateLimit.mockResolvedValue({ success: true, remaining: 2, resetAt: new Date(Date.now() + 60_000) });
  });

  it('returns unauthorized without a session user', async () => {
    getServerSession.mockResolvedValue(null);
    const { POST } = await import('../route');
    const response = await POST();
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
    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.total).toBe(9);
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
    const response = await POST();

    expect(response.status).toBe(400);
  });
});

