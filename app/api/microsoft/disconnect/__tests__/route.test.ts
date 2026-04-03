import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const mockGetServerSession = vi.fn();
const mockGetAuthOptions = vi.fn();
const mockGetUserToken = vi.fn();
const mockSoftDisconnectUserToken = vi.fn();
const mockApiError = vi.fn();

vi.mock('next-auth', () => ({
  getServerSession: mockGetServerSession,
}));

vi.mock('@/lib/auth/auth-options', () => ({
  getAuthOptions: mockGetAuthOptions,
}));

vi.mock('@/lib/auth/user-tokens', () => ({
  getUserToken: mockGetUserToken,
  softDisconnectUserToken: mockSoftDisconnectUserToken,
}));

vi.mock('@/lib/utils/api-error', () => ({
  apiError: mockApiError,
  apiErrorForRoute: mockApiError,
}));

describe('POST /api/microsoft/disconnect', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockGetAuthOptions.mockReturnValue({});
    mockApiError.mockImplementation((error: unknown) =>
      NextResponse.json(
        { error: error instanceof Error ? error.message : String(error) },
        { status: 500 },
      ),
    );
  });

  it('returns 401 when the user session is missing', async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { POST } = await import('../route');

    const response = await POST();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
  });

  it('returns 404 when the Microsoft token row does not exist', async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockGetUserToken.mockResolvedValue(null);
    const { POST } = await import('../route');

    const response = await POST();

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Microsoft account not connected' });
    expect(mockSoftDisconnectUserToken).not.toHaveBeenCalled();
  });

  it('soft-disconnects the token row instead of deleting it', async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockGetUserToken.mockResolvedValue({
      access_token: 'access',
      refresh_token: 'refresh',
      expires_at: Date.now() + 3600,
      email: 'user@example.com',
      last_synced_at: null,
    });
    mockSoftDisconnectUserToken.mockResolvedValue(undefined);
    const { POST } = await import('../route');

    const response = await POST();

    expect(mockSoftDisconnectUserToken).toHaveBeenCalledWith('user-1', 'microsoft');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });
});
