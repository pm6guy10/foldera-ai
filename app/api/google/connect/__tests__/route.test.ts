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

describe('GET /api/google/connect', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv('NEXTAUTH_URL', 'https://foldera.ai');
    vi.stubEnv('GOOGLE_CLIENT_ID', 'client-id-123');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'client-secret-123');
  });

  it('redirects authenticated users into Google OAuth with the registered callback URL', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'user-123' } });

    const { GET } = await import('../route');
    const response = await GET();

    expect(response.status).toBe(307);
    const location = response.headers.get('location');
    expect(location).toContain('https://accounts.google.com/o/oauth2/v2/auth?');
    expect(location).toContain(
      'redirect_uri=https%3A%2F%2Fwww.foldera.ai%2Fapi%2Fgoogle%2Fcallback',
    );
    expect(cookieSet).toHaveBeenCalledTimes(1);
  });
});
