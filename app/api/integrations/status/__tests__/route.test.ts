import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const getServerSession = vi.fn();
const mockFrom = vi.fn();
const mockApiError = vi.fn();

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth/auth-options', () => ({
  getAuthOptions: vi.fn(() => ({})),
}));
vi.mock('@/lib/db/client', () => ({
  createServerClient: () => ({ from: mockFrom }),
}));
vi.mock('@/lib/utils/api-error', () => ({
  apiErrorForRoute: mockApiError,
}));

function userTokensChain() {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        or: vi.fn().mockResolvedValue({
          data: [
            {
              provider: 'google',
              email: 'u@gmail.com',
              last_synced_at: '2026-04-07T10:00:00.000Z',
              scopes: 's',
              access_token: 'access',
              expires_at: 9999999999,
              refresh_token: 'refresh',
              disconnected_at: null,
              oauth_reauth_required_at: null,
            },
          ],
          error: null,
        }),
      }),
    }),
  };
}

function newestMailChain(occurredAt: string | null) {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: occurredAt ? { occurred_at: occurredAt } : null,
    error: null,
  });
  const limit = vi.fn().mockReturnValue({ maybeSingle });
  const order = vi.fn().mockReturnValue({ limit });
  const inType = vi.fn().mockReturnValue({ order });
  const inSource = vi.fn().mockReturnValue({ in: inType });
  const eqUser = vi.fn().mockReturnValue({ in: inSource });
  return {
    select: vi.fn().mockReturnValue({ eq: eqUser }),
    _eqUser: eqUser,
    maybeSingle,
  };
}

describe('GET /api/integrations/status', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useRealTimers();
    mockApiError.mockImplementation((err: unknown) =>
      NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 }),
    );
  });

  it('returns 401 when unauthenticated', async () => {
    getServerSession.mockResolvedValue(null);
    const { GET } = await import('../route');
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('uses ingested mail (not processed-only) for newest_mail_signal_at', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'user-1' } });
    const newest = newestMailChain('2026-04-06T15:00:00.000Z');
    mockFrom.mockImplementation((table: string) => {
      if (table === 'user_tokens') return userTokensChain();
      if (table === 'tkg_signals') return newest;
      throw new Error(`unexpected table ${table}`);
    });

    vi.useFakeTimers({ now: new Date('2026-04-07T12:00:00.000Z').getTime() });
    const { GET } = await import('../route');
    const res = await GET();
    vi.useRealTimers();

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      newest_mail_signal_at: string | null;
      mail_ingest_looks_stale: boolean;
      sourceCounts?: unknown;
    };
    expect(body.newest_mail_signal_at).toBe('2026-04-06T15:00:00.000Z');
    expect(body.mail_ingest_looks_stale).toBe(false);
    expect(body.sourceCounts).toBeUndefined();
    expect(newest._eqUser).toHaveBeenCalledWith('user_id', 'user-1');
    expect(newest._eqUser).toHaveBeenCalledTimes(1);
  });

  it('falls back to legacy user_tokens select when oauth_reauth_required_at column is missing (PostgREST error message)', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'user-1' } });
    const missingColErr = new Error(
      'column user_tokens.oauth_reauth_required_at does not exist',
    ) as Error & { code?: string };
    missingColErr.code = '42703';

    const legacySelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        is: vi.fn().mockResolvedValue({
          data: [
            {
              provider: 'google',
              email: 'u@gmail.com',
              last_synced_at: '2026-04-07T10:00:00.000Z',
              scopes: 's',
              access_token: 'access',
              expires_at: 9999999999,
              refresh_token: 'refresh',
            },
          ],
          error: null,
        }),
      }),
    });

    let userTokensCalls = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === 'user_tokens') {
        userTokensCalls += 1;
        if (userTokensCalls === 1) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                or: vi.fn().mockResolvedValue({ data: null, error: missingColErr }),
              }),
            }),
          };
        }
        return { select: legacySelect };
      }
      if (table === 'tkg_signals') return newestMailChain(null);
      throw new Error(`unexpected table ${table}`);
    });

    const { GET } = await import('../route');
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { integrations: Array<{ needs_reauth?: boolean }> };
    expect(body.integrations.length).toBe(1);
    expect(body.integrations[0].needs_reauth).toBe(false);
    expect(legacySelect).toHaveBeenCalledWith(
      'provider, email, last_synced_at, scopes, access_token, expires_at, refresh_token',
    );
  });

  it('falls back on 42703 when details mention oauth_reauth but not full column name', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'user-1' } });
    const missingColErr = new Error('query failed') as Error & { code?: string; details?: string };
    missingColErr.code = '42703';
    // Unlikely real shape, but proves the 42703 + oauth_reauth branch (not /oauth_reauth_required_at/)
    missingColErr.details = 'undefined_column user_tokens oauth_reauth';

    const legacySelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        is: vi.fn().mockResolvedValue({
          data: [
            {
              provider: 'google',
              email: 'u@gmail.com',
              last_synced_at: '2026-04-07T10:00:00.000Z',
              scopes: 's',
              access_token: 'access',
              expires_at: 9999999999,
              refresh_token: 'refresh',
            },
          ],
          error: null,
        }),
      }),
    });

    let userTokensCalls = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === 'user_tokens') {
        userTokensCalls += 1;
        if (userTokensCalls === 1) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                or: vi.fn().mockResolvedValue({ data: null, error: missingColErr }),
              }),
            }),
          };
        }
        return { select: legacySelect };
      }
      if (table === 'tkg_signals') return newestMailChain(null);
      throw new Error(`unexpected table ${table}`);
    });

    const { GET } = await import('../route');
    const res = await GET();
    expect(res.status).toBe(200);
    expect(legacySelect).toHaveBeenCalled();
  });

  it('sets mail_ingest_looks_stale when newest ingested mail is older than 7d', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'user_tokens') return userTokensChain();
      if (table === 'tkg_signals') return newestMailChain('2026-03-20T12:00:00.000Z');
      throw new Error(`unexpected table ${table}`);
    });

    vi.useFakeTimers({ now: new Date('2026-04-07T12:00:00.000Z').getTime() });
    const { GET } = await import('../route');
    const res = await GET();
    vi.useRealTimers();

    const body = (await res.json()) as { mail_ingest_looks_stale: boolean };
    expect(body.mail_ingest_looks_stale).toBe(true);
  });
});
