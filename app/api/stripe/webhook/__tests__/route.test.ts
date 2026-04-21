import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockConstructEvent = vi.fn();
const mockCheckoutRetrieve = vi.fn();
const mockPortalCreate = vi.fn();
const mockCreateServerClient = vi.fn();
const mockSendProWelcomeEmail = vi.fn();
const mockSendPaymentFailedEmail = vi.fn();
const mockUpdateSubscriptionByCustomerId = vi.fn();
const mockUpdateSubscriptionBySubscriptionId = vi.fn();
const mockPeriodEndIsoFromInvoice = vi.fn();
const mockPeriodEndIsoFromSubscription = vi.fn();
const mockSubscriptionStatusToDb = vi.fn();

vi.mock('stripe', () => {
  class StripeMock {
    webhooks = { constructEvent: mockConstructEvent };
    checkout = { sessions: { retrieve: mockCheckoutRetrieve } };
    billingPortal = { sessions: { create: mockPortalCreate } };
  }

  return { default: StripeMock };
});

vi.mock('@/lib/db/client', () => ({
  createServerClient: mockCreateServerClient,
}));

vi.mock('@/lib/email/resend', () => ({
  sendProWelcomeEmail: mockSendProWelcomeEmail,
  sendPaymentFailedEmail: mockSendPaymentFailedEmail,
}));

vi.mock('@/lib/stripe/subscription-db', () => ({
  periodEndIsoFromInvoice: mockPeriodEndIsoFromInvoice,
  periodEndIsoFromSubscription: mockPeriodEndIsoFromSubscription,
  subscriptionStatusToDb: mockSubscriptionStatusToDb,
  updateSubscriptionByCustomerId: mockUpdateSubscriptionByCustomerId,
  updateSubscriptionBySubscriptionId: mockUpdateSubscriptionBySubscriptionId,
}));

describe('POST /api/stripe/webhook', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_123');
    mockPeriodEndIsoFromInvoice.mockReturnValue('2026-05-01T00:00:00.000Z');
    mockPeriodEndIsoFromSubscription.mockReturnValue('2026-05-01T00:00:00.000Z');
    mockSubscriptionStatusToDb.mockReturnValue('active');
    mockSendProWelcomeEmail.mockResolvedValue(undefined);
    mockSendPaymentFailedEmail.mockResolvedValue(undefined);
    mockUpdateSubscriptionByCustomerId.mockResolvedValue(undefined);
    mockUpdateSubscriptionBySubscriptionId.mockResolvedValue(undefined);
    mockPortalCreate.mockResolvedValue({ url: 'https://billing.stripe.com/p/session_123' });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 200 when checkout.session.completed persists the subscription row', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    mockCreateServerClient.mockReturnValue({
      from: vi.fn(() => ({ upsert })),
    });
    mockConstructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_test_123' } },
    });
    mockCheckoutRetrieve.mockResolvedValue({
      id: 'cs_test_123',
      client_reference_id: 'user-123',
      customer: 'cus_123',
      subscription: { id: 'sub_123' },
      customer_details: { email: 'user@example.com' },
    });

    const { POST } = await import('../route');
    const response = await POST(
      new Request('http://localhost/api/stripe/webhook', {
        method: 'POST',
        headers: { 'stripe-signature': 'sig_123' },
        body: '{}',
      }) as any,
    );

    expect(response.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-123',
        stripe_customer_id: 'cus_123',
        stripe_subscription_id: 'sub_123',
        plan: 'pro',
        status: 'active',
        current_period_end: '2026-05-01T00:00:00.000Z',
      }),
      { onConflict: 'user_id' },
    );
    expect(mockSendProWelcomeEmail).toHaveBeenCalledWith('user@example.com');
  });

  it('returns 500 when checkout.session.completed cannot persist the subscription row', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: { message: 'db write failed' } });
    mockCreateServerClient.mockReturnValue({
      from: vi.fn(() => ({ upsert })),
    });
    mockConstructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_test_456' } },
    });
    mockCheckoutRetrieve.mockResolvedValue({
      id: 'cs_test_456',
      client_reference_id: 'user-456',
      customer: 'cus_456',
      subscription: { id: 'sub_456' },
      customer_details: { email: 'user@example.com' },
    });

    const { POST } = await import('../route');
    const response = await POST(
      new Request('http://localhost/api/stripe/webhook', {
        method: 'POST',
        headers: { 'stripe-signature': 'sig_456' },
        body: '{}',
      }) as any,
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Webhook handler failed' });
  });

  it('returns 500 when a subscription update event matches no persisted subscription row', async () => {
    mockCreateServerClient.mockReturnValue({
      from: vi.fn(),
    });
    mockConstructEvent.mockReturnValue({
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_missing',
          status: 'active',
        },
      },
    });
    mockUpdateSubscriptionBySubscriptionId.mockRejectedValue(
      new Error('[stripe] no subscription row matched subscription sub_missing'),
    );

    const { POST } = await import('../route');
    const response = await POST(
      new Request('http://localhost/api/stripe/webhook', {
        method: 'POST',
        headers: { 'stripe-signature': 'sig_789' },
        body: '{}',
      }) as any,
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Webhook handler failed' });
  });
});
