import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const mockResolveUser = vi.fn();
const mockProcessUnextractedSignals = vi.fn();
const mockScoreOpenLoops = vi.fn();
const mockGenerateDirective = vi.fn();
const mockEgressEmergencyBlock = vi.fn();

vi.mock('@/lib/auth/resolve-user', () => ({
  resolveUser: mockResolveUser,
}));

vi.mock('@/lib/signals/signal-processor', () => ({
  processUnextractedSignals: mockProcessUnextractedSignals,
}));

vi.mock('@/lib/briefing/scorer', () => ({
  scoreOpenLoops: mockScoreOpenLoops,
}));

vi.mock('@/lib/briefing/generator', () => ({
  generateDirective: mockGenerateDirective,
}));

vi.mock('@/lib/utils/egress-emergency', () => ({
  blockDevRouteDuringEgressEmergency: mockEgressEmergencyBlock,
}));

const OWNER_ID = 'e40b7cd8-4925-42f7-bc99-5022969f1d22';
const OTHER_ID = '11111111-1111-1111-1111-111111111111';

describe('POST /api/dev/stress-test', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv('ALLOW_DEV_ROUTES', 'true');
    mockEgressEmergencyBlock.mockReturnValue(null);
    mockProcessUnextractedSignals.mockResolvedValue(undefined);
    mockScoreOpenLoops.mockResolvedValue({
      candidateDiscovery: { topCandidates: [] },
      winner: null,
    });
    mockGenerateDirective.mockResolvedValue({
      directive: 'Send the follow-up to Alex Morgan before noon.',
      action_type: 'send_message',
      confidence: 72,
      generationLog: { outcome: 'success' },
    });
  });

  it('returns 403 when ALLOW_DEV_ROUTES is not true', async () => {
    vi.stubEnv('ALLOW_DEV_ROUTES', undefined);
    const { POST } = await import('../route');
    const response = await POST(
      new Request('http://localhost/api/dev/stress-test', {
        method: 'POST',
        body: JSON.stringify({ rounds: 1 }),
        headers: { 'content-type': 'application/json' },
      }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Dev routes are disabled.' });
    expect(mockResolveUser).not.toHaveBeenCalled();
    vi.stubEnv('ALLOW_DEV_ROUTES', 'true');
  });

  it('returns 401 when resolveUser rejects the session', async () => {
    mockResolveUser.mockResolvedValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    );
    const { POST } = await import('../route');
    const response = await POST(
      new Request('http://localhost/api/dev/stress-test', {
        method: 'POST',
        body: JSON.stringify({ rounds: 1 }),
        headers: { 'content-type': 'application/json' },
      }),
    );

    expect(response.status).toBe(401);
  });

  it('returns 403 for authenticated non-owner users', async () => {
    mockResolveUser.mockResolvedValue({ userId: OTHER_ID });
    const { POST } = await import('../route');
    const response = await POST(
      new Request('http://localhost/api/dev/stress-test', {
        method: 'POST',
        body: JSON.stringify({ rounds: 1 }),
        headers: { 'content-type': 'application/json' },
      }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Forbidden' });
  });

  it('allows the owner through the dry-run path', async () => {
    mockResolveUser.mockResolvedValue({ userId: OWNER_ID });
    const { POST } = await import('../route');
    const response = await POST(
      new Request('http://localhost/api/dev/stress-test', {
        method: 'POST',
        body: JSON.stringify({ rounds: 1 }),
        headers: { 'content-type': 'application/json' },
      }),
    );

    expect(response.status).toBe(200);
    expect(mockProcessUnextractedSignals).toHaveBeenCalledWith(OWNER_ID, { dryRun: true });
    expect(mockScoreOpenLoops).toHaveBeenCalledWith(OWNER_ID);
    expect(mockGenerateDirective).toHaveBeenCalledWith(OWNER_ID, { dryRun: true });

    const body = await response.json();
    expect(body.rounds_run).toBe(1);
    expect(body.summary.total_directives_generated).toBe(1);
    expect(body.results[0]).toMatchObject({
      round: 1,
      directive: 'Send the follow-up to Alex Morgan before noon.',
      action_type: 'send_message',
      rejection_reason: null,
    });
  });
});
