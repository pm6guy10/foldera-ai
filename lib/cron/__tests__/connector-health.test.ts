import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendResendEmail = vi.fn();
const from = vi.fn();

vi.mock('@/lib/db/client', () => ({
  createServerClient: () => ({
    from,
  }),
}));

vi.mock('@/lib/email/resend', () => ({
  renderPlaintextEmailHtml: vi.fn((body: string) => `<p>${body}</p>`),
  sendResendEmail,
}));

describe('checkConnectorHealth', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    sendResendEmail.mockResolvedValue({ data: { id: 'email-1' }, error: null });
    from.mockImplementation((table: string) => {
      if (table === 'user_tokens') {
        return {
          select: () => ({
            eq: (column: string, value: string) => ({
              eq: (providerColumn: string, providerValue: string) => Promise.resolve({ error: null }),
            }),
          }),
          update: () => ({
            eq: () => ({
              eq: () => Promise.resolve({ error: null }),
            }),
          }),
        };
      }

      if (table === 'tkg_signals') {
        return {
          select: () => ({
            eq: () => ({
              gte: () => Promise.resolve({
                data: [{ source: 'gmail' }],
                error: null,
              }),
            }),
          }),
        };
      }

      return {
        select: () => Promise.resolve({ data: [], error: null }),
      };
    });
  });

  it('sends connector health alerts for connected sources with no seven-day signal coverage', async () => {
    from.mockImplementationOnce(() => ({
      select: () => Promise.resolve({
        data: [{
          user_id: 'user-1',
          provider: 'google',
          email: 'member@example.com',
          last_health_alert_at: null,
        }],
        error: null,
      }),
    }));

    const { checkConnectorHealth } = await import('../connector-health');
    const result = await checkConnectorHealth();

    expect(result.ok).toBe(true);
    expect(result.flagged_sources).toBe(2);
    expect(result.alerts_sent).toBe(2);
    expect(sendResendEmail).toHaveBeenCalledTimes(2);
    expect(sendResendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: "Foldera: Google Calendar isn't syncing",
      }),
    );
    expect(sendResendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: "Foldera: Google Drive isn't syncing",
      }),
    );
  });
});
