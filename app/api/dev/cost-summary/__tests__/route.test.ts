import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';
import { OWNER_USER_ID } from '@/lib/auth/constants';

const resolveUser = vi.fn();
const getCostEventSummaryReport = vi.fn();
const blockDevRouteDuringEgressEmergency = vi.fn();

vi.mock('@/lib/auth/resolve-user', () => ({
  resolveUser,
}));

vi.mock('@/lib/utils/api-tracker', () => ({
  getCostEventSummaryReport,
}));

vi.mock('@/lib/utils/egress-emergency', () => ({
  blockDevRouteDuringEgressEmergency,
}));

describe('GET /api/dev/cost-summary', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    blockDevRouteDuringEgressEmergency.mockReturnValue(null);
  });

  it('passes through auth responses', async () => {
    resolveUser.mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));

    const { GET } = await import('../route');
    const response = await GET(new Request('http://localhost/api/dev/cost-summary'));

    expect(response.status).toBe(401);
  });

  it('blocks non-owner users', async () => {
    resolveUser.mockResolvedValue({ userId: '11111111-1111-1111-1111-111111111111' });

    const { GET } = await import('../route');
    const response = await GET(new Request('http://localhost/api/dev/cost-summary'));

    expect(response.status).toBe(403);
    expect(getCostEventSummaryReport).not.toHaveBeenCalled();
  });

  it('returns the ledger summary for the owner', async () => {
    resolveUser.mockResolvedValue({ userId: OWNER_USER_ID });
    getCostEventSummaryReport.mockResolvedValue({
      generated_at: '2026-05-09T22:00:00.000Z',
      windows: {
        last_24h: { total_usd: 0.12, event_count: 1, input_tokens: 1000, output_tokens: 500 },
        last_7d: { total_usd: 0.15, event_count: 2, input_tokens: 1400, output_tokens: 620 },
        last_30d: { total_usd: 0.15, event_count: 2, input_tokens: 1400, output_tokens: 620 },
      },
      by_endpoint_7d: [{ endpoint: 'directive', total_usd: 0.12, event_count: 1 }],
      by_model_7d: [{ model: 'claude-sonnet-4-20250514', total_usd: 0.12, event_count: 1 }],
    });

    const { GET } = await import('../route');
    const response = await GET(new Request('http://localhost/api/dev/cost-summary'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(getCostEventSummaryReport).toHaveBeenCalledTimes(1);
    expect(payload.windows.last_7d.total_usd).toBe(0.15);
    expect(payload.by_endpoint_7d[0].endpoint).toBe('directive');
  });
});
