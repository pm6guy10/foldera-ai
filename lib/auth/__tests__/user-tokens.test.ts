import { beforeEach, describe, expect, it, vi } from 'vitest';

const upsertSpy = vi.fn();
const updateEqSpy = vi.fn();
const updateSpy = vi.fn();

vi.mock('@/lib/db/client', () => ({
  createServerClient: () => ({
    from(table: string) {
      if (table !== 'user_tokens') {
        throw new Error(`Unexpected table ${table}`);
      }

      return {
        upsert: upsertSpy,
        update: updateSpy,
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

    upsertSpy.mockResolvedValue({ error: null });
    updateEqSpy.mockResolvedValue({ error: null });
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
      }),
      { onConflict: 'user_id,provider', ignoreDuplicates: false },
    );
  });
});

describe('softDisconnectUserToken', () => {
  beforeEach(() => {
    vi.resetModules();
    updateEqSpy.mockReset();
    updateSpy.mockReset();
    updateEqSpy.mockResolvedValue({ error: null });
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
    }));
  });
});
