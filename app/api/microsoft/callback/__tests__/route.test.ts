import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const getAuthOptions = vi.fn(() => ({}));
const saveUserToken = vi.fn();
const findCrossUserTokenConflict = vi.fn();
const cookieGet = vi.fn();
const cookieDelete = vi.fn();

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth/auth-options', () => ({ getAuthOptions }));
vi.mock('@/lib/auth/user-tokens', () => ({ saveUserToken, findCrossUserTokenConflict }));
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: cookieGet,
    delete: cookieDelete,
  })),
}));

describe('GET /api/microsoft/callback', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv('NEXTAUTH_URL', 'https://foldera.ai');
    vi.stubEnv('AZURE_AD_CLIENT_ID', 'client-id-123');
    vi.stubEnv('AZURE_AD_CLIENT_SECRET', 'client-secret-123');
    vi.stubEnv('AZURE_AD_TENANT_ID', 'common');

    getServerSession.mockResolvedValue({ user: { id: 'user-123' } });
    cookieGet.mockReturnValue({ value: 'state-123' });
    saveUserToken.mockResolvedValue(undefined);
    findCrossUserTokenConflict.mockResolvedValue(null);
    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            access_token: 'access-token',
            refresh_token: 'refresh-token',
            expires_in: 3600,
            scope: 'scope-a scope-b',
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            mail: 'user@example.com',
            userPrincipalName: 'user@example.com',
          }),
        }),
    );
  });

  it('uses the registered callback URL when exchanging the Microsoft authorization code', async () => {
    const { GET } = await import('../route');
    const response = await GET(
      new NextRequest('https://foldera.ai/api/microsoft/callback?code=code-123&state=state-123'),
    );

    expect(response.status).toBe(307);
    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      expect.objectContaining({
        method: 'POST',
        body: expect.any(URLSearchParams),
      }),
    );

    const firstCall = vi.mocked(global.fetch).mock.calls[0];
    const params = firstCall?.[1]?.body as URLSearchParams;
    expect(params.get('redirect_uri')).toBe('https://www.foldera.ai/api/microsoft/callback');

    expect(saveUserToken).toHaveBeenCalledWith(
      'user-123',
      'microsoft',
      expect.objectContaining({
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        email: 'user@example.com',
      }),
    );
    expect(response.headers.get('location')).toBe(
      'https://foldera.ai/dashboard/settings?microsoft_connected=true',
    );
  });

  it('refuses to link a Microsoft account already connected to another Foldera user', async () => {
    findCrossUserTokenConflict.mockResolvedValueOnce('other-user-999');

    const { GET } = await import('../route');
    const response = await GET(
      new NextRequest('https://foldera.ai/api/microsoft/callback?code=code-123&state=state-123'),
    );

    expect(findCrossUserTokenConflict).toHaveBeenCalledWith('microsoft', 'user@example.com', 'user-123');
    expect(saveUserToken).not.toHaveBeenCalled();
    expect(response.headers.get('location')).toBe(
      'https://foldera.ai/dashboard/settings?microsoft_error=already_linked_elsewhere',
    );
  });

  it('fails closed when Microsoft does not return a refresh token', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'access-token',
          expires_in: 3600,
          scope: 'scope-a scope-b',
        }),
      }),
    );

    const { GET } = await import('../route');
    const response = await GET(
      new NextRequest('https://foldera.ai/api/microsoft/callback?code=code-123&state=state-123'),
    );

    expect(saveUserToken).not.toHaveBeenCalled();
    expect(response.headers.get('location')).toBe(
      'https://foldera.ai/dashboard/settings?microsoft_error=missing_refresh_token',
    );
  });
});
