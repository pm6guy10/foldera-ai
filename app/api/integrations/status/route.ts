/**
 * GET /api/integrations/status
 *
 * Returns the list of connected OAuth integrations for the authenticated user.
 * Reads from `user_tokens` — the table that OAuth connect flows write to.
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth/auth-options';
import { createServerClient } from '@/lib/db/client';
import { apiErrorForRoute } from '@/lib/utils/api-error';
import { INTEGRATIONS_MAIL_GRAPH_STALE_MS, INTEGRATIONS_SYNC_STALE_MS } from '@/lib/config/constants';

export const dynamic = 'force-dynamic';

/**
 * PostgREST errors are often `PostgrestError extends Error`. `JSON.stringify(err)` drops
 * non-enumerable `message`, so schema errors never match `/oauth_reauth_required_at/`.
 */
function supabaseErrorText(err: unknown): string {
  if (err == null) return '';
  if (typeof err === 'string') return err;
  if (err instanceof Error) {
    const e = err as Error & { details?: string; hint?: string; code?: string };
    return [e.message, e.details, e.hint, e.code].filter(Boolean).join(' | ');
  }
  if (typeof err === 'object') {
    const o = err as Record<string, unknown>;
    const parts = [o.message, o.details, o.hint, o.code].filter((x) => typeof x === 'string') as string[];
    try {
      return `${parts.join(' | ')} | ${JSON.stringify(err)}`;
    } catch {
      return parts.join(' | ');
    }
  }
  return String(err);
}

function isOauthReauthColumnMissing(err: unknown): boolean {
  return /oauth_reauth_required_at/i.test(supabaseErrorText(err));
}

export async function GET() {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = createServerClient();

    let data: unknown[] | null;
    let legacyReauthShape = false;

    let modern: { data: unknown; error: unknown };
    try {
      modern = await supabase
        .from('user_tokens')
        .select(
          'provider, email, last_synced_at, scopes, access_token, expires_at, refresh_token, disconnected_at, oauth_reauth_required_at',
        )
        .eq('user_id', session.user.id)
        .or('disconnected_at.is.null,oauth_reauth_required_at.not.is.null');
    } catch (caught) {
      if (!isOauthReauthColumnMissing(caught)) throw caught;
      modern = { data: null, error: caught };
    }

    // #region agent log
    fetch('http://127.0.0.1:7695/ingest/9e285a70-f4df-4ff8-9890-574a4203a08e', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '35fceb' },
      body: JSON.stringify({
        sessionId: '35fceb',
        hypothesisId: 'H1',
        location: 'integrations/status/route.ts:modern',
        message: 'user_tokens query',
        data: {
          hasError: modern.error != null,
          errTextSample: modern.error != null ? supabaseErrorText(modern.error).slice(0, 500) : null,
          missingColMatch: modern.error != null ? isOauthReauthColumnMissing(modern.error) : false,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    if (modern.error && isOauthReauthColumnMissing(modern.error)) {
      const legacy = await supabase
        .from('user_tokens')
        .select('provider, email, last_synced_at, scopes, access_token, expires_at, refresh_token')
        .eq('user_id', session.user.id)
        .is('disconnected_at', null);
      if (legacy.error) {
        throw legacy.error;
      }
      data = legacy.data as unknown[];
      legacyReauthShape = true;
    } else if (modern.error) {
      throw modern.error;
    } else {
      data = modern.data as unknown[];
    }

    const nowMs = Date.now();
    const integrations = (data ?? []).map((row: any) => {
      // Map user_tokens provider names to settings UI provider names
      const uiProvider = row.provider === 'microsoft' ? 'azure_ad' : row.provider;
      const hasToken = typeof row.access_token === 'string' && row.access_token.length > 0;
      const expSec = typeof row.expires_at === 'number' ? row.expires_at : null;
      // Encrypted blob or plaintext — presence means background refresh may work
      const hasRefreshInDb =
        typeof row.refresh_token === 'string' && row.refresh_token.length > 0;

      // Do NOT treat short-lived access_token expiry as "reconnect": cron/sync refreshes via
      // refresh_token; DB expires_at can lag behind a successful last_synced_at (Google).
      const needsReconnect = hasToken && !hasRefreshInDb;
      const reauthRequired =
        !legacyReauthShape &&
        row.oauth_reauth_required_at != null &&
        typeof row.oauth_reauth_required_at === 'string';

      const lastSyncMs = row.last_synced_at ? new Date(row.last_synced_at as string).getTime() : 0;
      const syncStale =
        hasToken &&
        hasRefreshInDb &&
        lastSyncMs > 0 &&
        nowMs - lastSyncMs > INTEGRATIONS_SYNC_STALE_MS;

      return {
        provider: uiProvider,
        is_active: hasToken,
        sync_email: row.email ?? null,
        last_synced_at: row.last_synced_at ?? null,
        scopes: row.scopes ?? null,
        expires_at: expSec,
        needs_reconnect: needsReconnect,
        needs_reauth: reauthRequired,
        sync_stale: syncStale,
      };
    });

    // Per-source signal counts for connector health display
    const { data: signalRows } = await supabase
      .from('tkg_signals')
      .select('source')
      .eq('user_id', session.user.id)
      .eq('processed', true)
      .limit(10000);

    const sourceCounts: Record<string, number> = {};
    for (const row of (signalRows ?? [])) {
      const src = row.source as string;
      sourceCounts[src] = (sourceCounts[src] ?? 0) + 1;
    }

    // Newest mail by message date among ingested Gmail/Outlook rows — not `processed=true`.
    // Sync upserts with processed=false until the signal processor runs; filtering only processed
    // made "Latest mail…" look weeks stale while connectors showed fresh sync (misleading banner).
    const { data: newestMailRow } = await supabase
      .from('tkg_signals')
      .select('occurred_at')
      .eq('user_id', session.user.id)
      .in('source', ['gmail', 'outlook'])
      .in('type', ['email_received', 'email_sent'])
      .order('occurred_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const tokenRows = (data ?? []) as Array<{
      provider?: string;
      access_token?: unknown;
      refresh_token?: unknown;
    }>;
    const hasMailConnector = tokenRows.some(
      (row) =>
        (row.provider === 'google' || row.provider === 'microsoft') &&
        typeof row.access_token === 'string' &&
        row.access_token.length > 0 &&
        typeof row.refresh_token === 'string' &&
        row.refresh_token.length > 0,
    );
    const newestMailIso = (newestMailRow?.occurred_at as string | undefined) ?? null;
    const newestMailMs = newestMailIso ? new Date(newestMailIso).getTime() : 0;
    const mailIngestLooksStale =
      hasMailConnector &&
      (newestMailMs === 0 || nowMs - newestMailMs > INTEGRATIONS_MAIL_GRAPH_STALE_MS);

    return NextResponse.json(
      {
        integrations,
        sourceCounts,
        newest_mail_signal_at: newestMailIso,
        mail_ingest_looks_stale: mailIngestLooksStale,
      },
      {
        headers: {
          'Cache-Control': 'private, no-store, must-revalidate',
        },
      },
    );
  } catch (err: unknown) {
    return apiErrorForRoute(err, 'integrations/status');
  }
}
