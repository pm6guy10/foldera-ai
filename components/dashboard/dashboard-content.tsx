'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import ConvictionCard from './conviction-card';
import type { SkipReason } from './conviction-card';
import type { ConvictionAction } from '@/lib/briefing/types';

interface GraphStats {
  signalsTotal:      number;
  commitmentsActive: number;
  patternsActive:    number;
  lastSignalAt:      string | null;
  lastSignalSource:  string | null;
}

interface EmailActionFeedback {
  tone: 'success' | 'error';
  text: string;
}

export default function DashboardContent() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [stats, setStats]               = useState<GraphStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [conviction, setConviction]     = useState<ConvictionAction | null>(null);
  const [convictionLoading, setConvictionLoading] = useState(true);
  const [emailActionMsg, setEmailActionMsg] = useState<EmailActionFeedback | null>(null);
  const [contextGreeting, setContextGreeting] = useState<string | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [convictionError, setConvictionError] = useState<string | null>(null);

  const showEmailActionFeedback = useCallback((tone: EmailActionFeedback['tone'], text: string) => {
    setEmailActionMsg({ tone, text });
    window.setTimeout(() => setEmailActionMsg(null), 4000);
  }, []);

  // Handle email deep-link: approve/skip → execute; outcome (worked/didnt_work) → conviction/outcome
  useEffect(() => {
    if (status !== 'authenticated') return;
    const params = new URLSearchParams(window.location.search);
    const action = params.get('action');
    const id     = params.get('id');
    const result = params.get('result');
    if (!action || !id) return;

    const cleanUrl = window.location.pathname;
    window.history.replaceState({}, '', cleanUrl);

    if (action === 'outcome' && (result === 'worked' || result === 'didnt_work')) {
      fetch('/api/conviction/outcome', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action_id: id, outcome: result }),
      })
        .then(res => {
          if (!res.ok) throw new Error('failed');
          return res.json();
        })
        .then(() => {
          showEmailActionFeedback('success', result === 'worked' ? "Recorded — it worked." : "Recorded — we'll adjust.");
        })
        .catch(() => {
          showEmailActionFeedback('error', "Couldn't record that — please try again.");
        });
      return;
    }

    if (action === 'approve' || action === 'skip') {
      fetch('/api/conviction/execute', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action_id: id, decision: action }),
      })
        .then(async (res) => {
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            throw new Error((data as { error?: string }).error ?? 'Could not update that action.');
          }
          return data;
        })
        .then(data => {
          if (data.status === 'executed' || data.status === 'skipped') {
            showEmailActionFeedback('success', action === 'approve' ? 'Done — Foldera executed that.' : 'Skipped. Foldera will adjust.');
            return;
          }
          throw new Error('Unexpected response from Foldera.');
        })
        .catch((error: unknown) => {
          showEmailActionFeedback(
            'error',
            error instanceof Error ? error.message : 'Could not update that action.',
          );
        });
    }
  }, [showEmailActionFeedback, status]);

  useEffect(() => {
    if (status === 'authenticated') {
      loadStats();
      loadLatestConviction();
    }
    if (status === 'unauthenticated') router.push('/start');
  }, [status]);

  const loadStats = async () => {
    setStatsLoading(true);
    setStatsError(null);
    try {
      const res = await fetch('/api/graph/stats');
      if (!res.ok) {
        throw new Error('Could not load dashboard stats right now.');
      }
      setStats(await res.json());
    } catch (error: unknown) {
      setStatsError(error instanceof Error ? error.message : 'Could not load dashboard stats right now.');
      setStats(null);
    } finally { setStatsLoading(false); }
  };

  const loadLatestConviction = async () => {
    setConvictionLoading(true);
    setConvictionError(null);
    try {
      const res = await fetch('/api/conviction/latest');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof (data as { error?: unknown }).error === 'string'
            ? ((data as { error: string }).error)
            : 'Could not load your latest read right now.',
        );
      }
      if (data.context_greeting) setContextGreeting(data.context_greeting);
      // Only set conviction if there's an actual action (has an id)
      setConviction(data.id ? data : null);
    } catch (error: unknown) {
      setConvictionError(error instanceof Error ? error.message : 'Could not load your latest read right now.');
      setConviction(null);
    } finally { setConvictionLoading(false); }
  };

  const generateDirective = useCallback(async () => {
    setConvictionLoading(true);
    setConviction(null);
    setConvictionError(null);
    try {
      const res = await fetch('/api/conviction/generate', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof (data as { error?: unknown }).error === 'string'
            ? ((data as { error: string }).error)
            : 'Could not generate a read right now.',
        );
      }
      setConviction(data);
    } catch (error: unknown) {
      setConvictionError(error instanceof Error ? error.message : 'Could not generate a read right now.');
    } finally { setConvictionLoading(false); }
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
        <div className={`px-5 py-3 rounded-xl border ${
          emailActionMsg.tone === 'success'
            ? 'bg-emerald-500/10 border-emerald-500/30'
            : 'bg-rose-500/10 border-rose-500/30'
        }`}>
          <p className={`text-sm ${
            emailActionMsg.tone === 'success' ? 'text-emerald-300' : 'text-rose-300'
          }`}>{emailActionMsg.text}</p>
        </div>
      )}
      {statsError && (
        <div className="px-5 py-3 rounded-xl border border-amber-500/30 bg-amber-500/10">
          <p className="text-sm text-amber-200">{statsError}</p>
        </div>
      )}
      {convictionError && (
        <div className="px-5 py-3 rounded-xl border border-rose-500/30 bg-rose-500/10">
          <p className="text-sm text-rose-300">{convictionError}</p>
        </div>
      )}

      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">{contextGreeting ?? 'Loading context...'}</h1>
          <p className="text-zinc-400 text-sm mt-1">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        </div>
        <button
          onClick={() => { loadStats(); loadLatestConviction(); }}
          disabled={statsLoading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${statsLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Signal line */}
      {!statsLoading && stats && (
        <div>
          <p className="text-zinc-500 text-xs font-mono">
            {stats.signalsTotal === 0 && stats.patternsActive === 0
              ? 'Foldera is building your identity graph. Your first read arrives tomorrow at 7am.'
              : `${stats.signalsTotal} signals · ${stats.commitmentsActive} commitments · ${stats.patternsActive} patterns detected`
            }
          </p>
          {stats.lastSignalAt && (
            <p className="text-zinc-600 text-xs font-mono mt-1">
              Last signal: {formatTimeAgo(stats.lastSignalAt)} from {stats.lastSignalSource ?? 'unknown'}
            </p>
          )}
        </div>
      )}

      {/* Hero: Today's Read — the ONE thing */}
      <ConvictionCard
        action={conviction}
        isLoading={convictionLoading}
        onGenerate={generateDirective}
        onApprove={handleApprove}
        onSkip={handleSkip}
        onOutcome={handleOutcome}
      />
    </div>
  );
}

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
