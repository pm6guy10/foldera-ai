'use client';

import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import { useSession } from 'next-auth/react';
import {
  Bell,
  Clock3,
  Copy,
  Download,
  FileText,
  Inbox,
  Layers3,
  Lock,
  Search,
  Send,
  Shield,
  TriangleAlert,
  TrendingUp,
} from 'lucide-react';
import type { ConvictionAction } from '@/lib/briefing/types';
import { DailyBriefCard } from '@/components/foldera/DailyBriefCard';
import { DashboardSidebar } from '@/components/foldera/DashboardSidebar';
import { FolderaLogo } from '@/components/foldera/FolderaLogo';

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

function shouldReconcileExecuteFailure(res: Response | null, errorMessage: string): boolean {
  if (res && res.status === 404) return true;
  const message = errorMessage.toLowerCase();
  return message.includes('already claimed') || message.includes('not found');
}

function artifactPrimaryText(artifact: ArtifactWithDraftedEmail | null | undefined): string | null {
  if (!artifact) return null;
  const raw = artifact.body ?? artifact.text ?? artifact.content;
  if (typeof raw === 'string' && raw.trim().length > 0) return raw;
  return null;
}

function approveSuccessFlash(actionType: string | undefined, result: unknown): string {
  const payload = result && typeof result === 'object' ? (result as Record<string, unknown>) : null;
  if (actionType === 'write_document') {
    const emailResult = payload?.document_ready_email;
    if (emailResult && typeof emailResult === 'object') {
      const output = emailResult as { sent?: boolean; reason?: string; send_error?: string };
      if (output.sent === true) return 'Saved. We also emailed you the full document.';
      if (output.reason === 'no_verified_email') {
        return 'Saved to your Foldera record. Add a verified email in Settings to receive a copy by email.';
      }
      if (typeof output.send_error === 'string' && output.send_error.length > 0) {
        return 'Saved. Email delivery failed — your document is still in Foldera Signals.';
      }
    }
    if (payload?.saved === true) return 'Saved. Your document is in Foldera Signals.';
    return 'Saved.';
  }

  const sentVia = (payload as { sent_via?: string } | null)?.sent_via;
  if (sentVia === 'gmail') return 'Sent from your Gmail.';
  if (sentVia === 'outlook') return 'Sent from your Outlook.';
  if (sentVia === 'resend') return 'Sent via Foldera. Connect Gmail in Settings to send from your own inbox.';
  return 'Sent. Check your outbox.';
}

type ActionWithDomain = ConvictionAction & { domain?: string; generatedAt?: string };

const DOCUMENT_MARKDOWN_COMPONENTS = {
  h1: ({ children }: { children?: ReactNode }) => (
    <h1 className="mb-3 text-base font-semibold text-text-primary first:mt-0">{children}</h1>
  ),
  h2: ({ children }: { children?: ReactNode }) => (
    <h2 className="mb-3 mt-4 text-sm font-semibold uppercase tracking-[0.14em] text-text-secondary first:mt-0">{children}</h2>
  ),
  h3: ({ children }: { children?: ReactNode }) => (
    <h3 className="mb-2 mt-4 text-sm font-semibold text-text-primary first:mt-0">{children}</h3>
  ),
  p: ({ children }: { children?: ReactNode }) => (
    <p className="mb-3 text-[15px] leading-7 text-text-primary last:mb-0">{children}</p>
  ),
  ul: ({ children }: { children?: ReactNode }) => (
    <ul className="mb-3 list-disc space-y-2 pl-6 text-[15px] leading-7 text-text-primary marker:text-accent">{children}</ul>
  ),
  ol: ({ children }: { children?: ReactNode }) => (
    <ol className="mb-3 list-decimal space-y-2 pl-6 text-[15px] leading-7 text-text-primary marker:text-accent">{children}</ol>
  ),
  li: ({ children }: { children?: ReactNode }) => <li>{children}</li>,
  strong: ({ children }: { children?: ReactNode }) => <strong className="font-semibold text-text-primary">{children}</strong>,
  a: ({ children, href }: { children?: ReactNode; href?: string }) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-accent underline underline-offset-2">
      {children}
    </a>
  ),
  code: ({ children }: { children?: ReactNode }) => (
    <code className="rounded-[10px] border border-border bg-panel px-1.5 py-0.5 font-mono text-[13px] text-text-primary">{children}</code>
  ),
  blockquote: ({ children }: { children?: ReactNode }) => (
    <blockquote className="my-3 border-l border-accent pl-4 italic text-text-secondary">{children}</blockquote>
  ),
  hr: () => <hr className="my-4 border-border" />,
};

const demoDraft = `Hi Alex —

Following up on the update from yesterday.
I pulled the latest status and can send the finalized version by noon unless you want one adjustment first.

Best,
Brandon`;

const briefHowRows = [
  {
    title: 'Directive',
    body: 'The single move that matters most right now.',
  },
  {
    title: 'Draft',
    body: 'Ready-to-send wording when writing is the bottleneck.',
  },
  {
    title: 'Source trail',
    body: 'The evidence behind the recommendation.',
  },
];

function getDateLabel(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).toUpperCase();
}

function getGreetingLabel(): string {
  return 'Good afternoon';
}

function inferSourcePills(action: ActionWithDomain | null, artifact: ArtifactWithDraftedEmail | null | undefined): string[] {
  if (artifact?.type === 'document') {
    return ['Prepared document', 'Decision basis', 'Connected sources'];
  }
  if (artifact?.type === 'wait_rationale') {
    return ['Current context', 'Source trail'];
  }
  const evidenceText = JSON.stringify(action?.evidence ?? []).toLowerCase();
  const pills = new Set<string>();
  if (artifact?.type === 'email' || artifact?.type === 'drafted_email' || evidenceText.includes('email')) pills.add('Email thread');
  if (evidenceText.includes('calendar')) pills.add('Calendar hold');
  pills.add('Last draft');
  pills.add('Connected inbox');
  return Array.from(pills);
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const [action, setAction] = useState<ActionWithDomain | null>(null);
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [artifactVisibilityCount, setArtifactVisibilityCount] = useState(0);
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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('generated') === 'true') {
      window.history.replaceState({}, '', window.location.pathname);
      setFlash('Brief generated and sent.');
      setTimeout(() => setFlash(null), 4000);
    }
    if (params.get('upgraded') === 'true') {
      window.history.replaceState({}, '', window.location.pathname);
      setFlash('Welcome to Pro. Full artifacts unlocked.');
      setTimeout(() => setFlash(null), 6000);
    }
  }, []);

  useEffect(() => {
    if (status !== 'authenticated') return;
    let cancelled = false;
    void fetch('/api/integrations/status', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { integrations?: Array<{ provider: string; is_active?: boolean; needs_reauth?: boolean }> } | null) => {
        if (cancelled || !data?.integrations) return;
        setHasActiveIntegration(data.integrations.some((item) => item.is_active === true));
        const microsoft = data.integrations.find((item) => item.provider === 'azure_ad' && item.needs_reauth);
        const google = data.integrations.find((item) => item.provider === 'google' && item.needs_reauth);
        if (microsoft) setOauthReconnect('microsoft');
        else if (google) setOauthReconnect('google');
        else setOauthReconnect(null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [status]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (sessionStorage.getItem('foldera_pending_checkout') !== 'pro') return;
    sessionStorage.removeItem('foldera_pending_checkout');
    void (async () => {
      try {
        const response = await fetch('/api/stripe/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        const data = await response.json().catch(() => ({}));
        if (data.url) window.location.href = data.url as string;
      } catch {
        /* user stays on dashboard */
      }
    })();
  }, []);

  const load = useCallback(async () => {
    loadAbortRef.current?.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;

    setLoading(true);
    setFetchError(false);

    try {
      const [latestRes, subscriptionRes] = await Promise.all([
        fetch('/api/conviction/latest', { signal: controller.signal }),
        fetch('/api/subscription/status', { signal: controller.signal }),
      ]);

      if (controller.signal.aborted) return;

      if (subscriptionRes.ok) {
        const subscription = await subscriptionRes.json().catch(() => ({}));
        if (controller.signal.aborted) return;
        setSubPlan(typeof subscription.plan === 'string' ? subscription.plan : null);
        setSubStatus(typeof subscription.status === 'string' ? subscription.status : null);
      } else {
        setSubPlan(null);
        setSubStatus(null);
      }

      if (controller.signal.aborted) return;

      if (!latestRes.ok) {
        setFetchError(true);
        setAction(null);
        setArtifactVisibilityCount(0);
        return;
      }

      const data = await latestRes.json().catch(() => ({}));
      if (controller.signal.aborted) return;
      setArtifactVisibilityCount(typeof data?.approved_count === 'number' ? data.approved_count : 0);
      setAction(data?.id ? data : null);
    } catch {
      if (controller.signal.aborted) return;
      setFetchError(true);
      setAction(null);
      setArtifactVisibilityCount(0);
      setSubPlan(null);
      setSubStatus(null);
    } finally {
      if (!controller.signal.aborted && isMountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const deepAction = params.get('action');
    const id = params.get('id');
    if (!deepAction || !id) return;
    window.history.replaceState({}, '', window.location.pathname);
    if (deepAction !== 'approve' && deepAction !== 'skip') return;

    void (async () => {
      try {
        const response = await fetch('/api/conviction/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action_id: id, decision: deepAction }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          const message = (data as { error?: string }).error ?? 'Could not update that action.';
          if (shouldReconcileExecuteFailure(response, message)) {
            await load();
            setFlash('That directive was already handled or replaced. Showing your current state.');
            return;
          }
          throw new Error(message);
        }

        if (data.status === 'executed' || data.status === 'skipped') {
          setDone(true);
          setLastDecision(deepAction === 'approve' ? 'approve' : 'skip');
          if (deepAction === 'approve') {
            setExecutedActionId((data.action_id as string | undefined) ?? null);
            setFlash(approveSuccessFlash((data as { action_type?: string }).action_type ?? undefined, data.result));
          } else {
            setFlash('Snoozed. Foldera will adjust.');
          }
        } else {
          throw new Error('Unexpected response from Foldera.');
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Could not update that action.';
        if (shouldReconcileExecuteFailure(null, message)) {
          await load();
          setFlash('That directive was already handled or replaced. Showing your current state.');
          return;
        }
        setFlash(message);
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
      const response = await fetch('/api/conviction/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action_id: action.id, decision: 'approve' }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = (data as { error?: string }).error ?? 'Approve failed';
        if (shouldReconcileExecuteFailure(response, message)) {
          await load();
          setFlash('That directive was already handled or replaced. Showing your current state.');
          return;
        }
        throw new Error(message);
      }

      if (data.status === 'executed' || data.status === 'skipped') {
        setDone(true);
        setLastDecision('approve');
        setExecutedActionId((data.action_id as string | undefined) ?? null);
        setFlash(approveSuccessFlash((data as { action_type?: string }).action_type ?? action.action_type, data.result));
      } else {
        throw new Error('Unexpected response from Foldera.');
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Approve failed';
      if (shouldReconcileExecuteFailure(null, message)) {
        await load();
        setFlash('That directive was already handled or replaced. Showing your current state.');
        return;
      }
      setFlash(message);
    } finally {
      setExecuting(false);
    }
  };

  const handleSkip = async () => {
    if (!action || executing) return;
    setExecuting(true);
    try {
      const response = await fetch('/api/conviction/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action_id: action.id, decision: 'skip' }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = (data as { error?: string }).error ?? 'Skip failed';
        if (shouldReconcileExecuteFailure(response, message)) {
          await load();
          setFlash('That directive was already handled or replaced. Showing your current state.');
          return;
        }
        throw new Error(message);
      }
      if (data.status === 'executed' || data.status === 'skipped') {
        setDone(true);
        setLastDecision('skip');
        setFlash(action?.action_type === 'write_document' ? 'Skipped. Foldera will adjust.' : 'Snoozed. Foldera will adjust.');
      } else {
        throw new Error('Unexpected response from Foldera.');
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Skip failed';
      if (shouldReconcileExecuteFailure(null, message)) {
        await load();
        setFlash('That directive was already handled or replaced. Showing your current state.');
        return;
      }
      setFlash(message);
    } finally {
      setExecuting(false);
    }
  };

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
      /* best effort */
    }
    setFlash('Foldera will adjust.');
  }, [executedActionId, outcomeRecorded]);

  const handleCopyDraft = useCallback(async () => {
    const artifact = action?.artifact as ArtifactWithDraftedEmail | null | undefined;
    if (!artifact) return;
    const subject = typeof artifact.subject === 'string' ? artifact.subject : '';
    const body = artifactPrimaryText(artifact) ?? '';
    const toLine = artifact?.to || artifact?.recipient || '';
    const block = [`To: ${toLine}`, `Subject: ${subject}`, '', body].join('\n');
    try {
      await navigator.clipboard.writeText(block);
      setFlash('Copied draft — paste into your mail app, or tap Approve & send to deliver from your connected mailbox.');
      setTimeout(() => setFlash(null), 6000);
    } catch {
      setFlash('Could not copy automatically — select the text in your morning email or dashboard.');
      setTimeout(() => setFlash(null), 5000);
    }
  }, [action]);

  const handleCopyDocument = useCallback(async () => {
    const artifact = action?.artifact as ArtifactWithDraftedEmail | null | undefined;
    if (!artifact) return;
    const title = typeof artifact.title === 'string' ? artifact.title : 'Document';
    const body = artifactPrimaryText(artifact) ?? '';
    const block = [title, '', body].join('\n');
    try {
      await navigator.clipboard.writeText(block);
      setFlash('Copied full document — paste anywhere, or tap Save document to file it in Foldera.');
      setTimeout(() => setFlash(null), 6000);
    } catch {
      setFlash('Could not copy automatically — select the text in the preview below.');
      setTimeout(() => setFlash(null), 5000);
    }
  }, [action]);

  async function runFirstReadNow() {
    if (firstReadRunning) return;
    setFirstReadRunning(true);
    setFlash(null);
    try {
      const response = await fetch('/api/settings/run-brief?force=true&use_llm=true', {
        method: 'POST',
      });
      const data = await response.json().catch(() => ({}));
      const spendPolicy = data?.spend_policy as
        | { paid_llm_requested?: boolean; pipeline_dry_run?: boolean }
        | undefined;

      if (spendPolicy?.paid_llm_requested && spendPolicy?.pipeline_dry_run) {
        setFlash('First read ran as a dry run. Real generation is not enabled on this deployment.');
        return;
      }

      if (!response.ok && !data?.stages) {
        const message = typeof data?.error === 'string' ? data.error : 'Could not run your first read right now.';
        throw new Error(message);
      }

      await load();
      setFlash(data?.ok === true ? 'First read generated.' : 'First read ran. Foldera will show the result when the pipeline has enough signal.');
    } catch (error: unknown) {
      setFlash(error instanceof Error ? error.message : 'Could not run your first read right now.');
    } finally {
      setFirstReadRunning(false);
    }
  }

  async function startStripeCheckout() {
    try {
      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await response.json().catch(() => ({}));
      if (data.url) window.location.href = data.url as string;
    } catch {
      setFlash('Could not open checkout right now.');
    }
  }

  const sessionName = session?.user?.name?.trim() || 'Brandon';
  const firstName = sessionName.split(' ')[0] || 'Brandon';
  const currentAction = action;
  const artifact = currentAction?.artifact as ArtifactWithDraftedEmail | null | undefined;
  const artifactBody = artifactPrimaryText(artifact);
  const isEmail = artifact?.type === 'email' || artifact?.type === 'drafted_email';
  const isDocument = artifact?.type === 'document';
  const isWait = artifact?.type === 'wait_rationale';
  const isProArtifactUnlocked = subPlan === 'pro' && (subStatus === 'active' || subStatus === 'past_due');
  const showArtifactBlur = Boolean(artifact) && !isProArtifactUnlocked && artifactVisibilityCount > 3;

  const cardDirective = currentAction?.directive ?? 'Send the follow-up to Alex Morgan before noon.';
  const cardWhyNow = currentAction?.reason ?? 'You have an open thread with no reply, the ask is time-bound, and the current hold on your calendar makes this the cleanest unblocker today.';
  const cardSourcePills = inferSourcePills(currentAction, artifact);
  const cardStatusText = isDocument ? 'READY TO FILE' : isWait ? 'READY TO REVIEW' : 'READY TO SEND';
  const cardNextStep = isDocument ? 'Next: Save to record' : 'Next: Await response';
  const draftLabel = isDocument ? 'DOCUMENT' : isWait ? 'RATIONALE' : 'DRAFT';

  const draftBody = isDocument ? (
    artifactBody ? (
      <div
        className="max-h-[380px] overflow-y-auto rounded-[16px] border border-border bg-panel-raised p-4"
        data-testid="dashboard-document-body"
      >
        {artifact?.title ? <p className="mb-3 text-base font-semibold text-text-primary">{artifact.title}</p> : null}
        <ReactMarkdown components={DOCUMENT_MARKDOWN_COMPONENTS}>{artifactBody}</ReactMarkdown>
      </div>
    ) : (
      <p className="text-[15px] leading-7 text-text-secondary">Full text is in your morning email. Save document to file it, or skip to adjust.</p>
    )
  ) : isWait ? (
    <div className="space-y-3">
      {artifact?.context ? <p className="text-[15px] leading-7 text-text-primary">{artifact.context}</p> : null}
      {artifact?.tripwires?.[0] || artifact?.check_date ? (
        <p className="text-[13px] uppercase tracking-[0.12em] text-accent">Resume when: {artifact?.tripwires?.[0] ?? artifact?.check_date}</p>
      ) : null}
    </div>
  ) : (
    <div className="whitespace-pre-line text-[15px] leading-8 text-text-primary">{artifactBody ?? demoDraft}</div>
  );

  const cardActions = currentAction
    ? isDocument
      ? [
          { label: 'Copy full text', kind: 'secondary' as const, onClick: () => void handleCopyDocument() },
          { label: 'Skip and adjust', kind: 'amber' as const, onClick: () => void handleSkip() },
          { label: 'Save document', kind: 'primary' as const, onClick: () => void handleApprove(), dataTestId: 'dashboard-primary-action' },
        ]
      : [
          { label: 'Copy draft', kind: 'secondary' as const, onClick: () => void handleCopyDraft() },
          { label: 'Snooze 24h', kind: 'amber' as const, onClick: () => void handleSkip() },
          { label: 'Approve & send', kind: 'primary' as const, onClick: () => void handleApprove(), dataTestId: 'dashboard-primary-action' },
        ]
    : [
        { label: 'Copy draft', kind: 'secondary' as const, disabled: true },
        { label: 'Snooze 24h', kind: 'amber' as const, disabled: true },
        { label: 'Approve & send', kind: 'primary' as const, disabled: true },
      ];

  const flashBanner = flash ? (
    <div className="foldera-subpanel px-4 py-4">
      <p className="text-sm text-text-primary">{flash}</p>
    </div>
  ) : null;

  return (
    <div className="foldera-page min-h-screen bg-bg text-text-primary">
      <div className="mx-auto max-w-[1500px] px-3 py-3 sm:px-4 lg:px-6 lg:py-6">
        <div className="grid gap-4 lg:grid-cols-[clamp(240px,18vw,272px)_minmax(0,1fr)]">
          <DashboardSidebar activeLabel="Executive Briefing" userName={firstName} />

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_clamp(248px,20vw,296px)]">
            <div className="min-w-0">
              <div className="mx-auto w-full max-w-[980px] space-y-4">
                <div className="foldera-panel flex items-center justify-between px-4 py-3 lg:hidden">
                  <FolderaLogo href="/dashboard" markSize="sm" />
                  <div className="flex items-center gap-2">
                    <button type="button" className="inline-flex h-10 w-10 items-center justify-center rounded-[14px] border border-border bg-panel-raised text-text-secondary" aria-label="Search">
                      <Search className="h-4 w-4" />
                    </button>
                    <button type="button" className="inline-flex h-10 w-10 items-center justify-center rounded-[14px] border border-border bg-panel-raised text-text-secondary" aria-label="Notifications">
                      <Bell className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <header className="foldera-panel px-5 py-5 sm:px-6">
                  <p className="foldera-eyebrow">{getDateLabel()}</p>
                  <h1 className="mt-2 text-[38px] font-semibold tracking-[-0.05em] text-text-primary sm:text-[52px]">
                    {getGreetingLabel()}, {firstName}.
                  </h1>
                  <div className="mt-6 flex flex-wrap gap-5 text-sm text-text-secondary">
                    <div className="flex items-center gap-3">
                      <Inbox className="h-4 w-4 text-text-muted" />
                      <span className="text-[28px] font-semibold tracking-[-0.04em] text-text-primary">5</span>
                      <span>open threads</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <TriangleAlert className="h-4 w-4 text-warning" />
                      <span className="text-[28px] font-semibold tracking-[-0.04em] text-warning">2</span>
                      <span>need attention</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <TrendingUp className="h-4 w-4 text-text-muted" />
                      <span className="text-[28px] font-semibold tracking-[-0.04em] text-text-primary">1</span>
                      <span>ready to move</span>
                    </div>
                  </div>
                </header>

                {oauthReconnect ? (
                  <div className="foldera-subpanel px-4 py-4">
                    <p className="text-sm text-text-primary">
                      Your {oauthReconnect === 'microsoft' ? 'Microsoft' : 'Google'} connection needs a quick refresh so Foldera can keep your brief accurate.
                    </p>
                    <a
                      href={oauthReconnect === 'microsoft' ? '/api/microsoft/connect' : '/api/google/connect'}
                      className="foldera-button-primary mt-4"
                    >
                      Reconnect {oauthReconnect === 'microsoft' ? 'Microsoft' : 'Google'}
                    </a>
                  </div>
                ) : null}

                {!done ? flashBanner : null}

                {loading ? (
                  <div className="foldera-panel animate-pulse px-5 py-6 sm:px-6">
                    <div className="h-3 w-36 rounded-full bg-white/10" />
                    <div className="mt-4 h-12 w-3/4 rounded-[16px] bg-white/10" />
                    <div className="mt-3 h-12 w-2/3 rounded-[16px] bg-white/10" />
                    <div className="mt-6 h-[520px] rounded-[24px] bg-white/[0.03]" />
                  </div>
                ) : done ? (
                  <div className="foldera-panel px-5 py-8 text-center sm:px-6">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-cyan-300/30 bg-cyan-300/10 text-accent">
                      {lastDecision === 'skip' ? <Clock3 className="h-6 w-6" /> : <Send className="h-6 w-6" />}
                    </div>
                    {flash ? <p className="mt-5 text-lg font-medium text-text-primary">{flash}</p> : null}
                    <p className="mt-2 text-sm text-text-muted">Your next read arrives tomorrow morning.</p>
                    {lastDecision === 'approve' && executedActionId && !outcomeRecorded ? (
                      <div className="mt-6 flex flex-wrap justify-center gap-3">
                        <button
                          type="button"
                          onClick={() => void recordOutcome('worked')}
                          className="foldera-button-primary"
                        >
                          It worked
                        </button>
                        <button
                          type="button"
                          onClick={() => void recordOutcome('didnt_work')}
                          className="foldera-button-secondary"
                        >
                          Didn&apos;t work
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : fetchError ? (
                  <div className="foldera-panel px-5 py-8 text-center sm:px-6">
                    <p className="text-lg font-medium text-text-primary">Something went wrong loading your dashboard.</p>
                    <button type="button" onClick={() => void load()} className="foldera-button-secondary mt-5">
                      Try again
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <DailyBriefCard
                      className="mx-auto w-full max-w-[960px]"
                      directive={cardDirective}
                      whyNow={cardWhyNow}
                      draftLabel={draftLabel}
                      draftBody={draftBody}
                      sourcePills={cardSourcePills}
                      nextStep={cardNextStep}
                      statusText={cardStatusText}
                      footerText="Grounded in connected sources"
                      actions={cardActions}
                      blur={showArtifactBlur}
                      blurCta={(
                        <div className="text-center">
                          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-cyan-300/30 bg-cyan-300/10 text-accent">
                            <Lock className="h-5 w-5" />
                          </div>
                          <p className="mt-4 max-w-[280px] text-base font-medium text-text-primary">
                            Upgrade to Pro to keep receiving finished work.
                          </p>
                          <button
                            type="button"
                            onClick={() => void startStripeCheckout()}
                            className="foldera-button-primary mt-4"
                          >
                            Upgrade to Pro
                          </button>
                        </div>
                      )}
                    />

                    {!currentAction && hasActiveIntegration ? (
                      <div className="mx-auto w-full max-w-[960px]">
                        <div className="foldera-subpanel px-4 py-4">
                          <p className="text-sm text-text-primary">
                            Foldera will post your next source-backed brief here as soon as one is ready.
                          </p>
                          <button
                            type="button"
                            onClick={() => void runFirstReadNow()}
                            disabled={firstReadRunning}
                            className="foldera-button-primary mt-4 disabled:cursor-wait disabled:opacity-60"
                          >
                            {firstReadRunning ? 'Running first read' : 'Run first read now'}
                          </button>
                        </div>
                      </div>
                    ) : null}

                    {currentAction?.action_type === 'send_message' && isEmail && artifactBody ? (
                      <div className="foldera-subpanel px-4 py-4 text-center">
                        <p className="text-[12px] leading-6 text-text-secondary">
                          Approve sends from your connected Gmail or Outlook.{' '}
                          <button type="button" onClick={() => void handleCopyDraft()} className="underline underline-offset-2 hover:text-text-primary">
                            Copy as text
                          </button>
                        </p>
                      </div>
                    ) : null}

                    {currentAction?.action_type === 'write_document' && isDocument && artifactBody ? (
                      <div className="foldera-subpanel px-4 py-4 text-center" data-testid="dashboard-document-actions-hint">
                        <p className="text-[12px] leading-6 text-text-secondary">
                          Save document files the full text to your Foldera record. Skip keeps it out of your record and tells Foldera to adjust.
                        </p>
                        <p className="mt-2 text-[12px] leading-6 text-text-secondary">
                          <button type="button" onClick={() => void handleCopyDocument()} className="underline underline-offset-2 hover:text-text-primary">
                            Copy full text
                          </button>
                        </p>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            </div>

            <aside className="hidden space-y-4 xl:block">
              <div className="foldera-panel hidden px-4 py-4 xl:block">
                <div className="flex items-center gap-3 rounded-[16px] border border-border bg-panel-raised px-4 py-3 text-sm text-text-muted">
                  <Search className="h-4 w-4" />
                  <span className="flex-1">Search Foldera...</span>
                  <span className="rounded-[10px] border border-border px-2 py-1 text-[11px]">⌘ K</span>
                </div>
                <button type="button" className="mt-3 inline-flex h-11 w-11 items-center justify-center rounded-[16px] border border-border bg-panel-raised text-text-secondary">
                  <Bell className="h-4 w-4" />
                </button>
              </div>

              <div className="foldera-panel p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="foldera-eyebrow">How this brief works</p>
                  <a href="/#product" className="text-sm text-text-muted hover:text-text-primary">
                    Learn more →
                  </a>
                </div>
                <div className="mt-5 space-y-5">
                  {briefHowRows.map((row) => (
                    <div key={row.title} className="grid grid-cols-[auto_minmax(0,1fr)] gap-4 border-t border-border pt-5 first:border-t-0 first:pt-0">
                      <div className="flex h-9 w-9 items-center justify-center rounded-[12px] border border-border bg-panel-raised text-text-secondary">
                        {row.title === 'Directive' ? <Send className="h-4 w-4" /> : row.title === 'Draft' ? <FileText className="h-4 w-4" /> : <Layers3 className="h-4 w-4" />}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-text-primary">{row.title}</p>
                        <p className="mt-2 text-sm leading-7 text-text-muted">{row.body}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="foldera-panel p-5">
                <div className="flex min-h-[164px] items-center justify-center rounded-[20px] border border-dashed border-border bg-panel-raised px-6 text-center">
                  <div>
                    <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-border bg-panel text-text-muted">
                      <Download className="h-4 w-4" />
                    </div>
                    <p className="mt-4 text-base font-medium text-text-primary">Drop a folder or document</p>
                    <p className="mt-2 text-sm leading-7 text-text-muted">Foldera will get to work instantly.</p>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}
