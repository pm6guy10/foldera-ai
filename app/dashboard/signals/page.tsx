'use client';

import { useEffect, useState } from 'react';
import { Radio, Mail, MessageSquare, Calendar, FileText } from 'lucide-react';
import { SkeletonSignalsPage } from '@/components/ui/skeleton';

interface GraphStats {
  signalsTotal: number;
  commitmentsActive: number;
  patternsActive: number;
  lastSignalAt: string | null;
  lastSignalSource: string | null;
}

interface IntegrationStatus {
  provider: string;
  is_active: boolean;
  sync_email?: string | null;
  last_synced_at?: string | null;
}

const SOURCE_META: Record<string, { icon: React.ElementType; label: string; color: string }> = {
  gmail:            { icon: Mail,          label: 'Gmail',             color: 'text-red-400' },
  google:           { icon: Mail,          label: 'Google',            color: 'text-red-400' },
  google_calendar:  { icon: Calendar,      label: 'Google Calendar',   color: 'text-emerald-400' },
  outlook:          { icon: Mail,          label: 'Outlook',           color: 'text-blue-400' },
  azure_ad:         { icon: Mail,          label: 'Microsoft',         color: 'text-blue-400' },
  outlook_calendar: { icon: Calendar,      label: 'Outlook Calendar',  color: 'text-emerald-400' },
  onedrive:         { icon: FileText,      label: 'OneDrive',          color: 'text-blue-300' },
  microsoft_todo:   { icon: MessageSquare, label: 'Microsoft To Do',   color: 'text-cyan-400' },
  conversation:     { icon: MessageSquare, label: 'Conversation',      color: 'text-cyan-400' },
  manual:           { icon: MessageSquare, label: 'Manual',            color: 'text-amber-400' },
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
  const totalSignals = stats?.signalsTotal ?? 0;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-cyan-600/20 flex items-center justify-center">
            <Radio className="w-4.5 h-4.5 text-cyan-400" style={{ width: 18, height: 18 }} />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">Activity</h1>
        </div>
        <p className="text-zinc-500 text-sm ml-12">
          Everything Foldera has read and processed from your connected sources.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-8">
        {[
          { label: 'Items processed', value: String(totalSignals) },
          { label: 'Sources connected', value: String(activeIntegrations.length) },
          { label: 'Updated', value: stats?.lastSignalAt ? formatTimeAgo(stats.lastSignalAt) : 'No signals' },
        ].map((stat) => (
          <div key={stat.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className="text-xl font-bold text-zinc-50 tabular-nums">{stat.value}</div>
            <div className="text-zinc-500 text-xs mt-0.5">{stat.label}</div>
          </div>
        ))}
      </div>

      {totalSignals === 0 ? (
        <EmptyState />
      ) : (
        <ActivityOverview
          stats={stats}
          integrations={activeIntegrations}
        />
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
      <h3 className="text-zinc-200 font-semibold text-base mb-2">No activity yet</h3>
      <p className="text-zinc-500 text-sm max-w-sm mx-auto leading-relaxed mb-6">
        Once Foldera starts reading your inbox and calendar, every processed item appears here. Connect your inbox to get started.
      </p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        {[
          { icon: Mail, label: 'Gmail processed', color: 'text-red-400' },
          { icon: Calendar, label: 'Calendar read', color: 'text-emerald-400' },
          { icon: MessageSquare, label: 'Conversations analyzed', color: 'text-cyan-400' },
        ].map(({ icon: Icon, label, color }) => (
          <div key={label} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-800 text-sm text-zinc-400">
            <Icon className={`w-4 h-4 ${color}`} />
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}

function ActivityOverview({
  stats,
  integrations,
}: {
  stats: GraphStats | null;
  integrations: IntegrationStatus[];
}) {
  const sourceKey = stats?.lastSignalSource ?? '';
  const sourceMeta = SOURCE_META[sourceKey] ?? {
    icon: Radio,
    label: formatSourceLabel(sourceKey),
    color: 'text-cyan-400',
  };
  const SourceIcon = sourceMeta.icon;

  return (
    <div className="space-y-3">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-6">
        <div>
          <span className="text-xs font-mono text-zinc-600 uppercase tracking-widest">Latest signal</span>
        </div>

        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center shrink-0">
            <SourceIcon className={`w-4 h-4 ${sourceMeta.color}`} />
          </div>
          <div className="min-w-0">
            <p className="text-zinc-200 text-sm font-medium">
              {sourceMeta.label}
            </p>
            <p className="text-zinc-500 text-sm">
              {stats?.lastSignalAt ? `Processed ${formatTimeAgo(stats.lastSignalAt)}` : 'No signal timestamp available'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
            <p className="text-zinc-500 text-xs uppercase tracking-widest mb-2">Commitments</p>
            <p className="text-zinc-200 text-lg font-semibold">{stats?.commitmentsActive ?? 0}</p>
            <p className="text-zinc-500 text-sm mt-1">Active commitments currently tracked.</p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
            <p className="text-zinc-500 text-xs uppercase tracking-widest mb-2">Patterns</p>
            <p className="text-zinc-200 text-lg font-semibold">{stats?.patternsActive ?? 0}</p>
            <p className="text-zinc-500 text-sm mt-1">Behavioral patterns currently active in your graph.</p>
          </div>
        </div>
      </div>

      <div className="bg-zinc-900/60 border border-zinc-800/60 rounded-2xl p-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <p className="text-zinc-300 text-sm font-medium">Connected sources</p>
          <p className="text-zinc-500 text-xs">{integrations.length} active</p>
        </div>
        {integrations.length > 0 ? (
          <div className="space-y-3">
            {integrations.map((integration) => {
              const meta = SOURCE_META[integration.provider] ?? {
                icon: Radio,
                label: formatSourceLabel(integration.provider),
                color: 'text-cyan-400',
              };
              const Icon = meta.icon;

              return (
                <div key={integration.provider} className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-3">
                  <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0">
                    <Icon className={`w-4 h-4 ${meta.color}`} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-zinc-200 text-sm font-medium">{meta.label}</p>
                    <p className="text-zinc-500 text-sm">
                      {integration.sync_email || 'Connected'}
                      {integration.last_synced_at ? ` · synced ${formatTimeAgo(integration.last_synced_at)}` : ''}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-zinc-500 text-sm">No connected sources reported yet.</p>
        )}
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
