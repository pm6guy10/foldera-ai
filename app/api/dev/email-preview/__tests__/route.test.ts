import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const mockResolveUser = vi.fn();

const mockSupabase = {
  from: vi.fn(),
};

vi.mock('@/lib/auth/resolve-user', () => ({
  resolveUser: mockResolveUser,
  isValidUuid: (value: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value),
}));

vi.mock('@/lib/db/client', () => ({
  createServerClient: () => mockSupabase,
}));

describe('GET /api/dev/email-preview', () => {
  const ownerId = 'e40b7cd8-4925-42f7-bc99-5022969f1d22';
  const actionUuid = 'aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee';

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv('ALLOW_DEV_ROUTES', 'true');
  });

  it('returns 404 when ALLOW_DEV_ROUTES is not true', async () => {
    vi.stubEnv('ALLOW_DEV_ROUTES', undefined);
    const { GET } = await import('../route');
    const req = new Request('http://localhost:3000/api/dev/email-preview');
    const response = await GET(req);
    expect(response.status).toBe(404);
    vi.stubEnv('ALLOW_DEV_ROUTES', 'true');
  });

  it('returns 400 for malformed action_id', async () => {
    const { GET } = await import('../route');
    const req = new Request('http://localhost:3000/api/dev/email-preview?action_id=not-a-uuid');
    const response = await GET(req);
    expect(response.status).toBe(400);
  });

  it('returns 403 for authenticated non-owner when action_id is set', async () => {
    mockResolveUser.mockResolvedValue({ userId: '11111111-1111-1111-1111-111111111111' });
    const { GET } = await import('../route');
    const req = new Request(
      `http://localhost:3000/api/dev/email-preview?action_id=${actionUuid}`,
    );
    const response = await GET(req);
    expect(response.status).toBe(403);
  });

  it('returns 401 when resolveUser rejects session', async () => {
    mockResolveUser.mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    const { GET } = await import('../route');
    const req = new Request(
      `http://localhost:3000/api/dev/email-preview?action_id=${actionUuid}`,
    );
    const response = await GET(req);
    expect(response.status).toBe(401);
  });

  it('returns 404 when action row is missing', async () => {
    mockResolveUser.mockResolvedValue({ userId: ownerId });
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
    });
    const { GET } = await import('../route');
    const req = new Request(
      `http://localhost:3000/api/dev/email-preview?action_id=${actionUuid}`,
    );
    const response = await GET(req);
    expect(response.status).toBe(404);
  });

  it('returns HTML for owner with persisted action', async () => {
    mockResolveUser.mockResolvedValue({ userId: ownerId });
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: actionUuid,
                user_id: ownerId,
                generated_at: '2026-04-02T12:00:00.000Z',
                action_type: 'send_message',
                directive_text: 'Test directive line for preview',
                reason: 'Because. [score=4.0]',
                confidence: 77,
                artifact: null,
                execution_result: {
                  artifact: {
                    type: 'email',
                    subject: 'Hello',
                    body: 'Body text',
                  },
                },
              },
              error: null,
            }),
          }),
        }),
      }),
    });
    const { GET } = await import('../route');
    const req = new Request(
      `http://localhost:3000/api/dev/email-preview?action_id=${actionUuid}`,
    );
    const response = await GET(req);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('Test directive line for preview');
    expect(html).toContain('Body text');
    expect(html).not.toContain('[score=4.0]');
  });
});
