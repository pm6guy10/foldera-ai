import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const mockResolveUser = vi.fn();
const mockApiErrorForRoute = vi.fn();

const mockSupabase = {
  auth: {
    admin: {
      getUserById: vi.fn(),
    },
  },
};

vi.mock('@/lib/auth/resolve-user', () => ({ resolveUser: mockResolveUser }));
vi.mock('@/lib/db/client', () => ({ createServerClient: () => mockSupabase }));
vi.mock('@/lib/utils/api-error', () => ({
  apiErrorForRoute: mockApiErrorForRoute,
  badRequest: (message: string) => NextResponse.json({ error: message }, { status: 400 }),
}));

describe('Connectors test-mode ingest', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockResolveUser.mockResolvedValue({ userId: 'u-48' });
    mockApiErrorForRoute.mockImplementation((error: unknown) =>
      NextResponse.json(
        { error: error instanceof Error ? error.message : String(error) },
        { status: 500 },
      ),
    );
  });

  it('POST /api/connectors/test-mode/ingest collapses noisy multi-signal evidence to at most one intervention', async () => {
    mockSupabase.auth.admin.getUserById.mockResolvedValue({
      data: {
        user: {
          user_metadata: {
            workday_presence_state: {
              current_focus: 'Ship Phase 4 ingestion seam',
              next_move: 'Write the single smallest integration test',
              why_it_matters: 'The loop must stay quiet unless it has one real move.',
              blocker: null,
              do_not_touch: null,
              waiting_on: 'thread_123',
              last_completed_step: null,
              state_source: 'manual_anchor',
              created_at: '2026-05-20T12:00:00.000Z',
              updated_at: '2026-05-20T12:10:00.000Z',
            },
          },
        },
      },
      error: null,
    });

    const { POST } = await import('../ingest/route');
    const response = await POST(
      new Request('http://localhost/api/connectors/test-mode/ingest', {
        method: 'POST',
        body: JSON.stringify({
          events: [
            // noise: calendar requires_prep=false
            {
              kind: 'calendar',
              event_id: 'evt_1',
              title: 'Weekly status',
              starts_at_iso: '2026-05-20T17:00:00.000Z',
              requires_prep: false,
            },
            // candidate: calendar requires_prep=true
            {
              kind: 'calendar',
              event_id: 'evt_2',
              title: 'Customer call',
              starts_at_iso: '2026-05-20T18:00:00.000Z',
              requires_prep: true,
            },
            // candidate: slack reply_needed on active waiting_on thread (should win priority)
            {
              kind: 'slack',
              event_id: 'sl_1',
              thread_id: 'thread_123',
              summary: 'Need your reply on the decision',
              reply_needed: true,
            },
            // noise: slack neither reply_needed nor changed
            {
              kind: 'slack',
              event_id: 'sl_2',
              thread_id: 'thread_999',
              summary: 'reaction only',
            },
            // candidate but should be dedup-collapsed by thread
            {
              kind: 'slack',
              event_id: 'sl_3',
              thread_id: 'thread_123',
              summary: 'follow-up ping',
              reply_needed: true,
            },
          ],
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.result.selected_context.trigger_type).toBe('mention_reply_needed');
    expect(body.result.trigger_result.outcome).toBe('intervention');
  });

  it('POST /api/connectors/test-mode/ingest stays quiet when nothing is actionable', async () => {
    mockSupabase.auth.admin.getUserById.mockResolvedValue({
      data: {
        user: {
          user_metadata: {
            workday_presence_state: {
              current_focus: 'Stay quiet',
              next_move: 'Do one tiny move',
              why_it_matters: 'Noise should not wake the system.',
              blocker: null,
              do_not_touch: null,
              waiting_on: null,
              last_completed_step: null,
              state_source: 'manual_anchor',
              created_at: '2026-05-20T12:00:00.000Z',
              updated_at: '2026-05-20T12:10:00.000Z',
            },
          },
        },
      },
      error: null,
    });

    const { POST } = await import('../ingest/route');
    const response = await POST(
      new Request('http://localhost/api/connectors/test-mode/ingest', {
        method: 'POST',
        body: JSON.stringify({
          events: [
            {
              kind: 'calendar',
              event_id: 'evt_3',
              title: 'FYI meeting',
              starts_at_iso: '2026-05-20T19:00:00.000Z',
              requires_prep: false,
            },
            {
              kind: 'slack',
              event_id: 'sl_4',
              thread_id: 'thread_1',
              summary: 'emoji reaction',
              is_noise: true,
            },
          ],
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.result.selected_context).toBeNull();
    expect(body.result.trigger_result).toBeNull();
    expect(body.result.reason).toMatch(/quiet/i);
  });

  it('prefers explicit state-change triggers over older noisy evidence when connector events name a cleared blocker', async () => {
    mockSupabase.auth.admin.getUserById.mockResolvedValue({
      data: {
        user: {
          user_metadata: {
            workday_presence_state: {
              current_focus: 'Close ACME renewal decision',
              next_move: 'Send the approval note',
              why_it_matters: 'The renewal window closes today.',
              blocker: 'Waiting for legal sign-off',
              do_not_touch: null,
              waiting_on: 'thread_123',
              last_completed_step: 'Drafted the approval note',
              state_source: 'manual_anchor',
              created_at: '2026-05-20T12:00:00.000Z',
              updated_at: '2026-05-20T12:10:00.000Z',
            },
          },
        },
      },
      error: null,
    });

    const { POST } = await import('../ingest/route');
    const response = await POST(
      new Request('http://localhost/api/connectors/test-mode/ingest', {
        method: 'POST',
        body: JSON.stringify({
          events: [
            {
              kind: 'slack',
              event_id: 'sl_5',
              thread_id: 'thread_123',
              summary: 'Legal approved the redlines and the thread is unblocked.',
              blocker_cleared: true,
              cleared_blocker: 'Waiting for legal sign-off',
            },
            {
              kind: 'slack',
              event_id: 'sl_6',
              thread_id: 'thread_123',
              summary: 'Need your reply on the decision',
              reply_needed: true,
            },
          ],
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.result.selected_context.trigger_type).toBe('blocker_cleared');
    expect(body.result.trigger_result.outcome).toBe('intervention');
  });
});

