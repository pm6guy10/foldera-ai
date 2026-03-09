'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Zap, Target, Upload, RefreshCw } from 'lucide-react';

interface CoSBrief {
  topInsight: string;
  confidence: number;
  recommendedAction: string;
  fullBrief: string;
  generatedAt: string;
  briefingDate: string;
  graphStats: {
    signalsTotal: number;
    commitmentsActive: number;
    patternsActive: number;
  };
}

export default function DashboardContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [brief, setBrief] = useState<CoSBrief | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (status === 'authenticated') fetchBrief();
    if (status === 'unauthenticated') router.push('/api/auth/signin');
  }, [status]);

  const fetchBrief = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/briefing/latest');
      if (res.ok) setBrief(await res.json());
    } catch {
      // silent — brief panel shows empty state
    } finally {
      setIsLoading(false);
    }
  };

  const stats = brief?.graphStats;
  const isEmpty = stats && stats.signalsTotal === 0 && stats.commitmentsActive === 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-zinc-50">{getGreeting()}</h1>
          <p className="text-zinc-400 text-sm mt-1">
            {brief?.briefingDate ?? new Date().toISOString().slice(0, 10)}
          </p>
        </div>
        <button
          onClick={fetchBrief}
          disabled={isLoading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          {isLoading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-3 gap-4">
        <MetricCard
          label="Signals ingested"
          value={isLoading ? '—' : String(stats?.signalsTotal ?? 0)}
        />
        <MetricCard
          label="Active commitments"
          value={isLoading ? '—' : String(stats?.commitmentsActive ?? 0)}
          highlight={!!stats?.commitmentsActive}
        />
        <MetricCard
          label="Patterns identified"
          value={isLoading ? '—' : String(stats?.patternsActive ?? 0)}
        />
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-3 gap-6">

        {/* Brief panel */}
        <div className="col-span-2 bg-zinc-900 border border-zinc-800 rounded-xl">
          <div className="p-5 border-b border-zinc-800">
            <h2 className="text-zinc-50 font-semibold">Today's Brief</h2>
            <p className="text-zinc-500 text-sm mt-0.5">
              {brief?.briefingDate ?? '—'}
            </p>
          </div>
          <div className="p-5 space-y-4">
            {isLoading ? (
              <div className="space-y-3 animate-pulse">
                <div className="h-4 bg-zinc-800 rounded w-3/4" />
                <div className="h-4 bg-zinc-800 rounded w-full" />
                <div className="h-4 bg-zinc-800 rounded w-2/3" />
              </div>
            ) : isEmpty ? (
              <EmptyState />
            ) : brief ? (
              <>
                {/* Top insight */}
                <div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Zap className="w-4 h-4 text-cyan-400" />
                    <span className="text-cyan-400 text-xs font-semibold uppercase tracking-wider">
                      Top Insight
                    </span>
                    <span className={`ml-auto text-xs font-mono px-1.5 py-0.5 rounded ${
                      brief.confidence >= 70
                        ? 'bg-emerald-900/50 text-emerald-400'
                        : brief.confidence >= 40
                        ? 'bg-amber-900/50 text-amber-400'
                        : 'bg-zinc-800 text-zinc-500'
                    }`}>
                      {brief.confidence}%
                    </span>
                  </div>
                  <p className="text-zinc-200 leading-relaxed">{brief.topInsight}</p>
                </div>

                {/* Recommended action */}
                <div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Target className="w-4 h-4 text-violet-400" />
                    <span className="text-violet-400 text-xs font-semibold uppercase tracking-wider">
                      Action
                    </span>
                  </div>
                  <p className="text-zinc-300 leading-relaxed">{brief.recommendedAction}</p>
                </div>
              </>
            ) : (
              <p className="text-zinc-500 text-sm">No brief available.</p>
            )}
          </div>
        </div>

        {/* Side panel — feed conversation */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl">
          <div className="p-5 border-b border-zinc-800">
            <h2 className="text-zinc-50 font-semibold">Feed the Graph</h2>
            <p className="text-zinc-500 text-sm mt-0.5">Upload a conversation export</p>
          </div>
          <div className="p-5">
            <FeedPanel onIngested={fetchBrief} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Feed Panel — minimal inline ingest UI
// ---------------------------------------------------------------------------

function FeedPanel({ onIngested }: { onIngested: () => void }) {
  const [text, setText] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [result, setResult] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!text.trim()) return;
    setStatus('loading');
    setResult(null);
    try {
      const res = await fetch('/api/extraction/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ingest failed');
      setResult(`✓ ${data.decisionsWritten} decisions · ${data.patternsUpdated} patterns`);
      setStatus('done');
      setText('');
      onIngested();
    } catch (err: any) {
      setResult(err.message);
      setStatus('error');
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-zinc-500 text-xs leading-relaxed">
        Paste a Claude conversation export. The extraction engine will pull decisions,
        patterns, and goals into your identity graph.
      </p>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Paste conversation text here..."
        rows={8}
        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 resize-none focus:outline-none focus:border-violet-500 transition-colors"
      />
      <button
        onClick={handleSubmit}
        disabled={!text.trim() || status === 'loading'}
        className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
      >
        <Upload className="w-4 h-4" />
        {status === 'loading' ? 'Processing...' : 'Ingest Conversation'}
      </button>
      {result && (
        <p className={`text-xs font-mono ${status === 'error' ? 'text-red-400' : 'text-emerald-400'}`}>
          {result}
        </p>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-8">
      <p className="text-zinc-400 mb-2">Your identity graph is empty.</p>
      <p className="text-zinc-500 text-sm">
        Paste a Claude conversation export in the panel on the right to get started.
      </p>
    </div>
  );
}

function MetricCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`p-4 rounded-xl border ${
        highlight
          ? 'bg-violet-900/20 border-violet-700/40'
          : 'bg-zinc-900 border-zinc-800'
      }`}
    >
      <div className="text-2xl font-bold text-zinc-50">{value}</div>
      <div className="text-zinc-500 text-xs mt-0.5">{label}</div>
    </div>
  );
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}
