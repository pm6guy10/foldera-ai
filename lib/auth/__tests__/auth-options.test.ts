import { beforeEach, describe, expect, it, vi } from 'vitest';

const hasCompletedOnboarding = vi.fn();
const resolveSupabaseAuthUserId = vi.fn();
const saveUserToken = vi.fn();
const softDisconnectAfterFatalOAuthRefresh = vi.fn();

vi.mock('@/lib/auth/onboarding-state', () => ({
  hasCompletedOnboarding,
}));

vi.mock('@/lib/auth/supabase-auth-user', () => ({
  resolveSupabaseAuthUserId,
}));

vi.mock('@/lib/auth/user-tokens', () => ({
  saveUserToken,
  softDisconnectAfterFatalOAuthRefresh,
}));

function getAuthorizationPrompt(provider: any): string | null {
  const authorization = provider?.options?.authorization ?? provider?.authorization;
  if (typeof authorization === 'string') {
    try {
      return new URL(authorization).searchParams.get('prompt');
    } catch {
      return null;
    }
  }

  return authorization?.params?.prompt ?? null;
}

describe('auth session refresh', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    hasCompletedOnboarding.mockResolvedValue(true);
    resolveSupabaseAuthUserId.mockResolvedValue('user-1');
    process.env.GOOGLE_CLIENT_ID = 'google-client';
    process.env.GOOGLE_CLIENT_SECRET = 'google-secret';
    process.env.AZURE_AD_CLIENT_ID = 'azure-client';
    process.env.AZURE_AD_CLIENT_SECRET = 'azure-secret';
    process.env.AZURE_AD_TENANT_ID = 'common';
    process.env.NEXTAUTH_SECRET = 'secret';
  });

  it('does not soft-disconnect Microsoft source tokens when only the NextAuth JWT refresh fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({
          error: 'invalid_grant',
          error_description: 'AADSTS700082: The refresh token has expired due to inactivity.',
        }),
      }),
    );

    const { getAuthOptions } = await import('../auth-options');
    const jwt = getAuthOptions().callbacks?.jwt;
    if (!jwt) throw new Error('missing jwt callback');

    const token = await jwt({
      token: {
        userId: 'user-1',
        email: 'member@outlook.com',
        provider: 'azure-ad',
        accessToken: 'expired-access',
        refreshToken: 'stale-nextauth-refresh',
        expiresAt: Math.floor(Date.now() / 1000) - 60,
        hasOnboarded: true,
      },
      account: null,
      user: undefined,
    } as any);

    expect(token).toMatchObject({ error: 'RefreshAccessTokenError' });
    expect(softDisconnectAfterFatalOAuthRefresh).not.toHaveBeenCalled();
    expect(saveUserToken).not.toHaveBeenCalled();
  });

  it('does not soft-disconnect Google source tokens when only the NextAuth JWT refresh fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({
          error: 'invalid_grant',
          error_description: 'Token has been expired or revoked.',
        }),
      }),
    );

    const { getAuthOptions } = await import('../auth-options');
    const jwt = getAuthOptions().callbacks?.jwt;
    if (!jwt) throw new Error('missing jwt callback');

    const token = await jwt({
      token: {
        userId: 'user-1',
        email: 'member@gmail.com',
        provider: 'google',
        accessToken: 'expired-access',
        refreshToken: 'stale-nextauth-refresh',
        expiresAt: Math.floor(Date.now() / 1000) - 60,
        hasOnboarded: true,
      },
      account: null,
      user: undefined,
    } as any);

    expect(token).toMatchObject({ error: 'RefreshAccessTokenError' });
    expect(softDisconnectAfterFatalOAuthRefresh).not.toHaveBeenCalled();
    expect(saveUserToken).not.toHaveBeenCalled();
  });

  it('asks Google sign-in to show account choice while preserving consent', async () => {
    const { getAuthOptions } = await import('../auth-options');
    const provider = getAuthOptions().providers.find((candidate) => candidate.id === 'google') as any;
    const prompt = getAuthorizationPrompt(provider);

    expect(prompt?.split(/\s+/)).toEqual(expect.arrayContaining(['consent', 'select_account']));
  });

  it('asks Microsoft sign-in to show account choice', async () => {
    const { getAuthOptions } = await import('../auth-options');
    const provider = getAuthOptions().providers.find((candidate) => candidate.id === 'azure-ad') as any;

    expect(getAuthorizationPrompt(provider)).toBe('select_account');
  });
});
