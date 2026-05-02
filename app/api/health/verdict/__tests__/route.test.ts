import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mockResolveUser = vi.fn();
const mockApiErrorForRoute = vi.fn((error: unknown) =>
  NextResponse.json({ error: 'Internal server error' }, { status: 500 }),
);
const mockSingle = vi.fn();
const mockFrom = vi.fn();

vi.mock('@/lib/auth/resolve-user', () => ({
  resolveUser: mockResolveUser,
}));

vi.mock('@/lib/db/client', () => ({
  createServerClient: () => ({
    from: mockFrom,
  }),
}));

vi.mock('@/lib/utils/api-error', () => ({
  apiErrorForRoute: mockApiErrorForRoute,
}));

function request() {
  return new NextRequest(new URL('http://localhost/api/health/verdict'));
}

describe('GET /api/health/verdict', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              single: mockSingle,
            }),
          }),
        }),
      }),
    });
  });

  it('returns 401 when resolveUser rejects the session', async () => {
    mockResolveUser.mockResolvedValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    );
    const { GET } = await import('../route');
    const response = await GET(request());
    expect(response.status).toBe(401);
  });

  it('returns verdict null when no system_health row exists', async () => {
    mockResolveUser.mockResolvedValue({ userId: '11111111-1111-1111-1111-111111111111' });
    mockSingle.mockResolvedValue({
      data: null,
      error: { code: 'PGRST116', message: 'No rows found' },
    });
    const { GET } = await import('../route');
    const response = await GET(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ verdict: null });
    expect(mockApiErrorForRoute).not.toHaveBeenCalled();
  });

  it('sanitizes database errors through apiErrorForRoute', async () => {
    const dbError = { code: 'XX000', message: 'database exploded' };
    mockResolveUser.mockResolvedValue({ userId: '11111111-1111-1111-1111-111111111111' });
    mockSingle.mockResolvedValue({
      data: null,
      error: dbError,
    });
    const { GET } = await import('../route');
    const response = await GET(request());

    expect(mockApiErrorForRoute).toHaveBeenCalledWith(dbError, 'health/verdict');
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'Internal server error' });
  });

  it('returns the latest verdict row on success', async () => {
    const verdict = {
      id: 'health-row-1',
      winner_status: 'pending_approval',
      failure_class: null,
    };
    mockResolveUser.mockResolvedValue({ userId: '11111111-1111-1111-1111-111111111111' });
    mockSingle.mockResolvedValue({
      data: verdict,
      error: null,
    });
    const { GET } = await import('../route');
    const response = await GET(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ verdict });
  });
});
