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
import {
  buildConnectorHealthEntries,
  buildConnectorHealthSummary,
  loadConnectorHealthRows,
} from '@/lib/integrations/connector-health';
import { apiErrorForRoute } from '@/lib/utils/api-error';
import { INTEGRATIONS_MAIL_GRAPH_STALE_MS } from '@/lib/config/constants';
import { withReadOnlyUserCache } from '@/lib/utils/read-only-user-cache';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = createServerClient();
    const { rows } = await loadConnectorHealthRows({
      userId: session.user.id,
      supabase: supabase as never,
    });
    const nowMs = Date.now();
    const connectorProviders = buildConnectorHealthEntries(rows, { nowMs });
    const connectorHealth = buildConnectorHealthSummary(connectorProviders);
    const integrations = connectorProviders.map((provider, index) => {
      const row = rows[index];
      return {
        provider: provider.ui_provider,
        is_active: provider.is_active,
        sync_email: provider.email,
        last_synced_at: provider.last_synced_at,
        scopes: row?.scopes ?? null,
        missing_scopes: provider.missing_scopes,
        expires_at: typeof row?.expires_at === 'number' ? row.expires_at : null,
        needs_reconnect: provider.needs_reconnect,
        needs_reauth: provider.needs_reauth,
        needs_sync: provider.needs_sync,
        sync_stale: provider.sync_stale,
        status: provider.status,
        recommended_action: provider.recommended_action,
      };
    });

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

    const hasMailConnector = connectorProviders.some(
      (provider) =>
        (provider.provider === 'google' || provider.provider === 'microsoft') &&
        provider.has_access_token &&
        provider.has_refresh_token,
    );
    const newestMailIso = (newestMailRow?.occurred_at as string | undefined) ?? null;
    const newestMailMs = newestMailIso ? new Date(newestMailIso).getTime() : 0;
    const mailIngestLooksStale =
      hasMailConnector &&
      (newestMailMs === 0 || nowMs - newestMailMs > INTEGRATIONS_MAIL_GRAPH_STALE_MS);

    return NextResponse.json(
      {
        integrations,
        connector_health: connectorHealth,
        newest_mail_signal_at: newestMailIso,
        mail_ingest_looks_stale: mailIngestLooksStale,
      },
      withReadOnlyUserCache(),
    );
  } catch (err: unknown) {
    return apiErrorForRoute(err, 'integrations/status');
  }
}
