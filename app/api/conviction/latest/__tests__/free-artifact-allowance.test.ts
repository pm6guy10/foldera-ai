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

function buildSupabaseMock(options: {
  pendingActions: Record<string, unknown>[];
  approvedCount?: number;
  freeUsageCount?: number;
  accountCreatedAt?: string | null;
}) {
  const inLegacyStatuses = vi.fn().mockResolvedValue({ count: options.approvedCount ?? 0 });
  const inFreeUsageStatuses = vi.fn().mockResolvedValue({ count: options.freeUsageCount ?? 0 });

  const legacyCountEqUser = vi.fn().mockReturnValue({ in: inLegacyStatuses });
  const freeUsageCountEqUser = vi.fn().mockReturnValue({ in: inFreeUsageStatuses });
  const pendingLimit = vi.fn().mockResolvedValue({ data: options.pendingActions, error: null });
  const pendingOrderGenerated = vi.fn().mockReturnValue({ limit: pendingLimit });
  const pendingOrderConfidence = vi.fn().mockReturnValue({ order: pendingOrderGenerated });
  const pendingEqStatus = vi.fn().mockReturnValue({ order: pendingOrderConfidence });
  const pendingEqUser = vi.fn().mockReturnValue({ eq: pendingEqStatus });

  const tkgActionsSelect = vi
    .fn()
    .mockImplementation((_columns: string, config?: { count?: string; head?: boolean }) => {
      if (config?.head) {
        if (tkgActionsSelect.mock.calls.filter(([, c]) => c?.head).length === 1) {
          return { eq: legacyCountEqUser };
        }
        return { eq: freeUsageCountEqUser };
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
      inLegacyStatuses,
      inFreeUsageStatuses,
      tkgActionsSelect,
      userSubscriptionUpdateEq,
    },
  };
}

describe('GET /api/conviction/latest free artifact allowance', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockApiErrorForRoute.mockImplementation((err: unknown) =>
      NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 }),
    );
    mockResolveUser.mockResolvedValue({ userId: 'u-test' });
    mockBuildContextGreeting.mockResolvedValue('Today. 0 active commitments. Top priority: None set.');
  });

  it('does not consume the free sample from pending_approval alone', async () => {
    const supabase = buildSupabaseMock({
      pendingActions: [
        {
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
        },
      ],
      approvedCount: 1,
      freeUsageCount: 0,
    });
    mockCreateServerClient.mockReturnValue(supabase);
    mockGetSubscriptionStatus.mockResolvedValue({ status: 'inactive' });

    const { GET } = await import('../route');
    const res = await GET(new Request('http://localhost/api/conviction/latest'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;

    expect(body.free_artifact_remaining).toBe(true);
    expect(body.artifact_paywall_locked).toBe(false);
    expect(body.id).toBe('action-1');
    expect(supabase.spies.inFreeUsageStatuses).toHaveBeenCalledWith('status', ['approved', 'executed', 'skipped']);
  });

  it('locks artifact for returning free users after approved/executed/skipped history', async () => {
    const supabase = buildSupabaseMock({
      pendingActions: [
        {
          id: 'action-2',
          directive_text: 'Send reply to hiring coordinator.',
          action_type: 'send_message',
          confidence: 88,
          reason: 'Thread has gone stale and deadline is near.',
          status: 'pending_approval',
          generated_at: new Date().toISOString(),
          evidence: [],
          artifact: { type: 'email', subject: 'Quick follow-up', body: 'Can you confirm by EOD?' },
          execution_result: {},
        },
      ],
      approvedCount: 4,
      freeUsageCount: 2,
    });
    mockCreateServerClient.mockReturnValue(supabase);
    mockGetSubscriptionStatus.mockResolvedValue({ status: 'inactive' });

    const { GET } = await import('../route');
    const res = await GET(new Request('http://localhost/api/conviction/latest'));
    const body = (await res.json()) as Record<string, unknown>;

    expect(body.free_artifact_remaining).toBe(false);
    expect(body.artifact_paywall_locked).toBe(true);
  });

  it('never locks artifact when subscription is active/past_due/active_trial', async () => {
    for (const status of ['active', 'past_due', 'active_trial']) {
      const supabase = buildSupabaseMock({
        pendingActions: [
          {
            id: `action-${status}`,
            directive_text: 'Finalize decision note.',
            action_type: 'write_document',
            confidence: 90,
            reason: 'Decision owner is waiting for this note.',
            status: 'pending_approval',
            generated_at: new Date().toISOString(),
            evidence: [],
            artifact: { type: 'document', title: 'Decision note', content: 'Decision and next step.' },
            execution_result: {},
          },
        ],
        approvedCount: 6,
        freeUsageCount: 6,
      });
      mockCreateServerClient.mockReturnValue(supabase);
      mockGetSubscriptionStatus.mockResolvedValue({ status });

      const { GET } = await import('../route');
      const res = await GET(new Request('http://localhost/api/conviction/latest'));
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.artifact_paywall_locked).toBe(false);
    }
  });
});
