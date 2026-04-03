import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const mockResolveUser = vi.fn();
const mockExecuteAction = vi.fn();
const mockApiError = vi.fn();

vi.mock('@/lib/auth/resolve-user', () => ({ resolveUser: mockResolveUser }));
vi.mock('@/lib/conviction/execute-action', () => ({ executeAction: mockExecuteAction }));
vi.mock('@/lib/utils/api-error', () => ({
  apiError: mockApiError,
  apiErrorForRoute: mockApiError,
  validationError: (msg: string) => NextResponse.json({ error: msg }, { status: 400 }),
}));

describe('POST /api/conviction/execute', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockApiError.mockImplementation((err: unknown) =>
      NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 }),
    );
  });

  it('returns 401 when unauthenticated', async () => {
    mockResolveUser.mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    const { POST } = await import('../route');
    const res = await POST(new Request('http://localhost/api/conviction/execute', {
      method: 'POST',
      body: JSON.stringify({ action_id: 'act-1', decision: 'approve' }),
    }));
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid body', async () => {
    mockResolveUser.mockResolvedValue({ userId: 'user-1' });
    const { POST } = await import('../route');
    const res = await POST(new Request('http://localhost/api/conviction/execute', {
      method: 'POST',
      body: JSON.stringify({ decision: 'approve' }), // missing action_id
    }));
    expect(res.status).toBe(400);
  });

  it('allows free-tier users to approve without subscription check', async () => {
    // Bug Class 10: Pro gate removed — any authenticated user can approve
    mockResolveUser.mockResolvedValue({ userId: 'free-user-1' });
    mockExecuteAction.mockResolvedValue({
      status: 'approved',
      action_id: 'act-1',
      result: { sent: true },
    });
    const { POST } = await import('../route');
    const res = await POST(new Request('http://localhost/api/conviction/execute', {
      method: 'POST',
      body: JSON.stringify({ action_id: 'act-1', decision: 'approve' }),
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('approved');
    expect(mockExecuteAction).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'free-user-1',
      actionId: 'act-1',
      decision: 'approve',
    }));
  });

  it('allows free-tier users to skip', async () => {
    mockResolveUser.mockResolvedValue({ userId: 'free-user-2' });
    mockExecuteAction.mockResolvedValue({
      status: 'skipped',
      action_id: 'act-2',
      result: null,
    });
    const { POST } = await import('../route');
    const res = await POST(new Request('http://localhost/api/conviction/execute', {
      method: 'POST',
      body: JSON.stringify({ action_id: 'act-2', decision: 'skip', skip_reason: 'not_relevant' }),
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('skipped');
  });

  it('returns 404 when action not found on skip', async () => {
    mockResolveUser.mockResolvedValue({ userId: 'user-1' });
    mockExecuteAction.mockResolvedValue({
      status: 'skipped',
      action_id: 'act-missing',
      error: 'Action not found',
      result: null,
    });
    const { POST } = await import('../route');
    const res = await POST(new Request('http://localhost/api/conviction/execute', {
      method: 'POST',
      body: JSON.stringify({ action_id: 'act-missing', decision: 'skip' }),
    }));
    expect(res.status).toBe(404);
  });
});
