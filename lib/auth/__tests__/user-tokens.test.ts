import { beforeEach, describe, expect, it, vi } from 'vitest';

const upsertSpy = vi.fn();
const updateEqSpy = vi.fn();
const updateSpy = vi.fn();
const maybeSingleSpy = vi.fn();
const selectEqSpy = vi.fn();
const selectNotSpy = vi.fn();
const selectIsSpy = vi.fn();
const selectChain = {
  eq: selectEqSpy,
  not: selectNotSpy,
  is: selectIsSpy,
  maybeSingle: maybeSingleSpy,
};

vi.mock('@/lib/db/client', () => ({
  createServerClient: () => ({
    from(table: string) {
      if (table !== 'user_tokens') {
        throw new Error(`Unexpected table ${table}`);
      }

      return {
        upsert: upsertSpy,
        update: updateSpy,
        select: () => selectChain,
      };
    },
  }),
}));

vi.mock('@/lib/crypto/token-encryption', () => ({
  encryptToken: (value: string) => `enc:${value}`,
  decryptToken: (value: string) => value,
  isEncrypted: () => false,
}));

describe('saveUserToken', () => {
  beforeEach(() => {
    vi.resetModules();
    upsertSpy.mockReset();
    updateEqSpy.mockReset();
    updateSpy.mockReset();
    maybeSingleSpy.mockReset();
    selectEqSpy.mockReset();
    selectNotSpy.mockReset();
    selectIsSpy.mockReset();

    upsertSpy.mockResolvedValue({ error: null });
    updateEqSpy.mockResolvedValue({ error: null });
    maybeSingleSpy.mockResolvedValue({ data: null, error: null });
    selectEqSpy.mockReturnValue(selectChain);
    selectNotSpy.mockReturnValue(selectChain);
    selectIsSpy.mockResolvedValue({ data: [], error: null });
    updateSpy.mockReturnValue({
      eq() {
        return {
          eq: updateEqSpy,
        };
      },
    });
  });

  it('rejects test-prefixed tokens before any database write', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { saveUserToken } = await import('../user-tokens');

    await expect(saveUserToken('user-1', 'google', {
      access_token: 'test_access_token_gate2',
      refresh_token: 'test_refresh_token_gate2',
      expires_at: Date.now() + 60_000,
    })).rejects.toThrow('Refusing to persist test token value');

    expect(upsertSpy).not.toHaveBeenCalled();
    expect(updateSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith('[user-tokens] rejected test token write for google user user-1');

    warnSpy.mockRestore();
  });

  it('persists non-test tokens normally', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { saveUserToken } = await import('../user-tokens');

    await saveUserToken('user-1', 'google', {
      access_token: 'ya29.real_access_token',
      refresh_token: '1//real_refresh_token',
      expires_at: Date.now() + 60_000,
      email: 'user@example.com',
    });

    expect(upsertSpy).toHaveBeenCalledTimes(1);
    expect(upsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'google',
        refresh_token: 'enc:1//real_refresh_token',
        access_token: 'enc:ya29.real_access_token',
        disconnected_at: null,
        oauth_reauth_required_at: null,
        email: 'user@example.com',
      }),
      { onConflict: 'user_id,provider', ignoreDuplicates: false },
    );

    logSpy.mockRestore();
  });

  it('clears disconnected_at when writing with upsert', async () => {
    const { saveUserToken } = await import('../user-tokens');

    await saveUserToken('user-1', 'microsoft', {
      access_token: 'valid_access_token',
      refresh_token: 'valid_refresh_token',
      expires_at: Date.now() + 60_000,
    });

    expect(upsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        access_token: 'enc:valid_access_token',
        refresh_token: 'enc:valid_refresh_token',
        disconnected_at: null,
        oauth_reauth_required_at: null,
      }),
      { onConflict: 'user_id,provider', ignoreDuplicates: false },
    );
  });

  it('preserves email and scopes when omitted (token refresh paths must not null them)', async () => {
    maybeSingleSpy.mockResolvedValueOnce({
      data: { email: 'keep@example.com', scopes: 'scope1 scope2' },
      error: null,
    });

    const { saveUserToken } = await import('../user-tokens');

    await saveUserToken('user-1', 'google', {
      access_token: 'new_access',
      refresh_token: 'new_refresh',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    });

    expect(maybeSingleSpy).toHaveBeenCalled();
    expect(upsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'keep@example.com',
        scopes: 'scope1 scope2',
      }),
      { onConflict: 'user_id,provider', ignoreDuplicates: false },
    );
  });

  it('allows explicit null email to clear stored email', async () => {
    const { saveUserToken } = await import('../user-tokens');

    await saveUserToken('user-1', 'google', {
      access_token: 'a',
      refresh_token: 'r',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      email: null,
    });

    expect(upsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ email: null }),
      { onConflict: 'user_id,provider', ignoreDuplicates: false },
    );
  });
});

describe('softDisconnectUserToken', () => {
  beforeEach(() => {
    vi.resetModules();
    updateEqSpy.mockReset();
    updateSpy.mockReset();
    selectEqSpy.mockReset();
    selectNotSpy.mockReset();
    selectIsSpy.mockReset();
    updateEqSpy.mockResolvedValue({ error: null });
    selectEqSpy.mockReturnValue(selectChain);
    selectNotSpy.mockReturnValue(selectChain);
    selectIsSpy.mockResolvedValue({ data: [], error: null });
    updateSpy.mockReturnValue({
      eq() {
        return {
          eq: updateEqSpy,
        };
      },
    });
  });

  it('nulls tokens and sets disconnected_at without deleting the row', async () => {
    const { softDisconnectUserToken } = await import('../user-tokens');

    await softDisconnectUserToken('user-1', 'microsoft');

    expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({
      access_token: null,
      refresh_token: null,
      disconnected_at: expect.any(String),
      oauth_reauth_required_at: null,
    }));
  });

  it('sets oauth_reauth_required_at when oauthReauthRequired is true', async () => {
    const { softDisconnectUserToken } = await import('../user-tokens');

    await softDisconnectUserToken('user-1', 'google', { oauthReauthRequired: true });

    expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({
      oauth_reauth_required_at: expect.any(String),
    }));
  });
});

describe('softDisconnectAfterFatalOAuthRefresh', () => {
  beforeEach(() => {
    vi.resetModules();
    updateEqSpy.mockReset();
    updateSpy.mockReset();
    selectEqSpy.mockReset();
    selectNotSpy.mockReset();
    selectIsSpy.mockReset();
    updateEqSpy.mockResolvedValue({ error: null });
    selectEqSpy.mockReturnValue(selectChain);
    selectNotSpy.mockReturnValue(selectChain);
    selectIsSpy.mockResolvedValue({ data: [], error: null });
    updateSpy.mockReturnValue({
      eq() {
        return {
          eq: updateEqSpy,
        };
      },
    });
  });

  it('soft-disconnects with oauth re-auth flag set', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { softDisconnectAfterFatalOAuthRefresh } = await import('../user-tokens');

    await softDisconnectAfterFatalOAuthRefresh('user-1', 'microsoft', {
      source: 'unit_test',
      error_code: 'invalid_grant',
    });

    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        access_token: null,
        refresh_token: null,
        oauth_reauth_required_at: expect.any(String),
      }),
    );
    errSpy.mockRestore();
  });
});

describe('getAllUsersWithProvider', () => {
  beforeEach(() => {
    vi.resetModules();
    selectEqSpy.mockReset();
    selectNotSpy.mockReset();
    selectIsSpy.mockReset();
    selectEqSpy.mockReturnValue(selectChain);
    selectNotSpy.mockReturnValue(selectChain);
    selectIsSpy.mockResolvedValue({
      data: [{ user_id: 'user-1' }, { user_id: 'user-2' }],
      error: null,
    });
  });

  it('lists only refresh-capable connected provider rows for background sync', async () => {
    const { getAllUsersWithProvider } = await import('../user-tokens');

    await expect(getAllUsersWithProvider('microsoft')).resolves.toEqual(['user-1', 'user-2']);

    expect(selectEqSpy).toHaveBeenCalledWith('provider', 'microsoft');
    expect(selectNotSpy).toHaveBeenNthCalledWith(1, 'access_token', 'is', null);
    expect(selectNotSpy).toHaveBeenNthCalledWith(2, 'refresh_token', 'is', null);
    expect(selectIsSpy).toHaveBeenCalledWith('disconnected_at', null);
  });
});

describe('findCrossUserTokenConflict', () => {
  beforeEach(() => {
    vi.resetModules();
    selectEqSpy.mockReset();
    selectIsSpy.mockReset();
    selectEqSpy.mockReturnValue(selectChain);
    selectIsSpy.mockResolvedValue({ data: [], error: null });
  });

  it('returns null without querying when the email is empty', async () => {
    const { findCrossUserTokenConflict } = await import('../user-tokens');
    await expect(findCrossUserTokenConflict('google', '', 'user-1')).resolves.toBeNull();
    await expect(findCrossUserTokenConflict('google', null, 'user-1')).resolves.toBeNull();
    expect(selectEqSpy).not.toHaveBeenCalled();
  });

  it('returns the other user_id when the same email is active under a different user (case-insensitive)', async () => {
    selectIsSpy.mockResolvedValueOnce({
      data: [{ user_id: 'other-user', email: 'Shared@Example.com' }],
      error: null,
    });
    const { findCrossUserTokenConflict } = await import('../user-tokens');
    await expect(
      findCrossUserTokenConflict('google', 'shared@example.com', 'user-1'),
    ).resolves.toBe('other-user');
    expect(selectEqSpy).toHaveBeenCalledWith('provider', 'google');
    expect(selectIsSpy).toHaveBeenCalledWith('disconnected_at', null);
  });

  it('returns null when only the same user has the email linked (self-reconnect is allowed)', async () => {
    selectIsSpy.mockResolvedValueOnce({
      data: [{ user_id: 'user-1', email: 'shared@example.com' }],
      error: null,
    });
    const { findCrossUserTokenConflict } = await import('../user-tokens');
    await expect(
      findCrossUserTokenConflict('google', 'shared@example.com', 'user-1'),
    ).resolves.toBeNull();
  });

  it('fails open (returns null) on a query error so a DB blip never blocks linking', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    selectIsSpy.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    const { findCrossUserTokenConflict } = await import('../user-tokens');
    await expect(
      findCrossUserTokenConflict('microsoft', 'a@b.com', 'user-1'),
    ).resolves.toBeNull();
    warnSpy.mockRestore();
  });
});
