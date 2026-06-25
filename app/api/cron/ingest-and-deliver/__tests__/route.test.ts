import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const validateCronAuth = vi.fn();
const mockSyncMicrosoft = vi.fn();
const mockSyncGoogle = vi.fn();
const mockSeedFromScorer = vi.fn();
const mockTriggerRunner = vi.fn();

vi.mock('@/lib/auth/resolve-user', () => ({
  validateCronAuth,
}));

vi.mock('@/lib/sync/microsoft-sync', () => ({
  syncMicrosoft: mockSyncMicrosoft,
}));

vi.mock('@/lib/sync/google-sync', () => ({
  syncGoogle: mockSyncGoogle,
}));

vi.mock('@/app/api/workday-presence/seed-from-scorer/route', () => ({
  POST: mockSeedFromScorer,
}));

vi.mock('@/app/api/cron/workday-presence-trigger-runner/route', () => ({
  POST: mockTriggerRunner,
}));

function request() {
  return new NextRequest(new URL('http://localhost/api/cron/ingest-and-deliver'), {
    headers: { authorization: 'Bearer test-cron-secret' },
  });
}

const ZERO_MS_RESULT = {
  mail_signals: 0,
  calendar_signals: 0,
  file_signals: 0,
  task_signals: 0,
  mail_total_signals: 0,
  calendar_total_signals: 0,
  file_total_signals: 0,
  task_total_signals: 0,
  is_first_sync: false,
};

const ZERO_GOOGLE_RESULT = {
  gmail_signals: 0,
  calendar_signals: 0,
  drive_signals: 0,
  is_first_sync: false,
};

describe('ingest-and-deliver cron route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    validateCronAuth.mockReturnValue(null);
    process.env.FOLDERA_SELF_USER_ID = 'test-owner-id';
    mockSyncMicrosoft.mockResolvedValue(ZERO_MS_RESULT);
    mockSyncGoogle.mockResolvedValue(ZERO_GOOGLE_RESULT);
    mockSeedFromScorer.mockResolvedValue(
      NextResponse.json({ seeded: true, scorer_outcome: 'winner_selected' }),
    );
    mockTriggerRunner.mockResolvedValue(
      NextResponse.json({ ok: true, outcome: 'quiet' }),
    );
  });

  it('rejects unauthorized requests before syncing', async () => {
    validateCronAuth.mockReturnValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    );
    const { POST } = await import('../route');
    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(mockSyncMicrosoft).not.toHaveBeenCalled();
    expect(mockSyncGoogle).not.toHaveBeenCalled();
    expect(mockSeedFromScorer).not.toHaveBeenCalled();
    expect(mockTriggerRunner).not.toHaveBeenCalled();
  });

  it('returns 500 when FOLDERA_SELF_USER_ID is missing', async () => {
    delete process.env.FOLDERA_SELF_USER_ID;
    const { POST } = await import('../route');
    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/FOLDERA_SELF_USER_ID/);
  });

  it('skips seed-from-scorer and still runs trigger-runner when no new signals', async () => {
    const { POST } = await import('../route');
    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.new_signals.total).toBe(0);
    expect(body.seed_skipped).toBe(true);
    expect(body.seed_result).toBeNull();
    expect(mockSeedFromScorer).not.toHaveBeenCalled();
    expect(mockTriggerRunner).toHaveBeenCalledTimes(1);
  });

  it('calls seed-from-scorer and trigger-runner when Microsoft signals arrive', async () => {
    mockSyncMicrosoft.mockResolvedValue({
      ...ZERO_MS_RESULT,
      mail_signals: 3,
    });

    const { POST } = await import('../route');
    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.new_signals.microsoft).toBe(3);
    expect(body.new_signals.total).toBe(3);
    expect(body.seed_skipped).toBe(false);
    expect(mockSeedFromScorer).toHaveBeenCalledTimes(1);
    expect(mockTriggerRunner).toHaveBeenCalledTimes(1);

    // seed runs before trigger
    expect(mockSeedFromScorer.mock.invocationCallOrder[0]).toBeLessThan(
      mockTriggerRunner.mock.invocationCallOrder[0],
    );
  });

  it('calls seed-from-scorer and trigger-runner when Google signals arrive', async () => {
    mockSyncGoogle.mockResolvedValue({
      ...ZERO_GOOGLE_RESULT,
      drive_signals: 2,
    });

    const { POST } = await import('../route');
    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.new_signals.google).toBe(2);
    expect(body.new_signals.total).toBe(2);
    expect(body.seed_skipped).toBe(false);
    expect(mockSeedFromScorer).toHaveBeenCalledTimes(1);
    expect(mockTriggerRunner).toHaveBeenCalledTimes(1);
  });

  it('forwards cron auth header to seed-from-scorer and trigger-runner', async () => {
    mockSyncMicrosoft.mockResolvedValue({ ...ZERO_MS_RESULT, mail_signals: 1 });

    const { POST } = await import('../route');
    await POST(request());

    const seedReq = mockSeedFromScorer.mock.calls[0][0] as NextRequest;
    const triggerReq = mockTriggerRunner.mock.calls[0][0] as NextRequest;

    expect(seedReq.headers.get('authorization')).toBe('Bearer test-cron-secret');
    expect(triggerReq.headers.get('authorization')).toBe('Bearer test-cron-secret');
  });

  it('continues to trigger-runner even when Microsoft sync throws', async () => {
    mockSyncMicrosoft.mockRejectedValue(new Error('ms boom'));

    const { POST } = await import('../route');
    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.microsoft_error).toMatch('ms boom');
    expect(body.new_signals.microsoft).toBe(0);
    expect(mockTriggerRunner).toHaveBeenCalledTimes(1);
  });

  it('continues to trigger-runner even when Google sync throws', async () => {
    mockSyncGoogle.mockRejectedValue(new Error('google boom'));

    const { POST } = await import('../route');
    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.google_error).toMatch('google boom');
    expect(body.new_signals.google).toBe(0);
    expect(mockTriggerRunner).toHaveBeenCalledTimes(1);
  });

  it('syncs the owner user (FOLDERA_SELF_USER_ID) for both providers', async () => {
    const { POST } = await import('../route');
    await POST(request());

    expect(mockSyncMicrosoft).toHaveBeenCalledWith('test-owner-id');
    expect(mockSyncGoogle).toHaveBeenCalledWith('test-owner-id');
  });

  it('accepts GET requests as well as POST', async () => {
    const { GET } = await import('../route');
    const getRequest = new NextRequest(
      new URL('http://localhost/api/cron/ingest-and-deliver'),
      { headers: { authorization: 'Bearer test-cron-secret' } },
    );
    const response = await GET(getRequest);
    expect(response.status).toBe(200);
  });
});
