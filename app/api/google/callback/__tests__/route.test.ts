import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const getAuthOptions = vi.fn(() => ({}));
const saveUserToken = vi.fn();
const cookieGet = vi.fn();
const cookieDelete = vi.fn();
const oauth2Constructor = vi.fn();
const getToken = vi.fn();
const setCredentials = vi.fn();
const userInfoGet = vi.fn();

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth/auth-options', () => ({ getAuthOptions }));
vi.mock('@/lib/auth/user-tokens', () => ({ saveUserToken }));
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: cookieGet,
    delete: cookieDelete,
  })),
}));
vi.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: vi.fn().mockImplementation((clientId, clientSecret, redirectUri) => {
        oauth2Constructor(clientId, clientSecret, redirectUri);
        return {
          getToken,
          setCredentials,
        };
      }),
    },
    oauth2: vi.fn(() => ({
      userinfo: {
        get: userInfoGet,
      },
    })),
  },
}));

describe('GET /api/google/callback', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv('NEXTAUTH_URL', 'https://foldera.ai');
    vi.stubEnv('GOOGLE_CLIENT_ID', 'client-id-123');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'client-secret-123');

    getServerSession.mockResolvedValue({ user: { id: 'user-123' } });
    cookieGet.mockReturnValue({ value: 'state-123' });
    getToken.mockResolvedValue({
      tokens: {
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        expiry_date: 1777000000000,
        scope: 'scope-a scope-b',
      },
    });
    userInfoGet.mockResolvedValue({
      data: { email: 'user@example.com' },
    });
    saveUserToken.mockResolvedValue(undefined);
  });

  it('uses the registered callback URL when exchanging the Google authorization code', async () => {
    const { GET } = await import('../route');
    const response = await GET(
      new NextRequest('https://foldera.ai/api/google/callback?code=code-123&state=state-123'),
    );

    expect(response.status).toBe(307);
    expect(oauth2Constructor).toHaveBeenCalledWith(
      'client-id-123',
      'client-secret-123',
      'https://www.foldera.ai/api/google/callback',
    );
    expect(saveUserToken).toHaveBeenCalledWith(
      'user-123',
      'google',
      expect.objectContaining({
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        email: 'user@example.com',
      }),
    );
    expect(response.headers.get('location')).toBe(
      'https://foldera.ai/dashboard/settings?google_connected=true',
    );
  });
});
