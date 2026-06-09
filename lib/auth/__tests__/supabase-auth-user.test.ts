import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const listUsers = vi.fn();
const createUser = vi.fn();

vi.mock('@/lib/db/client', () => ({
  createServerClient: () => ({
    rpc,
    auth: { admin: { listUsers, createUser } },
  }),
}));

describe('resolveSupabaseAuthUserId', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    rpc.mockResolvedValue({ data: null, error: { message: 'rpc unavailable' } });
    listUsers.mockResolvedValue({ data: { users: [] }, error: null });
    createUser.mockResolvedValue({ data: { user: { id: 'created-id' } }, error: null });
  });

  it('returns the existing user id from the RPC lookup', async () => {
    rpc.mockResolvedValue({ data: 'existing-id', error: null });

    const { resolveSupabaseAuthUserId } = await import('../supabase-auth-user');
    await expect(resolveSupabaseAuthUserId('Owner@Gmail.com')).resolves.toBe('existing-id');
    expect(createUser).not.toHaveBeenCalled();
  });

  it('creates a new user when no lookup finds a match', async () => {
    const { resolveSupabaseAuthUserId } = await import('../supabase-auth-user');
    await expect(resolveSupabaseAuthUserId('new@gmail.com')).resolves.toBe('created-id');
    expect(createUser).toHaveBeenCalledTimes(1);
  });

  it('recovers the existing user when lookups fail transiently and createUser says already registered', async () => {
    // First lookup pass fails (RPC + listUsers), createUser reports duplicate,
    // second lookup pass succeeds — sign-in must resolve, not throw.
    rpc
      .mockResolvedValueOnce({ data: null, error: { message: 'timeout' } })
      .mockResolvedValueOnce({ data: 'existing-id', error: null });
    listUsers.mockResolvedValue({ data: null, error: { message: 'GoTrue scan error' } });
    createUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'A user with this email address has already been registered', status: 422 },
    });

    const { resolveSupabaseAuthUserId } = await import('../supabase-auth-user');
    await expect(resolveSupabaseAuthUserId('owner@gmail.com')).resolves.toBe('existing-id');
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('recovers via the email_exists error code', async () => {
    rpc
      .mockResolvedValueOnce({ data: null, error: { message: 'timeout' } })
      .mockResolvedValueOnce({ data: 'existing-id', error: null });
    createUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'duplicate', code: 'email_exists' },
    });

    const { resolveSupabaseAuthUserId } = await import('../supabase-auth-user');
    await expect(resolveSupabaseAuthUserId('owner@gmail.com')).resolves.toBe('existing-id');
  });

  it('still throws when createUser fails for a non-duplicate reason', async () => {
    createUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'database unavailable' },
    });

    const { resolveSupabaseAuthUserId } = await import('../supabase-auth-user');
    await expect(resolveSupabaseAuthUserId('owner@gmail.com')).rejects.toMatchObject({
      message: 'database unavailable',
    });
  });

  it('throws when createUser reports duplicate but the recovery lookup also fails', async () => {
    createUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'A user with this email address has already been registered' },
    });

    const { resolveSupabaseAuthUserId } = await import('../supabase-auth-user');
    await expect(resolveSupabaseAuthUserId('owner@gmail.com')).rejects.toMatchObject({
      message: 'A user with this email address has already been registered',
    });
  });
});
