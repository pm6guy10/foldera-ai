import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mockAuthClientState = vi.fn();
const mockClaimGraphPush = vi.fn();
const mockEnsureSubscription = vi.fn();
const mockSyncMicrosoft = vi.fn();
const mockDeliver = vi.fn();

vi.mock('@/lib/sync/graph-subscription', () => ({
  authenticateClientState: (...a: unknown[]) => mockAuthClientState(...a),
  claimGraphPush: (...a: unknown[]) => mockClaimGraphPush(...a),
  ensureGraphSubscription: (...a: unknown[]) => mockEnsureSubscription(...a),
}));
vi.mock('@/lib/sync/microsoft-sync', () => ({
  syncMicrosoft: (...a: unknown[]) => mockSyncMicrosoft(...a),
}));
vi.mock('@/lib/workday-presence/deliver-now', () => ({
  deliverWorkdayPresence: (...a: unknown[]) => mockDeliver(...a),
}));

import { handleGraphWebhookPost } from '../graph-webhook';

function postReq(url: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

const SUB = 'sub-123';

describe('handleGraphWebhookPost', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthClientState.mockReturnValue('owner-1');
    mockClaimGraphPush.mockResolvedValue(true);
    mockSyncMicrosoft.mockResolvedValue({
      mail_signals: 1,
      calendar_signals: 0,
      file_signals: 0,
      task_signals: 0,
    });
    mockDeliver.mockResolvedValue({ seeded: true });
  });

  afterEach(() => vi.clearAllMocks());

  it('echoes the validation token on the creation handshake', async () => {
    const res = await handleGraphWebhookPost(
      postReq('https://x.test/api/webhooks/graph?validationToken=abc%20123'),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/plain');
    expect(await res.text()).toBe('abc 123');
    expect(mockSyncMicrosoft).not.toHaveBeenCalled();
  });

  it('authenticates, syncs, and delivers a real change notification (push context)', async () => {
    const res = await handleGraphWebhookPost(
      postReq('https://x.test/api/webhooks/graph', {
        value: [{ subscriptionId: SUB, clientState: 'cs', changeType: 'created' }],
      }),
    );
    const json = await res.json();
    expect(json.processed).toBe(1);
    expect(mockSyncMicrosoft).toHaveBeenCalledWith('owner-1');
    expect(mockDeliver).toHaveBeenCalledWith('owner-1', {
      trigger: 'push',
      syncDelta: { gmail: 1, calendar: 0, drive: 0 },
    });
  });

  it('rejects a notification whose clientState fails authentication', async () => {
    mockAuthClientState.mockReturnValue(null);
    const res = await handleGraphWebhookPost(
      postReq('https://x.test/api/webhooks/graph', {
        value: [{ subscriptionId: SUB, clientState: 'forged' }],
      }),
    );
    const json = await res.json();
    expect(json.processed).toBe(0);
    expect(mockSyncMicrosoft).not.toHaveBeenCalled();
    expect(mockDeliver).not.toHaveBeenCalled();
  });

  it('debounces: when the claim is lost, it does not spend the brain', async () => {
    mockClaimGraphPush.mockResolvedValue(false);
    await handleGraphWebhookPost(
      postReq('https://x.test/api/webhooks/graph', {
        value: [{ subscriptionId: SUB, clientState: 'cs' }],
      }),
    );
    expect(mockSyncMicrosoft).not.toHaveBeenCalled();
    expect(mockDeliver).not.toHaveBeenCalled();
  });

  it('collapses a burst for the same user into a single delivery', async () => {
    await handleGraphWebhookPost(
      postReq('https://x.test/api/webhooks/graph', {
        value: [
          { subscriptionId: SUB, clientState: 'cs' },
          { subscriptionId: SUB, clientState: 'cs' },
          { subscriptionId: SUB, clientState: 'cs' },
        ],
      }),
    );
    // Deduped to one user → one claim → one delivery.
    expect(mockClaimGraphPush).toHaveBeenCalledTimes(1);
    expect(mockDeliver).toHaveBeenCalledTimes(1);
  });

  it('re-arms the subscription on a lifecycle event instead of delivering', async () => {
    mockEnsureSubscription.mockResolvedValue({ ok: true, action: 'renewed' });
    const res = await handleGraphWebhookPost(
      postReq('https://x.test/api/webhooks/graph', {
        value: [{ subscriptionId: SUB, clientState: 'cs', lifecycleEvent: 'reauthorizationRequired' }],
      }),
    );
    const json = await res.json();
    expect(json.lifecycle).toBe(1);
    expect(mockEnsureSubscription).toHaveBeenCalledWith('owner-1', { force: true });
    expect(mockDeliver).not.toHaveBeenCalled();
  });

  it('returns 400 on invalid JSON body', async () => {
    const req = new NextRequest('https://x.test/api/webhooks/graph', {
      method: 'POST',
      body: 'not json',
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await handleGraphWebhookPost(req);
    expect(res.status).toBe(400);
  });
});
