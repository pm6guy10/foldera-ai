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

function requirementsAction(overrides: Record<string, unknown> = {}) {
  return {
    id: 'action-1',
    user_id: 'u1',
    status: 'pending_approval',
    action_type: 'write_document',
    directive_text:
      'Write a decision memo that closes "Submit high-quality .docx documents for document collection" with the owner, next action, and deadline.',
    artifact: {
      type: 'document',
      title: 'Requirements needed: Submit high-quality .docx documents for document collection',
      content: [
        'REQUIREMENTS-NEEDED PACKET',
        'To finish this, provide: owned .docx/source files, document topics/titles, and submission URL.',
        'MISSING BEFORE FINISHED .DOCX WORK',
        '- Owned candidate .docx files or source document bodies.',
      ].join('\n'),
    },
    execution_result: {
      brief_origin: 'selected_move_generate',
      artifact: {
        type: 'document',
        title: 'Requirements needed: Submit high-quality .docx documents for document collection',
        content: 'REQUIREMENTS-NEEDED PACKET',
      },
    },
    ...overrides,
  };
}

function mockActionSelect(action: Record<string, unknown> | null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: action, error: null });
  const eqUser = vi.fn().mockReturnValue({ maybeSingle });
  const eqId = vi.fn().mockReturnValue({ eq: eqUser });
  const select = vi.fn().mockReturnValue({ eq: eqId });
  return { select, eqId, eqUser, maybeSingle };
}

function mockActionUpdate() {
  const eqUser = vi.fn().mockResolvedValue({ error: null });
  const eqId = vi.fn().mockReturnValue({ eq: eqUser });
  const update = vi.fn().mockReturnValue({ eq: eqId });
  return { update, eqId, eqUser };
}

describe('POST /api/conviction/actions/[id]/document-collection-intake', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockApiError.mockImplementation((err: unknown) =>
      NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 }),
    );
  });

  it('captures submission link and owned document notes on the current requirements packet without changing status', async () => {
    mockResolveUser.mockResolvedValue({ userId: 'u1' });
    const selectChain = mockActionSelect(requirementsAction());
    const updateChain = mockActionUpdate();
    mockFrom
      .mockReturnValueOnce({ select: selectChain.select })
      .mockReturnValueOnce({ update: updateChain.update });

    const { POST } = await import('../route');
    const res = await POST(
      new Request('http://localhost/api/conviction/actions/action-1/document-collection-intake', {
        method: 'POST',
        body: JSON.stringify({
          submission_url: 'https://forms.gle/submission',
          candidate_documents:
            '1. Benefits appeal outline - owned source body pasted below.\n2. Resume review checklist - owned .docx available.',
        }),
      }),
      { params: Promise.resolve({ id: 'action-1' }) },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(
      expect.objectContaining({
        ok: true,
        action_id: 'action-1',
        intake_status: 'inputs_provided',
      }),
    );
    expect(updateChain.update).toHaveBeenCalledWith({
      execution_result: expect.objectContaining({
        brief_origin: 'selected_move_generate',
        document_collection_intake: expect.objectContaining({
          status: 'inputs_provided',
          submission_url: 'https://forms.gle/submission',
          candidate_documents:
            '1. Benefits appeal outline - owned source body pasted below.\n2. Resume review checklist - owned .docx available.',
          next_action: 'Produce the finished submission packet from the captured owned inputs.',
        }),
      }),
    });
    expect(updateChain.update.mock.calls[0][0]).not.toHaveProperty('status');
    expect(selectChain.eqId).toHaveBeenCalledWith('id', 'action-1');
    expect(selectChain.eqUser).toHaveBeenCalledWith('user_id', 'u1');
    expect(updateChain.eqId).toHaveBeenCalledWith('id', 'action-1');
    expect(updateChain.eqUser).toHaveBeenCalledWith('user_id', 'u1');
  });

  it('rejects non-requirements actions so the intake path cannot become general file management', async () => {
    mockResolveUser.mockResolvedValue({ userId: 'u1' });
    const selectChain = mockActionSelect(
      requirementsAction({
        artifact: {
          type: 'document',
          title: 'Regular packet',
          content: 'EXECUTION BRIEF\nFINAL RECOMMENDATION: close the normal deadline.',
        },
        execution_result: {},
      }),
    );
    mockFrom.mockReturnValueOnce({ select: selectChain.select });

    const { POST } = await import('../route');
    const res = await POST(
      new Request('http://localhost/api/conviction/actions/action-1/document-collection-intake', {
        method: 'POST',
        body: JSON.stringify({
          submission_url: 'https://forms.gle/submission',
          candidate_documents: 'Owned document list.',
        }),
      }),
      { params: Promise.resolve({ id: 'action-1' }) },
    );

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: 'Document collection requirements packet required',
    });
  });
});
