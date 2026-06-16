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
    },
  },
};

vi.mock('@/lib/auth/resolve-user', () => ({ resolveUser: mockResolveUser }));
vi.mock('@/lib/db/client', () => ({ createServerClient: () => mockSupabase }));
vi.mock('@/lib/utils/api-error', () => ({
  apiErrorForRoute: mockApiErrorForRoute,
  badRequest: mockBadRequest,
}));

const ownerUserId = '11111111-1111-4111-8111-111111111111';
const otherUserId = '22222222-2222-4222-8222-222222222222';
const activeState = {
  current_focus: 'Close ACME renewal decision',
  next_move: 'Send owner confirmation note',
  why_it_matters: 'The renewal window closes at 4 PM PT.',
  blocker: null,
  do_not_touch: null,
  waiting_on: null,
  last_completed_step: null,
  state_source: 'manual_anchor',
  source_trail: [],
  snoozed_until: null,
  interaction_history: [],
  created_at: '2026-05-20T12:00:00.000Z',
  updated_at: '2026-05-20T12:10:00.000Z',
};

describe('POST /api/slack/right-now', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv('FOLDERA_SELF_USER_ID', ownerUserId);
    vi.stubEnv('FOLDERA_SLACK_SELF_CHANNEL_ID', 'CSELF');
    vi.stubEnv('SLACK_BOT_TOKEN', '');
    mockResolveUser.mockResolvedValue({ userId: ownerUserId });
    mockApiErrorForRoute.mockImplementation((error: unknown) =>
      NextResponse.json(
        { error: error instanceof Error ? error.message : String(error) },
        { status: 500 },
      ),
    );
    mockSupabase.auth.admin.getUserById.mockResolvedValue({
      data: { user: { user_metadata: { workday_presence_state: activeState } } },
      error: null,
    });
  });

  it('forbids live Slack sends for authenticated users other than the owner', async () => {
    mockResolveUser.mockResolvedValue({ userId: otherUserId });

    const { POST } = await import('../route');
    const response = await POST(
      new Request('http://localhost/api/slack/right-now', { method: 'POST' }),
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe('Forbidden');
    expect(mockSupabase.auth.admin.getUserById).not.toHaveBeenCalled();
  });
});
