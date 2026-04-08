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
            is: () => Promise.resolve({ data: [], error: null }),
          }),
          update: () => ({
            eq: () => ({
              eq: () => Promise.resolve({ error: null }),
            }),
          }),
        };
      }
      if (table === 'user_subscriptions') {
        return {
          select: () => ({
            in: () => Promise.resolve({ data: [], error: null }),
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

  it('sends connector health alerts for connected sources with no 14-day secondary signal coverage', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    from.mockImplementation((table: string) => {
      if (table === 'user_tokens') {
        return {
          select: () => ({
            is: () =>
              Promise.resolve({
                data: [
                  {
                    user_id: 'user-1',
                    provider: 'google',
                    email: 'member@example.com',
                    last_health_alert_at: null,
                    expires_at: nowSec + 3600,
                    access_token: 'a',
                    refresh_token: 'r',
                    disconnected_at: null,
                  },
                ],
                error: null,
              }),
          }),
          update: () => ({
            eq: () => ({
              eq: () => Promise.resolve({ error: null }),
            }),
          }),
        };
      }
      if (table === 'user_subscriptions') {
        return {
          select: () => ({
            in: () =>
              Promise.resolve({
                data: [{ user_id: 'user-1', last_dashboard_visit_at: null }],
                error: null,
              }),
          }),
        };
      }
      if (table === 'tkg_signals') {
        return {
          select: () => ({
            eq: () => ({
              gte: () =>
                Promise.resolve({
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

    const { checkConnectorHealth } = await import('../connector-health');
    const result = await checkConnectorHealth();

    expect(result.ok).toBe(true);
    expect(result.oauth_token_diagnostics?.rows.length).toBe(1);
    expect(result.oauth_token_diagnostics?.missing_access_not_disconnected).toBe(0);
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
    const firstBody = sendResendEmail.mock.calls[0]?.[0]?.text ?? '';
    expect(firstBody).toContain('/dashboard/settings?reconnect=google');
  });

  it('skips email when last_dashboard_visit_at is within the skip window', async () => {
    const recent = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const nowSec = Math.floor(Date.now() / 1000);
    from.mockImplementation((table: string) => {
      if (table === 'user_tokens') {
        return {
          select: () => ({
            is: () =>
              Promise.resolve({
                data: [
                  {
                    user_id: 'user-1',
                    provider: 'google',
                    email: 'member@example.com',
                    last_health_alert_at: null,
                    expires_at: nowSec + 3600,
                    access_token: 'a',
                    refresh_token: 'r',
                    disconnected_at: null,
                  },
                ],
                error: null,
              }),
          }),
          update: () => ({
            eq: () => ({
              eq: () => Promise.resolve({ error: null }),
            }),
          }),
        };
      }
      if (table === 'user_subscriptions') {
        return {
          select: () => ({
            in: () =>
              Promise.resolve({
                data: [{ user_id: 'user-1', last_dashboard_visit_at: recent }],
                error: null,
              }),
          }),
        };
      }
      if (table === 'tkg_signals') {
        return {
          select: () => ({
            eq: () => ({
              gte: () =>
                Promise.resolve({
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

    const { checkConnectorHealth } = await import('../connector-health');
    const result = await checkConnectorHealth();

    expect(result.ok).toBe(true);
    expect(result.alerts_sent).toBe(0);
    expect(result.skipped_recent_alerts).toBe(2);
    expect(sendResendEmail).not.toHaveBeenCalled();
  });
});
