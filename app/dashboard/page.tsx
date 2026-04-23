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
    <h1 className="text-base font-bold text-text-primary mt-4 mb-2 first:mt-0">{children}</h1>
  ),
  h2: ({ children }: { children?: ReactNode }) => (
    <h2 className="text-sm font-bold text-text-primary mt-3 mb-1.5 first:mt-0">{children}</h2>
  ),
  h3: ({ children }: { children?: ReactNode }) => (
    <h3 className="text-[11px] font-black uppercase tracking-widest text-text-secondary mt-3 mb-1 first:mt-0">{children}</h3>
  ),
  p: ({ children }: { children?: ReactNode }) => (
    <p className="text-sm text-text-secondary leading-relaxed mb-2 last:mb-0">{children}</p>
  ),
  ul: ({ children }: { children?: ReactNode }) => (
    <ul className="list-disc pl-6 mb-2 space-y-1 text-sm text-text-secondary marker:text-accent">{children}</ul>
  ),
  ol: ({ children }: { children?: ReactNode }) => (
    <ol className="list-decimal pl-6 mb-2 space-y-1 text-sm text-text-secondary marker:text-accent">{children}</ol>
  ),
  li: ({ children }: { children?: ReactNode }) => (
    <li className="leading-relaxed">{children}</li>
  ),
  strong: ({ children }: { children?: ReactNode }) => (
    <strong className="font-semibold text-text-primary">{children}</strong>
  ),
  em: ({ children }: { children?: ReactNode }) => <em className="italic">{children}</em>,
  a: ({ children, href }: { children?: ReactNode; href?: string }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-2 hover:text-accent-hover">
      {children}
    </a>
  ),
  code: ({ children }: { children?: ReactNode }) => (
    <code className="rounded bg-panel px-1.5 py-0.5 font-mono text-[0.85em] text-text-primary">{children}</code>
  ),
  blockquote: ({ children }: { children?: ReactNode }) => (
    <blockquote className="border-l-2 border-accent-dim pl-3 text-text-secondary italic my-2">{children}</blockquote>
  ),
  hr: () => <hr className="my-3 border-border-subtle" />,
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
  const [artifactVisibilityCount, setArtifactVisibilityCount] = useState(0);
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
        setArtifactVisibilityCount(0);
        return;
      }
      const data = await convRes.json().catch(() => ({}));
      if (ac.signal.aborted) return;
      setIsSubscribed(data?.is_subscribed === true);
      setArtifactVisibilityCount(typeof data?.approved_count === 'number' ? data.approved_count : 0);
      setAction(data?.id ? data : null);
    } catch (e: unknown) {
      if (ac.signal.aborted) return;
      setFetchError(true);
      setAction(null);
      setArtifactVisibilityCount(0);
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
  const showArtifactBlur =
    Boolean(artifact) && !isProArtifactUnlocked && artifactVisibilityCount > 3;

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
    <div className="min-h-[100dvh] bg-bg text-text-primary">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-border-subtle bg-bg/95 pt-[env(safe-area-inset-top,0px)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href="/dashboard" className="inline-flex min-h-[44px] min-w-[44px] items-center gap-3 rounded-button px-1">
            <FolderaMark size="sm" decorative />
            <span className="text-sm font-black uppercase tracking-[0.12em] text-text-primary">Foldera</span>
          </Link>
          <nav className="hidden items-center gap-2 md:flex">
            <Link href="/dashboard" className="inline-flex min-h-[40px] items-center rounded-button bg-panel-raised px-3 text-xs font-black uppercase tracking-[0.12em] text-text-primary">
              Today
            </Link>
            <Link href="/dashboard/briefings" className="inline-flex min-h-[40px] items-center rounded-button px-3 text-xs font-black uppercase tracking-[0.12em] text-text-secondary transition-colors hover:text-text-primary">
              Briefings
            </Link>
            <Link href="/dashboard/settings" className="inline-flex min-h-[40px] items-center rounded-button px-3 text-xs font-black uppercase tracking-[0.12em] text-text-secondary transition-colors hover:text-text-primary">
              Settings
            </Link>
          </nav>
          <div className="flex items-center gap-1">
            <Link
              href="/dashboard/briefings"
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-button border border-border text-text-secondary transition-colors hover:text-text-primary md:hidden"
              aria-label="Past directives"
            >
              <History className="h-5 w-5" />
            </Link>
            <Link
              href="/dashboard/settings"
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-button border border-border text-text-secondary transition-colors hover:text-text-primary md:hidden"
              aria-label="Settings"
            >
              <Settings className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-6xl px-4 pb-16 pt-24 sm:px-6 sm:pt-28">
        <section className="border-b border-border-subtle pb-8">
          <h1 className="text-4xl font-black tracking-tight sm:text-5xl">Today</h1>
          <p className="mt-4 max-w-3xl text-sm leading-relaxed text-text-secondary">
            One directive, one artifact, one decision.
          </p>
        </section>

        <section className="pt-8">
        {oauthReconnect && (
          <div
            role="status"
            className="mb-6 w-full rounded-card border border-border bg-panel px-4 py-4"
          >
            <p className="text-sm font-medium text-text-primary">
              Your {oauthReconnect === 'microsoft' ? 'Microsoft' : 'Google'} connection needs a quick refresh so Foldera
              can keep your brief accurate.
            </p>
            <a
              href={oauthReconnect === 'microsoft' ? '/api/microsoft/connect' : '/api/google/connect'}
              className="mt-3 inline-flex min-h-[44px] items-center justify-center rounded-button bg-accent px-4 text-xs font-black uppercase tracking-[0.12em] text-bg transition-colors hover:bg-accent-hover"
            >
              Reconnect {oauthReconnect === 'microsoft' ? 'Microsoft' : 'Google'}
            </a>
          </div>
        )}

        {/* Flash message */}
        {flash && !done && (
          <div
            role="status"
            className="mb-6 w-full rounded-card border border-border bg-panel px-4 py-4"
          >
            <p className="text-sm font-medium text-text-primary">{flash}</p>
          </div>
        )}

        {loading ? (
          <div key="dashboard-directive-skeleton" className="mt-8 max-w-xl animate-pulse" aria-hidden>
            <div className="space-y-4">
              <div className="h-2 w-24 rounded bg-panel-raised" />
              <div className="h-7 w-full rounded bg-panel-raised" />
              <div className="h-7 w-4/5 rounded bg-panel-raised" />
              <div className="mt-4 h-40 rounded-card bg-panel" />
              <div className="flex gap-3 mt-4">
                <div className="h-14 flex-1 rounded-button bg-panel-raised" />
                <div className="h-14 w-28 rounded-button bg-panel-raised" />
              </div>
            </div>
          </div>
        ) : done ? (
          <div className="mt-12 rounded-card border border-border bg-panel p-8 text-center">
            <div className="flex items-center justify-center mb-6">
              {lastDecision === 'skip' ? (
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-pill bg-accent opacity-40" />
                  <span className="relative inline-flex rounded-pill h-3 w-3 bg-accent" />
                </span>
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-pill border border-accent-dim bg-accent-dim/20">
                  <span className="text-xl text-accent">✓</span>
                </div>
              )}
            </div>
            {flash && <p className="mb-3 text-base font-bold text-text-primary">{flash}</p>}
            {lastDecision === 'approve' && executedActionId && !outcomeRecorded && (
              <div className="mt-4 flex gap-3 justify-center">
                <button
                  type="button"
                  onClick={() => void recordOutcome('worked')}
                    className="touch-manipulation min-h-[40px] rounded-button border border-success bg-success/20 px-4 text-[10px] font-black uppercase tracking-[0.15em] text-text-primary transition-colors hover:bg-success/30"
                >
                  It worked
                </button>
                <button
                  type="button"
                  onClick={() => void recordOutcome('didnt_work')}
                    className="touch-manipulation min-h-[40px] rounded-button border border-border bg-panel-raised px-4 text-[10px] font-black uppercase tracking-[0.15em] text-text-secondary transition-colors hover:text-text-primary"
                >
                  Didn&apos;t work
                </button>
              </div>
            )}
            <p className="mt-6 text-[10px] font-black uppercase tracking-[0.14em] text-text-secondary">Your next read arrives tomorrow morning.</p>
          </div>
        ) : fetchError ? (
          <div className="mt-12 rounded-card border border-border bg-panel p-8 text-center">
            <p className="text-sm text-text-secondary">Something went wrong loading your dashboard.</p>
            <button
              type="button"
              onClick={() => void load()}
              className="mt-4 inline-flex min-h-[44px] items-center rounded-button border border-border px-4 text-[10px] font-black uppercase tracking-[0.14em] text-text-primary"
            >
              Try again
            </button>
          </div>
        ) : !action ? (
          <div className="mt-12">
            <div className="mx-auto max-w-2xl rounded-card border border-border bg-panel p-8 text-center">
              <p className="text-lg font-semibold leading-snug text-text-primary">You&apos;re set until tomorrow morning.</p>
              <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-text-secondary">
                No directive is queued in the app right now. Your next read still lands in email — connect accounts in Settings if you want deeper context.
              </p>
              {hasActiveIntegration && (
                <button
                  type="button"
                  onClick={() => void runFirstReadNow()}
                  disabled={firstReadRunning}
                  className="mt-6 inline-flex min-h-[48px] items-center justify-center rounded-button bg-accent px-6 text-xs font-black uppercase tracking-[0.14em] text-bg transition-colors hover:bg-accent-hover disabled:cursor-wait disabled:opacity-60"
                >
                  {firstReadRunning ? (
                    <span className="inline-flex items-center justify-center gap-2">
                      <span className="h-4 w-4 rounded-pill border-2 border-bg/30 border-t-bg animate-spin" />
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
          <div className="w-full overflow-hidden rounded-card border border-border bg-panel">

            <div className="border-b border-border-subtle px-6 py-6 md:px-8">
              <p className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-accent">
                Today&apos;s directive
              </p>
              {action.generatedAt && (
                <p className="mb-3 text-xs text-text-muted">
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
              <div className="border-l-2 border-accent pl-4">
                <p className="text-xl font-bold leading-tight text-text-primary">{action.directive}</p>
              </div>
            </div>

            {/* Artifact — free users see full layout under a blur overlay (conversion) */}
            {artifact && (
              <div className="border-b border-border-subtle bg-panel px-6 py-6 md:px-8 md:py-6">
                <div className="relative isolate min-h-[120px] overflow-hidden rounded-card border border-border-subtle bg-panel-raised">
                  <div className={showArtifactBlur ? 'pointer-events-none select-none' : ''}>
                    {isEmail && (
                      <div className="border-l-2 border-accent p-4 md:p-6">
                        <p className="mb-3 text-[10px] font-black uppercase tracking-[0.14em] text-accent">Drafted Reply</p>
                        {recipient && (
                          <p className="mb-1 truncate text-xs text-text-muted">To: {recipient}</p>
                        )}
                        {artifact.subject && (
                          <p className="mb-2 truncate text-sm font-medium text-text-secondary">
                            Re: {artifact.subject}
                          </p>
                        )}
                        {artifact.body && (
                          <p
                            className={`text-sm leading-relaxed text-text-primary whitespace-pre-wrap ${
                              showArtifactBlur ? '' : 'line-clamp-6'
                            }`}
                          >
                            {artifact.body}
                          </p>
                        )}
                      </div>
                    )}

                    {isDecision && artifact.options && (
                      <div className="space-y-2 p-4 md:p-6">
                        <p className="mb-3 text-[10px] font-black uppercase tracking-[0.14em] text-accent">Decision Frame</p>
                        <div className="grid grid-cols-1 gap-3">
                          {artifact.options.slice(0, 2).map((opt, i) => (
                            <div key={i} className="rounded-card border border-border bg-panel p-4">
                              <p className="text-sm font-bold text-text-primary">{opt.option}</p>
                              <p className="mt-1 text-xs leading-relaxed text-text-secondary">{opt.rationale}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {isWait && (
                      <div className="m-4 rounded-card border border-border bg-panel p-4 md:m-6">
                        <p className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-text-secondary">Context</p>
                        {artifact.context && (
                          <p className="text-sm leading-relaxed text-text-primary">{artifact.context}</p>
                        )}
                        {(artifact.tripwires?.[0] || artifact.check_date) && (
                          <p className="mt-3 text-xs font-black uppercase tracking-[0.1em] text-accent">
                            Resume when: {artifact.tripwires?.[0] ?? artifact.check_date}
                          </p>
                        )}
                      </div>
                    )}

                    {isDocument && (
                      <div className="m-4 rounded-card border border-border bg-panel p-4 md:m-6 md:p-6">
                        <div className="flex items-start justify-between gap-3 mb-1">
                          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-accent">
                            Finished document
                          </p>
                          {artifactBody && (
                            <button
                              type="button"
                              disabled
                              title="PDF export is coming soon"
                              aria-label="Download PDF (coming soon)"
                              data-testid="dashboard-document-download-pdf"
                              className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-badge border border-border bg-panel-raised px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-text-secondary opacity-70"
                            >
                              <Download className="w-3 h-3" aria-hidden="true" />
                              Download PDF
                            </button>
                          )}
                        </div>
                        <p className="mb-3 text-[11px] leading-snug text-text-secondary">
                          Ready to file or share — save it to your Foldera record when you&apos;re happy with it.
                        </p>
                        {artifact.title && (
                          <p className="mb-2 text-base font-semibold text-text-primary">{artifact.title}</p>
                        )}
                        {artifactBody ? (
                          <div
                            className="max-h-[min(50vh,24rem)] overflow-y-auto rounded-button border border-border bg-panel-raised p-4 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
                            data-testid="dashboard-document-body"
                          >
                            <ReactMarkdown components={DOCUMENT_MARKDOWN_COMPONENTS}>
                              {artifactBody}
                            </ReactMarkdown>
                          </div>
                        ) : (
                          <p className="text-sm leading-relaxed text-text-secondary">
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
                        <div className="p-4 md:p-6">
                          <p className="mb-3 text-[10px] font-black uppercase tracking-[0.14em] text-accent">
                            Finished work
                          </p>
                          {artifactBody ? (
                            <p className="text-sm leading-relaxed text-text-primary whitespace-pre-wrap">{artifactBody}</p>
                          ) : (
                            <p className="text-sm leading-relaxed text-text-secondary">
                              This directive does not have an in-app preview. Check your morning email for the full
                              artifact, or use Approve / Skip to continue.
                            </p>
                          )}
                        </div>
                      )}
                  </div>

                  {showArtifactBlur && (
                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-bg/85 px-4 py-6 text-center backdrop-blur-sm">
                      <Lock className="h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
                      <p className="max-w-[18rem] px-1 text-sm font-semibold leading-snug text-text-primary">
                        Upgrade to Pro to keep receiving finished work.
                      </p>
                      <button
                        type="button"
                        onClick={startStripeCheckout}
                        className="touch-manipulation min-h-[48px] rounded-button bg-accent px-6 py-3 text-xs font-black uppercase tracking-[0.14em] text-bg transition-colors hover:bg-accent-hover"
                      >
                        Upgrade to Pro
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {action.action_type === 'send_message' && isEmail && artifactBody && (
              <div className="border-t border-border-subtle px-4 pb-1 pt-2 text-center">
                <p className="mb-1 px-1 text-[11px] leading-relaxed text-text-secondary">
                  Approve sends from your connected Gmail or Outlook.{' '}
                  <button
                    type="button"
                    onClick={() => void handleCopyDraft()}
                    className="underline transition-colors text-text-secondary hover:text-text-primary focus-visible:outline-none"
                  >
                    Copy as text
                  </button>
                </p>
              </div>
            )}

            {action.action_type === 'write_document' && isDocument && artifactBody && (
              <div className="border-t border-border-subtle px-4 pb-1 pt-2 text-center" data-testid="dashboard-document-actions-hint">
                <p className="mb-1 px-1 text-[12px] leading-relaxed text-text-secondary">
                  Save document files the full text to your Foldera record. Skip keeps it out of your record and tells Foldera to adjust.
                </p>
                <p className="px-1 text-[11px] leading-relaxed text-text-secondary">
                  <button
                    type="button"
                    onClick={() => void handleCopyDocument()}
                    className="underline transition-colors text-text-secondary hover:text-text-primary focus-visible:outline-none"
                  >
                    Copy full text
                  </button>
                </p>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex flex-row gap-3 border-t border-border-subtle bg-panel px-4 py-4 max-[400px]:flex-col max-[400px]:[&>button]:w-full">
              <button
                type="button"
                onClick={handleApprove}
                disabled={executing}
                data-testid="dashboard-primary-action"
                className="touch-manipulation flex min-h-[56px] w-full flex-1 items-center justify-center gap-2 rounded-button bg-accent py-3 text-xs font-black uppercase tracking-[0.14em] text-bg transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
              >
                {executing ? (
                  <span className="w-4 h-4 border-2 border-bg/30 border-t-bg rounded-pill animate-spin" />
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
                className="touch-manipulation flex min-h-[56px] w-full items-center justify-center gap-2 rounded-button border border-border bg-panel-raised py-3 text-xs font-black uppercase tracking-[0.14em] text-text-secondary transition-colors hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-60 sm:min-w-[5.5rem] sm:w-auto sm:px-6"
              >
                {executing ? (
                  <span className="w-4 h-4 border-2 border-border border-t-text-secondary rounded-pill animate-spin" />
                ) : (
                  action.action_type === 'write_document' ? 'Skip and adjust' : 'Skip'
                )}
              </button>
            </div>
          </div>
        )}
        </section>
      </main>
    </div>
  );
}


