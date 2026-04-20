import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const syncMicrosoft = vi.fn();
const rateLimit = vi.fn();

vi.mock('next-auth', () => ({
  getServerSession,
}));

vi.mock('@/lib/auth/auth-options', () => ({
  getAuthOptions: vi.fn(() => ({})),
}));

vi.mock('@/lib/sync/microsoft-sync', () => ({
  syncMicrosoft,
}));

vi.mock('@/lib/utils/rate-limit', () => ({
  rateLimit,
}));

describe('POST /api/microsoft/sync-now', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: 'user-1' } });
    rateLimit.mockResolvedValue({
      success: true,
      remaining: 2,
      resetAt: new Date(Date.now() + 60_000),
    });
  });

  it('returns unauthorized without a session user', async () => {
    getServerSession.mockResolvedValue(null);
    const { POST } = await import('../route');
    const response = await POST();
    expect(response.status).toBe(401);
  });

  it('passes the 7 day bounded lookback to Microsoft sync', async () => {
    syncMicrosoft.mockResolvedValue({
      mail_signals: 2,
      calendar_signals: 3,
      file_signals: 4,
      task_signals: 5,
      mail_total_signals: 2,
      calendar_total_signals: 3,
      file_total_signals: 4,
      task_total_signals: 5,
      is_first_sync: false,
    });
    const { POST } = await import('../route');
    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.total).toBe(14);
    expect(syncMicrosoft).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        maxLookbackMs: 7 * 24 * 60 * 60 * 1000,
      }),
    );
  });

  it('returns 400 when Microsoft is not connected', async () => {
    syncMicrosoft.mockResolvedValue({
      mail_signals: 0,
      calendar_signals: 0,
      file_signals: 0,
      task_signals: 0,
      mail_total_signals: 0,
      calendar_total_signals: 0,
      file_total_signals: 0,
      task_total_signals: 0,
      is_first_sync: false,
      error: 'no_token',
    });
    const { POST } = await import('../route');
    const response = await POST();

    expect(response.status).toBe(400);
  });
});
