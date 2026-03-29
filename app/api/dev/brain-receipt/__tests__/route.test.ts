import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const mockResolveUser = vi.fn();
const mockRunDailyGenerate = vi.fn();
const mockIsSendWorthy = vi.fn();
const mockApiError = vi.fn();

const mockSupabase = {
  from: vi.fn(),
};

vi.mock('@/lib/auth/resolve-user', () => ({
  resolveUser: mockResolveUser,
}));

vi.mock('@/lib/cron/daily-brief-generate', () => ({
  runDailyGenerate: mockRunDailyGenerate,
  isSendWorthy: mockIsSendWorthy,
}));

vi.mock('@/lib/db/client', () => ({
  createServerClient: () => mockSupabase,
}));

vi.mock('@/lib/utils/api-error', () => ({
  apiError: mockApiError,
}));

describe('POST /api/dev/brain-receipt', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockApiError.mockImplementation((error: unknown) =>
      NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 }));
  });

  it('rejects authenticated non-owner users', async () => {
    mockResolveUser.mockResolvedValue({ userId: '11111111-1111-1111-1111-111111111111' });
    const { POST } = await import('../route');

    const response = await POST(new Request('http://localhost:3000/api/dev/brain-receipt', { method: 'POST' }));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Forbidden' });
  });

  it('returns conflict if fresh run still reports stale pending reuse', async () => {
    mockResolveUser.mockResolvedValue({ userId: 'e40b7cd8-4925-42f7-bc99-5022969f1d22' });
    mockRunDailyGenerate.mockResolvedValue({
      results: [{
        userId: 'e40b7cd8-4925-42f7-bc99-5022969f1d22',
        code: 'pending_approval_reused',
        success: true,
        meta: { action_id: '2e3a92ac-f93e-42b4-a978-bedd3dcee4d6' },
      }],
    });
    const { POST } = await import('../route');

    const response = await POST(new Request('http://localhost:3000/api/dev/brain-receipt', { method: 'POST' }));
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.blocker).toBe('stale_pending_action_reuse_not_blocked');
  });
});
