import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const validateCronAuth = vi.fn();
const mockSyncMicrosoft = vi.fn();
const mockSyncGoogle = vi.fn();
const mockDeliver = vi.fn();
const mockEnsureGraphSubscription = vi.fn();

vi.mock('@/lib/auth/resolve-user', () => ({
  validateCronAuth,
}));

vi.mock('@/lib/sync/microsoft-sync', () => ({
  syncMicrosoft: mockSyncMicrosoft,
}));

vi.mock('@/lib/sync/google-sync', () => ({
  syncGoogle: mockSyncGoogle,
}));

vi.mock('@/lib/workday-presence/deliver-now', () => ({
  deliverWorkdayPresence: mockDeliver,
}));

vi.mock('@/lib/sync/graph-subscription', () => ({
  ensureGraphSubscription: mockEnsureGraphSubscription,
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
    mockDeliver.mockResolvedValue({ trigger_context: 'heartbeat', seeded: true, seed: {}, trigger: {} });
    mockEnsureGraphSubscription.mockResolvedValue({ ok: true, action: 'renewed' });
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
    expect(mockDeliver).not.toHaveBeenCalled();
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

  it('always runs the deliver pipeline (heartbeat), even with no new signals', async () => {
    const { POST } = await import('../route');
    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.new_signals.total).toBe(0);
    // The seed gate is gone: the heartbeat always evaluates the pool.
    expect(mockDeliver).toHaveBeenCalledTimes(1);
    expect(mockDeliver).toHaveBeenCalledWith('test-owner-id');
  });

  it('reflects Microsoft signal counts and still delivers', async () => {
    mockSyncMicrosoft.mockResolvedValue({ ...ZERO_MS_RESULT, mail_signals: 3 });

    const { POST } = await import('../route');
    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.new_signals.microsoft).toBe(3);
    expect(body.new_signals.total).toBe(3);
    expect(mockDeliver).toHaveBeenCalledTimes(1);
  });

  it('reflects Google signal counts and still delivers', async () => {
    mockSyncGoogle.mockResolvedValue({ ...ZERO_GOOGLE_RESULT, drive_signals: 2 });

    const { POST } = await import('../route');
    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.new_signals.google).toBe(2);
    expect(body.new_signals.total).toBe(2);
    expect(mockDeliver).toHaveBeenCalledTimes(1);
  });

  it('re-arms the owner Graph subscription (Stage 0) before delivering', async () => {
    const { POST } = await import('../route');
    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockEnsureGraphSubscription).toHaveBeenCalledWith('test-owner-id');
    expect(body.graph_subscription).toEqual({ ok: true, action: 'renewed' });
  });

  it('still delivers even if the Graph subscription re-arm throws', async () => {
    mockEnsureGraphSubscription.mockRejectedValue(new Error('graph boom'));

    const { POST } = await import('../route');
    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.graph_subscription).toMatchObject({ error: expect.stringContaining('graph boom') });
    expect(mockDeliver).toHaveBeenCalledTimes(1);
  });

  it('continues to deliver even when Microsoft sync throws', async () => {
    mockSyncMicrosoft.mockRejectedValue(new Error('ms boom'));

    const { POST } = await import('../route');
    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.microsoft_error).toMatch('ms boom');
    expect(body.new_signals.microsoft).toBe(0);
    expect(mockDeliver).toHaveBeenCalledTimes(1);
  });

  it('continues to deliver even when Google sync throws', async () => {
    mockSyncGoogle.mockRejectedValue(new Error('google boom'));

    const { POST } = await import('../route');
    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.google_error).toMatch('google boom');
    expect(body.new_signals.google).toBe(0);
    expect(mockDeliver).toHaveBeenCalledTimes(1);
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
