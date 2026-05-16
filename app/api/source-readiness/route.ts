import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth/auth-options';
import { createServerClient } from '@/lib/db/client';
import {
  buildConnectorHealthEntries,
  loadConnectorHealthRows,
} from '@/lib/integrations/connector-health';
import { buildFirstRunSourceReadiness } from '@/lib/source-readiness/first-run-source-readiness';
import { apiErrorForRoute } from '@/lib/utils/api-error';
import { withReadOnlyUserCache } from '@/lib/utils/read-only-user-cache';

export const dynamic = 'force-dynamic';

function providerLabel(provider: string): string {
  if (provider === 'google') return 'Google';
  if (provider === 'microsoft' || provider === 'azure_ad') return 'Microsoft';
  return provider || 'Source';
}

function latestIso(values: Array<string | null | undefined>): string | null {
  let latest: string | null = null;
  let latestMs = 0;
  for (const value of values) {
    if (!value) continue;
    const ms = new Date(value).getTime();
    if (!Number.isFinite(ms) || ms <= latestMs) continue;
    latest = value;
    latestMs = ms;
  }
  return latest;
}

export async function GET() {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = createServerClient();
    const userId = session.user.id;
    const { rows } = await loadConnectorHealthRows({
      userId,
      supabase: supabase as never,
    });
    const connectorProviders = buildConnectorHealthEntries(rows);

    const [
      signalCountResult,
      processedSignalCountResult,
      unprocessedSignalCountResult,
      actionCountResult,
      pipelineRunCountResult,
      latestSignalResult,
    ] = await Promise.all([
      supabase
        .from('tkg_signals')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId),
      supabase
        .from('tkg_signals')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('processed', true),
      supabase
        .from('tkg_signals')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('processed', false),
      supabase
        .from('tkg_actions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId),
      supabase
        .from('pipeline_runs')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId),
      supabase
        .from('tkg_signals')
        .select('ingested_at, occurred_at, created_at')
        .eq('user_id', userId)
        .order('ingested_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const latestSignal = latestSignalResult.data as
      | { ingested_at?: string | null; occurred_at?: string | null; created_at?: string | null }
      | null;
    const latestProviderSync = latestIso(
      connectorProviders.map((provider) => provider.last_synced_at),
    );
    const latestSignalAt = latestIso([
      latestSignal?.ingested_at,
      latestSignal?.occurred_at,
      latestSignal?.created_at,
    ]);

    const readiness = buildFirstRunSourceReadiness({
      providers: connectorProviders.map((provider) => ({
        provider: provider.provider,
        label: providerLabel(provider.provider),
        is_active: provider.is_active,
        status: provider.status,
        last_synced_at: provider.last_synced_at,
        can_check_now:
          provider.is_active &&
          provider.needs_reauth !== true &&
          provider.needs_reconnect !== true,
      })),
      signal_count: signalCountResult.count ?? 0,
      processed_signal_count: processedSignalCountResult.count ?? 0,
      unprocessed_signal_count: unprocessedSignalCountResult.count ?? 0,
      action_count: actionCountResult.count ?? 0,
      pipeline_run_count: pipelineRunCountResult.count ?? 0,
      last_checked_at: latestIso([latestProviderSync, latestSignalAt]),
      newest_signal_at: latestSignalAt,
    });

    return NextResponse.json(readiness, withReadOnlyUserCache());
  } catch (err: unknown) {
    return apiErrorForRoute(err, 'source-readiness');
  }
}
