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
  apiErrorForRoute: mockApiError,
}));

describe('GET /api/conviction/actions/[id]', () => {
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
    const res = await GET(new Request('http://localhost/api/conviction/actions/action-1'), {
      params: Promise.resolve({ id: 'action-1' }),
    });
    expect(res.status).toBe(401);
  });

  it('returns full action detail for the authenticated user by id', async () => {
    mockResolveUser.mockResolvedValue({ userId: 'u1' });
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: 'action-1',
        status: 'pending_approval',
        action_type: 'write_document',
        confidence: 88,
        generated_at: '2026-05-09T12:00:00.000Z',
        directive_text: 'Finalize the packet owner memo.',
        reason: 'The packet is due today, but the owner is still missing.',
        evidence: [{ description: 'Drive packet owner field is blank.' }],
        approved_at: null,
        executed_at: null,
        artifact: {
          type: 'document',
          title: 'Packet owner memo',
          content: 'Assign Holly as owner before 4 PM PT.',
        },
        execution_result: {
          discrepancy_card: {
            claim: 'Finalize the packet owner memo.',
            contradiction: 'The packet is due today, but the owner is still missing.',
            risk: 'The same-day handoff slips without an owner.',
            evidence: ['Drive packet owner field is blank.'],
            next_action: 'Assign Holly as owner before 4 PM PT.',
            why_now: 'The same-day handoff closes today.',
            source_refs: ['drive:packet-owner'],
            confidence: 0.88,
            pattern_keys: ['discrepancy:admin_deadline', 'action:write_document'],
          },
        },
      },
      error: null,
    });
    const eqUser = vi.fn().mockReturnValue({ maybeSingle });
    const eqId = vi.fn().mockReturnValue({ eq: eqUser });
    const select = vi.fn().mockReturnValue({ eq: eqId });
    mockFrom.mockReturnValue({ select });

    const { GET } = await import('../route');
    const res = await GET(new Request('http://localhost/api/conviction/actions/action-1'), {
      params: Promise.resolve({ id: 'action-1' }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.id).toBe('action-1');
    expect(body.artifact).toEqual(
      expect.objectContaining({
        type: 'document',
        title: 'Packet owner memo',
      }),
    );
    expect(body.executionResult).toEqual(
      expect.objectContaining({
        discrepancy_card: expect.objectContaining({
          claim: 'Finalize the packet owner memo.',
        }),
      }),
    );
    expect(select).toHaveBeenCalledWith(
      'id, action_type, directive_text, reason, confidence, evidence, status, generated_at, approved_at, executed_at, execution_result, artifact',
    );
    expect(eqId).toHaveBeenCalledWith('id', 'action-1');
    expect(eqUser).toHaveBeenCalledWith('user_id', 'u1');
  });
});
