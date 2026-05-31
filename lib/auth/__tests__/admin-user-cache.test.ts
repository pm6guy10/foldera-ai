import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetUserById = vi.fn();

vi.mock('@/lib/db/client', () => ({
  createServerClient: () => ({
    auth: {
      admin: {
        getUserById: mockGetUserById,
      },
    },
  }),
}));

describe('auth admin user cache', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    const { clearAuthAdminUserCacheForTests } = await import('../admin-user-cache');
    clearAuthAdminUserCacheForTests();
  });

  it('collapses repeated lookups for the same user id', async () => {
    mockGetUserById.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'user@example.com' } },
      error: null,
    });
    const { getAuthAdminUserCached } = await import('../admin-user-cache');

    const [first, second, third] = await Promise.all([
      getAuthAdminUserCached('user-1'),
      getAuthAdminUserCached('user-1'),
      getAuthAdminUserCached('user-1'),
    ]);

    expect(first?.email).toBe('user@example.com');
    expect(second?.email).toBe('user@example.com');
    expect(third?.email).toBe('user@example.com');
    expect(mockGetUserById).toHaveBeenCalledTimes(1);
  });

  it('does not share lookups across different user ids', async () => {
    mockGetUserById.mockImplementation(async (userId: string) => ({
      data: { user: { id: userId, email: `${userId}@example.com` } },
      error: null,
    }));
    const { getAuthAdminUserCached } = await import('../admin-user-cache');

    await getAuthAdminUserCached('user-1');
    await getAuthAdminUserCached('user-2');

    expect(mockGetUserById).toHaveBeenCalledTimes(2);
  });
});
