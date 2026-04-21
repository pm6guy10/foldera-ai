import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const getAuthOptions = vi.fn(() => ({}));
const cookieSet = vi.fn();

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth/auth-options', () => ({ getAuthOptions }));
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    set: cookieSet,
  })),
}));

describe('GET /api/microsoft/connect', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv('NEXTAUTH_URL', 'https://foldera.ai');
    vi.stubEnv('AZURE_AD_CLIENT_ID', 'client-id-123');
    vi.stubEnv('AZURE_AD_TENANT_ID', 'common');
  });

  it('redirects authenticated users into Microsoft OAuth with the registered callback URL', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'user-123' } });

    const { GET } = await import('../route');
    const response = await GET();

    expect(response.status).toBe(307);
    const location = response.headers.get('location');
    expect(location).toContain('https://login.microsoftonline.com/common/oauth2/v2.0/authorize?');
    expect(location).toContain(
      'redirect_uri=https%3A%2F%2Fwww.foldera.ai%2Fapi%2Fmicrosoft%2Fcallback',
    );
    expect(cookieSet).toHaveBeenCalledTimes(1);
  });
});
