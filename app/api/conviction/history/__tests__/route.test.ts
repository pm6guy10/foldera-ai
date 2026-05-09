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

  it('returns summary items with artifact previews for authenticated user', async () => {
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
          artifact_preview:
            'Proposal deadline - Hi Sam — checking whether the proposal is still on track before tomorrow.',
          is_no_send: false,
          no_send_reason: null,
        },
      ],
      error: null,
    });
    const mockOrder = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockEq = vi.fn().mockReturnValue({ order: mockOrder });
    const mockSelect = vi.fn().mockReturnValue({
      eq: mockEq,
    });
    mockFrom.mockReturnValue({
      select: mockSelect,
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
    expect(body.items[0].artifact_preview).toContain('Proposal deadline');
    expect(body.items[0].artifact_preview).toContain('checking whether the proposal');
    expect(mockSelect).toHaveBeenCalledWith(
      'id, status, action_type, confidence, generated_at, directive_text, artifact_preview, is_no_send, no_send_reason',
    );
    expect(mockEq).toHaveBeenCalledWith('user_id', 'u1');
  });

  it('hides no-send tombstones and internal failure rows from Recent Work', async () => {
    mockResolveUser.mockResolvedValue({ userId: 'u1' });
    const mockLimit = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'no-send-1',
          status: 'skipped',
          action_type: 'do_nothing',
          confidence: 0,
          generated_at: '2026-04-02T12:00:00Z',
          directive_text: 'GENERATION_LOOP: All ranked candidates blocked by missing_current_fact',
          artifact_preview: null,
          is_no_send: true,
          no_send_reason: 'missing_current_fact',
        },
        {
          id: 'failed-1',
          status: 'failed',
          action_type: 'write_document',
          confidence: 12,
          generated_at: '2026-04-02T11:00:00Z',
          directive_text: 'Directive rejected by persistence validation: weak_next_action',
          artifact_preview: null,
          is_no_send: false,
          no_send_reason: null,
        },
        {
          id: 'real-1',
          status: 'skipped',
          action_type: 'write_document',
          confidence: 79,
          generated_at: '2026-04-02T10:00:00Z',
          directive_text: 'Save the job seeker account transition packet before the deadline.',
          artifact_preview:
            'Job seeker account transition packet - A concise packet with the deadline, required save action, and source trail.',
          is_no_send: false,
          no_send_reason: null,
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
    const res = await GET(new Request('http://localhost/api/conviction/history?limit=3'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: Array<{
        id: string;
        directive_preview: string;
        artifact_preview?: string;
      }>;
    };

    expect(body.items).toHaveLength(1);
    expect(body.items[0].id).toBe('real-1');
    expect(body.items[0].directive_preview).toContain('job seeker account transition');
    expect(body.items[0].artifact_preview).toContain('deadline');
    expect(JSON.stringify(body.items)).not.toMatch(/GENERATION_LOOP|missing_current_fact|weak_next_action|do_nothing/i);
  });

  it('keeps the history summary query off artifact and execution_result', async () => {
    const source = await import('node:fs/promises').then((fs) =>
      fs.readFile(new URL('../route.ts', import.meta.url), 'utf8'),
    );

    expect(source).toContain("from('tkg_action_summaries')");
    expect(source).not.toContain('artifact, execution_result');
  });
});
