import { beforeEach, describe, expect, it, vi } from 'vitest';

const getUserToken = vi.fn();
const updateSyncTimestamp = vi.fn();
const saveUserToken = vi.fn();

vi.mock('@/lib/auth/user-tokens', () => ({
  getUserToken,
  updateSyncTimestamp,
  saveUserToken,
}));

vi.mock('@/lib/db/client', () => ({
  createServerClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          })),
        })),
      })),
    })),
  })),
}));

vi.mock('@/lib/encryption', () => ({
  encrypt: vi.fn((value: string) => value),
}));

describe('syncMicrosoft', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it(
    'returns no_token without running sync work when token lookup resolves as disconnected',
    async () => {
      getUserToken.mockResolvedValue(null);
      const { syncMicrosoft } = await import('../microsoft-sync');

      const result = await syncMicrosoft('user-1');

      expect(result).toEqual({
        mail_signals: 0,
        calendar_signals: 0,
        file_signals: 0,
        task_signals: 0,
        mail_total_signals: 0,
        calendar_total_signals: 0,
        file_total_signals: 0,
        task_total_signals: 0,
        is_first_sync: false,
        error: 'no_token',
      });
      expect(updateSyncTimestamp).not.toHaveBeenCalled();
      expect(saveUserToken).not.toHaveBeenCalled();
    },
    30_000,
  );

  it('formats mailbox body evidence beyond the old preview cap', async () => {
    const longBody = `Opening context. ${'A'.repeat(4500)} deadline evidence near the end.`;
    const { formatMicrosoftMailContent } = await import('../microsoft-sync');

    const content = formatMicrosoftMailContent(
      {
        id: 'message-1',
        from: { emailAddress: { address: 'sender@example.com' } },
        toRecipients: [{ emailAddress: { address: 'user@example.com' } }],
        subject: 'Account transition',
        receivedDateTime: '2026-05-08T12:00:00.000Z',
        body: { content: longBody },
      },
      'email_received',
    );

    expect(content).toContain('Body text:');
    expect(content).toContain('deadline evidence near the end');
    expect(content).not.toContain('Body preview:');
  });
});
