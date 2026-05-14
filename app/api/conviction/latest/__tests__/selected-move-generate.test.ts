import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const mockResolveUser = vi.fn();
const mockCreateServerClient = vi.fn();
const mockApiErrorForRoute = vi.fn();
const mockGetWinnerTruthReport = vi.fn();
const mockGenerateDirective = vi.fn();
const mockProcessUnextractedSignals = vi.fn();

vi.mock('@/lib/auth/resolve-user', () => ({ resolveUser: mockResolveUser }));
vi.mock('@/lib/db/client', () => ({ createServerClient: mockCreateServerClient }));
vi.mock('@/lib/utils/api-error', () => ({ apiErrorForRoute: mockApiErrorForRoute }));
vi.mock('@/lib/system/winner-truth', () => ({ getWinnerTruthReport: mockGetWinnerTruthReport }));
vi.mock('@/lib/signals/signal-processor', () => ({ processUnextractedSignals: mockProcessUnextractedSignals }));
vi.mock('@/lib/briefing/generator', async () => {
  const actual = await vi.importActual<typeof import('@/lib/briefing/generator')>('@/lib/briefing/generator');
  return {
    ...actual,
    generateDirective: mockGenerateDirective,
  };
});

function buildInsertMock() {
  let insertedPayload: Record<string, unknown> | null = null;
  const emptyRead = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue({ data: [], error: null }),
  };
  const single = vi.fn().mockResolvedValue({
    data: {
      id: 'selected-action-1',
      generated_at: '2026-05-13T15:00:00.000Z',
      status: 'pending_approval',
      execution_result: {},
    },
    error: null,
  });
  const select = vi.fn().mockReturnValue({ single });
  const insert = vi.fn().mockImplementation((payload: Record<string, unknown>) => {
    insertedPayload = payload;
    return { select };
  });
  mockCreateServerClient.mockReturnValue({
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'tkg_commitments' || table === 'tkg_signals') return emptyRead;
      if (table !== 'tkg_actions') throw new Error(`Unexpected table: ${table}`);
      return { insert };
    }),
  });
  return { insert, select, single, getInsertedPayload: () => insertedPayload };
}

describe('POST /api/conviction/generate selected winner mode', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockApiErrorForRoute.mockImplementation((error: unknown) =>
      NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 }),
    );
    mockResolveUser.mockResolvedValue({ userId: 'u-test' });
  });

  it('allows enough runtime for winner-truth scoring before the deterministic write', async () => {
    const { maxDuration } = await import('../../generate/route');

    expect(maxDuration).toBeGreaterThanOrEqual(120);
  });

  it('persists the selected WorkSourceWA winner as a real pending artifact without paid generation', async () => {
    const db = buildInsertMock();
    mockGetWinnerTruthReport.mockResolvedValue({
      current_winner: {
        verdict: 'selected',
        discrepancy_card: {
          claim:
            'Deadline closing: Complete at least one account activity (apply for job, create/update resume, save job/search, or register)',
          contradiction:
            'Expected: Active commitment, last updated 19 days ago. Current: 0 day(s) until deadline with no movement.',
          risk:
            'Deadline is TODAY and last movement was 19 days ago — execution gap is now visible to stakeholders.',
          evidence: [
            'Complete at least one account activity (apply for job, create/update resume, save job/search, or register) to ensure account moves to new WorkSourceWA site.',
            'Active commitment, last updated 19 days ago; 0 day(s) until deadline with no movement.',
          ],
          next_action:
            'Write a decision memo that closes "Deadline closing: Complete at least one account activity (apply for job, create/update resume, save job/search, or register)" with the owner, next action, and deadline.',
          why_now:
            'Deadline is TODAY and last movement was 19 days ago — execution gap is now visible to stakeholders.',
          source_refs: ['commitment:2aeae0a5-0ce8-4554-8e81-2234a7f68da1'],
          confidence: 0.86,
        },
      },
    });

    const { POST } = await import('../../generate/route');
    const response = await POST(new Request('http://localhost/api/conviction/generate?source=winner_truth', {
      method: 'POST',
    }));
    const body = await response.json();
    const inserted = db.getInsertedPayload();

    expect(response.status, JSON.stringify(body)).toBe(200);
    expect(mockProcessUnextractedSignals).not.toHaveBeenCalled();
    expect(mockGenerateDirective).not.toHaveBeenCalled();
    expect(mockGetWinnerTruthReport).toHaveBeenCalledWith('u-test');
    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(inserted).toEqual(
      expect.objectContaining({
        user_id: 'u-test',
        action_type: 'write_document',
        status: 'pending_approval',
        artifact: expect.objectContaining({
          type: 'document',
          title: expect.stringContaining('WorkSourceWA'),
          content: expect.stringContaining('complete one account activity now'),
        }),
        execution_result: expect.objectContaining({
          brief_origin: 'selected_move_generate',
          selected_winner_fingerprint: expect.stringContaining('claim:deadline closing: complete at least one account activity'),
          selected_winner_claim: expect.stringContaining('Deadline closing'),
          selected_winner_source_refs: expect.arrayContaining([
            'commitment:2aeae0a5-0ce8-4554-8e81-2234a7f68da1',
          ]),
          artifact_readiness: expect.objectContaining({
            state: 'FINISHED_ARTIFACT_READY',
            reason: expect.stringContaining('finished work'),
          }),
          artifact: expect.objectContaining({
            title: expect.stringContaining('WorkSourceWA'),
          }),
          discrepancy_card: expect.objectContaining({
            claim: expect.stringContaining('decision memo'),
            why_now: expect.stringContaining('Deadline is TODAY'),
            source_refs: expect.arrayContaining(['commitment:1']),
          }),
          discrepancy_quality: expect.objectContaining({
            passes: true,
          }),
        }),
      }),
    );
    expect(JSON.stringify(inserted)).not.toMatch(/DRY RUN|Verification brief|pipeline_dry_run/i);
    expect(body).toEqual(
      expect.objectContaining({
        id: 'selected-action-1',
        status: 'pending_approval',
        artifact_readiness_state: 'FINISHED_ARTIFACT_READY',
        artifact: expect.objectContaining({
          title: expect.stringContaining('WorkSourceWA'),
        }),
      }),
    );
  });
});
