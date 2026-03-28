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
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Fixed header */}
      <header className="fixed top-0 left-0 right-0 z-10 bg-zinc-950/95 backdrop-blur border-b border-zinc-800 h-14">
        <div className="max-w-3xl mx-auto h-full flex items-center justify-between px-4">
          <span className="text-lg font-bold text-white">Foldera</span>
          <Link href="/dashboard/settings">
            <Settings className="w-5 h-5 text-zinc-500 hover:text-white transition-colors" />
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="pt-20 pb-10 px-4 max-w-3xl mx-auto">
        {/* Flash message (from deep-link errors, actions, or settings redirect) */}
        {flash && !done && (
          <div className="mb-6 px-4 py-3 rounded-xl bg-zinc-900 border border-zinc-800">
            <p className="text-sm text-zinc-300">{flash}</p>
          </div>
        )}
        {loading ? (
          <div className="animate-pulse space-y-4 mt-4">
            <div className="h-3 w-20 bg-zinc-800 rounded" />
            <div className="h-6 bg-zinc-800 rounded w-full" />
            <div className="h-6 bg-zinc-800 rounded w-4/5" />
            <div className="h-32 bg-zinc-800 rounded-xl mt-4" />
            <div className="flex gap-3 mt-4">
              <div className="h-12 bg-zinc-800 rounded-xl flex-1" />
              <div className="h-12 bg-zinc-800 rounded-xl flex-1" />
            </div>
          </div>
        ) : done ? (
          <div className="mt-20 text-center">
            {flash && <p className="text-white text-base mb-2">{flash}</p>}
            <p className="text-zinc-500 text-sm">Your next read arrives at 7am Pacific.</p>
          </div>
        ) : fetchError ? (
          <div className="mt-20 text-center">
            <p className="text-zinc-400">Something went wrong loading your dashboard.</p>
            <button
              onClick={load}
              className="mt-4 text-sm text-emerald-500 hover:text-emerald-400 transition-colors"
            >
              Try again
            </button>
          </div>
        ) : !action ? (
          <div className="mt-16 md:mt-20">
            <div className="mx-auto max-w-xl rounded-2xl border border-zinc-800 bg-zinc-900/60 px-6 py-8 text-center">
            {isNewAccount ? (
              <>
                <p className="text-zinc-300 text-lg font-medium">Foldera is building your model.</p>
                <p className="text-zinc-500 text-sm mt-3">It&apos;s reading your email and calendar. Your first directive arrives tomorrow at 7am Pacific.</p>
              </>
            ) : (
              <>
                <p className="text-zinc-300 text-lg font-medium">Nothing queued at high confidence.</p>
                <p className="text-zinc-500 text-sm mt-3">Your next read arrives at 7am Pacific.</p>
              </>
            )}
            </div>
          </div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 md:p-7">
            {/* Domain badge */}
            {action.domain && (
              <p className="text-xs uppercase tracking-wide text-emerald-500">
                {action.domain}
              </p>
            )}

            {/* Directive text */}
            <p className="text-xl md:text-2xl font-semibold text-white mt-3 leading-relaxed">
              {action.directive}
            </p>

            {/* Artifact */}
            {artifact && (
              <div className="mt-6">
                {isEmail && (
                  <div className="bg-zinc-800/80 rounded-xl p-4 md:p-5 border border-zinc-700/60">
                    {recipient && (
                      <p className="text-sm text-zinc-400 truncate">To: {recipient}</p>
                    )}
                    {artifact.subject && (
                      <p className="text-sm text-white mt-1 font-medium truncate">
                        Subject: {artifact.subject}
                      </p>
                    )}
                    {artifact.body && (
                      <p className="text-sm text-zinc-300 mt-3 whitespace-pre-wrap">
                        {artifact.body}
                      </p>
                    )}
                  </div>
                )}

                {isDecision && artifact.options && (
                  <div className="grid grid-cols-2 gap-3">
                    {artifact.options.slice(0, 2).map((opt, i) => (
                      <div key={i} className="bg-zinc-800 rounded-xl p-4">
                        <p className="text-sm font-medium text-white">{opt.option}</p>
                        <p className="text-xs text-zinc-400 mt-1">{opt.rationale}</p>
                      </div>
                    ))}
                  </div>
                )}

                {isWait && (
                  <div className="bg-zinc-800 rounded-xl p-4">
                    {artifact.context && (
                      <p className="text-sm text-zinc-300">Why wait: {artifact.context}</p>
                    )}
                    {(artifact.tripwires?.[0] || artifact.check_date) && (
                      <p className="text-sm text-emerald-400 mt-2">
                        Resume when: {artifact.tripwires?.[0] ?? artifact.check_date}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Action buttons */}
            <div className="mt-6 flex gap-3">
              <button
                onClick={handleApprove}
                disabled={executing}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 rounded-xl font-medium transition-colors"
              >
                {executing ? 'Working…' : 'Approve'}
              </button>
              <div className="flex-1 text-center">
                <button
                  onClick={handleSkip}
                  disabled={executing}
                  className="w-full bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-300 py-3 rounded-xl font-medium transition-colors"
                >
                  Skip
                </button>
                <p className="text-[10px] text-zinc-500 mt-1">Foldera learns from this</p>
              </div>
            </div>
          </div>
        )}

        {/* Footer — only when directive shown */}
        {!loading && !done && action && (
          <p className="text-xs text-zinc-600 text-center mt-8">Your next read arrives at 7am Pacific</p>
        )}

        {/* Your model — shown when signal data exists */}
        {!loading && !done && modelState && modelState.signal_count > 5 && (
          <div className="mt-10 border border-zinc-800 rounded-2xl p-5 md:p-6 bg-zinc-900/40">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-semibold tracking-widest text-emerald-500 uppercase">Your model</span>
              </div>
              <span className="text-xs text-zinc-600">
                {modelState.days_active}d · {modelState.signal_count.toLocaleString()} signals
              </span>
            </div>

            {/* Top people */}
            {modelState.top_entities.length > 0 && (
              <div className="mb-4">
                <p className="text-[11px] text-zinc-500 uppercase tracking-wide mb-2">People it&apos;s tracking</p>
                <div className="space-y-1.5">
                  {modelState.top_entities.slice(0, 3).map((entity, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <span className="text-sm text-zinc-300">{entity.name}</span>
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

            {/* Behavioral insights */}
            {modelState.behavioral_insights.length > 0 && (
              <div className="mb-4 bg-zinc-900 rounded-xl p-3">
                <p className="text-[11px] text-zinc-500 uppercase tracking-wide mb-2">What it inferred</p>
                {modelState.behavioral_insights.slice(0, 2).map((insight, i) => (
                  <p key={i} className="text-xs text-zinc-400 leading-relaxed">
                    ▸ {insight.label}
                  </p>
                ))}
              </div>
            )}

            {/* Learning stats */}
            <div className="flex items-center gap-4 text-xs text-zinc-600">
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
