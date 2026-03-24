import { beforeEach, describe, expect, it, vi } from 'vitest';

const maybeSingleSpy = vi.fn();
const updateEqSpy = vi.fn();
const updateSpy = vi.fn();
const insertSpy = vi.fn();

vi.mock('@/lib/db/client', () => ({
  createServerClient: () => ({
    from(table: string) {
      if (table !== 'user_tokens') {
        throw new Error(`Unexpected table ${table}`);
      }

      return {
        select() {
          return {
            eq() {
              return {
                eq() {
                  return {
                    maybeSingle: maybeSingleSpy,
                  };
                },
              };
            },
          };
        },
        update: updateSpy,
        insert: insertSpy,
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
    maybeSingleSpy.mockReset();
    updateEqSpy.mockReset();
    updateSpy.mockReset();
    insertSpy.mockReset();

    maybeSingleSpy.mockResolvedValue({ data: null, error: null });
    updateEqSpy.mockResolvedValue({ error: null });
    updateSpy.mockReturnValue({
      eq() {
        return {
          eq: updateEqSpy,
        };
      },
    });
    insertSpy.mockResolvedValue({ error: null });
  });

  it('rejects test-prefixed tokens before any database write', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { saveUserToken } = await import('../user-tokens');

    await expect(saveUserToken('user-1', 'google', {
      access_token: 'test_access_token_gate2',
      refresh_token: 'test_refresh_token_gate2',
      expires_at: Date.now() + 60_000,
    })).rejects.toThrow('Refusing to persist test token value');

    expect(maybeSingleSpy).not.toHaveBeenCalled();
    expect(updateSpy).not.toHaveBeenCalled();
    expect(insertSpy).not.toHaveBeenCalled();
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

    expect(maybeSingleSpy).toHaveBeenCalledTimes(1);
    expect(insertSpy).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'google',
      refresh_token: 'enc:1//real_refresh_token',
      access_token: 'enc:ya29.real_access_token',
      email: 'user@example.com',
    }));

    logSpy.mockRestore();
  });
});
