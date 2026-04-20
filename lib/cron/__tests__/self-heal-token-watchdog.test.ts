import { beforeEach, describe, expect, it, vi } from 'vitest';

const from = vi.fn();
const getAllUsersWithProvider = vi.fn();
const getGoogleTokens = vi.fn();
const getMicrosoftTokensWithRefreshOutcome = vi.fn();
const emailsSend = vi.fn();

let microsoftRows: Array<{ user_id: string }> = [];

vi.mock('@/lib/db/client', () => ({
  createServerClient: () => ({
    from,
    auth: {
      admin: {
        getUserById: vi.fn().mockResolvedValue({ data: { user: { email: 'member@example.com' } } }),
      },
    },
  }),
}));

vi.mock('@/lib/auth/user-tokens', () => ({
  getAllUsersWithProvider,
}));

vi.mock('@/lib/auth/token-store', () => ({
  getGoogleTokens,
  getMicrosoftTokensWithRefreshOutcome,
}));

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: emailsSend };
  },
}));

describe('runTokenWatchdog', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    microsoftRows = [{ user_id: 'ms-user-1' }];
    getAllUsersWithProvider.mockImplementation((provider: string) =>
      Promise.resolve(provider === 'google' ? [] : []),
    );
    getGoogleTokens.mockResolvedValue(null);
    from.mockImplementation((table: string) => {
      if (table !== 'user_tokens') {
        throw new Error(`Unexpected table ${table}`);
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            or: vi.fn().mockResolvedValue({
              data: microsoftRows,
              error: null,
            }),
          }),
        }),
      };
    });
  });

  it('does not send the reconnect email for retryable Microsoft refresh failures', async () => {
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
    expect(emailsSend).not.toHaveBeenCalled();
  });

  it('surfaces fatal Microsoft reauth rows instead of treating them as healthy', async () => {
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
    expect(emailsSend).not.toHaveBeenCalled();
  });
});
