'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Mail } from 'lucide-react';
import { ProductShell } from '@/components/dashboard/ProductShell';
import { SkeletonSignalsPage } from '@/components/ui/skeleton';
import { formatRelativeTime, providerDisplayName } from '@/lib/ui/provider-display';

interface GraphStats {
  lastSignalAt: string | null;
  lastSignalSource: string | null;
}

interface IntegrationStatus {
  provider: string;
  is_active: boolean;
  sync_email?: string | null;
  last_synced_at?: string | null;
  connected_at?: string | null;
}

export default function SignalsPage() {
  const [stats, setStats] = useState<GraphStats | null>(null);
  const [integrations, setIntegrations] = useState<IntegrationStatus[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetch('/api/graph/stats'), fetch('/api/integrations/status')])
      .then(async ([statsResponse, integrationsResponse]) => {
        const nextStats = statsResponse.ok ? await statsResponse.json() : null;
        const nextIntegrations = integrationsResponse.ok ? await integrationsResponse.json() : null;
        setStats(nextStats);
        setIntegrations(Array.isArray(nextIntegrations?.integrations) ? nextIntegrations.integrations : []);
      })
      .catch(() => {
        setStats(null);
        setIntegrations([]);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <ProductShell
        title="Signals"
        subtitle="Legacy route for source diagnostics."
      >
        <SkeletonSignalsPage />
      </ProductShell>
    );
  }

  const activeIntegrations = integrations.filter((integration) => integration.is_active);
  const latestSignalLabel = stats?.lastSignalAt
    ? `${providerDisplayName(stats.lastSignalSource)} · ${formatRelativeTime(stats.lastSignalAt)}`
    : 'No signal yet';

  return (
    <ProductShell
      title="Signals"
      subtitle="Source status now lives in Settings. This route stays available for older links."
    >
      <section className="rounded-card border border-border bg-panel p-6">
        <h2 className="text-2xl font-bold tracking-tight text-text-primary">Source status moved to Settings</h2>
        <p className="mt-3 text-sm leading-relaxed text-text-secondary">
          Connected account health and latest source activity now live under Settings so this information sits with account controls.
        </p>
        <Link
          href="/dashboard/settings#connected-accounts"
          className="mt-5 inline-flex min-h-[44px] items-center rounded-button bg-accent px-4 text-xs font-black uppercase tracking-[0.14em] text-bg transition-colors hover:bg-accent-hover"
        >
          Open connected accounts
        </Link>
      </section>

      <section className="mt-4 rounded-card border border-border-subtle bg-panel p-6">
        <p className="text-[10px] font-black uppercase tracking-[0.12em] text-text-secondary">Legacy snapshot</p>
        <div className="mt-4 grid gap-4 border-y border-border-subtle py-4 md:grid-cols-2">
          <article>
            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-text-secondary">Connected sources</p>
            <p className="mt-2 text-3xl font-black tracking-tight text-text-primary">{activeIntegrations.length}</p>
          </article>
          <article>
            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-text-secondary">Latest source signal</p>
            <p className="mt-2 text-sm leading-relaxed text-text-primary">{latestSignalLabel}</p>
          </article>
        </div>

        <h3 className="mt-5 text-sm font-black uppercase tracking-[0.12em] text-text-secondary">Connected list</h3>
        {activeIntegrations.length === 0 ? (
          <p className="mt-3 text-sm leading-relaxed text-text-secondary">
            No active sources are connected yet.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {activeIntegrations.map((integration) => (
              <li key={integration.provider} className="rounded-card border border-border bg-panel-raised p-4">
                <div className="flex items-center gap-3">
                  <div className="inline-flex h-9 w-9 items-center justify-center rounded-badge border border-border bg-panel">
                    <Mail className="h-4 w-4 text-accent" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-text-primary">
                      {providerDisplayName(integration.provider)}
                    </p>
                    <p className="truncate text-sm text-text-secondary">
                      {integration.sync_email || 'Connected'}
                      {integration.last_synced_at ? ` · ${formatRelativeTime(integration.last_synced_at)}` : ''}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </ProductShell>
  );
}

