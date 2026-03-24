import { beforeEach, describe, expect, it, vi } from 'vitest';

const getUserToken = vi.fn();
const updateSyncTimestamp = vi.fn();
const saveUserToken = vi.fn();

vi.mock('@/lib/auth/user-tokens', () => ({
  getUserToken,
  updateSyncTimestamp,
  saveUserToken,
}));

vi.mock('@/lib/db/client', () => ({
  createServerClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          })),
        })),
      })),
    })),
  })),
}));

vi.mock('@/lib/encryption', () => ({
  encrypt: vi.fn((value: string) => value),
}));

describe('syncMicrosoft', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('returns no_token without running sync work when token lookup resolves as disconnected', async () => {
    getUserToken.mockResolvedValue(null);
    const { syncMicrosoft } = await import('../microsoft-sync');

    const result = await syncMicrosoft('user-1');

    expect(result).toEqual({
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
    expect(updateSyncTimestamp).not.toHaveBeenCalled();
    expect(saveUserToken).not.toHaveBeenCalled();
  });
});
