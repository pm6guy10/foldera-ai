import { beforeEach, describe, expect, it, vi } from 'vitest';

const getUserToken = vi.fn();
const updateSyncTimestamp = vi.fn();
const saveUserToken = vi.fn();
const maybeSingle = vi.fn();
const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

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
            maybeSingle,
          })),
        })),
      })),
    })),
  })),
}));

vi.mock('@/lib/encryption', () => ({
  encrypt: vi.fn((value: string) => value),
}));

vi.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: class {
        setCredentials() {}
        on() {}
      },
    },
  },
}));

describe('syncGoogle', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    maybeSingle.mockResolvedValue({ data: { scopes: null }, error: null });
  });

  it('returns no_token without attempting sync work when the user has no Google token', async () => {
    getUserToken.mockResolvedValue(null);

    const { syncGoogle } = await import('../google-sync');
    const result = await syncGoogle('user-1');

    expect(result).toEqual({
      gmail_signals: 0,
      calendar_signals: 0,
      drive_signals: 0,
      is_first_sync: false,
      error: 'no_token',
    });
    expect(updateSyncTimestamp).not.toHaveBeenCalled();
    expect(saveUserToken).not.toHaveBeenCalled();
  });

  it('logs granted scopes and warns when calendar or drive scopes are missing', async () => {
    getUserToken.mockResolvedValue({
      access_token: 'access',
      refresh_token: 'refresh',
      expires_at: 123,
      email: 'user@example.com',
      last_synced_at: null,
    });
    maybeSingle.mockResolvedValue({
      data: {
        scopes: 'https://www.googleapis.com/auth/gmail.readonly',
      },
      error: null,
    });

    const { syncGoogle } = await import('../google-sync');
    const result = await syncGoogle('user-1');

    expect(result.gmail_signals).toBe(0);
    expect(logSpy).toHaveBeenCalledWith('[google-sync] Granted scopes:', expect.stringContaining('gmail.readonly'));
    expect(warnSpy).toHaveBeenCalledWith('[google-sync] Missing scope: calendar.readonly');
    expect(warnSpy).toHaveBeenCalledWith('[google-sync] Missing scope: drive.readonly');
  });

  it('extracts Gmail plain text beyond the old preview cap', async () => {
    const longBody = `Opening context. ${'G'.repeat(4500)} source detail near the end.`;
    const encoded = Buffer.from(longBody, 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const { extractPlainTextFromGmailPart } = await import('../google-sync');

    const extracted = extractPlainTextFromGmailPart(
      {
        mimeType: 'text/plain',
        body: { data: encoded },
      } as any,
      12_000,
    );

    expect(extracted).toContain('source detail near the end');
    expect(extracted.length).toBeGreaterThan(4_000);
  });
});

describe('buildDriveBackfillQuery', () => {
  it('enumerates non-trashed files with no modifiedTime floor (deep backfill, not incremental-only)', async () => {
    const { buildDriveBackfillQuery } = await import('../google-sync');
    const mimeQueries = ["mimeType = 'application/vnd.google-apps.document'", "mimeType = 'text/plain'"];

    const query = buildDriveBackfillQuery(mimeQueries);

    // The whole point of #514: never reintroduce a modifiedTime window that
    // would skip historical files and stop already-synced accounts deepening.
    expect(query).not.toContain('modifiedTime');
    expect(query).toContain('trashed = false');
    for (const clause of mimeQueries) {
      expect(query).toContain(clause);
    }
  });
});
