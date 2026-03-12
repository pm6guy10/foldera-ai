'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Upload, RefreshCw, AlertCircle, Sparkles, Check as CheckIcon } from 'lucide-react';
import ConvictionCard from './conviction-card';
import type { SkipReason } from './conviction-card';
import DraftQueue from './draft-queue';
import type { ConvictionAction } from '@/lib/briefing/types';

interface GraphStats {
  signalsTotal:      number;
  commitmentsActive: number;
  patternsActive:    number;
}

export default function DashboardContent() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [stats, setStats]               = useState<GraphStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [conviction, setConviction]     = useState<ConvictionAction | null>(null);
  const [convictionLoading, setConvictionLoading] = useState(false);
  const [trialExpired, setTrialExpired] = useState(false);
  const [checkingOut, setCheckingOut]   = useState(false);
  const [emailActionMsg, setEmailActionMsg] = useState<string | null>(null);

  // Handle email deep-link: /dashboard?action=approve&id=XXX
  useEffect(() => {
    if (status !== 'authenticated') return;
    const params = new URLSearchParams(window.location.search);
    const action = params.get('action');
    const id     = params.get('id');
    if (!action || !id) return;

    // Clear the query string without triggering a re-render loop
    const cleanUrl = window.location.pathname;
    window.history.replaceState({}, '', cleanUrl);

    const endpoint = '/api/conviction/execute';
    const body     = { action_id: id, decision: action === 'approve' ? 'approve' : 'skip' };

    fetch(endpoint, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    })
      .then(res => res.json())
      .then(data => {
        if (data.status === 'executed' || data.status === 'skipped') {
          setEmailActionMsg(action === 'approve' ? 'Done — Foldera executed that.' : 'Skipped.');
          setTimeout(() => setEmailActionMsg(null), 4000);
        }
      })
      .catch(() => {});
  }, [status]);

  useEffect(() => {
    if (status === 'authenticated') {
      loadStats();
      loadLatestConviction();
      checkSubscription();
    }
    if (status === 'unauthenticated') router.push('/api/auth/signin');
  }, [status]);

  const checkSubscription = async () => {
    try {
      const res = await fetch('/api/subscription/status');
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'expired') setTrialExpired(true);
      }
    } catch { /* silent */ }
  };

  const handleUpgrade = async () => {
    setCheckingOut(true);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: 'pro' }),
      });
      const { url } = await res.json();
      if (url) window.location.href = url;
    } catch { /* ignore */ } finally { setCheckingOut(false); }
  };

  const loadStats = async () => {
    setStatsLoading(true);
    try {
      const res = await fetch('/api/graph/stats');
      if (res.ok) setStats(await res.json());
    } catch { /* silent */ } finally { setStatsLoading(false); }
  };

  const loadLatestConviction = async () => {
    try {
      const res = await fetch('/api/conviction/latest');
      if (res.status === 204) return;
      if (res.ok) setConviction(await res.json());
    } catch { /* silent */ }
  };

  const generateDirective = useCallback(async () => {
    setConvictionLoading(true);
    setConviction(null);
    try {
      const res = await fetch('/api/conviction/generate', { method: 'POST' });
      if (res.ok) setConviction(await res.json());
    } catch { /* silent */ } finally { setConvictionLoading(false); }
  }, []);

  const handleApprove = async (actionId: string) => {
    const res = await fetch('/api/conviction/execute', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action_id: actionId, decision: 'approve' }),
    });
    if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Execute failed'); }
    setConviction(prev => prev ? { ...prev, status: 'executed' } : prev);
  };

  const handleSkip = async (actionId: string, reason?: SkipReason) => {
    const payload: Record<string, string | undefined> = { action_id: actionId, decision: 'skip' };
    if (reason) payload.skip_reason = reason;

    const res = await fetch('/api/conviction/execute', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Skip failed'); }
    setConviction(prev => prev ? { ...prev, status: 'skipped' } : prev);
  };

  const handleOutcome = async (actionId: string, outcome: 'worked' | 'didnt_work') => {
    const res = await fetch('/api/conviction/outcome', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action_id: actionId, outcome }),
    });
    if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Could not save outcome'); }
  };

  return (
    <div className="space-y-6">
      {/* Email action confirmation banner */}
      {emailActionMsg && (
        <div className="px-5 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
          <p className="text-emerald-300 text-sm">{emailActionMsg}</p>
        </div>
      )}

      {/* Trial expired banner */}
      {trialExpired && (
        <div className="flex items-center justify-between gap-4 px-5 py-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <p className="text-amber-200 text-sm">Your trial ended. Keep getting daily reads for $99/month.</p>
          </div>
          <button
            onClick={handleUpgrade}
            disabled={checkingOut}
            className="shrink-0 px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-sm font-semibold transition-colors disabled:opacity-60"
          >
            {checkingOut ? 'Redirecting...' : 'Upgrade'}
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-zinc-50">{getGreeting()}</h1>
          <p className="text-zinc-400 text-sm mt-1">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
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
          label="Activity"
          fullLabel="Things Foldera has processed"
          value={statsLoading ? '—' : String(stats?.signalsTotal ?? 0)}
          emptyHint="Paste text to begin"
        />
        <MetricCard
          label="Commitments"
          fullLabel="Things you said you'd do"
          value={statsLoading ? '—' : String(stats?.commitmentsActive ?? 0)}
          highlight={!!stats?.commitmentsActive}
        />
        <MetricCard
          label="Noticed"
          fullLabel="Things Foldera noticed"
          value={statsLoading ? '—' : String(stats?.patternsActive ?? 0)}
          emptyHint="Appears after 1st ingest"
        />
      </div>

      {/* Current Priorities */}
      <CurrentPriorities />

      {/* Draft Queue */}
      <DraftQueue onDecided={loadStats} />

      {/* Quick Capture */}
      <QuickCapture />

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        <div className="col-span-1 lg:col-span-2">
          <ConvictionCard
            action={conviction}
            isLoading={convictionLoading}
            onGenerate={generateDirective}
            onApprove={handleApprove}
            onSkip={handleSkip}
            onOutcome={handleOutcome}
          />
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl">
          <div className="p-5 border-b border-zinc-800">
            <h2 className="text-zinc-50 font-semibold">Teach Foldera</h2>
            <p className="text-zinc-500 text-sm mt-0.5">Paste any conversation or notes</p>
          </div>
          <div className="p-5">
            <FeedPanel onIngested={loadStats} />
          </div>
        </div>
      </div>
    </div>
  );
}

function FeedPanel({ onIngested }: { onIngested: () => void }) {
  const [text, setText]     = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [result, setResult] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!text.trim()) return;
    setStatus('loading'); setResult(null);
    try {
      const res = await fetch('/api/extraction/ingest', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ingest failed');
      setResult(`Foldera read it — ${data.decisionsWritten} commitment${data.decisionsWritten !== 1 ? 's' : ''} recorded and ${data.patternsUpdated} new insight${data.patternsUpdated !== 1 ? 's' : ''} found.`);
      setStatus('done'); setText(''); onIngested();
    } catch (err: any) {
      // Show a friendly message — raw DB/server errors should never reach the user
      setResult('Something went wrong. Please try again in a moment.');
      setStatus('error');
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-zinc-500 text-xs leading-relaxed">
        Paste any conversation, email thread, or notes. Foldera will read it and update what it knows about your decisions and priorities.
      </p>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Paste text here — an email, a conversation, meeting notes..."
        rows={8}
        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 resize-none focus:outline-none focus:border-violet-500 transition-colors"
      />
      <button
        onClick={handleSubmit}
        disabled={!text.trim() || status === 'loading'}
        className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
      >
        <Upload className="w-4 h-4" />
        {status === 'loading' ? 'Reading...' : 'Learn from this'}
      </button>
      {result && (
        <p className={`text-xs font-mono ${status === 'error' ? 'text-red-400' : 'text-emerald-400'}`}>
          {result}
        </p>
      )}
    </div>
  );
}

function MetricCard({ label, fullLabel, value, highlight, emptyHint }: {
  label:     string;
  fullLabel?: string;
  value:     string;
  highlight?: boolean;
  emptyHint?: string;
}) {
  const isEmpty = value === '0';
  return (
    <div className={`p-2.5 sm:p-4 rounded-xl border ${highlight ? 'bg-violet-900/20 border-violet-700/40' : 'bg-zinc-900 border-zinc-800'}`}>
      <div className={`text-xl sm:text-2xl font-bold tabular-nums ${isEmpty ? 'text-zinc-600' : 'text-zinc-50'}`}>{value}</div>
      <div className="text-zinc-500 text-[10px] sm:text-xs mt-0.5 leading-tight">
        {isEmpty && emptyHint ? (
          <span className="text-zinc-600">{emptyHint}</span>
        ) : (
          <>
            <span className="sm:hidden">{label}</span>
            <span className="hidden sm:inline">{fullLabel ?? label}</span>
          </>
        )}
      </div>
    </div>
  );
}

function CurrentPriorities() {
  const [priorities, setPriorities] = useState<string[]>([]);
  const [editing, setEditing]       = useState(false);
  const [drafts, setDrafts]         = useState<string[]>(['', '', '']);
  const [saving, setSaving]         = useState(false);
  const [loaded, setLoaded]         = useState(false);

  // Load on mount
  useEffect(() => {
    fetch('/api/priorities/update')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.priorities) {
          const texts = data.priorities.map((p: any) => p.text);
          setPriorities(texts);
          setDrafts([texts[0] ?? '', texts[1] ?? '', texts[2] ?? '']);
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    const cleaned = drafts.filter(d => d.trim().length > 0).map(d => ({ text: d.trim() }));
    try {
      const res = await fetch('/api/priorities/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priorities: cleaned }),
      });
      if (res.ok) {
        setPriorities(cleaned.map(c => c.text));
        setEditing(false);
      }
    } catch { /* silent */ } finally { setSaving(false); }
  };

  if (!loaded) return null;

  // Compact display when not editing
  if (!editing) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-5 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="w-4 h-4 text-violet-400 shrink-0" />
            <span className="text-zinc-500 text-xs font-medium shrink-0">Right now:</span>
            {priorities.length === 0 ? (
              <span className="text-zinc-600 text-sm">Tell Foldera what matters most</span>
            ) : (
              <div className="flex items-center gap-2 min-w-0 overflow-hidden">
                {priorities.map((p, i) => (
                  <span key={i} className="text-zinc-200 text-sm truncate">
                    {i > 0 && <span className="text-zinc-700 mx-1">/</span>}{p}
                  </span>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={() => setEditing(true)}
            className="text-xs text-zinc-600 hover:text-zinc-300 transition-colors shrink-0 ml-3"
          >
            {priorities.length === 0 ? 'Set' : 'Edit'}
          </button>
        </div>
      </div>
    );
  }

  // Editing mode
  return (
    <div className="bg-zinc-900 border border-violet-700/40 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-4 h-4 text-violet-400" />
        <span className="text-zinc-200 text-sm font-semibold">What matters most right now?</span>
      </div>
      <div className="space-y-2 mb-3">
        {[0, 1, 2].map(i => (
          <input
            key={i}
            type="text"
            value={drafts[i]}
            onChange={e => {
              const next = [...drafts];
              next[i] = e.target.value;
              setDrafts(next);
            }}
            placeholder={i === 0 ? 'e.g. Land a WSDOT role' : i === 1 ? 'e.g. Save $2k by April' : 'e.g. Reconnect with Alex'}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500 transition-colors"
          />
        ))}
      </div>
      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
        >
          <CheckIcon className="w-3.5 h-3.5" />
          {saving ? 'Saving...' : 'Save'}
        </button>
        <button
          onClick={() => {
            setDrafts([priorities[0] ?? '', priorities[1] ?? '', priorities[2] ?? '']);
            setEditing(false);
          }}
          className="px-4 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-sm transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function QuickCapture() {
  const [text, setText]     = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'done'>('idle');

  const handleSubmit = async () => {
    if (!text.trim()) return;
    setStatus('sending');
    try {
      const res = await fetch('/api/extraction/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim() }),
      });
      if (res.ok) {
        setText('');
        setStatus('done');
        setTimeout(() => setStatus('idle'), 2000);
      } else {
        setStatus('idle');
      }
    } catch {
      setStatus('idle');
    }
  };

  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }}
        placeholder="Quick note — tell Foldera something it should remember"
        disabled={status === 'sending'}
        className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500 transition-colors disabled:opacity-50"
      />
      {status === 'done' ? (
        <span className="text-emerald-400 text-sm font-medium shrink-0 px-3">Got it.</span>
      ) : (
        <button
          onClick={handleSubmit}
          disabled={!text.trim() || status === 'sending'}
          className="shrink-0 px-4 py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium transition-colors disabled:opacity-40"
        >
          {status === 'sending' ? 'Saving...' : 'Save'}
        </button>
      )}
    </div>
  );
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}
