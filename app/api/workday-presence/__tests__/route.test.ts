import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const mockResolveUser = vi.fn();
const mockApiErrorForRoute = vi.fn();
const mockBadRequest = vi.fn((message: string) =>
  NextResponse.json({ error: message }, { status: 400 }),
);

const mockSupabase = {
  auth: {
    admin: {
      getUserById: vi.fn(),
      updateUserById: vi.fn(),
    },
  },
};

vi.mock('@/lib/auth/resolve-user', () => ({ resolveUser: mockResolveUser, resolveAnyUser: mockResolveUser }));
vi.mock('@/lib/db/client', () => ({ createServerClient: () => mockSupabase }));
vi.mock('@/lib/utils/api-error', () => ({
  apiErrorForRoute: mockApiErrorForRoute,
  badRequest: mockBadRequest,
}));

describe('GET /api/workday-presence', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockResolveUser.mockResolvedValue({ userId: 'u-45' });
    mockApiErrorForRoute.mockImplementation((error: unknown) =>
      NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 }),
    );
  });

  it('emits exactly one setup card when no state exists', async () => {
    mockSupabase.auth.admin.getUserById.mockResolvedValue({
      data: { user: { user_metadata: {} } },
      error: null,
    });
    const { GET } = await import('../route');
    const response = await GET(new Request('http://localhost/api/workday-presence'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.resolution.verdict).toBe('CLEAR');
    expect(body.resolution.rule).toBe('no_saved_state');
    expect(body.card.mode).toBe('setup');
    expect(body.card.verdict_line).toContain('No justified move yet');
    expect(Object.keys(body)).toEqual(expect.arrayContaining(['state', 'card']));
  });

  it('emits exactly one active card when state exists', async () => {
    mockSupabase.auth.admin.getUserById.mockResolvedValue({
      data: {
        user: {
          user_metadata: {
            workday_presence_state: {
              current_focus: 'Close ACME renewal decision',
              next_move: 'Send owner confirmation note',
              why_it_matters: 'The renewal window closes at 4 PM PT.',
              blocker: null,
              do_not_touch: null,
              waiting_on: 'Owner confirmation sent',
              last_completed_step: 'Drafted decision context',
              state_source: 'manual_anchor',
              interaction_history: [
                {
                  interaction_type: 'done',
                  timestamp: '2026-05-20T12:09:00.000Z',
                  resulting_state: {
                    next_move: 'Send owner confirmation note',
                    blocker: null,
                    waiting_on: 'Owner confirmation sent',
                    last_completed_step: 'Drafted decision context',
                  },
                },
              ],
              created_at: '2026-05-19T12:00:00.000Z',
              updated_at: '2026-05-19T12:10:00.000Z',
            },
          },
        },
      },
      error: null,
    });
    const { GET } = await import('../route');
    const response = await GET(new Request('http://localhost/api/workday-presence'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.resolution.verdict).toBe('WAIT');
    expect(body.resolution.rule).toBe('external_wait');
    expect(body.card.mode).toBe('active');
    expect(body.card.heading).toBe('Right now.');
    expect(body.card.next_move).toContain('Hold here until Owner confirmation sent');
    expect(body.card.verdict_line).toContain('Trusted verdict: Hold.');
    expect(body.card.source_line).toContain('Source: your saved focus');
    expect(body.card.last_interaction).toContain('Last interaction: done');
  });

  it('turns source-backed CLEAR into honest quiet instead of a fake next move', async () => {
    mockSupabase.auth.admin.getUserById.mockResolvedValue({
      data: {
        user: {
          user_metadata: {
            workday_presence_state: {
              current_focus: 'Close ACME renewal decision',
              next_move: 'Send owner confirmation note',
              why_it_matters: 'The renewal window closes at 4 PM PT.',
              blocker: null,
              do_not_touch: null,
              waiting_on: null,
              last_completed_step: null,
              state_source: 'source_backed',
              source_trail: [
                {
                  table: 'tkg_commitments',
                  source: 'gmail',
                  type: 'commitment',
                  redacted_summary: 'Renewal confirmation owed to ACME',
                  selection_reason: 'active commitment row is the safest source-backed next move',
                },
              ],
              interaction_history: [],
              created_at: '2026-05-19T12:00:00.000Z',
              updated_at: '2026-05-19T12:10:00.000Z',
            },
          },
        },
      },
      error: null,
    });
    const { GET } = await import('../route');
    const response = await GET(new Request('http://localhost/api/workday-presence'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.resolution.verdict).toBe('CLEAR');
    expect(body.resolution.rule).toBe('no_justified_command');
    expect(body.card.mode).toBe('active');
    expect(body.card.next_move).toBe('Next move: Stay quiet until connected work proves something is ready.');
    expect(body.card.verdict_line).toContain('Clear right now');
  });
});
