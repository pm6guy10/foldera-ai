'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { FolderaMark } from '@/components/nav/FolderaMark';
import { signOut, useSession } from 'next-auth/react';
import { Settings, Lock, LogOut } from 'lucide-react';
import type { ConvictionAction } from '@/lib/briefing/types';
import { OWNER_USER_ID } from '@/lib/auth/constants';
import { AgentSystemPanel } from '@/components/dashboard/AgentSystemPanel';

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

type ActionWithDomain = ConvictionAction & { domain?: string; generatedAt?: string };

export default function DashboardPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const { data: session, status } = useSession();
  const isOwner =
    mounted &&
    status === 'authenticated' &&
    session?.user?.id === OWNER_USER_ID;
  const [mainTab, setMainTab] = useState<'directive' | 'system'>('directive');
  const [action, setAction] = useState<ActionWithDomain | null>(null);
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subPlan, setSubPlan] = useState<string | null>(null);
  const [subStatus, setSubStatus] = useState<string | null>(null);
  const [lastDecision, setLastDecision] = useState<'approve' | 'skip' | null>(null);

  // Handle ?generated=true from settings run-brief success
  // Handle ?upgraded=true from Stripe checkout success
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('generated') === 'true') {
      window.history.replaceState({}, '', window.location.pathname);
      setFlash('Brief generated and sent.');
      setTimeout(() => setFlash(null), 4000);
    }
    if (params.get('upgraded') === 'true') {
      window.history.replaceState({}, '', window.location.pathname);
      setIsSubscribed(true);
      setFlash('Welcome to Pro. Full artifacts unlocked.');
      setTimeout(() => setFlash(null), 6000);
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
            setLastDecision(deepAction === 'approve' ? 'approve' : 'skip');
            setFlash(
              deepAction === 'approve'
                ? 'Sent. Check your outbox.'
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

  // After OAuth from /start?plan=pro, send user to Stripe Checkout once.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (sessionStorage.getItem('foldera_pending_checkout') !== 'pro') return;
    sessionStorage.removeItem('foldera_pending_checkout');
    void (async () => {
      try {
        const res = await fetch('/api/stripe/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        const data = await res.json().catch(() => ({}));
        if (data.url) window.location.href = data.url as string;
      } catch {
        /* user stays on dashboard */
      }
    })();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setFetchError(false);
    try {
      const [convRes, subRes] = await Promise.all([
        fetch('/api/conviction/latest'),
        fetch('/api/subscription/status'),
      ]);

      if (subRes.ok) {
        const sub = await subRes.json().catch(() => ({}));
        setSubPlan(typeof sub.plan === 'string' ? sub.plan : null);
        setSubStatus(typeof sub.status === 'string' ? sub.status : null);
      } else {
        setSubPlan(null);
        setSubStatus(null);
      }

      if (!convRes.ok) {
        setFetchError(true);
        setAction(null);
        return;
      }
      const data = await convRes.json().catch(() => ({}));
      setIsSubscribed(data?.is_subscribed === true);
      setAction(data?.id ? data : null);
    } catch {
      setFetchError(true);
      setAction(null);
      setSubPlan(null);
      setSubStatus(null);
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
      if (data.status === 'executed' || data.status === 'skipped') {
        setDone(true);
        setLastDecision('approve');
        setFlash('Sent. Check your outbox.');
      } else {
        throw new Error('Unexpected response from Foldera.');
      }
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
      if (data.status === 'executed' || data.status === 'skipped') {
        setDone(true);
        setLastDecision('skip');
        setFlash('Skipped. Foldera will adjust.');
      } else {
        throw new Error('Unexpected response from Foldera.');
      }
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

  const isProArtifactUnlocked =
    subPlan === 'pro' && (subStatus === 'active' || subStatus === 'past_due');
  const showArtifactBlur = Boolean(artifact) && !isProArtifactUnlocked;

  async function startStripeCheckout() {
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (data.url) window.location.href = data.url as string;
      else window.location.href = '/pricing';
    } catch {
      window.location.href = '/pricing';
    }
  }

  return (
    <div className="min-h-screen bg-[#07070c] text-white selection:bg-cyan-500/30 selection:text-white">
      {/* Ambient grid */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,#000_20%,transparent_100%)]" />
      </div>

      {/* Fixed header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#07070c]/90 backdrop-blur-xl border-b border-white/5 h-14">
        <div className="max-w-2xl mx-auto h-full flex items-center justify-between px-4 gap-2">
          <Link href="/dashboard" className="flex items-center gap-2.5 group min-w-0">
            <FolderaMark
              size="sm"
              className="shadow-[0_0_20px_rgba(255,255,255,0.15)] transition-transform group-hover:scale-105 shrink-0"
            />
            <span className="text-sm font-black tracking-tighter text-white uppercase truncate">Foldera</span>
          </Link>
          <div className="flex items-center gap-1 shrink-0">
            <Link href="/dashboard/settings" className="p-2 rounded-lg text-zinc-500 hover:text-white hover:bg-white/5 transition-colors flex items-center" aria-label="Settings">
              <Settings className="w-5 h-5" />
            </Link>
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: '/' })}
              className="p-2 rounded-lg text-zinc-500 hover:text-white hover:bg-white/5 transition-colors flex items-center"
              aria-label="Sign out"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main id="main" className="relative z-10 pt-20 pb-14 px-4 max-w-2xl mx-auto">
        {isOwner && (
          <div className="flex gap-1 p-1 rounded-xl bg-zinc-900/80 border border-white/10 mb-6 max-w-md">
            <button
              type="button"
              onClick={() => setMainTab('directive')}
              className={`flex-1 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors ${
                mainTab === 'directive' ? 'bg-cyan-500/20 text-cyan-300' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Directive
            </button>
            <button
              type="button"
              onClick={() => setMainTab('system')}
              className={`flex-1 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors ${
                mainTab === 'system' ? 'bg-emerald-500/20 text-emerald-300' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              System
            </button>
          </div>
        )}

        {isOwner && mainTab === 'system' ? (
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400 mb-1">Autonomous agents</p>
            <h1 className="text-xl font-bold text-white">Draft queue</h1>
            <p className="text-sm text-zinc-500 mt-1">
              Agent outputs stay out of your morning email. Approve to file artifacts, or skip to train the agent.
            </p>
            <AgentSystemPanel />
          </div>
        ) : null}

        {(!isOwner || mainTab === 'directive') && (
          <>
        {/* Flash message */}
        {flash && !done && (
          <div
            role="status"
            className="mb-5 px-4 py-3.5 rounded-xl bg-zinc-950/90 border border-cyan-500/25 backdrop-blur-md shadow-[0_12px_40px_-12px_rgba(0,0,0,0.8)]"
          >
            <p className="text-sm text-zinc-200 font-medium">{flash}</p>
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
              {lastDecision === 'skip' ? (
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-40" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-400" />
                </span>
              ) : (
                <div className="w-12 h-12 rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
                  <span className="text-cyan-400 text-xl">✓</span>
                </div>
              )}
            </div>
            {flash && <p className="text-white text-base font-bold mb-3">{flash}</p>}
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Your next read arrives tomorrow morning.</p>
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
            <div className="mx-auto max-w-lg rounded-2xl border border-white/10 bg-zinc-950/80 backdrop-blur-xl p-10 text-center shadow-[0_40px_80px_-20px_rgba(0,0,0,0.8)]">
              <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse mx-auto mb-6" />
              <p className="text-zinc-200 text-lg font-medium">Your next read arrives tomorrow morning.</p>
              <p className="text-zinc-500 text-sm mt-2">Foldera is learning from your patterns.</p>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl bg-[#0a0a0f] border border-cyan-500/20 shadow-[0_40px_100px_-20px_rgba(0,0,0,1),_0_0_50px_rgba(6,182,212,0.15)] overflow-hidden transition-all duration-300 ease-out">
            {/* Cyan top accent */}
            <div className="w-full h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent" />

            <div className="px-6 py-6 md:px-8 md:py-7 border-b border-white/10">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-400 mb-2">
                Today&apos;s directive
              </p>
              {action.generatedAt && (
                <p className="text-zinc-600 text-xs mb-3">
                  Generated{' '}
                  {new Date(action.generatedAt).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                    timeZone: 'America/Los_Angeles',
                  })}{' '}
                  Pacific
                </p>
              )}
              <div className="border-l-4 border-cyan-500 pl-4">
                <p className="text-xl font-bold text-white leading-tight">{action.directive}</p>
              </div>
            </div>

            {/* Artifact — free users see full layout under a blur overlay (conversion) */}
            {artifact && (
              <div className="px-6 py-5 md:px-8 md:py-6 bg-black/40">
                <div className="relative min-h-[120px] rounded-2xl overflow-hidden border border-white/10">
                  <div className={showArtifactBlur ? 'pointer-events-none select-none' : ''}>
                    {isEmail && (
                      <div className="rounded-2xl bg-cyan-500/10 border border-cyan-500/30 border-l-4 border-l-cyan-500 p-4 md:p-5">
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
                          <p
                            className={`text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap ${
                              showArtifactBlur ? '' : 'line-clamp-6'
                            }`}
                          >
                            {artifact.body}
                          </p>
                        )}
                      </div>
                    )}

                    {isDecision && artifact.options && (
                      <div className="space-y-2 p-4 md:p-5">
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
                      <div className="rounded-2xl bg-zinc-950/60 border border-white/10 p-4 m-4 md:m-5">
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

                  {showArtifactBlur && (
                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-black/45 px-5 py-8 text-center backdrop-blur-md">
                      <Lock className="w-5 h-5 text-cyan-400 shrink-0" aria-hidden="true" />
                      <p className="text-sm font-semibold text-zinc-100 leading-snug max-w-xs">
                        Upgrade to Pro to unlock finished work. $29/mo.
                      </p>
                      <button
                        type="button"
                        onClick={startStripeCheckout}
                        className="rounded-xl bg-white px-6 py-3.5 text-xs font-black uppercase tracking-[0.15em] text-black shadow-[0_0_30px_rgba(255,255,255,0.15)] transition-transform hover:bg-zinc-200 hover:scale-[1.02] active:scale-95"
                      >
                        Upgrade to Pro
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div className="p-4 flex gap-3 bg-white/[0.02] border-t border-white/10">
              <button
                onClick={handleApprove}
                disabled={executing}
                className="flex-1 min-h-[56px] bg-cyan-500 text-black py-3.5 rounded-xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(6,182,212,0.22)] hover:bg-cyan-400 transition-all duration-150 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#07070c]"
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
                className="px-6 min-h-[56px] bg-zinc-900 border border-white/20 text-zinc-400 py-3.5 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-zinc-800 hover:text-zinc-300 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 min-w-[5.5rem] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#07070c]"
              >
                {executing ? (
                  <span className="w-4 h-4 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
                ) : (
                  'Skip'
                )}
              </button>
            </div>
          </div>
        )}
          </>
        )}

      </main>
    </div>
  );
}
