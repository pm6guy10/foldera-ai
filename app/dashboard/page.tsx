'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import { useSession } from 'next-auth/react';
import type { ConvictionAction } from '@/lib/briefing/types';
import { DailyBriefCard } from '@/components/foldera/DailyBriefCard';
import { FolderaDashboardPixelLock } from '@/components/dashboard/foldera-dashboard-pixel-lock';

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

type ActionWithDomain = ConvictionAction & { domain?: string; generatedAt?: string };
type DashboardNoticeKind =
  | 'approve_sent'
  | 'approve_saved_document'
  | 'skip_snoozed'
  | 'reconciled_stale_action'
  | 'error';
type DashboardNotice = { kind: DashboardNoticeKind; message: string };

function approveSuccessFlash(actionType: string | undefined, result: unknown): DashboardNotice {
  const payload = result && typeof result === 'object' ? (result as Record<string, unknown>) : null;
  if (actionType === 'write_document') {
    const emailResult = payload?.document_ready_email;
    if (emailResult && typeof emailResult === 'object') {
      const output = emailResult as { sent?: boolean; reason?: string; send_error?: string };
      if (output.sent === true) {
        return { kind: 'approve_saved_document', message: 'Saved. We also emailed you the full document.' };
      }
      if (output.reason === 'no_verified_email') {
        return {
          kind: 'approve_saved_document',
          message: 'Saved to your Foldera record. Add a verified email in Settings to receive a copy by email.',
        };
      }
      if (typeof output.send_error === 'string' && output.send_error.length > 0) {
        return {
          kind: 'approve_saved_document',
          message: 'Saved. Email delivery failed - your document is still in Foldera Signals.',
        };
      }
    }
    if (payload?.saved === true) {
      return { kind: 'approve_saved_document', message: 'Saved. Your document is in Foldera Signals.' };
    }
    return { kind: 'approve_saved_document', message: 'Saved.' };
  }

  const sentVia = (payload as { sent_via?: string } | null)?.sent_via;
  if (sentVia === 'gmail') return { kind: 'approve_sent', message: 'Sent from your Gmail.' };
  if (sentVia === 'outlook') return { kind: 'approve_sent', message: 'Sent from your Outlook.' };
  if (sentVia === 'resend') {
    return { kind: 'approve_sent', message: 'Sent via Foldera. Connect Gmail in Settings to send from your own inbox.' };
  }
  return { kind: 'approve_sent', message: 'Sent. Check your outbox.' };
}

const DOCUMENT_MARKDOWN_COMPONENTS = {
  h1: ({ children }: { children?: ReactNode }) => (
    <h1 className="mb-3 text-base font-semibold text-white first:mt-0">{children}</h1>
  ),
  h2: ({ children }: { children?: ReactNode }) => (
    <h2 className="mb-3 mt-4 text-sm font-semibold uppercase tracking-[0.14em] text-gray-300 first:mt-0">{children}</h2>
  ),
  h3: ({ children }: { children?: ReactNode }) => (
    <h3 className="mb-2 mt-4 text-sm font-semibold text-white first:mt-0">{children}</h3>
  ),
  p: ({ children }: { children?: ReactNode }) => (
    <p className="mb-3 text-[15px] leading-7 text-gray-100 last:mb-0">{children}</p>
  ),
  ul: ({ children }: { children?: ReactNode }) => (
    <ul className="mb-3 list-disc space-y-2 pl-6 text-[15px] leading-7 text-gray-100 marker:text-cyan-400">{children}</ul>
  ),
  ol: ({ children }: { children?: ReactNode }) => (
    <ol className="mb-3 list-decimal space-y-2 pl-6 text-[15px] leading-7 text-gray-100 marker:text-cyan-400">{children}</ol>
  ),
  li: ({ children }: { children?: ReactNode }) => <li>{children}</li>,
  strong: ({ children }: { children?: ReactNode }) => <strong className="font-semibold text-white">{children}</strong>,
  a: ({ children, href }: { children?: ReactNode; href?: string }) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-cyan-400 underline underline-offset-2">
      {children}
    </a>
  ),
  code: ({ children }: { children?: ReactNode }) => (
    <code className="rounded-[10px] border border-[#1b2530] bg-[#121820] px-1.5 py-0.5 font-mono text-[13px] text-white">{children}</code>
  ),
  blockquote: ({ children }: { children?: ReactNode }) => (
    <blockquote className="my-3 border-l border-cyan-400 pl-4 italic text-gray-300">{children}</blockquote>
  ),
  hr: () => <hr className="my-4 border-[#1b2530]" />,
};

const demoDraft = `Hi Alex -

Following up on the update from yesterday.
I pulled the latest status and can send the finalized version by noon unless you want one adjustment first.

Best,
Brandon`;

const DEMO_DIRECTIVE = 'Send the follow-up to Alex Morgan before noon.';
const DEMO_WHY =
  'You have an open thread with no reply, the ask is time-bound, and the current hold on your calendar makes this the cleanest unblocker today.';
const DEMO_SOURCE_PILLS = ['Email thread', 'Calendar hold', 'Last draft', 'Connected inbox'];
const DESKTOP_BREAKPOINT = 1024;

function computeIsDesktop(): boolean {
  if (typeof window === 'undefined') return false;
  return window.innerWidth >= DESKTOP_BREAKPOINT;
}

function getDateLabel(): string {
  return new Date()
    .toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    })
    .toUpperCase();
}

function getGreetingLabel(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
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
  const [executing, setExecuting] = useState(false);
  const [notice, setNotice] = useState<DashboardNotice | null>(null);
  const [artifactVisibilityCount, setArtifactVisibilityCount] = useState(0);
  const [subPlan, setSubPlan] = useState<string | null>(null);
  const [subStatus, setSubStatus] = useState<string | null>(null);
  const [lastDecision, setLastDecision] = useState<'approve' | 'skip' | null>(null);
  const [executedActionId, setExecutedActionId] = useState<string | null>(null);
  const [outcomeRecorded, setOutcomeRecorded] = useState(false);
  const [isDesktop, setIsDesktop] = useState(() => computeIsDesktop());

  const loadAbortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    loadAbortRef.current?.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;

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

      if (!latestRes.ok) {
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
      setAction(null);
      setArtifactVisibilityCount(0);
      setSubPlan(null);
      setSubStatus(null);
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
            setNotice({
              kind: 'reconciled_stale_action',
              message: 'That directive was already handled or replaced. Showing your current state.',
            });
            return;
          }
          setNotice({ kind: 'error', message });
          return;
        }

        if (data.status === 'executed' || data.status === 'skipped') {
          if (deepAction === 'approve') {
            setLastDecision('approve');
            setExecutedActionId((data.action_id as string | undefined) ?? id);
            setOutcomeRecorded(false);
            setNotice(approveSuccessFlash((data as { action_type?: string }).action_type ?? action?.action_type, data.result));
          } else {
            setLastDecision('skip');
            setExecutedActionId(null);
            setNotice({ kind: 'skip_snoozed', message: 'Snoozed. Foldera will adjust.' });
          }
          await load();
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Could not update that action.';
        if (shouldReconcileExecuteFailure(null, message)) {
          await load();
          setNotice({
            kind: 'reconciled_stale_action',
            message: 'That directive was already handled or replaced. Showing your current state.',
          });
          return;
        }
        setNotice({ kind: 'error', message });
      }
    })();
  }, [action?.action_type, load]);

  useEffect(() => {
    if (status === 'authenticated') {
      void load();
    }
    return () => {
      loadAbortRef.current?.abort();
    };
  }, [load, status]);

  useEffect(() => {
    const onResize = () => setIsDesktop(computeIsDesktop());
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousOverflowX = document.body.style.overflowX;
    const previousOverflowY = document.body.style.overflowY;
    if (isDesktop) {
      document.body.style.overflow = 'hidden';
      document.body.style.overflowX = 'hidden';
      document.body.style.overflowY = 'hidden';
    } else {
      document.body.style.overflow = previousOverflow;
      document.body.style.overflowX = previousOverflowX;
      document.body.style.overflowY = previousOverflowY;
    }
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.overflowX = previousOverflowX;
      document.body.style.overflowY = previousOverflowY;
    };
  }, [isDesktop]);

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
          setNotice({
            kind: 'reconciled_stale_action',
            message: 'That directive was already handled or replaced. Showing your current state.',
          });
          await load();
          return;
        }
        setNotice({ kind: 'error', message });
        return;
      }

      if (data.status === 'executed' || data.status === 'skipped') {
        setLastDecision('approve');
        setExecutedActionId((data.action_id as string | undefined) ?? action.id);
        setOutcomeRecorded(false);
        setNotice(approveSuccessFlash((data as { action_type?: string }).action_type ?? action.action_type, data.result));
        await load();
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Approve failed';
      if (shouldReconcileExecuteFailure(null, message)) {
        setNotice({
          kind: 'reconciled_stale_action',
          message: 'That directive was already handled or replaced. Showing your current state.',
        });
        await load();
        return;
      }
      setNotice({ kind: 'error', message });
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
          setNotice({
            kind: 'reconciled_stale_action',
            message: 'That directive was already handled or replaced. Showing your current state.',
          });
          await load();
          return;
        }
        setNotice({ kind: 'error', message });
        return;
      }
      if (data.status === 'executed' || data.status === 'skipped') {
        setLastDecision('skip');
        setExecutedActionId(null);
        setNotice({ kind: 'skip_snoozed', message: 'Snoozed. Foldera will adjust.' });
        await load();
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Skip failed';
      if (shouldReconcileExecuteFailure(null, message)) {
        setNotice({
          kind: 'reconciled_stale_action',
          message: 'That directive was already handled or replaced. Showing your current state.',
        });
        await load();
        return;
      }
      setNotice({ kind: 'error', message });
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
    } catch {
      /* clipboard may be unavailable */
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
    } catch {
      /* clipboard may be unavailable */
    }
  }, [action]);

  const handleCopyFallbackDraft = useCallback(async () => {
    const block = ['To: alex.morgan@example.com', 'Subject: Alex Morgan follow-up', '', demoDraft].join('\n');
    try {
      await navigator.clipboard.writeText(block);
    } catch {
      /* ignore */
    }
  }, []);

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
      setNotice({ kind: 'error', message: 'Could not open checkout right now.' });
    }
  }

  const sessionName = session?.user?.name?.trim() || 'Brandon';
  const firstName = sessionName.split(' ')[0] || 'Brandon';
  const currentAction = action;
  const artifact = currentAction?.artifact as ArtifactWithDraftedEmail | null | undefined;
  const artifactBody = artifactPrimaryText(artifact);
  const isDocument = artifact?.type === 'document';
  const isWait = artifact?.type === 'wait_rationale';
  const isProArtifactUnlocked =
    subPlan === 'pro' && (subStatus === 'active' || subStatus === 'past_due' || subStatus === 'active_trial');
  const showArtifactBlur = Boolean(artifact) && !isProArtifactUnlocked && artifactVisibilityCount > 3;

  const hasLiveAction = Boolean(currentAction?.id);
  const cardDirective = currentAction?.directive ?? DEMO_DIRECTIVE;
  const cardWhyNow = currentAction?.reason ?? DEMO_WHY;
  const cardSourcePills =
    hasLiveAction && currentAction ? inferSourcePills(currentAction, artifact) : DEMO_SOURCE_PILLS;
  const cardStatusText = isDocument ? 'READY TO FILE' : isWait ? 'READY TO REVIEW' : 'READY TO SEND';
  const cardNextStep = isDocument ? 'Next: Save to record' : 'Next: Await response';
  const draftLabel = isDocument ? 'DOCUMENT' : isWait ? 'RATIONALE' : 'DRAFT';

  const draftBody = showArtifactBlur ? (
    <div
      className="relative overflow-hidden rounded-[16px] border border-[#1b2530] bg-[#121820] p-4"
      data-testid="dashboard-pro-blur"
    >
      <div className="pointer-events-none select-none blur-[5px]">
        {isDocument ? (
          <>
            {artifact?.title ? <p className="mb-3 text-base font-semibold text-white">{artifact.title}</p> : null}
            <div className="whitespace-pre-line text-[15px] leading-7 text-gray-100">{artifactBody}</div>
          </>
        ) : (
          <div className="whitespace-pre-line text-[15px] leading-7 text-gray-100">{artifactBody}</div>
        )}
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#07090dcc] px-6 text-center">
        <p className="max-w-[280px] text-base font-medium text-white">Upgrade to Pro to keep receiving finished work.</p>
        <button
          type="button"
          onClick={() => void startStripeCheckout()}
          className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-lg bg-cyan-500 px-4 py-2 font-medium text-black"
        >
          Upgrade to Pro
        </button>
      </div>
    </div>
  ) : isDocument ? (
    artifactBody ? (
      <div
        className="max-h-[380px] overflow-y-auto rounded-[16px] border border-[#1b2530] bg-[#121820] p-4"
        data-testid="dashboard-document-body"
      >
        {artifact?.title ? <p className="mb-3 text-base font-semibold text-white">{artifact.title}</p> : null}
        <ReactMarkdown components={DOCUMENT_MARKDOWN_COMPONENTS}>{artifactBody}</ReactMarkdown>
      </div>
    ) : (
      <p className="text-[15px] leading-7 text-gray-300">Full text is in your morning email. Save document to file it, or skip to adjust.</p>
    )
  ) : isWait ? (
    <div className="space-y-3">
      {artifact?.context ? <p className="text-[15px] leading-7 text-gray-100">{artifact.context}</p> : null}
      {artifact?.tripwires?.[0] || artifact?.check_date ? (
        <p className="text-[13px] uppercase tracking-[0.12em] text-cyan-400">Resume when: {artifact?.tripwires?.[0] ?? artifact?.check_date}</p>
      ) : null}
    </div>
  ) : (
    <div className="whitespace-pre-line text-[15px] leading-7 text-gray-100">{artifactBody ?? demoDraft}</div>
  );

  const cardActions = isDocument
    ? [
        { label: 'Copy full text', kind: 'secondary' as const, onClick: () => void handleCopyDocument(), disabled: !artifactBody },
        { label: 'Skip and adjust', kind: 'amber' as const, onClick: () => void handleSkip(), disabled: !hasLiveAction || executing },
        {
          label: 'Save document',
          kind: 'primary' as const,
          onClick: () => void handleApprove(),
          disabled: !hasLiveAction || executing,
          dataTestId: 'dashboard-primary-action',
        },
      ]
    : [
        {
          label: 'Copy draft',
          kind: 'secondary' as const,
          onClick: () => void (hasLiveAction ? handleCopyDraft() : handleCopyFallbackDraft()),
          disabled: false,
        },
        { label: 'Snooze 24h', kind: 'amber' as const, onClick: () => void handleSkip(), disabled: !hasLiveAction || executing },
        {
          label: 'Approve & send',
          kind: 'primary' as const,
          onClick: () => void handleApprove(),
          disabled: !hasLiveAction || executing,
          dataTestId: 'dashboard-primary-action',
        },
      ];

  const noticeBanner = notice ? (
    <div
      className="border-b border-[#1a2530] bg-[#0d1419] px-4 py-3 sm:px-6"
      data-testid="dashboard-status-notice"
      data-status-id={notice.kind}
    >
      <p className="text-sm text-white">{notice.message}</p>
    </div>
  ) : null;

  const outcomeButtons = lastDecision === 'approve' && executedActionId && !outcomeRecorded ? (
    <div className="flex flex-wrap justify-center gap-3">
      <button
        type="button"
        onClick={() => void recordOutcome('worked')}
        className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-cyan-500 px-4 py-2 text-sm font-medium text-black"
      >
        It worked
      </button>
      <button
        type="button"
        onClick={() => void recordOutcome('didnt_work')}
        className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-[#1b2530] bg-[#0d1419] px-4 py-2 text-sm text-white"
      >
        Didn&apos;t work
      </button>
    </div>
  ) : null;

  if (isDesktop) {
    return (
      <div className="relative h-screen w-screen overflow-hidden bg-[#04080d] text-[#f3f7fa]">
        <FolderaDashboardPixelLock
          onCopyDraft={() => void (hasLiveAction ? handleCopyDraft() : handleCopyFallbackDraft())}
          onSnooze={() => void handleSkip()}
          onApprove={() => void handleApprove()}
          onUpgrade={() => void startStripeCheckout()}
          disableSnooze={!hasLiveAction || executing}
          disableApprove={!hasLiveAction || executing}
        />
        {notice ? (
          <div
            className="absolute bottom-6 left-1/2 z-30 w-[min(720px,92vw)] -translate-x-1/2 rounded-lg border border-[#1a2530] bg-[#0d1419f0] px-4 py-3"
            data-testid="dashboard-status-notice"
            data-status-id={notice.kind}
          >
            <p className="text-sm text-white">{notice.message}</p>
          </div>
        ) : null}
        {outcomeButtons ? (
          <div className="absolute bottom-20 left-1/2 z-30 -translate-x-1/2">{outcomeButtons}</div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0f14] text-[#f3f7fa]">
      {noticeBanner}
      <div className="mx-auto w-full max-w-[1140px] px-4 py-6">
        <p className="mb-1 text-sm uppercase tracking-wide text-gray-500">{getDateLabel()}</p>
        <h1 className="text-[clamp(2rem,4vw,2.5rem)] text-white">
          {getGreetingLabel()}, <span className="font-semibold">{firstName}.</span>
        </h1>

        <div className="mb-8 mt-6 flex flex-wrap items-center gap-8 text-sm text-gray-400">
          <span>5 open threads</span>
          <span>2 need attention</span>
          <span>1 ready to move</span>
        </div>

        <DailyBriefCard
          className="w-full"
          dashboardCta
          directive={cardDirective}
          whyNow={cardWhyNow}
          draftLabel={draftLabel}
          draftBody={draftBody}
          sourcePills={cardSourcePills}
          nextStep={cardNextStep}
          statusText={cardStatusText}
          footerText="Grounded in connected sources"
          actions={cardActions}
        />
      </div>
      {outcomeButtons ? <div className="px-4 pb-8">{outcomeButtons}</div> : null}
    </div>
  );
}
