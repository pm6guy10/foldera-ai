import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mockGetServerSession = vi.fn();
const mockCheckoutCreate = vi.fn();
const mockApiErrorForRoute = vi.fn();

vi.mock('next-auth', () => ({
  getServerSession: mockGetServerSession,
}));

vi.mock('stripe', () => {
  class StripeMock {
    checkout = { sessions: { create: mockCheckoutCreate } };
  }

  return { default: StripeMock };
});

vi.mock('@/lib/utils/api-error', () => ({
  apiErrorForRoute: mockApiErrorForRoute,
}));

describe('POST /api/stripe/checkout', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    vi.stubEnv('STRIPE_PRO_PRICE_ID', 'price_pro_123');
    vi.stubEnv('NEXTAUTH_URL', 'https://www.foldera.ai');
    mockApiErrorForRoute.mockImplementation((err: unknown) =>
      Response.json(
        { error: err instanceof Error ? err.message : String(err) },
        { status: 500 },
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 401 when the request is unauthenticated', async () => {
    mockGetServerSession.mockResolvedValue(null);

    const { POST } = await import('../route');
    const response = await POST(
      new NextRequest('http://localhost/api/stripe/checkout', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    expect(mockCheckoutCreate).not.toHaveBeenCalled();
  });

  it('creates a Stripe checkout session bound to the signed-in user', async () => {
    mockGetServerSession.mockResolvedValue({
      user: {
        id: 'user-123',
        email: 'pro-user@foldera.ai',
      },
    });
    mockCheckoutCreate.mockResolvedValue({
      url: 'https://checkout.stripe.com/c/pay/cs_test_foldera',
    });

    const { POST } = await import('../route');
    const response = await POST(
      new NextRequest('http://localhost/api/stripe/checkout', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      url: 'https://checkout.stripe.com/c/pay/cs_test_foldera',
    });
    expect(mockCheckoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'subscription',
        line_items: [{ price: 'price_pro_123', quantity: 1 }],
        success_url: 'https://www.foldera.ai/dashboard?upgraded=true',
        cancel_url: 'https://www.foldera.ai/pricing',
        client_reference_id: 'user-123',
        customer_email: 'pro-user@foldera.ai',
        metadata: { userId: 'user-123' },
      }),
    );
  });
});
