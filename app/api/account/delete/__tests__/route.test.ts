import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const deleteUser = vi.fn();
const apiError = vi.fn((error: unknown) => new Response(JSON.stringify({
  error: error instanceof Error ? error.message : String(error),
}), { status: 500 }));

vi.mock('next-auth', () => ({
  getServerSession,
}));

vi.mock('@/lib/auth/auth-options', () => ({
  getAuthOptions: vi.fn(() => ({})),
}));

vi.mock('@/lib/db/client', () => ({
  createServerClient: () => ({
    from: () => ({
      delete: () => ({
        eq: () => Promise.resolve({ error: null }),
      }),
    }),
    auth: {
      admin: {
        deleteUser,
      },
    },
  }),
}));

vi.mock('@/lib/utils/api-error', () => ({
  apiError,
  apiErrorForRoute: apiError,
}));

describe('POST /api/account/delete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    getServerSession.mockResolvedValue(null);
    const { POST } = await import('../route');

    const response = await POST();

    expect(response.status).toBe(401);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('deletes the auth user and returns ok', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'user-1' } });
    deleteUser.mockResolvedValue({ error: null });
    const { POST } = await import('../route');

    const response = await POST();
    const body = await response.json();

    expect(deleteUser).toHaveBeenCalledWith('user-1');
    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true });
  });

  it('returns apiError when delete fails', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'user-1' } });
    deleteUser.mockResolvedValue({ error: new Error('delete failed') });
    const { POST } = await import('../route');

    const response = await POST();

    expect(apiError).toHaveBeenCalled();
    expect(response.status).toBe(500);
  });
});

