import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const mockResolveUser = vi.fn();
const mockCreateServerClient = vi.fn();
const mockApiErrorForRoute = vi.fn();
const mockBuildContextGreeting = vi.fn();
const mockGetSubscriptionStatus = vi.fn();

vi.mock('@/lib/auth/resolve-user', () => ({ resolveUser: mockResolveUser }));
vi.mock('@/lib/db/client', () => ({ createServerClient: mockCreateServerClient }));
vi.mock('@/lib/utils/api-error', () => ({ apiErrorForRoute: mockApiErrorForRoute }));
vi.mock('@/lib/briefing/context-builder', () => ({ buildContextGreeting: mockBuildContextGreeting }));
vi.mock('@/lib/auth/subscription', () => ({ getSubscriptionStatus: mockGetSubscriptionStatus }));

type SupabaseMockOptions = {
  pendingActions: Record<string, unknown>[];
  consumedCount: number;
  accountCreatedAt?: string | null;
};

function buildSupabaseMock(options: SupabaseMockOptions) {
  const inConsumedStatuses = vi.fn().mockResolvedValue({ count: options.consumedCount });

  const consumedCountEqUser = vi.fn().mockReturnValue({ in: inConsumedStatuses });
  const pendingLimit = vi.fn().mockResolvedValue({ data: options.pendingActions, error: null });
  const pendingOrderGenerated = vi.fn().mockReturnValue({ limit: pendingLimit });
  const pendingOrderConfidence = vi.fn().mockReturnValue({ order: pendingOrderGenerated });
  const pendingEqStatus = vi.fn().mockReturnValue({ order: pendingOrderConfidence });
  const pendingEqUser = vi.fn().mockReturnValue({ eq: pendingEqStatus });

  const tkgActionsSelect = vi
    .fn()
    .mockImplementation((_columns: string, config?: { count?: string; head?: boolean }) => {
      if (config?.head) {
        return { eq: consumedCountEqUser };
      }
      return { eq: pendingEqUser };
    });

  const userSubscriptionUpdateEq = vi.fn().mockResolvedValue({ error: null });
  const userSubscriptionUpdate = vi.fn().mockReturnValue({ eq: userSubscriptionUpdateEq });

  const from = vi.fn().mockImplementation((table: string) => {
    if (table === 'tkg_actions') return { select: tkgActionsSelect };
    if (table === 'user_subscriptions') return { update: userSubscriptionUpdate };
    throw new Error(`Unexpected table: ${table}`);
  });

  return {
    from,
    auth: {
      admin: {
        getUserById: vi.fn().mockResolvedValue({
          data: { user: { created_at: options.accountCreatedAt ?? '2026-01-02T00:00:00.000Z' } },
          error: null,
        }),
      },
    },
    spies: {
      inConsumedStatuses,
    },
  };
}

function buildPendingAction(overrides?: Partial<Record<string, unknown>>): Record<string, unknown> {
  return {
    id: 'action-1',
    directive_text: 'Finalize packet owner outreach.',
    action_type: 'write_document',
    confidence: 92,
    reason: 'Owner confirmation is due today.',
    status: 'pending_approval',
    generated_at: new Date().toISOString(),
    evidence: [],
    artifact: { type: 'document', title: 'Packet owner confirmation', content: 'Owner must confirm by 4 PM PT.' },
    execution_result: {},
    ...(overrides ?? {}),
  };
}

async function callLatest() {
  const { GET } = await import('../route');
  return GET(new Request('http://localhost/api/conviction/latest'));
}

describe('GET /api/conviction/latest free artifact allowance contract', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockApiErrorForRoute.mockImplementation((err: unknown) =>
      NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 }),
    );
    mockResolveUser.mockResolvedValue({ userId: 'u-test' });
    mockBuildContextGreeting.mockResolvedValue('Today. 0 active commitments. Top priority: None set.');
  });

  it('pending_approval alone does not consume the free artifact', async () => {
    const supabase = buildSupabaseMock({
      pendingActions: [buildPendingAction()],
      consumedCount: 0,
    });
    mockCreateServerClient.mockReturnValue(supabase);
    mockGetSubscriptionStatus.mockResolvedValue({ status: 'none' });

    const res = await callLatest();
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;

    expect(body.id).toBe('action-1');
    expect(body.approved_count).toBe(0);
    expect(body.free_artifact_remaining).toBe(true);
    expect(body.artifact_paywall_locked).toBe(false);
    expect(supabase.spies.inConsumedStatuses).toHaveBeenCalledWith('status', ['approved', 'executed', 'skipped']);
  });

  it('approved consumes the free artifact for free users', async () => {
    const supabase = buildSupabaseMock({
      pendingActions: [buildPendingAction({ id: 'action-approved' })],
      consumedCount: 1,
    });
    mockCreateServerClient.mockReturnValue(supabase);
    mockGetSubscriptionStatus.mockResolvedValue({ status: 'none' });

    const res = await callLatest();
    const body = (await res.json()) as Record<string, unknown>;

    expect(body.approved_count).toBe(1);
    expect(body.free_artifact_remaining).toBe(false);
    expect(body.artifact_paywall_locked).toBe(true);
  });

  it('executed consumes the free artifact for free users', async () => {
    const supabase = buildSupabaseMock({
      pendingActions: [buildPendingAction({ id: 'action-executed' })],
      consumedCount: 1,
    });
    mockCreateServerClient.mockReturnValue(supabase);
    mockGetSubscriptionStatus.mockResolvedValue({ status: 'none' });

    const res = await callLatest();
    const body = (await res.json()) as Record<string, unknown>;

    expect(body.free_artifact_remaining).toBe(false);
    expect(body.artifact_paywall_locked).toBe(true);
  });

  it('skipped consumes the free artifact for free users', async () => {
    const supabase = buildSupabaseMock({
      pendingActions: [buildPendingAction({ id: 'action-skipped' })],
      consumedCount: 1,
    });
    mockCreateServerClient.mockReturnValue(supabase);
    mockGetSubscriptionStatus.mockResolvedValue({ status: 'none' });

    const res = await callLatest();
    const body = (await res.json()) as Record<string, unknown>;

    expect(body.free_artifact_remaining).toBe(false);
    expect(body.artifact_paywall_locked).toBe(true);
  });

  it('active never locks artifact', async () => {
    const supabase = buildSupabaseMock({
      pendingActions: [buildPendingAction({ id: 'action-active' })],
      consumedCount: 3,
    });
    mockCreateServerClient.mockReturnValue(supabase);
    mockGetSubscriptionStatus.mockResolvedValue({ status: 'active' });

    const res = await callLatest();
    const body = (await res.json()) as Record<string, unknown>;

    expect(body.free_artifact_remaining).toBe(false);
    expect(body.artifact_paywall_locked).toBe(false);
    expect(body.is_subscribed).toBe(true);
  });

  it('active_trial never locks artifact', async () => {
    const supabase = buildSupabaseMock({
      pendingActions: [buildPendingAction({ id: 'action-trial' })],
      consumedCount: 2,
    });
    mockCreateServerClient.mockReturnValue(supabase);
    mockGetSubscriptionStatus.mockResolvedValue({ status: 'active_trial' });

    const res = await callLatest();
    const body = (await res.json()) as Record<string, unknown>;

    expect(body.artifact_paywall_locked).toBe(false);
    expect(body.is_subscribed).toBe(true);
  });

  it('past_due never locks artifact', async () => {
    const supabase = buildSupabaseMock({
      pendingActions: [buildPendingAction({ id: 'action-past-due' })],
      consumedCount: 5,
    });
    mockCreateServerClient.mockReturnValue(supabase);
    mockGetSubscriptionStatus.mockResolvedValue({ status: 'past_due' });

    const res = await callLatest();
    const body = (await res.json()) as Record<string, unknown>;

    expect(body.artifact_paywall_locked).toBe(false);
    expect(body.is_subscribed).toBe(true);
  });

  it('no action response includes explicit allowance fields with unlocked paywall', async () => {
    const supabase = buildSupabaseMock({
      pendingActions: [],
      consumedCount: 0,
    });
    mockCreateServerClient.mockReturnValue(supabase);
    mockGetSubscriptionStatus.mockResolvedValue({ status: 'none' });

    const res = await callLatest();
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;

    expect(body.context_greeting).toBeTypeOf('string');
    expect(body.account_created_at).toBeTypeOf('string');
    expect(body.approved_count).toBe(0);
    expect(body.is_subscribed).toBe(false);
    expect(body.free_artifact_remaining).toBe(true);
    expect(body.artifact_paywall_locked).toBe(false);
    expect(body.id).toBeUndefined();
  });
});
