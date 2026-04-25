import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const mockResolveUser = vi.fn();
const mockFrom = vi.fn();
const mockApiError = vi.fn();

vi.mock('@/lib/auth/resolve-user', () => ({ resolveUser: mockResolveUser }));
vi.mock('@/lib/db/client', () => ({
  createServerClient: () => ({ from: mockFrom }),
}));
vi.mock('@/lib/utils/api-error', () => ({
  apiError: mockApiError,
  apiErrorForRoute: mockApiError,
}));

describe('GET /api/conviction/history', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockApiError.mockImplementation((err: unknown) =>
      NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 }),
    );
  });

  it('returns 401 when unauthenticated', async () => {
    mockResolveUser.mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    const { GET } = await import('../route');
    const res = await GET(new Request('http://localhost/api/conviction/history'));
    expect(res.status).toBe(401);
  });

  it('returns summary items for authenticated user', async () => {
    mockResolveUser.mockResolvedValue({ userId: 'u1' });
    const mockLimit = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'a1',
          status: 'executed',
          action_type: 'send_message',
          confidence: 77,
          generated_at: '2026-04-01T12:00:00Z',
          directive_text: 'Reach out to Sam about the proposal deadline tomorrow.',
          artifact: {
            type: 'email',
            body: 'Hi Sam, can you confirm the proposal timeline today?',
          },
          execution_result: null,
        },
      ],
      error: null,
    });
    const mockOrder = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockEq = vi.fn().mockReturnValue({ order: mockOrder });
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: mockEq,
      }),
    });

    const { GET } = await import('../route');
    const res = await GET(new Request('http://localhost/api/conviction/history'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: Array<{
        id: string;
        directive_preview: string;
        status: string;
        has_artifact?: boolean;
        artifact_preview?: string;
      }>;
    };
    expect(body.items).toHaveLength(1);
    expect(body.items[0].id).toBe('a1');
    expect(body.items[0].status).toBe('executed');
    expect(body.items[0].directive_preview).toContain('Sam');
    expect(body.items[0].has_artifact).toBe(true);
    expect(body.items[0].artifact_preview).toContain('Hi Sam');
    expect(mockEq).toHaveBeenCalledWith('user_id', 'u1');
  });
});
