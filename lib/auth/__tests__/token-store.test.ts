import { beforeEach, describe, expect, it, vi } from 'vitest';

const from = vi.fn();
const saveUserToken = vi.fn();
const softDisconnectAfterFatalOAuthRefresh = vi.fn();
const googleRefreshAccessToken = vi.fn();

let storedRow: Record<string, unknown> | null = null;

vi.mock('@/lib/db/client', () => ({
  createServerClient: () => ({
    from,
  }),
}));

vi.mock('@/lib/auth/user-tokens', () => ({
  getUserToken: vi.fn(),
  saveUserToken,
  softDisconnectAfterFatalOAuthRefresh,
}));

vi.mock('@/lib/crypto/token-encryption', () => ({
  decryptToken: (value: string) => value,
  isEncrypted: () => false,
}));

vi.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: class {
        setCredentials() {}
        async refreshAccessToken() {
          return googleRefreshAccessToken();
        }
      },
    },
  },
}));

function userTokensChain() {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: storedRow,
            error: null,
          }),
        }),
      }),
    }),
  };
}

describe('getMicrosoftTokensWithRefreshOutcome', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    googleRefreshAccessToken.mockReset();
    storedRow = null;
    from.mockImplementation((table: string) => {
      if (table !== 'user_tokens') {
        throw new Error(`Unexpected table ${table}`);
      }
      return userTokensChain();
    });
    vi.unstubAllGlobals();
  });

  it('classifies retryable Microsoft refresh failures without soft-disconnecting', async () => {
    storedRow = {
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      expires_at: Math.floor(Date.now() / 1000) + 60,
      email: 'member@outlook.com',
      disconnected_at: null,
      oauth_reauth_required_at: null,
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () =>
        JSON.stringify({
          error: 'temporarily_unavailable',
          error_description: 'Try again later',
        }),
    } as Response);

    const { getMicrosoftTokensWithRefreshOutcome } = await import('../token-store');
    const outcome = await getMicrosoftTokensWithRefreshOutcome('user-1');

    expect(outcome).toMatchObject({
      status: 'retryable_failure',
      error_code: 'temporarily_unavailable',
      http_status: 503,
    });
    expect(softDisconnectAfterFatalOAuthRefresh).not.toHaveBeenCalled();
    expect(saveUserToken).not.toHaveBeenCalled();
  });

  it('classifies fatal Microsoft refresh failures and soft-disconnects', async () => {
    storedRow = {
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      expires_at: Math.floor(Date.now() / 1000) + 60,
      email: 'member@outlook.com',
      disconnected_at: null,
      oauth_reauth_required_at: null,
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () =>
        JSON.stringify({
          error: 'invalid_grant',
          error_description: 'AADSTS700082: The refresh token has expired due to inactivity.',
        }),
    } as Response);

    const { getMicrosoftTokensWithRefreshOutcome } = await import('../token-store');
    const outcome = await getMicrosoftTokensWithRefreshOutcome('user-1');

    expect(outcome.status).toBe('fatal_reauth_required');
    expect(softDisconnectAfterFatalOAuthRefresh).toHaveBeenCalledWith(
      'user-1',
      'microsoft',
      expect.objectContaining({
        source: 'token-store.refreshMicrosoftTokens',
        error_code: 'invalid_grant',
      }),
    );
  });

  it('classifies a missing refresh token distinctly', async () => {
    storedRow = {
      access_token: 'access-token',
      refresh_token: null,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      email: 'member@outlook.com',
      disconnected_at: null,
      oauth_reauth_required_at: null,
    };

    const { getMicrosoftTokensWithRefreshOutcome } = await import('../token-store');
    const outcome = await getMicrosoftTokensWithRefreshOutcome('user-1');

    expect(outcome).toEqual({
      status: 'missing_refresh_token',
      error_code: 'no_refresh_token',
      error_description: 'Microsoft connector row is missing a refresh token.',
      reauth_required_at: null,
    });
    expect(softDisconnectAfterFatalOAuthRefresh).not.toHaveBeenCalled();
  });
});

describe('getGoogleTokensWithRefreshOutcome', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    googleRefreshAccessToken.mockReset();
    storedRow = null;
    from.mockImplementation((table: string) => {
      if (table !== 'user_tokens') {
        throw new Error(`Unexpected table ${table}`);
      }
      return userTokensChain();
    });
    vi.unstubAllGlobals();
  });

  it('classifies retryable Google refresh failures without soft-disconnecting', async () => {
    storedRow = {
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      expires_at: Math.floor(Date.now() / 1000) + 60,
      email: 'member@gmail.com',
      disconnected_at: null,
      oauth_reauth_required_at: null,
    };
    googleRefreshAccessToken.mockRejectedValue({
      code: 'EAI_AGAIN',
      message: 'Temporary DNS failure',
    });

    const { getGoogleTokensWithRefreshOutcome } = await import('../token-store');
    const outcome = await getGoogleTokensWithRefreshOutcome('user-1');

    expect(outcome).toMatchObject({
      status: 'retryable_failure',
      error_code: 'EAI_AGAIN',
      http_status: null,
    });
    expect(softDisconnectAfterFatalOAuthRefresh).not.toHaveBeenCalled();
    expect(saveUserToken).not.toHaveBeenCalled();
  });

  it('classifies fatal Google refresh failures and soft-disconnects', async () => {
    storedRow = {
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      expires_at: Math.floor(Date.now() / 1000) + 60,
      email: 'member@gmail.com',
      disconnected_at: null,
      oauth_reauth_required_at: null,
    };
    googleRefreshAccessToken.mockRejectedValue({
      response: {
        status: 400,
        data: {
          error: 'invalid_grant',
          error_description: 'Token has been expired or revoked.',
        },
      },
      message: 'Token has been expired or revoked.',
    });

    const { getGoogleTokensWithRefreshOutcome } = await import('../token-store');
    const outcome = await getGoogleTokensWithRefreshOutcome('user-1');

    expect(outcome.status).toBe('fatal_reauth_required');
    expect(softDisconnectAfterFatalOAuthRefresh).toHaveBeenCalledWith(
      'user-1',
      'google',
      expect.objectContaining({
        source: 'token-store.refreshGoogleTokens',
        error_code: 'invalid_grant',
      }),
    );
  });

  it('classifies a missing Google refresh token distinctly', async () => {
    storedRow = {
      access_token: 'access-token',
      refresh_token: null,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      email: 'member@gmail.com',
      disconnected_at: null,
      oauth_reauth_required_at: null,
    };

    const { getGoogleTokensWithRefreshOutcome } = await import('../token-store');
    const outcome = await getGoogleTokensWithRefreshOutcome('user-1');

    expect(outcome).toEqual({
      status: 'missing_refresh_token',
      error_code: 'no_refresh_token',
      error_description: 'Google connector row is missing a refresh token.',
      reauth_required_at: null,
    });
    expect(softDisconnectAfterFatalOAuthRefresh).not.toHaveBeenCalled();
  });
});
