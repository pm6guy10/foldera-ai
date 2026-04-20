import { beforeEach, describe, expect, it, vi } from 'vitest';

const from = vi.fn();
const getAllUsersWithProvider = vi.fn();
const getGoogleTokensWithRefreshOutcome = vi.fn();
const getMicrosoftTokensWithRefreshOutcome = vi.fn();

let googleRows: Array<{ user_id: string }> = [];
let microsoftRows: Array<{ user_id: string }> = [];

vi.mock('@/lib/db/client', () => ({
  createServerClient: () => ({
    from,
  }),
}));

vi.mock('@/lib/auth/user-tokens', () => ({
  getAllUsersWithProvider,
}));

vi.mock('@/lib/auth/token-store', () => ({
  getGoogleTokensWithRefreshOutcome,
  getMicrosoftTokensWithRefreshOutcome,
}));

describe('runTokenWatchdog', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    googleRows = [{ user_id: 'google-user-1' }];
    microsoftRows = [{ user_id: 'ms-user-1' }];
    getAllUsersWithProvider.mockResolvedValue([]);
    from.mockImplementation((table: string) => {
      if (table !== 'user_tokens') {
        throw new Error(`Unexpected table ${table}`);
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockImplementation((_field: string, provider: string) => {
            return {
              or: vi.fn().mockResolvedValue({
                data: provider === 'google' ? googleRows : microsoftRows,
                error: null,
              }),
            };
          }),
        }),
      };
    });
  });

  it('does not send the reconnect email for retryable Google refresh failures', async () => {
    getGoogleTokensWithRefreshOutcome.mockResolvedValue({
      status: 'retryable_failure',
      error_code: 'EAI_AGAIN',
      error_description: 'Temporary DNS failure',
      http_status: null,
    });
    getMicrosoftTokensWithRefreshOutcome.mockResolvedValue({
      status: 'ok',
      tokens: { access_token: 'ms-access', refresh_token: 'ms-refresh', expires_at: 1 },
      refreshed: false,
    });

    const { runTokenWatchdog } = await import('../self-heal');
    const result = await runTokenWatchdog();

    expect(result.ok).toBe(false);
    expect(result.details.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId: 'google-user-1',
          provider: 'google',
          status: 'retryable_failure',
        }),
      ]),
    );
    expect(getGoogleTokensWithRefreshOutcome).toHaveBeenCalledWith('google-user-1');
  });

  it('surfaces fatal Google reauth rows instead of treating them as healthy', async () => {
    getGoogleTokensWithRefreshOutcome.mockResolvedValue({
      status: 'fatal_reauth_required',
      error_code: 'reauth_required',
      error_description: 'Google requires an interactive reconnect for this token.',
      http_status: null,
      reauth_required_at: '2026-04-20T12:00:00.000Z',
    });
    getMicrosoftTokensWithRefreshOutcome.mockResolvedValue({
      status: 'ok',
      tokens: { access_token: 'ms-access', refresh_token: 'ms-refresh', expires_at: 1 },
      refreshed: false,
    });

    const { runTokenWatchdog } = await import('../self-heal');
    const result = await runTokenWatchdog();

    expect(result.ok).toBe(false);
    expect(result.details.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId: 'google-user-1',
          provider: 'google',
          status: 'fatal_reauth_required',
          reauth_required_at: '2026-04-20T12:00:00.000Z',
        }),
      ]),
    );
    expect(getGoogleTokensWithRefreshOutcome).toHaveBeenCalledWith('google-user-1');
  });

  it('does not send the reconnect email for retryable Microsoft refresh failures', async () => {
    getGoogleTokensWithRefreshOutcome.mockResolvedValue({
      status: 'ok',
      tokens: { access_token: 'google-access', refresh_token: 'google-refresh', expiry_date: 1 },
      refreshed: false,
    });
    getMicrosoftTokensWithRefreshOutcome.mockResolvedValue({
      status: 'retryable_failure',
      error_code: 'temporarily_unavailable',
      error_description: 'Try again later',
      http_status: 503,
    });

    const { runTokenWatchdog } = await import('../self-heal');
    const result = await runTokenWatchdog();

    expect(result.ok).toBe(false);
    expect(result.details.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId: 'ms-user-1',
          provider: 'microsoft',
          status: 'retryable_failure',
        }),
      ]),
    );
    expect(getMicrosoftTokensWithRefreshOutcome).toHaveBeenCalledWith('ms-user-1');
  });

  it('surfaces fatal Microsoft reauth rows instead of treating them as healthy', async () => {
    getGoogleTokensWithRefreshOutcome.mockResolvedValue({
      status: 'ok',
      tokens: { access_token: 'google-access', refresh_token: 'google-refresh', expiry_date: 1 },
      refreshed: false,
    });
    getMicrosoftTokensWithRefreshOutcome.mockResolvedValue({
      status: 'fatal_reauth_required',
      error_code: 'reauth_required',
      error_description: 'Microsoft requires an interactive reconnect for this token.',
      http_status: null,
      reauth_required_at: '2026-04-20T12:00:00.000Z',
    });

    const { runTokenWatchdog } = await import('../self-heal');
    const result = await runTokenWatchdog();

    expect(result.ok).toBe(false);
    expect(result.details.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId: 'ms-user-1',
          provider: 'microsoft',
          status: 'fatal_reauth_required',
          reauth_required_at: '2026-04-20T12:00:00.000Z',
        }),
      ]),
    );
    expect(getMicrosoftTokensWithRefreshOutcome).toHaveBeenCalledWith('ms-user-1');
  });
});
