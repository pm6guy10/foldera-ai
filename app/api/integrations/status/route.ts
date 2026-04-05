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
import { INTEGRATIONS_SYNC_STALE_MS } from '@/lib/config/constants';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = createServerClient();

    const { data, error } = await supabase
      .from('user_tokens')
      .select('provider, email, last_synced_at, scopes, access_token, expires_at, refresh_token')
      .eq('user_id', session.user.id)
      .is('disconnected_at', null);

    if (error) {
      throw error;
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

    return NextResponse.json({ integrations, sourceCounts });
  } catch (err: unknown) {
    return apiErrorForRoute(err, 'integrations/status');
  }
}
