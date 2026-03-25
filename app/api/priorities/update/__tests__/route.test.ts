import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const rpc = vi.fn();

vi.mock('next-auth', () => ({
  getServerSession,
}));

vi.mock('@/lib/auth/auth-options', () => ({
  getAuthOptions: vi.fn(() => ({})),
}));

vi.mock('@/lib/db/client', () => ({
  createServerClient: () => ({
    rpc,
    from: vi.fn(),
  }),
}));

describe('POST /api/priorities/update', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpc.mockResolvedValue({ error: null });
  });

  it('returns 401 when no session user', async () => {
    getServerSession.mockResolvedValue(null);
    const { POST } = await import('../route');

    const response = await POST(new Request('http://localhost/api/priorities/update', {
      method: 'POST',
      body: JSON.stringify({ priorities: [] }),
    }));

    expect(response.status).toBe(401);
  });

  it('atomically replaces current priorities through rpc', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'user-1' } });
    const { POST } = await import('../route');

    const response = await POST(new Request('http://localhost/api/priorities/update', {
      method: 'POST',
      body: JSON.stringify({
        priorities: [
          { text: '  Ship onboarding fixes  ', category: 'career' },
          { text: '   ', category: 'financial' },
        ],
      }),
    }));
    const body = await response.json();

    expect(rpc).toHaveBeenCalledWith('replace_current_priorities', {
      p_user_id: 'user-1',
      p_rows: [
        {
          goal_text: 'Ship onboarding fixes',
          goal_category: 'career',
          priority: 5,
        },
      ],
    });
    expect(response.status).toBe(200);
    expect(body).toEqual({ updated: 1 });
  });

  it('returns 500 when rpc replacement fails', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'user-1' } });
    rpc.mockResolvedValue({ error: new Error('rpc failed') });
    const { POST } = await import('../route');

    const response = await POST(new Request('http://localhost/api/priorities/update', {
      method: 'POST',
      body: JSON.stringify({
        priorities: [{ text: 'Goal', category: 'career' }],
      }),
    }));

    expect(response.status).toBe(500);
  });
});

