'use client';

import { useEffect, useState } from 'react';
import { Users, TrendingDown, Clock, Mail } from 'lucide-react';
import { SkeletonRelationshipsPage } from '@/components/ui/skeleton';

interface RelationshipData {
  coolingRelationships?: Array<{
    name: string;
    daysSinceContact: number;
    context?: string;
  }>;
}

export default function RelationshipsPage() {
  const [data, setData] = useState<RelationshipData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Try to fetch briefing data which may include relationship context
    fetch('/api/briefing/latest')
      .then(r => r.ok ? r.json() : null)
      .then(briefing => {
        if (briefing?.cooling_relationships) {
          setData({ coolingRelationships: briefing.cooling_relationships });
        } else {
          setData({});
        }
      })
      .catch(() => setData({}))
      .finally(() => setLoading(false));
  }, []);

  const cooling = data?.coolingRelationships ?? [];

  if (loading) return <SkeletonRelationshipsPage />;

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-cyan-600/20 flex items-center justify-center">
            <Users className="w-4.5 h-4.5 text-cyan-400" style={{ width: 18, height: 18 }} />
          </div>
          <h1 className="text-2xl font-bold text-zinc-50">Relationships</h1>
        </div>
        <p className="text-zinc-500 text-sm ml-12">
          Key people in your orbit. Foldera tracks who matters and flags when you go quiet.
        </p>
      </div>

      {cooling.length > 0 ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <TrendingDown className="w-4 h-4 text-amber-400" />
            <span className="text-sm text-zinc-400">Relationships cooling — you haven't been in touch recently</span>
          </div>
          {cooling.map((rel, i) => (
            <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center shrink-0">
                <span className="text-zinc-400 font-semibold text-sm">
                  {rel.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-zinc-200 font-medium text-sm">{rel.name}</p>
                {rel.context && (
                  <p className="text-zinc-500 text-xs mt-0.5 truncate">{rel.context}</p>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Clock className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-amber-400 text-xs font-mono">{rel.daysSinceContact}d</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState />
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="space-y-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-10 text-center">
        <div className="w-12 h-12 rounded-2xl bg-zinc-800 flex items-center justify-center mx-auto mb-5">
          <Users className="w-5 h-5 text-zinc-600" />
        </div>
        <h3 className="text-zinc-200 font-semibold text-base mb-2">Building your relationship map</h3>
        <p className="text-zinc-500 text-sm max-w-sm mx-auto leading-relaxed">
          Once Foldera reads your email history, it maps the key people in your orbit and flags relationships that are going quiet.
        </p>
      </div>

      {/* What will appear here */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[
          {
            icon: TrendingDown,
            color: 'text-amber-400',
            bg: 'bg-amber-500/10',
            title: 'Cooling relationships',
            desc: 'People you haven\'t contacted in 2+ weeks',
          },
          {
            icon: Mail,
            color: 'text-cyan-400',
            bg: 'bg-cyan-500/10',
            title: 'Pending replies',
            desc: 'Threads where someone is waiting on you',
          },
        ].map(({ icon: Icon, color, bg, title, desc }) => (
          <div key={title} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center mb-3`}>
              <Icon className={`w-4 h-4 ${color}`} />
            </div>
            <p className="text-zinc-200 text-sm font-medium mb-1">{title}</p>
            <p className="text-zinc-500 text-xs leading-relaxed">{desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
