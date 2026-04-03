import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const mockResolveUser = vi.fn();
const mockEncrypt = vi.fn((v: string) => `enc:${v}`);

const mockInsert = vi.fn();
const mockSupabase = {
  from: vi.fn().mockReturnValue({ insert: mockInsert }),
};

vi.mock('@/lib/auth/resolve-user', () => ({
  resolveUser: mockResolveUser,
}));

vi.mock('@/lib/encryption', () => ({
  encrypt: mockEncrypt,
}));

vi.mock('@/lib/db/client', () => ({
  createServerClient: () => mockSupabase,
}));

const OWNER_ID = 'e40b7cd8-4925-42f7-bc99-5022969f1d22';
const OTHER_ID = '11111111-1111-1111-1111-111111111111';

const SAMPLE_SIGNAL = {
  source: 'claude_conversation',
  source_id: 'conv-001',
  type: 'document',
  content: 'Hello world',
  author: 'user',
  occurred_at: new Date().toISOString(),
  content_hash: 'abc123',
};

describe('POST /api/dev/ingest-signals', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockSupabase.from.mockReturnValue({ insert: mockInsert });
  });

  it('returns 401 when unauthenticated', async () => {
    mockResolveUser.mockResolvedValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    );
    const { POST } = await import('../route');
    const res = await POST(
      new Request('http://localhost/api/dev/ingest-signals', {
        method: 'POST',
        body: JSON.stringify({ signals: [] }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-owner authenticated user', async () => {
    mockResolveUser.mockResolvedValue({ userId: OTHER_ID });
    const { POST } = await import('../route');
    const res = await POST(
      new Request('http://localhost/api/dev/ingest-signals', {
        method: 'POST',
        body: JSON.stringify({ signals: [SAMPLE_SIGNAL] }),
      }),
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
  });

  it('returns 200 with inserted count for valid signal array', async () => {
    mockResolveUser.mockResolvedValue({ userId: OWNER_ID });
    mockInsert.mockResolvedValue({ error: null });
    const { POST } = await import('../route');
    const res = await POST(
      new Request('http://localhost/api/dev/ingest-signals', {
        method: 'POST',
        body: JSON.stringify({ signals: [SAMPLE_SIGNAL] }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.inserted).toBe(1);
    expect(body.errors).toBe(0);
  });

  it('counts batch errors when insert fails', async () => {
    mockResolveUser.mockResolvedValue({ userId: OWNER_ID });
    mockInsert.mockResolvedValue({ error: { message: 'DB error' } });
    const { POST } = await import('../route');
    const res = await POST(
      new Request('http://localhost/api/dev/ingest-signals', {
        method: 'POST',
        body: JSON.stringify({ signals: [SAMPLE_SIGNAL, SAMPLE_SIGNAL] }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.inserted).toBe(0);
    expect(body.errors).toBe(2);
  });
});
