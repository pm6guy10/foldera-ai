import { describe, expect, it } from 'vitest';
import {
  buildConnectorStatusCheck,
  buildMailboxFreshnessCheck,
  buildMailboxReadinessCheck,
  buildMailCursorCheck,
  type HealthTokenRow,
} from '../health-connectors';

const now = new Date('2026-05-07T20:00:00.000Z').getTime();

function row(overrides: Partial<HealthTokenRow>): HealthTokenRow {
  return {
    provider: 'microsoft',
    last_synced_at: new Date(now - 60 * 60 * 1000).toISOString(),
    disconnected_at: null,
    access_token: 'access',
    refresh_token: 'refresh',
    ...overrides,
  };
}

describe('health connector copy', () => {
  it('does not call missing Microsoft fresh', () => {
    const check = buildMailboxReadinessCheck('Outlook', 'microsoft', []);

    expect(check?.line).toContain('Outlook disconnected');
    expect(check?.line).not.toContain('Outlook fresh');
    expect(check?.line).toContain('reconnect in Sources');
  });

  it('calls disconnected Microsoft reconnect required', () => {
    const check = buildMailboxReadinessCheck('Outlook', 'microsoft', [
      row({
        disconnected_at: '2026-05-07T18:00:00.000Z',
        access_token: null,
        refresh_token: null,
      }),
    ]);

    expect(check?.line).toContain('Outlook reconnect required');
    expect(check?.line).not.toContain('Outlook fresh');
  });

  it('calls missing Microsoft refresh reconnect required', () => {
    const check = buildMailboxReadinessCheck('Outlook', 'microsoft', [
      row({ refresh_token: null }),
    ]);

    expect(check?.line).toContain('Outlook reconnect required');
    expect(check?.line).toContain('missing background refresh');
    expect(check?.line).not.toContain('Outlook fresh');
  });

  it('only calls Outlook fresh when a refresh-capable connector has recent mail', () => {
    const readiness = buildMailboxReadinessCheck('Outlook', 'microsoft', [row({})]);
    const freshness = buildMailboxFreshnessCheck(
      'Outlook',
      new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      now,
    );

    expect(readiness).toBeNull();
    expect(freshness.line).toContain('Outlook fresh');
    expect(freshness.status).toBe('pass');
  });

  it('does not count access-only connector rows as current mail cursors', () => {
    const check = buildMailCursorCheck([row({ refresh_token: null })], now);

    expect(check.line).toContain('Mail cursors unavailable');
    expect(check.line).not.toContain('Mail cursors current');
  });

  it('reports Google stale from connector freshness truth', () => {
    const check = buildConnectorStatusCheck('Gmail', 'google', [
      row({
        provider: 'google',
        email: 'b.kapp1010@gmail.com',
        last_synced_at: new Date(now - 42 * 60 * 60 * 1000).toISOString(),
        scopes: 'openid email profile gmail.readonly gmail.send calendar drive.readonly',
      }),
    ], now);

    expect(check.line).toContain('Gmail stale');
    expect(check.line).toContain('Refresh Google before the next generation');
  });

  it('reports Microsoft fresh from connector freshness truth', () => {
    const check = buildConnectorStatusCheck('Outlook', 'microsoft', [
      row({
        provider: 'microsoft',
        email: 'b-kapp@outlook.com',
        scopes:
          'openid profile email User.Read Mail.Read Mail.Send Calendars.Read Files.Read Tasks.Read offline_access',
      }),
    ], now);

    expect(check.line).toContain('Outlook fresh');
    expect(check.status).toBe('pass');
  });
});
