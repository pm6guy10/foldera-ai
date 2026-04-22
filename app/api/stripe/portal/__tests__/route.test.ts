import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerSession = vi.fn();
const mockFrom = vi.fn();
const mockApiErrorForRoute = vi.fn();
const mockPortalCreate = vi.fn();
const mockCustomersList = vi.fn();
const mockSubscriptionsList = vi.fn();

vi.mock('next-auth', () => ({ getServerSession }));
vi.mock('@/lib/auth/auth-options', () => ({
  authOptions: {},
}));
vi.mock('@/lib/db/client', () => ({
  createServerClient: () => ({ from: mockFrom }),
}));
vi.mock('@/lib/utils/api-error', () => ({
  apiErrorForRoute: mockApiErrorForRoute,
}));
vi.mock('stripe', () => {
  class StripeMock {
    billingPortal = { sessions: { create: mockPortalCreate } };
    customers = { list: mockCustomersList };
    subscriptions = { list: mockSubscriptionsList };
  }

  return { default: StripeMock };
});

function makeSelectChain(rows: Array<Record<string, unknown>> | null, error: { message: string } | null = null) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue({ data: rows, error }),
      }),
    }),
  };
}

function makeUpdateChain(error: { message: string } | null = null) {
  return {
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error }),
    }),
  };
}

describe('POST /api/stripe/portal', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    mockApiErrorForRoute.mockImplementation((err: unknown) =>
      Response.json(
        { error: err instanceof Error ? err.message : String(err) },
        { status: 500 },
      ),
    );
  });

  it('uses the current request origin for the billing portal return URL', async () => {
    getServerSession.mockResolvedValue({
      user: { id: 'user-123', email: 'user@example.com' },
    });
    mockFrom.mockImplementation(() =>
      makeSelectChain([{ stripe_customer_id: 'cus_live_123', stripe_subscription_id: 'sub_live_123' }]),
    );
    mockPortalCreate.mockResolvedValue({
      url: 'https://billing.stripe.com/p/session_live',
    });

    const { POST } = await import('../route');
    const response = await POST(
      new Request('http://127.0.0.1:3011/api/stripe/portal', { method: 'POST' }),
    );

    expect(response.status).toBe(200);
    expect(mockPortalCreate).toHaveBeenCalledWith({
      customer: 'cus_live_123',
      return_url: 'http://127.0.0.1:3011/dashboard/settings',
    });
    expect(await response.json()).toEqual({
      url: 'https://billing.stripe.com/p/session_live',
    });
  });

  it('repairs a stale stored customer id by recovering the live Stripe customer via email', async () => {
    getServerSession.mockResolvedValue({
      user: { id: 'user-123', email: 'b-kapp@outlook.com' },
    });

    const selectChain = makeSelectChain([
      {
        stripe_customer_id: 'cus_test_brandon',
        stripe_subscription_id: 'sub_test_brandon',
      },
    ]);
    const updateChain = makeUpdateChain();
    mockFrom.mockImplementation(() => ({
      ...selectChain,
      ...updateChain,
    }));

    mockPortalCreate
      .mockRejectedValueOnce(new Error("No such customer: 'cus_test_brandon'"))
      .mockResolvedValueOnce({ url: 'https://billing.stripe.com/p/session_recovered' });
    mockCustomersList.mockResolvedValue({
      data: [{ id: 'cus_live_brandon' }],
    });
    mockSubscriptionsList.mockResolvedValue({
      data: [
        {
          id: 'sub_live_brandon',
          status: 'active',
          current_period_end: 1777000000,
        },
      ],
    });

    const { POST } = await import('../route');
    const response = await POST(
      new Request('http://127.0.0.1:3000/api/stripe/portal', { method: 'POST' }),
    );

    expect(response.status).toBe(200);
    expect(mockCustomersList).toHaveBeenCalledWith({
      email: 'b-kapp@outlook.com',
      limit: 10,
    });
    expect(updateChain.update).toHaveBeenCalledWith({
      stripe_customer_id: 'cus_live_brandon',
      stripe_subscription_id: 'sub_live_brandon',
      current_period_end: '2026-04-24T03:06:40.000Z',
      status: 'active',
    });
    expect(mockPortalCreate).toHaveBeenNthCalledWith(2, {
      customer: 'cus_live_brandon',
      return_url: 'http://127.0.0.1:3000/dashboard/settings',
    });
    expect(await response.json()).toEqual({
      url: 'https://billing.stripe.com/p/session_recovered',
    });
  });
});
