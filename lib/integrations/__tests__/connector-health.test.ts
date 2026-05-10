import { describe, expect, it } from 'vitest';
import {
  buildConnectorHealthEntries,
  buildConnectorHealthSummary,
  type ConnectorHealthRow,
} from '../connector-health';

const nowMs = new Date('2026-05-10T12:00:00.000Z').getTime();

function row(overrides: Partial<ConnectorHealthRow>): ConnectorHealthRow {
  return {
    provider: 'google',
    email: 'owner@gmail.com',
    last_synced_at: new Date('2026-05-10T11:00:00.000Z').toISOString(),
    scopes: 'openid email profile gmail.readonly gmail.send calendar drive.readonly',
    access_token: 'access',
    refresh_token: 'refresh',
    disconnected_at: null,
    oauth_reauth_required_at: null,
    ...overrides,
  };
}

describe('connector health classification', () => {
  it('classifies fresh, stale, disconnected, reauth_required, and never_synced states', () => {
    const entries = buildConnectorHealthEntries(
      [
        row({ provider: 'google', email: 'fresh@gmail.com' }),
        row({
          provider: 'microsoft',
          email: 'stale@outlook.com',
          last_synced_at: new Date('2026-05-08T18:00:00.000Z').toISOString(),
          scopes:
            'openid profile email User.Read Mail.Read Mail.Send Calendars.Read Files.Read Tasks.Read offline_access',
        }),
        row({
          provider: 'google',
          email: 'reauth@gmail.com',
          last_synced_at: new Date('2026-05-09T12:00:00.000Z').toISOString(),
          scopes: 'openid email profile gmail.readonly',
        }),
        row({
          provider: 'microsoft',
          email: 'never@outlook.com',
          last_synced_at: null,
          scopes:
            'openid profile email User.Read Mail.Read Mail.Send Calendars.Read Files.Read Tasks.Read offline_access',
        }),
        row({
          provider: 'google',
          email: 'off@gmail.com',
          access_token: null,
          refresh_token: null,
          disconnected_at: new Date('2026-05-09T10:00:00.000Z').toISOString(),
          last_synced_at: null,
        }),
      ],
      { nowMs },
    );

    expect(entries.map((entry) => [entry.provider, entry.email, entry.status])).toEqual([
      ['google', 'fresh@gmail.com', 'fresh'],
      ['microsoft', 'stale@outlook.com', 'stale'],
      ['google', 'reauth@gmail.com', 'reauth_required'],
      ['microsoft', 'never@outlook.com', 'never_synced'],
      ['google', 'off@gmail.com', 'disconnected'],
    ]);

    expect(entries.find((entry) => entry.email === 'fresh@gmail.com')?.recommended_action).toContain(
      'No action needed',
    );
    expect(entries.find((entry) => entry.email === 'stale@outlook.com')?.recommended_action).toContain(
      'Refresh Microsoft',
    );
    expect(entries.find((entry) => entry.email === 'reauth@gmail.com')?.recommended_action).toContain(
      'Reconnect Google',
    );
    expect(entries.find((entry) => entry.email === 'never@outlook.com')?.recommended_action).toContain(
      'first Microsoft sync',
    );
    expect(entries.find((entry) => entry.email === 'off@gmail.com')?.recommended_action).toContain(
      'Connect Google',
    );
  });

  it('warns when one connector is stale but another is fresh, and blocks when none are fresh', () => {
    const warnSummary = buildConnectorHealthSummary(
      buildConnectorHealthEntries(
        [
          row({ provider: 'google', email: 'fresh@gmail.com' }),
          row({
            provider: 'microsoft',
            email: 'stale@outlook.com',
            last_synced_at: new Date('2026-05-08T18:00:00.000Z').toISOString(),
            scopes:
              'openid profile email User.Read Mail.Read Mail.Send Calendars.Read Files.Read Tasks.Read offline_access',
          }),
        ],
        { nowMs },
      ),
    );

    expect(warnSummary.generation_gate.level).toBe('warn');
    expect(warnSummary.generation_gate.reason).toContain('still fresh');
    expect(warnSummary.instructions).toEqual([
      expect.objectContaining({
        provider: 'google',
        status: 'fresh',
      }),
      expect.objectContaining({
        provider: 'microsoft',
        status: 'stale',
      }),
    ]);

    const blockSummary = buildConnectorHealthSummary(
      buildConnectorHealthEntries(
        [
          row({
            provider: 'google',
            email: 'stale@gmail.com',
            last_synced_at: new Date('2026-05-08T18:00:00.000Z').toISOString(),
          }),
          row({
            provider: 'microsoft',
            email: 'never@outlook.com',
            last_synced_at: null,
            scopes:
              'openid profile email User.Read Mail.Read Mail.Send Calendars.Read Files.Read Tasks.Read offline_access',
          }),
        ],
        { nowMs },
      ),
    );

    expect(blockSummary.generation_gate.level).toBe('block');
    expect(blockSummary.generation_gate.reason).toContain('No active connector is fresh');
  });
});
