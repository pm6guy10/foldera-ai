// Microsoft Graph change-notification (push) subscription lifecycle.
//
// This is what replaces cron polling for Outlook: Graph POSTs /api/webhooks/graph the
// instant inbox mail changes, so a card can fire within seconds without any schedule.
// Graph mail subscriptions expire in ~70h, so a cheap daily tick renews (or re-creates)
// them — the only remaining "cron" is that LLM-free re-arm.
//
// No DB migration: subscription state lives in auth.users.user_metadata (the same jsonb
// store as workday_presence_state), and the per-user notification secret is SELF-CARRIED
// in the subscription's clientState as `${userId}.${HMAC(GRAPH_WEBHOOK_SECRET, userId)}`.
// Graph echoes clientState on every notification, so the webhook recovers + authenticates
// the userId with zero DB lookups and without trusting any id from the payload body.
import { createHmac, timingSafeEqual } from 'crypto';
import { getMicrosoftTokens } from '@/lib/auth/token-store';
import { createServerClient } from '@/lib/db/client';
import { resolveAppBaseUrl } from '@/lib/utils/app-url';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
// Inbox messages, created only — a new inbound mail is the actionable event.
const GRAPH_RESOURCE = "/me/mailFolders('inbox')/messages";
// Graph caps mail subscriptions at 4230 min (~70.5h). Stay safely under it.
const SUBSCRIPTION_TTL_MS = 68 * 60 * 60 * 1000;
// Renew when within this window of expiry (the daily re-arm runs well ahead of the cap).
export const RENEW_IF_EXPIRING_WITHIN_MS = 24 * 60 * 60 * 1000;

const META_KEY = 'workday_presence_graph_subscription';

interface GraphSubMeta {
  subscription_id: string | null;
  expires_at: string | null;
  last_push_at?: string | null;
}

// ── clientState: self-authenticating per-user token ────────────────────────────

function deriveSignature(userId: string): string {
  const secret = process.env.GRAPH_WEBHOOK_SECRET?.trim();
  if (!secret) throw new Error('GRAPH_WEBHOOK_SECRET is not set');
  return createHmac('sha256', secret).update(userId).digest('hex');
}

/** `${userId}.${HMAC}` — Graph echoes this back on every notification. (≤128 char cap.) */
export function buildClientState(userId: string): string {
  return `${userId}.${deriveSignature(userId)}`;
}

/**
 * Recover + authenticate the userId from an inbound notification's clientState.
 * Returns the userId only if the HMAC verifies (constant-time); null otherwise. A forged
 * clientState cannot pass without GRAPH_WEBHOOK_SECRET, so this is the notification's auth.
 */
export function authenticateClientState(clientState: string | undefined | null): string | null {
  if (!clientState) return null;
  const dot = clientState.lastIndexOf('.');
  if (dot <= 0) return null;
  const userId = clientState.slice(0, dot);
  const sig = clientState.slice(dot + 1);
  let expected: string;
  try {
    expected = deriveSignature(userId);
  } catch {
    return null;
  }
  const a = Buffer.from(expected);
  const b = Buffer.from(sig);
  if (a.length !== b.length) return null;
  return timingSafeEqual(a, b) ? userId : null;
}

// ── subscription state (user_metadata, no migration) ───────────────────────────

async function getSubMeta(userId: string): Promise<GraphSubMeta | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error || !data?.user) return null;
  const meta = (data.user.user_metadata ?? {}) as Record<string, unknown>;
  return (meta[META_KEY] as GraphSubMeta | undefined) ?? null;
}

async function patchSubMeta(userId: string, patch: Partial<GraphSubMeta>): Promise<void> {
  const supabase = createServerClient();
  const { data } = await supabase.auth.admin.getUserById(userId);
  const meta = (data?.user?.user_metadata ?? {}) as Record<string, unknown>;
  const current = (meta[META_KEY] as GraphSubMeta | undefined) ?? {
    subscription_id: null,
    expires_at: null,
  };
  const { error } = await supabase.auth.admin.updateUserById(userId, {
    user_metadata: { ...meta, [META_KEY]: { ...current, ...patch } },
  });
  if (error) throw error;
}

/**
 * Best-effort debounce: claim a push only if the last one was >debounceMs ago. Read-then-
 * write (not atomic), so a narrow concurrent race can let two through — but the materiality
 * gate (sync #2 sees 0 new signals) and the trigger-runner's own dedup cursor are the hard
 * guarantees against a duplicate CARD. This just trims redundant brain runs.
 */
export async function claimGraphPush(userId: string, debounceMs: number): Promise<boolean> {
  const meta = await getSubMeta(userId);
  const last = meta?.last_push_at ? new Date(meta.last_push_at).getTime() : 0;
  if (Date.now() - last < debounceMs) return false;
  await patchSubMeta(userId, { last_push_at: new Date().toISOString() }).catch(() => {});
  return true;
}

// ── lifecycle ──────────────────────────────────────────────────────────────────

function notificationUrl(): string {
  return `${resolveAppBaseUrl()}/api/webhooks/graph`;
}

function nextExpiration(nowMs: number): string {
  return new Date(nowMs + SUBSCRIPTION_TTL_MS).toISOString();
}

async function graphFetch(
  accessToken: string,
  path: string,
  init: { method: string; body?: unknown },
): Promise<{ ok: boolean; status: number; json: any }> {
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* some Graph responses (e.g. DELETE) have no body */
  }
  return { ok: res.ok, status: res.status, json };
}

export interface EnsureSubscriptionResult {
  ok: boolean;
  action: 'created' | 'renewed' | 'recreated' | 'skipped' | 'failed';
  subscriptionId?: string | null;
  expiresAt?: string | null;
  error?: string;
  status?: number;
}

/**
 * Build the POST body for a new subscription. Exported so the request shape can be unit
 * tested without hitting the network.
 */
export function buildSubscriptionBody(userId: string, nowMs: number) {
  return {
    changeType: 'created',
    notificationUrl: notificationUrl(),
    resource: GRAPH_RESOURCE,
    expirationDateTime: nextExpiration(nowMs),
    clientState: buildClientState(userId),
    latestSupportedTlsVersion: 'v1_2',
  };
}

async function createSubscription(
  userId: string,
  accessToken: string,
  nowMs: number,
): Promise<EnsureSubscriptionResult> {
  const body = buildSubscriptionBody(userId, nowMs);
  const res = await graphFetch(accessToken, '/subscriptions', { method: 'POST', body });
  if (!res.ok || !res.json?.id) {
    return {
      ok: false,
      action: 'failed',
      error: res.json?.error?.message ?? `create failed (${res.status})`,
      status: res.status,
    };
  }
  const expiresAt = res.json.expirationDateTime ?? body.expirationDateTime;
  await patchSubMeta(userId, { subscription_id: res.json.id, expires_at: expiresAt });
  return { ok: true, action: 'created', subscriptionId: res.json.id, expiresAt };
}

/**
 * Idempotent: create a subscription if none exists, renew (PATCH) if it is close to
 * expiring, otherwise skip. Re-creates if the stored subscription is gone (Graph 404).
 * `force` always renews/creates (used right after connect).
 */
export async function ensureGraphSubscription(
  userId: string,
  options: { nowMs?: number; force?: boolean } = {},
): Promise<EnsureSubscriptionResult> {
  const nowMs = options.nowMs ?? Date.now();

  if (!process.env.GRAPH_WEBHOOK_SECRET?.trim()) {
    return { ok: false, action: 'skipped', error: 'GRAPH_WEBHOOK_SECRET unset' };
  }

  const tokens = await getMicrosoftTokens(userId);
  if (!tokens?.access_token) {
    return { ok: false, action: 'skipped', error: 'no_microsoft_token' };
  }

  const existing = await getSubMeta(userId);

  if (!existing?.subscription_id) {
    return createSubscription(userId, tokens.access_token, nowMs);
  }

  const expiresMs = existing.expires_at ? new Date(existing.expires_at).getTime() : 0;
  const expiringSoon = expiresMs - nowMs <= RENEW_IF_EXPIRING_WITHIN_MS;
  if (!options.force && !expiringSoon) {
    return {
      ok: true,
      action: 'skipped',
      subscriptionId: existing.subscription_id,
      expiresAt: existing.expires_at,
    };
  }

  return patchRenew(userId, tokens.access_token, existing.subscription_id, nowMs, nextExpiration(nowMs));
}

// Separate function so the PATCH path can fall back to a fresh create on a 404
// (subscription dropped server-side).
async function patchRenew(
  userId: string,
  accessToken: string,
  subscriptionId: string,
  nowMs: number,
  newExpiry: string,
): Promise<EnsureSubscriptionResult> {
  const res = await graphFetch(accessToken, `/subscriptions/${subscriptionId}`, {
    method: 'PATCH',
    body: { expirationDateTime: newExpiry },
  });
  if (res.ok) {
    const expiresAt = res.json?.expirationDateTime ?? newExpiry;
    await patchSubMeta(userId, { subscription_id: subscriptionId, expires_at: expiresAt });
    return { ok: true, action: 'renewed', subscriptionId, expiresAt };
  }
  // 404 → the subscription is gone server-side; create a fresh one (self-healing).
  if (res.status === 404) {
    const created = await createSubscription(userId, accessToken, nowMs);
    return created.ok ? { ...created, action: 'recreated' } : created;
  }
  return {
    ok: false,
    action: 'failed',
    error: res.json?.error?.message ?? `renew failed (${res.status})`,
    status: res.status,
  };
}

/** Best-effort delete (used on disconnect). Clears stored state regardless of API outcome. */
export async function deleteGraphSubscription(userId: string): Promise<void> {
  const existing = await getSubMeta(userId);
  if (existing?.subscription_id) {
    const tokens = await getMicrosoftTokens(userId);
    if (tokens?.access_token) {
      await graphFetch(tokens.access_token, `/subscriptions/${existing.subscription_id}`, {
        method: 'DELETE',
      }).catch(() => null);
    }
  }
  await patchSubMeta(userId, { subscription_id: null, expires_at: null }).catch(() => {});
}
