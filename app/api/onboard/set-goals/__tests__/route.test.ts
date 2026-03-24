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
  renderPlaintextEmailHtml: vi.fn((body: string) => `<p>${body}</p>`),
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
      if (table === 'tkg_goals') {
        return {
          delete: () => ({
            eq: () => ({
              in: () => Promise.resolve({ error: null }),
            }),
          }),
          insert: () => Promise.resolve({ error: null }),
          select: () => ({
            eq: () => ({
              in: () => Promise.resolve({ data: [], error: null }),
            }),
          }),
        };
      }

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
    expect(sendResendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: "You're connected — your first read arrives tomorrow",
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
