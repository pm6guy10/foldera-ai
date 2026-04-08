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
    }),
  };
}

function signalSourceCountsChain() {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
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
    let signalsPass = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === 'user_tokens') return userTokensChain();
      if (table === 'tkg_signals') {
        signalsPass += 1;
        if (signalsPass === 1) return signalSourceCountsChain();
        return newest;
      }
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
    };
    expect(body.newest_mail_signal_at).toBe('2026-04-06T15:00:00.000Z');
    expect(body.mail_ingest_looks_stale).toBe(false);
    expect(newest._eqUser).toHaveBeenCalledWith('user_id', 'user-1');
    expect(newest._eqUser).toHaveBeenCalledTimes(1);
  });

  it('sets mail_ingest_looks_stale when newest ingested mail is older than 7d', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'user-1' } });
    let signalsPass = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === 'user_tokens') return userTokensChain();
      if (table === 'tkg_signals') {
        signalsPass += 1;
        if (signalsPass === 1) return signalSourceCountsChain();
        return newestMailChain('2026-03-20T12:00:00.000Z');
      }
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
