'use client';

import { useEffect, useState } from 'react';
import { Radio, Mail, MessageSquare, Calendar, FileText } from 'lucide-react';
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

const SOURCE_META: Record<string, { icon: React.ElementType; label: string; color: string }> = {
  gmail:            { icon: Mail,          label: 'Gmail',            color: 'text-red-400' },
  google:           { icon: Mail,          label: 'Google',           color: 'text-red-400' },
  google_calendar:  { icon: Calendar,      label: 'Google Calendar',  color: 'text-emerald-400' },
  outlook:          { icon: Mail,          label: 'Outlook',          color: 'text-blue-400' },
  azure_ad:         { icon: Mail,          label: 'Microsoft',        color: 'text-blue-400' },
  outlook_calendar: { icon: Calendar,      label: 'Outlook Calendar', color: 'text-emerald-400' },
  onedrive:         { icon: FileText,      label: 'OneDrive',         color: 'text-blue-300' },
  microsoft_todo:   { icon: MessageSquare, label: 'Microsoft To Do',  color: 'text-cyan-400' },
  conversation:     { icon: MessageSquare, label: 'Conversation',     color: 'text-cyan-400' },
  manual:           { icon: MessageSquare, label: 'Manual',           color: 'text-amber-400' },
};

export default function SignalsPage() {
  const [stats, setStats] = useState<GraphStats | null>(null);
  const [integrations, setIntegrations] = useState<IntegrationStatus[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/graph/stats'),
      fetch('/api/integrations/status'),
    ])
      .then(async ([statsRes, integrationsRes]) => {
        const nextStats = statsRes.ok ? await statsRes.json() : null;
        const nextIntegrations = integrationsRes.ok ? await integrationsRes.json() : null;

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
    return <SkeletonSignalsPage />;
  }

  const activeIntegrations = integrations.filter((integration) => integration.is_active);
  const sourceKey = stats?.lastSignalSource ?? '';
  const sourceMeta = SOURCE_META[sourceKey] ?? {
    icon: Radio,
    label: formatSourceLabel(sourceKey),
    color: 'text-cyan-400',
  };
  const SourceIcon = sourceMeta.icon;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-cyan-600/20 flex items-center justify-center">
            <Radio className="w-4.5 h-4.5 text-cyan-400" style={{ width: 18, height: 18 }} />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">Sources</h1>
        </div>
        <p className="text-zinc-500 text-sm ml-12">
          Connected inboxes and calendars. Foldera handles the reading in the background so your directive can stay simple.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-3 mb-8">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
          <p className="text-zinc-500 text-xs uppercase tracking-widest mb-2">Connected sources</p>
          <p className="text-zinc-50 text-3xl font-semibold tabular-nums">{activeIntegrations.length}</p>
          <p className="text-zinc-500 text-sm mt-2">Only active connections are shown here. Finished work still lives on the main dashboard.</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
          <p className="text-zinc-500 text-xs uppercase tracking-widest mb-2">Background sync</p>
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-zinc-800 flex items-center justify-center shrink-0">
              <SourceIcon className={`w-4 h-4 ${sourceMeta.color}`} />
            </div>
            <div>
              <p className="text-zinc-200 text-sm font-medium">
                {stats?.lastSignalAt ? `${sourceMeta.label} refreshed ${formatTimeAgo(stats.lastSignalAt)}` : 'No background sync yet'}
              </p>
              <p className="text-zinc-500 text-sm mt-1">
                {stats?.lastSignalAt ? 'Foldera is pulling context in the background for future directives.' : 'Connect a source in Settings to start building your background context.'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {activeIntegrations.length === 0 ? (
        <EmptyState />
      ) : (
        <SourcesOverview integrations={activeIntegrations} />
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-10 text-center">
      <div className="w-12 h-12 rounded-2xl bg-zinc-800 flex items-center justify-center mx-auto mb-5">
        <Radio className="w-5 h-5 text-zinc-600" />
      </div>
      <h3 className="text-zinc-200 font-semibold text-base mb-2">No sources connected yet</h3>
      <p className="text-zinc-500 text-sm max-w-sm mx-auto leading-relaxed mb-6">
        Foldera does its best work once it can read your inbox and calendar in the background. Connect a source, then come back to the dashboard for the finished directive.
      </p>
      <a
        href="/dashboard/settings"
        className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-black text-sm font-semibold transition-colors"
      >
        Open settings
      </a>
    </div>
  );
}

function SourcesOverview({ integrations }: { integrations: IntegrationStatus[] }) {
  return (
    <div className="space-y-3">
      <div className="bg-zinc-900/60 border border-zinc-800/60 rounded-2xl p-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <p className="text-zinc-300 text-sm font-medium">Active connections</p>
          <p className="text-zinc-500 text-xs">{integrations.length} active</p>
        </div>
        <div className="space-y-3">
          {integrations.map((integration) => {
            const meta = SOURCE_META[integration.provider] ?? {
              icon: Radio,
              label: formatSourceLabel(integration.provider),
              color: 'text-cyan-400',
            };
            const Icon = meta.icon;
            const syncStamp = integration.last_synced_at ?? integration.connected_at ?? null;

            return (
              <div key={integration.provider} className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-3">
                <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0">
                  <Icon className={`w-4 h-4 ${meta.color}`} />
                </div>
                <div className="min-w-0">
                  <p className="text-zinc-200 text-sm font-medium">{meta.label}</p>
                  <p className="text-zinc-500 text-sm">
                    {integration.sync_email || 'Connected'}
                    {syncStamp ? ` · updated ${formatTimeAgo(syncStamp)}` : ''}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
        <p className="text-zinc-300 text-sm font-medium mb-2">What this changes</p>
        <p className="text-zinc-500 text-sm leading-relaxed">
          Connected sources feed the engine in the background. Your actual decision point stays on the dashboard and in the morning email, where Foldera shows one directive with the finished artifact attached.
        </p>
      </div>
    </div>
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

function formatSourceLabel(value: string): string {
  return value
    .split('_')
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ');
}
