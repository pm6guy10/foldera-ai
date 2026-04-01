import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const sendResendEmail = vi.fn();
const apiError = vi.fn();
const badRequest = vi.fn((message: string) => new Response(JSON.stringify({ error: message }), { status: 400 }));

const mockSupabase = {
  auth: {
    admin: {
      getUserById: vi.fn(),
      updateUserById: vi.fn(),
    },
  },
  from: vi.fn(),
  rpc: vi.fn(),
};

vi.mock('next-auth', () => ({
  getServerSession,
}));

vi.mock('@/lib/auth/auth-options', () => ({
  getAuthOptions: vi.fn(() => ({})),
}));

vi.mock('@/lib/db/client', () => ({
  createServerClient: () => mockSupabase,
}));

vi.mock('@/lib/email/resend', () => ({
  renderWelcomeEmailHtml: vi.fn(() => '<html>welcome</html>'),
  sendResendEmail,
}));

vi.mock('@/lib/utils/api-error', () => ({
  apiError,
  badRequest,
}));

describe('POST /api/onboard/set-goals', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({
      user: {
        id: 'user-1',
        email: 'member@example.com',
      },
    });
    apiError.mockImplementation((error: unknown) => new Response(JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
    }), { status: 500 }));
    sendResendEmail.mockResolvedValue({ data: { id: 'email-1' }, error: null });
    mockSupabase.rpc.mockResolvedValue({ error: null });
    mockSupabase.auth.admin.getUserById.mockResolvedValue({
      data: {
        user: {
          email: 'member@example.com',
          user_metadata: {},
        },
      },
      error: null,
    });
    mockSupabase.auth.admin.updateUserById.mockResolvedValue({ data: {}, error: null });
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'user_tokens') {
        return {
          select: () => ({
            eq: () => Promise.resolve({ count: 1, error: null }),
          }),
        };
      }

      return {
        select: () => Promise.resolve({ data: [], error: null }),
      };
    });
  });

  it('sends the onboarding welcome email once after goals save when a provider is connected', async () => {
    const { POST } = await import('../route');
    const response = await POST(new Request('http://localhost/api/onboard/set-goals', {
      method: 'POST',
      body: JSON.stringify({
        buckets: ['Career growth'],
        freeText: null,
        skipped: false,
      }),
    }) as never);

    expect(response.status).toBe(200);
    expect(mockSupabase.rpc).toHaveBeenCalledWith('replace_onboarding_goals', {
      p_user_id: 'user-1',
      p_rows: [
        {
          user_id: 'user-1',
          goal_text: 'Professional development and advancement in current role',
          goal_category: 'career',
          priority: 3,
          current_priority: true,
          source: 'onboarding_bucket',
        },
        {
          user_id: 'user-1',
          goal_text: '__ONBOARDING_COMPLETE__',
          goal_category: 'other',
          priority: 1,
          current_priority: false,
          source: 'onboarding_marker',
        },
      ],
    });
    expect(sendResendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'Welcome to Foldera',
      }),
    );
    expect(mockSupabase.auth.admin.updateUserById).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        user_metadata: expect.objectContaining({
          welcome_email_sent: true,
        }),
      }),
    );
  });

  it('does not resend the welcome email when the metadata flag already exists', async () => {
    mockSupabase.auth.admin.getUserById.mockResolvedValue({
      data: {
        user: {
          email: 'member@example.com',
          user_metadata: { welcome_email_sent: true },
        },
      },
      error: null,
    });

    const { POST } = await import('../route');
    const response = await POST(new Request('http://localhost/api/onboard/set-goals', {
      method: 'POST',
      body: JSON.stringify({
        buckets: ['Career growth'],
        freeText: null,
        skipped: false,
      }),
    }) as never);

    expect(response.status).toBe(200);
    expect(sendResendEmail).not.toHaveBeenCalled();
    expect(mockSupabase.auth.admin.updateUserById).not.toHaveBeenCalled();
  });
});
