'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Settings } from 'lucide-react';
import type { ConvictionAction } from '@/lib/briefing/types';

type ArtifactWithDraftedEmail = {
  type: string;
  to?: string;
  recipient?: string;
  subject?: string;
  body?: string;
  options?: Array<{ option: string; weight: number; rationale: string }>;
  recommendation?: string;
  context?: string;
  evidence?: string;
  tripwires?: string[];
  check_date?: string;
};

type ActionWithDomain = ConvictionAction & { domain?: string };

interface ModelEntity {
  name: string;
  total_interactions: number;
  days_since_contact: number | null;
}

interface ModelGoal {
  text: string;
  priority: number;
  category: string;
}

interface ModelInsight {
  label: string;
  category: string;
  signal_count: number;
  entity_name?: string;
}

interface ModelState {
  days_active: number;
  signal_count: number;
  signals_processed: number;
  top_entities: ModelEntity[];
  stated_goals: ModelGoal[];
  behavioral_insights: ModelInsight[];
  approval_stats: {
    total: number;
    approved: number;
    skipped: number;
    approval_rate: number | null;
  };
  avg_confidence_last_7d: number | null;
  avg_confidence_last_30d: number | null;
}

export default function DashboardPage() {
  const [action, setAction] = useState<ActionWithDomain | null>(null);
  const [modelState, setModelState] = useState<ModelState | null>(null);
  const [accountCreatedAt, setAccountCreatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [isNewAccount, setIsNewAccount] = useState(false);
  const [surfaceVisible, setSurfaceVisible] = useState(false);

  // Handle ?generated=true from settings run-brief success
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('generated') === 'true') {
      window.history.replaceState({}, '', window.location.pathname);
      setFlash('Brief generated and sent.');
      setTimeout(() => setFlash(null), 4000);
    }
  }, []);

  // Handle email deep-link params (approve/skip from morning email)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const deepAction = params.get('action');
    const id = params.get('id');
    if (!deepAction || !id) return;
    window.history.replaceState({}, '', window.location.pathname);
    if (deepAction === 'approve' || deepAction === 'skip') {
      fetch('/api/conviction/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action_id: id, decision: deepAction }),
      })
        .then(async (res) => {
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            const msg = (data as { error?: string }).error ?? 'Could not update that action.';
            throw new Error(msg);
          }
          if (data.status === 'executed' || data.status === 'skipped') {
            setDone(true);
            setFlash(
              deepAction === 'approve'
                ? 'Done. Foldera executed that.'
                : 'Skipped. Foldera will adjust.',
            );
          } else {
            throw new Error('Unexpected response from Foldera.');
          }
        })
        .catch((err: unknown) => {
          setFlash(err instanceof Error ? err.message : 'Could not update that action.');
          // Don't set done=true on error — the load() effect will populate
          // the dashboard so the user sees the current state, not a permanent error
        });
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setFetchError(false);
    try {
      const [convRes, modelRes] = await Promise.all([
        fetch('/api/conviction/latest'),
        fetch('/api/model/state'),
      ]);
      if (!convRes.ok) {
        setFetchError(true);
        setAction(null);
        return;
      }
      const data = await convRes.json().catch(() => ({}));
      const createdAt = typeof data?.account_created_at === 'string' ? data.account_created_at : null;
      setAccountCreatedAt(createdAt);
      setIsNewAccount(createdAt !== null && Date.now() - new Date(createdAt).getTime() < 24 * 60 * 60 * 1000);
      setAction(data?.id ? data : null);
      if (modelRes.ok) {
        const ms = await modelRes.json().catch(() => null);
        setModelState(ms ?? null);
      }
    } catch {
      setFetchError(true);
      setAccountCreatedAt(null);
      setAction(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Subtle surface reveal whenever a directive is present.
  useEffect(() => {
    if (!action || loading || done || fetchError) {
      setSurfaceVisible(false);
      return;
    }
    setSurfaceVisible(false);
    const raf = window.requestAnimationFrame(() => setSurfaceVisible(true));
    return () => window.cancelAnimationFrame(raf);
  }, [action, loading, done, fetchError]);

  const handleApprove = async () => {
    if (!action || executing) return;
    setExecuting(true);
    try {
      const res = await fetch('/api/conviction/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action_id: action.id, decision: 'approve' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Approve failed');
      setDone(true);
      setFlash('Done. Foldera executed that.');
    } catch (err: unknown) {
      setFlash(err instanceof Error ? err.message : 'Approve failed');
    } finally {
      setExecuting(false);
    }
  };

  const handleSkip = async () => {
    if (!action || executing) return;
    setExecuting(true);
    try {
      const res = await fetch('/api/conviction/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action_id: action.id, decision: 'skip' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Skip failed');
      setDone(true);
      setFlash('Skipped. Foldera will adjust.');
    } catch (err: unknown) {
      setFlash(err instanceof Error ? err.message : 'Skip failed');
    } finally {
      setExecuting(false);
    }
  };

  const artifact = action?.artifact as ArtifactWithDraftedEmail | null | undefined;
  const isEmail = artifact?.type === 'email' || artifact?.type === 'drafted_email';
  const isDecision = artifact?.type === 'decision_frame';
  const isWait = artifact?.type === 'wait_rationale';
  const recipient = artifact?.to || artifact?.recipient || '';

  return (
    <div className="min-h-screen bg-[#07070c] text-white selection:bg-cyan-500/30 selection:text-white">
      {/* Ambient grid */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,#000_20%,transparent_100%)]" />
      </div>

      {/* Fixed header */}
      <header className="fixed top-0 left-0 right-0 z-10 bg-[#07070c]/90 backdrop-blur-xl border-b border-white/5 h-14">
        <div className="max-w-2xl mx-auto h-full flex items-center justify-between px-4">
          <span className="text-base font-black tracking-tighter text-white uppercase">Foldera</span>
          <Link href="/dashboard/settings">
            <Settings className="w-5 h-5 text-zinc-500 hover:text-white transition-colors" />
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="relative z-10 pt-20 pb-14 px-4 max-w-2xl mx-auto">
        {/* Flash message */}
        {flash && !done && (
          <div className="mb-5 px-4 py-3 rounded-xl bg-zinc-950/80 border border-white/10 backdrop-blur-sm">
            <p className="text-sm text-zinc-300">{flash}</p>
          </div>
        )}

        {loading ? (
          <div className="animate-pulse space-y-4 mt-8 max-w-xl">
            <div className="h-2 w-24 bg-zinc-800 rounded" />
            <div className="h-7 bg-zinc-800/60 rounded-lg w-full" />
            <div className="h-7 bg-zinc-800/60 rounded-lg w-4/5" />
            <div className="h-40 bg-zinc-800/40 rounded-2xl mt-4" />
            <div className="flex gap-3 mt-4">
              <div className="h-14 bg-zinc-800/60 rounded-xl flex-1" />
              <div className="h-14 bg-zinc-800/40 rounded-xl w-28" />
            </div>
          </div>
        ) : done ? (
          <div className="mt-20 text-center">
            <div className="flex items-center justify-center mb-5">
              <div className="w-12 h-12 rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
                <span className="text-cyan-400 text-xl">✓</span>
              </div>
            </div>
            {flash && <p className="text-white text-base font-bold mb-3">{flash}</p>}
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Your next read arrives at 7am Pacific.</p>
          </div>
        ) : fetchError ? (
          <div className="mt-20 text-center">
            <p className="text-zinc-400 text-sm">Something went wrong loading your dashboard.</p>
            <button
              onClick={load}
              className="mt-4 text-[10px] font-black uppercase tracking-[0.15em] text-cyan-400 hover:text-cyan-300 transition-colors"
            >
              Try again
            </button>
          </div>
        ) : !action ? (
          <div className="mt-12">
            <div className="mx-auto max-w-xl rounded-2xl border border-white/10 bg-zinc-950/80 backdrop-blur-xl px-6 py-10 md:px-8 md:py-12 text-center shadow-[0_40px_80px_-20px_rgba(0,0,0,0.8)]">
              {isNewAccount ? (
                <>
                  <div className="flex items-center justify-center mb-6">
                    <div className="relative">
                      <div className="w-3 h-3 rounded-full bg-cyan-400" />
                      <div className="absolute inset-0 rounded-full bg-cyan-400 animate-ping opacity-40" />
                    </div>
                  </div>
                  <p className="text-white text-base font-black tracking-tight mb-2">Foldera is building your model.</p>
                  <p className="text-zinc-500 text-sm leading-relaxed mb-5">
                    It&apos;s reading your email and calendar now. Your first directive arrives tomorrow at 7am Pacific.
                  </p>
                  <Link
                    href="/dashboard/settings"
                    className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.15em] text-cyan-400 hover:text-cyan-300 transition-colors"
                  >
                    Check connection status
                    <Settings className="w-3 h-3" />
                  </Link>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-center mb-6">
                    <div className="relative">
                      <div className="w-2.5 h-2.5 rounded-full bg-cyan-400/60" />
                      <div className="absolute inset-0 rounded-full bg-cyan-400/40 animate-ping opacity-60" />
                    </div>
                  </div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Your next read arrives at 7am Pacific.</p>
                  <p className="text-zinc-600 text-xs mt-2 leading-relaxed">
                    Nothing queued at high confidence right now.
                  </p>
                  <Link
                    href="/dashboard/settings"
                    className="mt-5 inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.15em] text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    Generate now
                    <Settings className="w-3 h-3" />
                  </Link>
                </>
              )}
            </div>
          </div>
        ) : (
          <div
            className={`rounded-2xl bg-[#0a0a0f] border border-cyan-500/40 shadow-[0_40px_100px_-20px_rgba(0,0,0,1),_0_0_50px_rgba(6,182,212,0.12)] overflow-hidden transition-all duration-300 ease-out ${
              surfaceVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
            }`}
          >
            {/* Cyan top accent */}
            <div className="w-full h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent" />

            <div className="px-6 py-6 md:px-8 md:py-7 border-b border-white/10">
              {/* Domain badge */}
              {action.domain && (
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-400 mb-3">
                  {action.domain}
                </p>
              )}
              {/* Directive text */}
              <p className="text-xl md:text-2xl font-black text-white leading-tight tracking-tight">
                {action.directive}
              </p>
            </div>

            {/* Artifact */}
            {artifact && (
              <div className="px-6 py-5 md:px-8 md:py-6 bg-black/40">
                {isEmail && (
                  <div className="rounded-2xl bg-cyan-500/10 border border-cyan-500/30 p-4 md:p-5">
                    <p className="text-[10px] font-black uppercase tracking-widest text-cyan-400 mb-3">Drafted Reply</p>
                    {recipient && (
                      <p className="text-xs text-zinc-500 mb-1 truncate">To: {recipient}</p>
                    )}
                    {artifact.subject && (
                      <p className="text-sm text-zinc-300 font-medium mb-2 truncate">
                        Re: {artifact.subject}
                      </p>
                    )}
                    {artifact.body && (
                      <p className="text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap line-clamp-6">
                        {artifact.body}
                      </p>
                    )}
                  </div>
                )}

                {isDecision && artifact.options && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-cyan-400 mb-3">Decision Frame</p>
                    <div className="grid grid-cols-1 gap-3">
                      {artifact.options.slice(0, 2).map((opt, i) => (
                        <div key={i} className="rounded-xl bg-zinc-950/60 border border-white/10 p-4">
                          <p className="text-sm font-bold text-white">{opt.option}</p>
                          <p className="text-xs text-zinc-400 mt-1 leading-relaxed">{opt.rationale}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {isWait && (
                  <div className="rounded-2xl bg-zinc-950/60 border border-white/10 p-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2">Context</p>
                    {artifact.context && (
                      <p className="text-sm text-zinc-300 leading-relaxed">{artifact.context}</p>
                    )}
                    {(artifact.tripwires?.[0] || artifact.check_date) && (
                      <p className="text-xs text-cyan-400 mt-3 font-black uppercase tracking-[0.1em]">
                        Resume when: {artifact.tripwires?.[0] ?? artifact.check_date}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Action buttons */}
            <div className="p-4 flex gap-3 bg-white/[0.02] border-t border-white/10">
              <button
                onClick={handleApprove}
                disabled={executing}
                className="flex-1 bg-cyan-500 text-black py-3.5 rounded-xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(6,182,212,0.22)] hover:bg-cyan-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {executing ? (
                  <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                ) : (
                  'Approve'
                )}
              </button>
              <button
                onClick={handleSkip}
                disabled={executing}
                className="px-6 bg-zinc-900 border border-white/20 text-zinc-400 py-3.5 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-zinc-800 hover:text-zinc-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Skip
              </button>
            </div>
          </div>
        )}

        {/* Your model — shown when signal data exists */}
        {!loading && !done && modelState && modelState.signal_count > 5 && (
          <div className="mt-6 rounded-2xl border border-white/10 bg-zinc-950/80 backdrop-blur-xl p-5 md:p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Your model</span>
              </div>
              <span className="text-[10px] font-black uppercase tracking-[0.15em] text-zinc-600">
                {modelState.days_active}d · {modelState.signal_count.toLocaleString()} signals
              </span>
            </div>

            {modelState.top_entities.length > 0 && (
              <div className="mb-4">
                <p className="text-[10px] font-black uppercase tracking-[0.15em] text-zinc-600 mb-2">People it&apos;s tracking</p>
                <div className="space-y-2">
                  {modelState.top_entities.slice(0, 3).map((entity, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <span className="text-sm text-zinc-300 font-medium">{entity.name}</span>
                      <span className="text-xs text-zinc-600">
                        {entity.days_since_contact !== null
                          ? entity.days_since_contact === 0
                            ? 'today'
                            : `${entity.days_since_contact}d ago`
                          : `${entity.total_interactions} interactions`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {modelState.behavioral_insights.length > 0 && (
              <div className="mb-4 rounded-xl bg-zinc-950/60 border border-white/5 p-3">
                <p className="text-[10px] font-black uppercase tracking-[0.15em] text-zinc-600 mb-2">What it inferred</p>
                {modelState.behavioral_insights.slice(0, 2).map((insight, i) => (
                  <p key={i} className="text-xs text-zinc-400 leading-relaxed">
                    › {insight.label}
                  </p>
                ))}
              </div>
            )}

            <div className="flex items-center gap-4 text-[10px] font-black uppercase tracking-[0.1em] text-zinc-700">
              {modelState.approval_stats.approval_rate !== null && (
                <span>Approve rate: {modelState.approval_stats.approval_rate}%</span>
              )}
              {modelState.avg_confidence_last_7d !== null && modelState.avg_confidence_last_30d !== null && (
                <span>
                  Conviction: {modelState.avg_confidence_last_30d} → {modelState.avg_confidence_last_7d}
                </span>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
