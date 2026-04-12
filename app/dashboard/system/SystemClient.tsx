'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { ChevronLeft } from 'lucide-react';
import { FolderaMark } from '@/components/nav/FolderaMark';
import { OWNER_USER_ID } from '@/lib/auth/constants';
import { AgentSystemPanel } from '@/components/dashboard/AgentSystemPanel';

/**
 * Owner-only surface: pipeline runs, agent toggle, system draft queue.
 * Normal users are redirected to /dashboard.
 */
export default function SystemClient() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  const [generateState, setGenerateState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [generateMessage, setGenerateMessage] = useState<string | null>(null);
  const [paidGenerateState, setPaidGenerateState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [paidGenerateMessage, setPaidGenerateMessage] = useState<string | null>(null);
  const lastPipelineRunRef = useRef<number>(0);

  const [agentsEnabled, setAgentsEnabled] = useState<boolean | null>(null);
  const [agentsSaving, setAgentsSaving] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isOwner =
    mounted && status === 'authenticated' && session?.user?.id === OWNER_USER_ID;

  useEffect(() => {
    if (!mounted || status === 'loading') return;
    if (status !== 'authenticated' || session?.user?.id !== OWNER_USER_ID) {
      router.replace('/dashboard');
    }
  }, [mounted, status, session?.user?.id, router]);

  useEffect(() => {
    if (!isOwner) return;
    void fetch('/api/settings/agents')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j && typeof j.enabled === 'boolean') setAgentsEnabled(j.enabled);
        else setAgentsEnabled(true);
      })
      .catch(() => setAgentsEnabled(true));
  }, [isOwner]);

  if (!mounted || status === 'loading' || !isOwner) {
    return (
      <div className="min-h-[100dvh] bg-[#07070c] text-white">
        <div className="fixed top-0 left-0 right-0 z-50 h-14 bg-[#07070c]/90 border-b border-white/5" />
        <main className="pt-24 px-4 max-w-3xl mx-auto">
          <div className="animate-pulse space-y-4 mt-8">
            <div className="h-3 w-40 bg-zinc-800/60 rounded" />
            <div className="h-24 bg-zinc-900/40 rounded-2xl" />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-[#07070c] text-white selection:bg-cyan-500/30 selection:text-white pb-[env(safe-area-inset-bottom,0px)]">
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,#000_20%,transparent_100%)]" />
      </div>

      <header className="fixed top-0 left-0 right-0 z-50 bg-[#07070c]/90 backdrop-blur-xl border-b border-white/5 border-emerald-500/15 pt-[env(safe-area-inset-top,0px)]">
        <div className="max-w-3xl mx-auto h-14 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center px-3 sm:px-4 gap-1 sm:gap-2">
          <div className="flex justify-start min-w-0">
            <Link
              href="/dashboard"
              className="text-zinc-500 hover:text-white transition-colors flex items-center gap-1 min-h-[44px] min-w-[44px] -ml-1 pl-1 pr-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#07070c]"
              aria-label="Back to dashboard"
            >
              <ChevronLeft className="w-5 h-5 shrink-0" aria-hidden="true" />
              <span className="text-xs font-black uppercase tracking-[0.12em] truncate max-w-[6rem] sm:max-w-none">
                Dashboard
              </span>
            </Link>
          </div>
          <div className="flex justify-center">
            <Link
              href="/dashboard"
              className="flex items-center gap-2 group min-h-[44px] min-w-[44px] justify-center rounded-lg px-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#07070c]"
            >
              <FolderaMark
                size="sm"
                decorative
                className="shadow-[0_0_20px_rgba(16,185,129,0.2)] transition-transform group-hover:scale-105 shrink-0"
              />
              <span className="sr-only sm:hidden">Foldera</span>
              <span className="text-sm font-black tracking-tighter text-white uppercase hidden sm:inline">Foldera</span>
            </Link>
          </div>
          <div className="min-w-0" aria-hidden="true" />
        </div>
      </header>

      <main
        id="main"
        className="relative z-10 pt-[calc(5rem+env(safe-area-inset-top,0px))] pb-16 sm:pb-14 px-4 max-w-3xl mx-auto space-y-9 sm:space-y-10 w-full min-w-0"
      >
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400 mb-1">Owner</p>
          <h1 className="text-xl font-bold text-white">System tools</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Pipeline runs and agent controls. This page is not part of the normal product flow.
          </p>
        </div>

        <section className="rounded-2xl border border-white/10 bg-zinc-950/80 backdrop-blur-xl overflow-hidden">
          <div className="px-4 py-5 sm:px-5 sm:py-6 md:px-6 border-b border-white/5">
            <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-zinc-500 mb-2">Generate</h2>
            <p className="text-xs text-zinc-600 leading-relaxed">
              Sync connectors and run the brief pipeline. <span className="text-zinc-500">Dry run</span> exercises scoring and a mock directive without Anthropic.{' '}
              <span className="text-zinc-500">AI generate</span> uses your daily caps and API credits.
            </p>
          </div>
          <div className="px-4 py-5 sm:px-5 sm:py-6 md:px-6 flex flex-col gap-3">
            <button
              disabled={
                generateState === 'loading' ||
                generateState === 'success' ||
                paidGenerateState === 'loading'
              }
              onClick={async () => {
                const now = Date.now();
                if (now - lastPipelineRunRef.current < 30_000) {
                  setGenerateMessage('Please wait 30 seconds before trying again.');
                  return;
                }
                lastPipelineRunRef.current = now;
                setGenerateState('loading');
                setGenerateMessage(null);
                setPaidGenerateMessage(null);
                try {
                  const res = await fetch('/api/settings/run-brief?force=true&dry_run=true', { method: 'POST' });
                  const data = await res.json().catch(() => null);
                  if (res.ok && data?.ok) {
                    setGenerateState('success');
                    window.location.href = '/dashboard?generated=true';
                    return;
                  }
                  if (res.ok && data?.stages) {
                    const stages = data.stages as Record<string, unknown>;
                    const genStatus = (stages.daily_brief as Record<string, unknown> | undefined)?.generate;
                    const genRec = genStatus as { status?: string } | undefined;
                    if (genRec?.status === 'ok') {
                      setGenerateState('success');
                      window.location.href = '/dashboard?generated=true';
                      return;
                    }
                    const sp = stages.daily_brief as Record<string, unknown> | undefined;
                    const sig = sp?.signal_processing as { status?: string } | undefined;
                    const genFailed = genRec?.status === 'failed';
                    const signalOnly = sig?.status === 'failed' && !genFailed;
                    if (signalOnly) {
                      setGenerateState('success');
                      window.location.href = '/dashboard?generated=true';
                      return;
                    }
                    const parts: string[] = [];
                    if (genRec?.status === 'failed') parts.push('Brief generation failed');
                    const sm = stages.sync_microsoft as { ok?: boolean } | undefined;
                    const sg = stages.sync_google as { ok?: boolean } | undefined;
                    if (sm?.ok === false) parts.push('Microsoft sync issue');
                    if (sg?.ok === false) parts.push('Google sync issue');
                    setGenerateState('error');
                    setGenerateMessage(parts.length > 0 ? parts.join('. ') + '.' : 'Something went wrong.');
                    return;
                  }
                  setGenerateState('error');
                  setGenerateMessage(data?.error || 'Request failed. Try again in 30 seconds.');
                } catch {
                  setGenerateState('error');
                  setGenerateMessage('Network error — try again in 30 seconds.');
                }
              }}
              className={`w-full min-h-[52px] touch-manipulation rounded-xl py-4 text-xs font-black uppercase tracking-[0.15em] transition-all flex items-center justify-center gap-2 ${
                generateState === 'loading'
                  ? 'bg-zinc-800/60 text-zinc-500 cursor-wait border border-white/5'
                  : generateState === 'success'
                    ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 cursor-default'
                    : 'bg-white text-black hover:bg-zinc-200 shadow-[0_0_40px_rgba(255,255,255,0.15)] hover:scale-[1.01] active:scale-[0.99]'
              }`}
            >
              {generateState === 'loading' ? (
                <>
                  <span className="w-4 h-4 border-2 border-zinc-600 border-t-zinc-400 rounded-full animate-spin" />
                  Running sync + dry run…
                </>
              ) : generateState === 'success' ? (
                'Redirecting…'
              ) : (
                'Run pipeline (dry run)'
              )}
            </button>
            <button
              disabled={
                paidGenerateState === 'loading' ||
                paidGenerateState === 'success' ||
                generateState === 'loading'
              }
              onClick={async () => {
                if (
                  !window.confirm(
                    'Generate with AI uses Anthropic API credits and counts toward your daily limits. Continue?',
                  )
                ) {
                  return;
                }
                const now = Date.now();
                if (now - lastPipelineRunRef.current < 30_000) {
                  setPaidGenerateMessage('Please wait 30 seconds before trying again.');
                  return;
                }
                lastPipelineRunRef.current = now;
                setPaidGenerateState('loading');
                setPaidGenerateMessage(null);
                setGenerateMessage(null);
                try {
                  const res = await fetch('/api/settings/run-brief?force=true&use_llm=true', { method: 'POST' });
                  const data = await res.json().catch(() => null);
                  const spend = data?.spend_policy as
                    | { paid_llm_requested?: boolean; pipeline_dry_run?: boolean }
                    | undefined;
                  if (spend?.paid_llm_requested && spend?.pipeline_dry_run) {
                    setPaidGenerateState('error');
                    setPaidGenerateMessage(
                      'Paid generation is not enabled on the server (needs ALLOW_PROD_PAID_LLM). You received a dry run instead.',
                    );
                    return;
                  }
                  if (res.ok && data?.ok) {
                    setPaidGenerateState('success');
                    window.location.href = '/dashboard?generated=true';
                    return;
                  }
                  if (res.ok && data?.stages) {
                    const stages = data.stages as Record<string, unknown>;
                    const genStatus = (stages.daily_brief as Record<string, unknown> | undefined)?.generate;
                    const genRec = genStatus as { status?: string } | undefined;
                    if (genRec?.status === 'ok') {
                      setPaidGenerateState('success');
                      window.location.href = '/dashboard?generated=true';
                      return;
                    }
                    const sp = stages.daily_brief as Record<string, unknown> | undefined;
                    const sig = sp?.signal_processing as { status?: string } | undefined;
                    const genFailed = genRec?.status === 'failed';
                    const signalOnly = sig?.status === 'failed' && !genFailed;
                    if (signalOnly) {
                      setPaidGenerateState('success');
                      window.location.href = '/dashboard?generated=true';
                      return;
                    }
                    const parts: string[] = [];
                    if (genRec?.status === 'failed') parts.push('Brief generation failed');
                    const sm = stages.sync_microsoft as { ok?: boolean } | undefined;
                    const sg = stages.sync_google as { ok?: boolean } | undefined;
                    if (sm?.ok === false) parts.push('Microsoft sync issue');
                    if (sg?.ok === false) parts.push('Google sync issue');
                    setPaidGenerateState('error');
                    setPaidGenerateMessage(parts.length > 0 ? parts.join('. ') + '.' : 'Something went wrong.');
                    return;
                  }
                  setPaidGenerateState('error');
                  setPaidGenerateMessage(data?.error || 'Request failed. Try again in 30 seconds.');
                } catch {
                  setPaidGenerateState('error');
                  setPaidGenerateMessage('Network error — try again in 30 seconds.');
                }
              }}
              className={`w-full min-h-[48px] touch-manipulation rounded-xl py-3 text-[10px] font-black uppercase tracking-[0.12em] transition-all border flex items-center justify-center gap-2 ${
                paidGenerateState === 'loading'
                  ? 'bg-zinc-900/40 text-zinc-500 cursor-wait border-white/5'
                  : paidGenerateState === 'success'
                    ? 'bg-cyan-500/5 text-cyan-400 border-cyan-500/20 cursor-default'
                    : 'bg-transparent text-zinc-400 hover:text-zinc-200 border-white/15 hover:border-white/25'
              }`}
            >
              {paidGenerateState === 'loading' ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-zinc-600 border-t-zinc-400 rounded-full animate-spin" />
                  Running sync + AI…
                </>
              ) : paidGenerateState === 'success' ? (
                'Redirecting…'
              ) : (
                'Generate with AI (uses credits)'
              )}
            </button>
            {generateMessage && (
              <p className={`text-xs leading-relaxed ${generateState === 'error' ? 'text-red-400' : 'text-cyan-400'}`}>
                {generateMessage}
              </p>
            )}
            {paidGenerateMessage && (
              <p
                className={`text-xs leading-relaxed ${paidGenerateState === 'error' ? 'text-red-400' : 'text-cyan-400'}`}
              >
                {paidGenerateMessage}
              </p>
            )}
          </div>
        </section>

        {agentsEnabled !== null && (
          <section className="rounded-2xl border border-emerald-500/20 bg-zinc-950/80 backdrop-blur-xl overflow-hidden">
            <div className="px-4 py-5 sm:px-5 sm:py-6 md:px-6 border-b border-white/5">
              <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-zinc-500 mb-2">Autonomous agents</h2>
              <p className="text-xs text-zinc-600 leading-relaxed">
                Scheduled jobs stage drafts for review here. Turn off to stop all agent runs immediately.
              </p>
            </div>
            <div className="px-4 py-5 sm:px-5 sm:py-6 md:px-6 flex items-center justify-between gap-4">
              <p className="text-sm text-zinc-300">Agents enabled</p>
              <button
                type="button"
                disabled={agentsSaving}
                onClick={async () => {
                  setAgentsSaving(true);
                  try {
                    const next = !agentsEnabled;
                    const res = await fetch('/api/settings/agents', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ enabled: next }),
                    });
                    if (res.ok) {
                      setAgentsEnabled(next);
                    }
                  } finally {
                    setAgentsSaving(false);
                  }
                }}
                className={`relative w-14 h-8 rounded-full transition-colors ${
                  agentsEnabled ? 'bg-emerald-500/80' : 'bg-zinc-700'
                } ${agentsSaving ? 'opacity-50' : ''}`}
                aria-pressed={agentsEnabled}
              >
                <span
                  className={`absolute top-1 left-1 w-6 h-6 rounded-full bg-white shadow transition-transform ${
                    agentsEnabled ? 'translate-x-6' : ''
                  }`}
                />
              </button>
            </div>
          </section>
        )}

        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400 mb-1">Draft queue</p>
          <h2 className="text-xl font-bold text-white">Agent outputs</h2>
          <p className="text-sm text-zinc-500 mt-1">
            Staged for review here — not emailed. Approve to file artifacts, or skip to train the agent.
          </p>
          <AgentSystemPanel />
        </div>

        <p className="text-center text-xs text-zinc-600 pb-4">
          <Link href="/dashboard/settings" className="text-zinc-500 hover:text-zinc-300 underline-offset-2 hover:underline">
            Back to settings
          </Link>
        </p>
      </main>
    </div>
  );
}
