'use client';

import { useEffect, useState } from 'react';
import { Radio, Mail, MessageSquare, Calendar, FileText, Loader2 } from 'lucide-react';

interface Signal {
  id: string;
  source: string;
  content_type: string;
  created_at: string;
  metadata?: Record<string, unknown>;
}

const SOURCE_META: Record<string, { icon: React.ElementType; label: string; color: string }> = {
  gmail:         { icon: Mail,          label: 'Gmail',        color: 'text-red-400'    },
  outlook:       { icon: Mail,          label: 'Outlook',      color: 'text-blue-400'   },
  conversation:  { icon: MessageSquare, label: 'Conversation', color: 'text-cyan-400'   },
  calendar:      { icon: Calendar,      label: 'Calendar',     color: 'text-emerald-400'},
  notion:        { icon: FileText,      label: 'Notion',       color: 'text-zinc-400'   },
  manual:        { icon: MessageSquare, label: 'Manual',       color: 'text-amber-400'  },
};

export default function SignalsPage() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    fetch('/api/graph/stats')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) setTotal(data.signalsTotal ?? 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
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

      {/* Stats strip */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        {[
          { label: 'Items processed', value: loading ? '—' : String(total) },
          { label: 'Sources connected', value: total > 0 ? '1' : '0' },
          { label: 'Updated', value: 'Tonight' },
        ].map((stat) => (
          <div key={stat.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className="text-xl font-bold text-zinc-50 tabular-nums">{stat.value}</div>
            <div className="text-zinc-500 text-xs mt-0.5">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Main content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-5 h-5 text-zinc-600 animate-spin" />
        </div>
      ) : total === 0 ? (
        <EmptyState />
      ) : (
        <ActivityList total={total} />
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

function ActivityList({ total }: { total: number }) {
  return (
    <div className="space-y-3">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <span className="text-xs font-mono text-zinc-600 uppercase tracking-widest">Recent sources</span>
        </div>
        <div className="space-y-4">
          {Object.entries(SOURCE_META).slice(0, 4).map(([key, meta]) => {
            const Icon = meta.icon;
            return (
              <div key={key} className="flex items-center gap-4">
                <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0">
                  <Icon className={`w-4 h-4 ${meta.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-300 text-sm font-medium">{meta.label}</span>
                  </div>
                  <div className="h-1.5 bg-zinc-800 rounded-full mt-2 overflow-hidden">
                    <div
                      className="h-full bg-cyan-500/60 rounded-full"
                      style={{ width: key === 'gmail' || key === 'outlook' ? '70%' : key === 'conversation' ? '45%' : '20%' }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-zinc-900/60 border border-zinc-800/60 rounded-2xl p-5 text-center">
        <p className="text-zinc-500 text-sm">
          <span className="text-zinc-300 font-medium">{total.toLocaleString()} items</span> processed and stored in your identity graph.
          Foldera reads new items nightly at 2 AM.
        </p>
      </div>
    </div>
  );
}
