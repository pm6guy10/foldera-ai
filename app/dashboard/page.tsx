'use client';

import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import { FolderaMark } from '@/components/nav/FolderaMark';
import { useSession } from 'next-auth/react';
import { Settings, Lock, History, Download } from 'lucide-react';
import type { ConvictionAction } from '@/lib/briefing/types';

type ArtifactWithDraftedEmail = {
  type: string;
  to?: string;
  recipient?: string;
  subject?: string;
  body?: string;
  text?: string;
  content?: string;
  title?: string;
  options?: Array<{ option: string; weight: number; rationale: string }>;
  recommendation?: string;
  context?: string;
  evidence?: string;
  tripwires?: string[];
  check_date?: string;
};

/** Stale email deep-link id, duplicate tab, or action already skipped/approved elsewhere. */
function shouldReconcileExecuteFailure(res: Response | null, errorMessage: string): boolean {
  if (res && res.status === 404) return true;
  const m = errorMessage.toLowerCase();
  return m.includes('already claimed') || m.includes('not found');
}

/** Plaintext body for document / unknown artifact shapes (never rely on a single field name). */
function artifactPrimaryText(a: ArtifactWithDraftedEmail | null | undefined): string | null {
  if (!a) return null;
  const raw = a.body ?? a.text ?? a.content;
  if (typeof raw === 'string' && raw.trim().length > 0) return raw;
  return null;
}

/** Human copy after Approve — write_document is save + optional Resend, not outbox send. */
function approveSuccessFlash(actionType: string | undefined, result: unknown): string {
  const r = result && typeof result === 'object' ? (result as Record<string, unknown>) : null;
  if (actionType === 'write_document') {
    const de = r?.document_ready_email;
    if (de && typeof de === 'object') {
      const o = de as { sent?: boolean; reason?: string; send_error?: string };
      if (o.sent === true) return 'Saved. We also emailed you the full document.';
      if (o.reason === 'no_verified_email') {
        return 'Saved to your Foldera record. Add a verified email in Settings to receive a copy by email.';
      }
      if (typeof o.send_error === 'string' && o.send_error.length > 0) {
        return 'Saved. Email delivery failed — your document is still in Foldera Signals.';
      }
    }
    if (r?.saved === true) return 'Saved. Your document is in Foldera Signals.';
    return 'Saved.';
  }
  const sentVia = (r as { sent_via?: string } | null)?.sent_via;
  if (sentVia === 'gmail') return 'Sent from your Gmail.';
  if (sentVia === 'outlook') return 'Sent from your Outlook.';
  if (sentVia === 'resend') return 'Sent via Foldera. Connect Gmail in Settings to send from your own inbox.';
  return 'Sent. Check your outbox.';
}

type ActionWithDomain = ConvictionAction & { domain?: string; generatedAt?: string };

/** Custom component map to render write_document markdown on the dashboard's dark card. */
const DOCUMENT_MARKDOWN_COMPONENTS = {
  h1: ({ children }: { children?: ReactNode }) => (
    <h1 className="text-base font-bold text-white mt-4 mb-2 first:mt-0">{children}</h1>
  ),
  h2: ({ children }: { children?: ReactNode }) => (
    <h2 className="text-sm font-bold text-white mt-3 mb-1.5 first:mt-0">{children}</h2>
  ),
  h3: ({ children }: { children?: ReactNode }) => (
    <h3 className="text-[11px] font-black uppercase tracking-widest text-zinc-300 mt-3 mb-1 first:mt-0">{children}</h3>
  ),
  p: ({ children }: { children?: ReactNode }) => (
    <p className="text-sm text-zinc-200 leading-relaxed mb-2 last:mb-0">{children}</p>
  ),
  ul: ({ children }: { children?: ReactNode }) => (
    <ul className="list-disc pl-5 mb-2 space-y-1 text-sm text-zinc-200 marker:text-cyan-400/70">{children}</ul>
  ),
  ol: ({ children }: { children?: ReactNode }) => (
    <ol className="list-decimal pl-5 mb-2 space-y-1 text-sm text-zinc-200 marker:text-cyan-400/70">{children}</ol>
  ),
  li: ({ children }: { children?: ReactNode }) => (
    <li className="leading-relaxed">{children}</li>
  ),
  strong: ({ children }: { children?: ReactNode }) => (
    <strong className="font-semibold text-white">{children}</strong>
  ),
  em: ({ children }: { children?: ReactNode }) => <em className="italic">{children}</em>,
  a: ({ children, href }: { children?: ReactNode; href?: string }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-cyan-400 underline underline-offset-2 hover:text-cyan-300">
      {children}
    </a>
  ),
  code: ({ children }: { children?: ReactNode }) => (
    <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[0.85em] text-zinc-100">{children}</code>
  ),
  blockquote: ({ children }: { children?: ReactNode }) => (
    <blockquote className="border-l-2 border-cyan-500/40 pl-3 text-zinc-400 italic my-2">{children}</blockquote>
  ),
  hr: () => <hr className="my-3 border-white/10" />,
};

export default function DashboardPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const { status } = useSession();
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
  const [executedActionId, setExecutedActionId] = useState<string | null>(null);
  const [outcomeRecorded, setOutcomeRecorded] = useState(false);
  const [oauthReconnect, setOauthReconnect] = useState<'google' | 'microsoft' | null>(null);
  const [hasActiveIntegration, setHasActiveIntegration] = useState(false);
  const [firstReadRunning, setFirstReadRunning] = useState(false);

  const loadAbortRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(false);

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

  useEffect(() => {
    if (status !== 'authenticated') return;
    let cancelled = false;
    void fetch('/api/integrations/status', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { integrations?: Array<{ provider: string; is_active?: boolean; needs_reauth?: boolean }> } | null) => {
        if (cancelled || !data?.integrations) return;
        setHasActiveIntegration(data.integrations.some((i) => i.is_active === true));
        const ms = data.integrations.find((i) => i.provider === 'azure_ad' && i.needs_reauth);
        const g = data.integrations.find((i) => i.provider === 'google' && i.needs_reauth);
        if (ms) setOauthReconnect('microsoft');
        else if (g) setOauthReconnect('google');
        else setOauthReconnect(null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [status]);

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
    loadAbortRef.current?.abort();
    const ac = new AbortController();
    loadAbortRef.current = ac;

    setLoading(true);
    setFetchError(false);
    try {
      const [convRes, subRes] = await Promise.all([
        fetch('/api/conviction/latest', { signal: ac.signal }),
        fetch('/api/subscription/status', { signal: ac.signal }),
      ]);

      if (ac.signal.aborted) return;

      if (subRes.ok) {
        const sub = await subRes.json().catch(() => ({}));
        if (ac.signal.aborted) return;
        setSubPlan(typeof sub.plan === 'string' ? sub.plan : null);
        setSubStatus(typeof sub.status === 'string' ? sub.status : null);
      } else {
        setSubPlan(null);
        setSubStatus(null);
      }

      if (ac.signal.aborted) return;

      if (!convRes.ok) {
        setFetchError(true);
        setAction(null);
        return;
      }
      const data = await convRes.json().catch(() => ({}));
      if (ac.signal.aborted) return;
      setIsSubscribed(data?.is_subscribed === true);
      setAction(data?.id ? data : null);
    } catch (e: unknown) {
      if (ac.signal.aborted) return;
      setFetchError(true);
      setAction(null);
      setSubPlan(null);
      setSubStatus(null);
    } finally {
      if (!ac.signal.aborted && isMountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  // Handle email deep-link params (approve/skip from morning email) — after `load` exists
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const deepAction = params.get('action');
    const id = params.get('id');
    if (!deepAction || !id) return;
    window.history.replaceState({}, '', window.location.pathname);
    if (deepAction !== 'approve' && deepAction !== 'skip') return;

    void (async () => {
      try {
        const res = await fetch('/api/conviction/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action_id: id, decision: deepAction }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const msg = (data as { error?: string }).error ?? 'Could not update that action.';
          if (shouldReconcileExecuteFailure(res, msg)) {
            await load();
            setFlash('That directive was already handled or replaced. Showing your current state.');
            return;
          }
          throw new Error(msg);
        }
        if (data.status === 'executed' || data.status === 'skipped') {
          setDone(true);
          setLastDecision(deepAction === 'approve' ? 'approve' : 'skip');
          if (deepAction === 'approve') {
            setExecutedActionId((data.action_id as string | undefined) ?? null);
            setFlash(
              approveSuccessFlash(
                (data as { action_type?: string }).action_type ?? undefined,
                data.result,
              ),
            );
          } else {
            setFlash('Skipped. Foldera will adjust.');
          }
        } else {
          throw new Error('Unexpected response from Foldera.');
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Could not update that action.';
        if (shouldReconcileExecuteFailure(null, msg)) {
          await load();
          setFlash('That directive was already handled or replaced. Showing your current state.');
          return;
        }
        setFlash(msg);
      }
    })();
  }, [load]);

  useEffect(() => {
    isMountedRef.current = true;
    void load();
    return () => {
      isMountedRef.current = false;
      loadAbortRef.current?.abort();
    };
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
      if (!res.ok) {
        const msg = (data as { error?: string }).error ?? 'Approve failed';
        if (shouldReconcileExecuteFailure(res, msg)) {
          await load();
          setFlash('That directive was already handled or replaced. Showing your current state.');
          return;
        }
        throw new Error(msg);
      }
      if (data.status === 'executed' || data.status === 'skipped') {
        setDone(true);
        setLastDecision('approve');
        setExecutedActionId((data.action_id as string | undefined) ?? null);
        setFlash(
          approveSuccessFlash(
            (data as { action_type?: string }).action_type ?? action.action_type,
            data.result,
          ),
        );
      } else {
        throw new Error('Unexpected response from Foldera.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Approve failed';
      if (shouldReconcileExecuteFailure(null, msg)) {
        await load();
        setFlash('That directive was already handled or replaced. Showing your current state.');
        return;
      }
      setFlash(msg);
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
      if (!res.ok) {
        const msg = (data as { error?: string }).error ?? 'Skip failed';
        if (shouldReconcileExecuteFailure(res, msg)) {
          await load();
          setFlash('That directive was already handled or replaced. Showing your current state.');
          return;
        }
        throw new Error(msg);
      }
      if (data.status === 'executed' || data.status === 'skipped') {
        setDone(true);
        setLastDecision('skip');
        setFlash('Skipped. Foldera will adjust.');
      } else {
        throw new Error('Unexpected response from Foldera.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Skip failed';
      if (shouldReconcileExecuteFailure(null, msg)) {
        await load();
        setFlash('That directive was already handled or replaced. Showing your current state.');
        return;
      }
      setFlash(msg);
    } finally {
      setExecuting(false);
    }
  };

  const artifact = action?.artifact as ArtifactWithDraftedEmail | null | undefined;
  const isEmail = artifact?.type === 'email' || artifact?.type === 'drafted_email';
  const isDecision = artifact?.type === 'decision_frame';
  const isWait = artifact?.type === 'wait_rationale';
  const isDocument = artifact?.type === 'document';
  const artifactBody = artifactPrimaryText(artifact);
  const recipient = artifact?.to || artifact?.recipient || '';

  const recordOutcome = useCallback(async (outcome: 'worked' | 'didnt_work') => {
    if (!executedActionId || outcomeRecorded) return;
    setOutcomeRecorded(true);
    try {
      await fetch('/api/conviction/outcome', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action_id: executedActionId, outcome }),
      });
    } catch {
      // Non-fatal — outcome is best-effort
    }
    setFlash('Foldera will adjust.');
  }, [executedActionId, outcomeRecorded]);

  const handleCopyDraft = useCallback(async () => {
    if (!action || !artifact || !isEmail) return;
    const subj = typeof artifact.subject === 'string' ? artifact.subject : '';
    const bodyText = artifactPrimaryText(artifact) ?? '';
    const toLine = artifact?.to || artifact?.recipient || '';
    const block = [`To: ${toLine}`, `Subject: ${subj}`, '', bodyText].join('\n');
    try {
      await navigator.clipboard.writeText(block);
      setFlash('Copied draft — paste into your mail app, or tap Approve to send from your connected mailbox.');
      setTimeout(() => setFlash(null), 6000);
    } catch {
      setFlash('Could not copy automatically — select the text in your morning email or dashboard.');
      setTimeout(() => setFlash(null), 5000);
    }
  }, [action, artifact, isEmail]);

  const handleCopyDocument = useCallback(async () => {
    if (!action || !artifact || !isDocument) return;
    const title = typeof artifact.title === 'string' ? artifact.title : 'Document';
    const bodyText = artifactPrimaryText(artifact) ?? '';
    const block = [title, '', bodyText].join('\n');
    try {
      await navigator.clipboard.writeText(block);
      setFlash('Copied full document — paste anywhere, or tap Save document to file it in Foldera.');
      setTimeout(() => setFlash(null), 6000);
    } catch {
      setFlash('Could not copy automatically — select the text in the preview below.');
      setTimeout(() => setFlash(null), 5000);
    }
  }, [action, artifact, isDocument]);

  const isProArtifactUnlocked =
    subPlan === 'pro' && (subStatus === 'active' || subStatus === 'past_due');
  const showArtifactBlur = Boolean(artifact) && !isProArtifactUnlocked;

  async function runFirstReadNow() {
    if (firstReadRunning) return;
    setFirstReadRunning(true);
    setFlash(null);
    try {
      const res = await fetch('/api/settings/run-brief?force=true&use_llm=true', {
        method: 'POST',
      });
      const data = await res.json().catch(() => ({}));
      const spend = data?.spend_policy as
        | { paid_llm_requested?: boolean; pipeline_dry_run?: boolean }
        | undefined;

      if (spend?.paid_llm_requested && spend?.pipeline_dry_run) {
        setFlash('First read ran as a dry run. Real generation is not enabled on this deployment.');
        return;
      }

      if (!res.ok && !data?.stages) {
        const msg =
          typeof data?.error === 'string'
            ? data.error
            : 'Could not run your first read right now.';
        throw new Error(msg);
      }

      await load();
      setFlash(
        data?.ok === true
          ? 'First read generated.'
          : 'First read ran. Foldera will show the result when the pipeline has enough signal.',
      );
    } catch (err: unknown) {
      setFlash(err instanceof Error ? err.message : 'Could not run your first read right now.');
    } finally {
      setFirstReadRunning(false);
    }
  }

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
    <div className="min-h-[100dvh] bg-[#07070c] text-white overflow-x-hidden selection:bg-cyan-500/30 selection:text-white">
      {/* Ambient grid */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,#000_20%,transparent_100%)]" />
      </div>

      {/* Fixed header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#07070c]/90 backdrop-blur-xl border-b border-white/5 pt-[env(safe-area-inset-top,0px)]">
        <div className="max-w-2xl mx-auto h-14 flex items-center justify-between px-3 sm:px-5 gap-2 min-w-0 w-full">
          <Link href="/dashboard" className="flex items-center gap-2 sm:gap-2.5 group min-w-0 max-w-[55%] sm:max-w-none">
            <FolderaMark
              size="sm"
              className="shadow-[0_0_20px_rgba(255,255,255,0.15)] transition-transform group-hover:scale-105 shrink-0"
            />
            <span className="text-sm font-black tracking-tighter text-white uppercase truncate">Foldera</span>
          </Link>
          <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
            <Link
              href="/dashboard/briefings"
              className="touch-manipulation min-w-[44px] min-h-[44px] p-2 rounded-lg text-zinc-500 hover:text-white hover:bg-white/5 transition-colors flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#07070c]"
              aria-label="Past directives"
            >
              <History className="w-5 h-5" />
            </Link>
            <Link href="/dashboard/settings" className="touch-manipulation min-w-[44px] min-h-[44px] p-2 rounded-lg text-zinc-500 hover:text-white hover:bg-white/5 transition-colors flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#07070c]" aria-label="Settings">
              <Settings className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </header>

      {/* Content */}
      <main
        id="main"
        className="relative z-10 pt-[calc(5rem+env(safe-area-inset-top,0px))] pb-[calc(3.5rem+env(safe-area-inset-bottom,0px))] px-4 max-w-2xl mx-auto w-full min-w-0"
      >
        {oauthReconnect && (
          <div
            role="status"
            className="mb-5 w-full rounded-xl border border-amber-500/35 bg-amber-950/40 px-4 py-3.5 backdrop-blur-md"
          >
            <p className="text-sm text-amber-100/95 font-medium">
              Your {oauthReconnect === 'microsoft' ? 'Microsoft' : 'Google'} connection needs a quick refresh so Foldera
              can keep your brief accurate.
            </p>
            <a
              href={oauthReconnect === 'microsoft' ? '/api/microsoft/connect' : '/api/google/connect'}
              className="mt-3 inline-flex items-center justify-center rounded-lg bg-cyan-500 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-black hover:bg-cyan-400 transition-colors"
            >
              Reconnect {oauthReconnect === 'microsoft' ? 'Microsoft' : 'Google'}
            </a>
          </div>
        )}

        {/* Flash message */}
        {flash && !done && (
          <div
            role="status"
            className="mb-5 w-full max-w-full mx-0 px-4 py-3.5 rounded-xl bg-zinc-950/90 border border-cyan-500/25 backdrop-blur-md shadow-[0_12px_40px_-12px_rgba(0,0,0,0.8)]"
          >
            <p className="text-sm text-zinc-200 font-medium break-words">{flash}</p>
          </div>
        )}

        {loading ? (
          <div
            key="dashboard-directive-skeleton"
            className="mt-8 max-w-xl animate-pulse"
            aria-hidden
          >
            <div className="space-y-4">
              <div className="h-2 w-24 bg-zinc-800 rounded" />
              <div className="h-7 bg-zinc-800/60 rounded-lg w-full" />
              <div className="h-7 bg-zinc-800/60 rounded-lg w-4/5" />
              <div className="h-40 bg-zinc-800/40 rounded-2xl mt-4" />
              <div className="flex gap-3 mt-4">
                <div className="h-14 bg-zinc-800/60 rounded-xl flex-1" />
                <div className="h-14 bg-zinc-800/40 rounded-xl w-28" />
              </div>
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
            {lastDecision === 'approve' && executedActionId && !outcomeRecorded && (
              <div className="mt-4 flex gap-3 justify-center">
                <button
                  type="button"
                  onClick={() => void recordOutcome('worked')}
                  className="touch-manipulation min-h-[40px] px-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[10px] font-black uppercase tracking-[0.15em] hover:bg-emerald-500/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#07070c]"
                >
                  It worked
                </button>
                <button
                  type="button"
                  onClick={() => void recordOutcome('didnt_work')}
                  className="touch-manipulation min-h-[40px] px-4 rounded-xl bg-zinc-900 border border-white/10 text-zinc-400 text-[10px] font-black uppercase tracking-[0.15em] hover:bg-zinc-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#07070c]"
                >
                  Didn&apos;t work
                </button>
              </div>
            )}
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 mt-5">Your next read arrives tomorrow morning.</p>
          </div>
        ) : fetchError ? (
          <div className="mt-20 text-center">
            <p className="text-zinc-400 text-sm">Something went wrong loading your dashboard.</p>
            <button
              type="button"
              onClick={() => void load()}
              className="mt-4 min-h-[44px] text-[10px] font-black uppercase tracking-[0.15em] text-cyan-400 hover:text-cyan-300 transition-colors"
            >
              Try again
            </button>
          </div>
        ) : !action ? (
          <div className="mt-10 sm:mt-12 px-0">
            <div className="mx-auto max-w-lg rounded-2xl border border-white/10 bg-zinc-950/80 backdrop-blur-xl p-6 sm:p-10 text-center shadow-[0_40px_80px_-20px_rgba(0,0,0,0.8)]">
              <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse mx-auto mb-5" />
              <p className="text-zinc-100 text-lg font-semibold leading-snug">You&apos;re set until tomorrow morning.</p>
              <p className="text-zinc-500 text-sm mt-3 leading-relaxed max-w-sm mx-auto">
                No directive is queued in the app right now. Your next read still lands in email — connect accounts in Settings if you want deeper context.
              </p>
              {hasActiveIntegration && (
                <button
                  type="button"
                  onClick={() => void runFirstReadNow()}
                  disabled={firstReadRunning}
                  className="mt-6 w-full min-h-[52px] touch-manipulation rounded-xl bg-white px-5 py-3.5 text-xs font-black uppercase tracking-[0.15em] text-black shadow-[0_0_30px_rgba(255,255,255,0.14)] transition-all hover:bg-zinc-200 hover:scale-[1.01] active:scale-[0.99] disabled:cursor-wait disabled:opacity-50 disabled:hover:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#07070c]"
                >
                  {firstReadRunning ? (
                    <span className="inline-flex items-center justify-center gap-2">
                      <span className="h-4 w-4 rounded-full border-2 border-black/30 border-t-black animate-spin" />
                      Running first read
                    </span>
                  ) : (
                    'Run first read now'
                  )}
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl bg-[#0a0a0f] border border-cyan-500/20 shadow-[0_40px_100px_-20px_rgba(0,0,0,1),_0_0_50px_rgba(6,182,212,0.15)] overflow-hidden transition-all duration-300 ease-out max-sm:mx-0 w-full min-w-0">
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
                <div className="relative isolate min-h-[120px] rounded-2xl overflow-hidden border border-white/10">
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

                    {isDocument && (
                      <div className="rounded-2xl bg-zinc-950/60 border border-cyan-500/20 border-l-4 border-l-cyan-500 p-4 md:p-5 m-4 md:m-5">
                        <div className="flex items-start justify-between gap-3 mb-1">
                          <p className="text-[10px] font-black uppercase tracking-widest text-cyan-400">
                            Finished document
                          </p>
                          {artifactBody && (
                            <button
                              type="button"
                              disabled
                              title="PDF export is coming soon"
                              aria-label="Download PDF (coming soon)"
                              data-testid="dashboard-document-download-pdf"
                              className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-zinc-400 opacity-70 cursor-not-allowed"
                            >
                              <Download className="w-3 h-3" aria-hidden="true" />
                              Download PDF
                            </button>
                          )}
                        </div>
                        <p className="text-[11px] text-zinc-500 leading-snug mb-3">
                          Ready to file or share — save it to your Foldera record when you&apos;re happy with it.
                        </p>
                        {artifact.title && (
                          <p className="text-base font-semibold text-white mb-2">{artifact.title}</p>
                        )}
                        {artifactBody ? (
                          <div
                            className="max-h-[min(50vh,24rem)] overflow-y-auto rounded-lg border border-white/5 bg-black/20 p-4 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
                            data-testid="dashboard-document-body"
                          >
                            <ReactMarkdown components={DOCUMENT_MARKDOWN_COMPONENTS}>
                              {artifactBody}
                            </ReactMarkdown>
                          </div>
                        ) : (
                          <p className="text-sm text-zinc-400 leading-relaxed">
                            Full text is in your morning email. Save document to file it, or skip to adjust.
                          </p>
                        )}
                      </div>
                    )}

                    {artifact &&
                      !isEmail &&
                      !isDecision &&
                      !isWait &&
                      !isDocument && (
                        <div className="p-4 md:p-5">
                          <p className="text-[10px] font-black uppercase tracking-widest text-cyan-400 mb-3">
                            Finished work
                          </p>
                          {artifactBody ? (
                            <p className="text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap">{artifactBody}</p>
                          ) : (
                            <p className="text-sm text-zinc-400 leading-relaxed">
                              This directive does not have an in-app preview. Check your morning email for the full
                              artifact, or use Approve / Skip to continue.
                            </p>
                          )}
                        </div>
                      )}
                  </div>

                  {showArtifactBlur && (
                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 sm:gap-4 bg-black/50 px-4 py-6 sm:px-5 sm:py-8 text-center backdrop-blur-md">
                      <Lock className="w-5 h-5 text-cyan-400 shrink-0" aria-hidden="true" />
                      <p className="text-sm font-semibold text-zinc-100 leading-snug max-w-[18rem] px-1">
                        Upgrade to Pro to unlock finished work. $29/mo.
                      </p>
                      <button
                        type="button"
                        onClick={startStripeCheckout}
                        className="touch-manipulation min-h-[48px] rounded-xl bg-white px-6 py-3.5 text-xs font-black uppercase tracking-[0.15em] text-black shadow-[0_0_30px_rgba(255,255,255,0.15)] transition-transform hover:bg-zinc-200 hover:scale-[1.02] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-black/80"
                      >
                        Upgrade to Pro
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {action.action_type === 'send_message' && isEmail && artifactBody && (
              <div className="px-4 pt-2 pb-1 border-t border-white/5 text-center">
                <p className="text-[11px] text-zinc-500 leading-relaxed px-1 mb-1">
                  Approve sends from your connected Gmail or Outlook.{' '}
                  <button
                    type="button"
                    onClick={() => void handleCopyDraft()}
                    className="underline text-zinc-400 hover:text-zinc-300 transition-colors focus-visible:outline-none"
                  >
                    Copy as text
                  </button>
                </p>
              </div>
            )}

            {action.action_type === 'write_document' && isDocument && artifactBody && (
              <div className="px-4 pt-2 pb-1 border-t border-white/5 text-center" data-testid="dashboard-document-actions-hint">
                <p className="text-[12px] text-zinc-400 leading-relaxed px-1 mb-1">
                  Save document files the full text to your Foldera record. Skip keeps it out of your record and tells Foldera to adjust.
                </p>
                <p className="text-[11px] text-zinc-500 leading-relaxed px-1">
                  <button
                    type="button"
                    onClick={() => void handleCopyDocument()}
                    className="underline text-zinc-400 hover:text-zinc-300 transition-colors focus-visible:outline-none"
                  >
                    Copy full text
                  </button>
                </p>
              </div>
            )}

            {/* Action buttons */}
            <div className="p-4 flex flex-row gap-3 max-[400px]:flex-col bg-white/[0.02] border-t border-white/10 max-[400px]:[&>button]:w-full">
              <button
                type="button"
                onClick={handleApprove}
                disabled={executing}
                data-testid="dashboard-primary-action"
                className="touch-manipulation flex-1 w-full sm:w-auto min-h-[56px] bg-cyan-500 text-black py-3.5 rounded-xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(6,182,212,0.22)] hover:bg-cyan-400 transition-all duration-150 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#07070c]"
              >
                {executing ? (
                  <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                ) : action.action_type === 'write_document' ? (
                  'Save document'
                ) : (
                  'Approve'
                )}
              </button>
              <button
                type="button"
                onClick={handleSkip}
                disabled={executing}
                className="touch-manipulation w-full sm:w-auto sm:px-6 min-h-[56px] bg-zinc-900 border border-white/20 text-zinc-400 py-3.5 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-zinc-800 hover:text-zinc-300 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 sm:min-w-[5.5rem] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#07070c]"
              >
                {executing ? (
                  <span className="w-4 h-4 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
                ) : (
                  action.action_type === 'write_document' ? 'Skip and adjust' : 'Skip'
                )}
              </button>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
