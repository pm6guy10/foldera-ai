'use client';

import { useEffect, useState } from 'react';
import { Mail, Radio } from 'lucide-react';
import { ProductShell } from '@/components/dashboard/ProductShell';
import { SkeletonSignalsPage } from '@/components/ui/skeleton';

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
        subtitle="Foldera reads connected sources in the background."
      >
        <SkeletonSignalsPage />
      </ProductShell>
    );
  }

  const activeIntegrations = integrations.filter((integration) => integration.is_active);

  return (
    <ProductShell
      title="Signals"
      subtitle="Foldera reads connected sources in the background so the morning directive stays focused."
    >
      <div className="rounded-card border border-border bg-panel p-6">
        <h2 className="text-2xl font-bold tracking-tight text-text-primary">Sources</h2>
        <p className="mt-3 text-sm leading-relaxed text-text-secondary">
          Connected inboxes and calendars are monitored continuously. Finished work still appears in Today.
        </p>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <article className="rounded-card border border-border bg-panel p-6">
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-text-secondary">Connected sources</p>
          <p className="mt-3 text-4xl font-black tracking-tight">{activeIntegrations.length}</p>
        </article>
        <article className="rounded-card border border-border bg-panel p-6">
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-text-secondary">Last signal</p>
          <p className="mt-3 text-sm text-text-primary">
            {stats?.lastSignalAt
              ? `${formatSource(stats.lastSignalSource)} · ${formatTimeAgo(stats.lastSignalAt)}`
              : 'No signal yet'}
          </p>
        </article>
      </div>

      {activeIntegrations.length === 0 ? (
        <article className="mt-4 rounded-card border border-border bg-panel p-8">
          <h3 className="text-lg font-semibold text-text-primary">No sources connected yet</h3>
          <p className="mt-2 text-sm leading-relaxed text-text-secondary">
            Connect at least one provider in settings so Foldera can read context.
          </p>
          <a
            href="/dashboard/settings"
            className="mt-6 inline-flex min-h-[44px] items-center rounded-button bg-accent px-4 text-xs font-black uppercase tracking-[0.14em] text-bg"
          >
            Open settings
          </a>
        </article>
      ) : (
        <ul className="mt-4 space-y-3">
          {activeIntegrations.map((integration) => (
            <li key={integration.provider} className="rounded-card border border-border bg-panel p-6">
              <div className="flex items-center gap-3">
                <div className="inline-flex h-9 w-9 items-center justify-center rounded-badge border border-border bg-panel-raised">
                  {integration.provider.includes('google') || integration.provider.includes('azure') ? (
                    <Mail className="h-4 w-4 text-accent" aria-hidden="true" />
                  ) : (
                    <Radio className="h-4 w-4 text-accent" aria-hidden="true" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-semibold text-text-primary">{formatSource(integration.provider)}</p>
                  <p className="text-sm text-text-secondary">
                    {integration.sync_email || 'Connected'}
                    {integration.last_synced_at
                      ? ` · ${formatTimeAgo(integration.last_synced_at)}`
                      : ''}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </ProductShell>
  );
}

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatSource(source: string | null | undefined): string {
  if (!source) return 'Unknown source';
  return source
    .split('_')
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ');
}

