'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Upload, RefreshCw } from 'lucide-react';
import ConvictionCard from './conviction-card';
import type { ConvictionAction } from '@/lib/briefing/types';

// ---------------------------------------------------------------------------
// Graph stats from /api/graph/stats
// ---------------------------------------------------------------------------

interface GraphStats {
  signalsTotal: number;
  commitmentsActive: number;
  patternsActive: number;
}

// ---------------------------------------------------------------------------
// Main dashboard
// ---------------------------------------------------------------------------

export default function DashboardContent() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [stats, setStats] = useState<GraphStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const [conviction, setConviction] = useState<ConvictionAction | null>(null);
  const [convictionLoading, setConvictionLoading] = useState(false);

  useEffect(() => {
    if (status === 'authenticated') {
      loadStats();
      loadLatestConviction();
    }
    if (status === 'unauthenticated') router.push('/api/auth/signin');
  }, [status]);

  // -- Stats: pure DB counts, no Claude call --
  const loadStats = async () => {
    setStatsLoading(true);
    try {
      const res = await fetch('/api/graph/stats');
      if (res.ok) setStats(await res.json());
    } catch {
      // silent
    } finally {
      setStatsLoading(false);
    }
  };

  // -- Load most recent pending directive (auto-populates card on mount) --
  const loadLatestConviction = async () => {
    try {
      const res = await fetch('/api/conviction/latest');
      if (res.status === 204) return; // no actions yet — leave card in empty state
      if (res.ok) setConviction(await res.json());
    } catch {
      // silent
    }
  };

  // -- Generate a fresh directive --
  const generateDirective = useCallback(async () => {
    setConvictionLoading(true);
    setConviction(null);
    try {
      const res = await fetch('/api/conviction/generate', { method: 'POST' });
      if (res.ok) setConviction(await res.json());
    } catch {
      // silent
    } finally {
      setConvictionLoading(false);
    }
  }, []);

  const handleApprove = async (actionId: string) => {
    const res = await fetch('/api/conviction/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action_id: actionId, decision: 'approve' }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Execute failed');
    }
    setConviction(prev => prev ? { ...prev, status: 'executed' } : prev);
  };

  const handleSkip = async (actionId: string) => {
    const res = await fetch('/api/conviction/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action_id: actionId, decision: 'skip' }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Skip failed');
    }
    setConviction(prev => prev ? { ...prev, status: 'skipped' } : prev);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-zinc-50">{getGreeting()}</h1>
          <p className="text-zinc-400 text-sm mt-1">{new Date().toISOString().slice(0, 10)}</p>
        </div>
        <button
          onClick={loadStats}
          disabled={statsLoading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${statsLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <MetricCard
          label="Signals"
          fullLabel="Signals ingested"
          value={statsLoading ? '—' : String(stats?.signalsTotal ?? 0)}
        />
        <MetricCard
          label="Commitments"
          fullLabel="Active commitments"
          value={statsLoading ? '—' : String(stats?.commitmentsActive ?? 0)}
          highlight={!!stats?.commitmentsActive}
        />
        <MetricCard
          label="Patterns"
          fullLabel="Patterns identified"
          value={statsLoading ? '—' : String(stats?.patternsActive ?? 0)}
        />
      </div>

      {/* Main grid — stacked on mobile, 3-col on lg */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">

        {/* CONVICTION CARD — front and center, full 2/3 width on desktop */}
        <div className="col-span-1 lg:col-span-2">
          <ConvictionCard
            action={conviction}
            isLoading={convictionLoading}
            onGenerate={generateDirective}
            onApprove={handleApprove}
            onSkip={handleSkip}
          />
        </div>

        {/* Side panel — feed the graph */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl">
          <div className="p-5 border-b border-zinc-800">
            <h2 className="text-zinc-50 font-semibold">Feed the Graph</h2>
            <p className="text-zinc-500 text-sm mt-0.5">Upload a conversation export</p>
          </div>
          <div className="p-5">
            <FeedPanel onIngested={loadStats} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Feed Panel
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function MetricCard({
  label,
  fullLabel,
  value,
  highlight,
}: {
  label: string;
  fullLabel?: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`p-2.5 sm:p-4 rounded-xl border ${
        highlight
          ? 'bg-violet-900/20 border-violet-700/40'
          : 'bg-zinc-900 border-zinc-800'
      }`}
    >
      <div className="text-xl sm:text-2xl font-bold text-zinc-50 tabular-nums">{value}</div>
      {/* Short label on small screens, full label on sm+ */}
      <div className="text-zinc-500 text-[10px] sm:text-xs mt-0.5 leading-tight">
        <span className="sm:hidden">{label}</span>
        <span className="hidden sm:inline">{fullLabel ?? label}</span>
      </div>
    </div>
  );
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}
