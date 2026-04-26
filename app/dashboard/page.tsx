'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useSession } from 'next-auth/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Bell,
  Mail,
  Search,
  TriangleAlert,
  TrendingUp,
} from 'lucide-react';
import { DailyBriefCard } from '@/components/foldera/DailyBriefCard';
import { DashboardSidebar } from '@/components/foldera/DashboardSidebar';
import { EmptyStateCard } from '@/components/foldera/EmptyStateCard';
import { FolderaLogo } from '@/components/foldera/FolderaLogo';
import { RightPanel } from '@/components/foldera/RightPanel';

type DashboardArtifact = {
  type?: string;
  to?: string;
  recipient?: string;
  subject?: string;
  title?: string;
  body?: string;
  text?: string;
  content?: string;
  context?: string;
  [key: string]: unknown;
};

type DashboardAction = {
  id: string;
  directive?: string;
  action_type?: string;
  reason?: string;
  evidence?: unknown[];
  artifact?: DashboardArtifact | null;
};

type DashboardStatusNotice = {
  id: string;
  message: string;
};

type IntegrationStatusPayload = {
  integrations?: Array<{
    is_active?: boolean;
  }>;
};

type StageMetrics = {
  isDesktop: boolean;
  scale: number;
  offsetX: number;
  offsetY: number;
};

const DESIGN_W = 2048;
const DESIGN_H = 1152;
const DESKTOP_STAGE_MIN_WIDTH = 1280;
const DEFAULT_STAGE_METRICS: StageMetrics = {
  isDesktop: false,
  scale: 1,
  offsetX: 0,
  offsetY: 0,
};

const DOCUMENT_MARKDOWN_COMPONENTS = {
  h1: ({ children }: { children?: ReactNode }) => (
    <h1 className="mb-3 text-base font-semibold text-text-primary first:mt-0">{children}</h1>
  ),
  h2: ({ children }: { children?: ReactNode }) => (
    <h2 className="mb-3 mt-4 text-sm font-semibold uppercase tracking-[0.14em] text-text-secondary first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }: { children?: ReactNode }) => (
    <h3 className="mb-2 mt-4 text-sm font-semibold text-text-primary first:mt-0">{children}</h3>
  ),
  p: ({ children }: { children?: ReactNode }) => (
    <p className="mb-3 text-[15px] leading-7 text-text-primary last:mb-0">{children}</p>
  ),
  ul: ({ children }: { children?: ReactNode }) => (
    <ul className="mb-3 list-disc space-y-2 pl-6 text-[15px] leading-7 text-text-primary marker:text-accent">
      {children}
    </ul>
  ),
  ol: ({ children }: { children?: ReactNode }) => (
    <ol className="mb-3 list-decimal space-y-2 pl-6 text-[15px] leading-7 text-text-primary marker:text-accent">
      {children}
    </ol>
  ),
  li: ({ children }: { children?: ReactNode }) => <li>{children}</li>,
  strong: ({ children }: { children?: ReactNode }) => (
    <strong className="font-semibold text-text-primary">{children}</strong>
  ),
};

function shouldReconcileExecuteFailure(res: Response | null, errorMessage: string): boolean {
  if (res && res.status === 404) return true;
  const message = errorMessage.toLowerCase();
  return message.includes('already claimed') || message.includes('not found');
}

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function artifactClipboardText(action: DashboardAction | null): string {
  if (!action?.artifact || typeof action.artifact !== 'object') return '';
  const artifact = action.artifact;
  const lines: string[] = [];
  const to = asTrimmedString(artifact.to ?? artifact.recipient);
  const subject = asTrimmedString(artifact.subject);
  const title = asTrimmedString(artifact.title);
  const body =
    asTrimmedString(artifact.body) ??
    asTrimmedString(artifact.text) ??
    asTrimmedString(artifact.content) ??
    asTrimmedString(artifact.context) ??
    '';

  if (to) lines.push(`To: ${to}`);
  if (subject) lines.push(`Subject: ${subject}`);
  if (title && !to && !subject) lines.push(title);
  if (lines.length > 0 && body) lines.push('');
  if (body) lines.push(body);

  if (lines.length > 0) return lines.join('\n');

  try {
    return JSON.stringify(artifact, null, 2);
  } catch {
    return '';
  }
}

function getArtifactBody(artifact: DashboardArtifact | null | undefined): string {
  return (
    asTrimmedString(artifact?.body) ??
    asTrimmedString(artifact?.text) ??
    asTrimmedString(artifact?.content) ??
    asTrimmedString(artifact?.context) ??
    ''
  );
}

function isWriteDocumentAction(action: DashboardAction | null): boolean {
  return action?.action_type === 'write_document' || action?.artifact?.type === 'document';
}

function buildDecisionSuccessNotice(
  action: DashboardAction | null,
  decision: 'approve' | 'skip',
): DashboardStatusNotice {
  if (decision === 'skip') {
    return {
      id: 'skip_snoozed',
      message: isWriteDocumentAction(action)
        ? 'Skipped. Foldera will adjust the next document.'
        : 'Snoozed. Foldera will adjust the next directive.',
    };
  }

  return isWriteDocumentAction(action)
    ? {
        id: 'approve_saved_document',
        message: 'Saved. Your document is in Foldera Signals.',
      }
    : {
        id: 'approve_sent',
        message: 'Sent. Check your outbox.',
      };
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
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function computeStageMetrics(): StageMetrics {
  if (typeof window === 'undefined') {
    return { isDesktop: false, scale: 1, offsetX: 0, offsetY: 0 };
  }

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  if (viewportWidth < DESKTOP_STAGE_MIN_WIDTH) {
    return { isDesktop: false, scale: 1, offsetX: 0, offsetY: 0 };
  }

  const scale = Math.min(viewportWidth / DESIGN_W, viewportHeight / DESIGN_H);
  const offsetX = (viewportWidth - DESIGN_W * scale) / 2;
  const offsetY = (viewportHeight - DESIGN_H * scale) / 2;
  return { isDesktop: true, scale, offsetX, offsetY };
}

function inferSourcePills(action: DashboardAction | null): string[] {
  if (isWriteDocumentAction(action)) {
    return ['Prepared document', 'Decision basis', 'Connected sources'];
  }

  if (action?.artifact?.type === 'wait_rationale' || action?.action_type === 'do_nothing') {
    return ['Current context', 'Source trail'];
  }

  const evidenceText = JSON.stringify(action?.evidence ?? []).toLowerCase();
  const pills = new Set<string>();
  if (
    action?.action_type === 'send_message' ||
    action?.artifact?.type === 'email' ||
    action?.artifact?.type === 'drafted_email' ||
    evidenceText.includes('email')
  ) {
    pills.add('Email thread');
  }
  if (evidenceText.includes('calendar')) {
    pills.add('Calendar hold');
  }
  pills.add('Last draft');
  pills.add('Connected inbox');
  return Array.from(pills);
}

export default function DashboardPage() {
  const { data: session, status } = useSession();

  const [action, setAction] = useState<DashboardAction | null>(null);
  const [loadingLatest, setLoadingLatest] = useState(true);
  const [hasActiveIntegration, setHasActiveIntegration] = useState(false);
  const [artifactPaywallLocked, setArtifactPaywallLocked] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [firstReadRunning, setFirstReadRunning] = useState(false);
  const [statusNotice, setStatusNotice] = useState<DashboardStatusNotice | null>(null);
  const [outcomeSubmitting, setOutcomeSubmitting] = useState<null | 'worked' | 'didnt_work'>(
    null,
  );
  const [stageMetrics, setStageMetrics] = useState<StageMetrics>(DEFAULT_STAGE_METRICS);
  const [executedActionId, setExecutedActionId] = useState<string | null>(null);
  const [outcomeRecorded, setOutcomeRecorded] = useState(false);

  const loadAbortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    loadAbortRef.current?.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;
    setLoadingLatest(true);

    try {
      const latestRes = await fetch('/api/conviction/latest', { signal: controller.signal });
      if (controller.signal.aborted) return;

      if (!latestRes.ok) {
        setAction(null);
        setArtifactPaywallLocked(false);
        return;
      }

      const latest = await latestRes.json().catch(() => ({}));
      if (controller.signal.aborted) return;

      setAction(latest?.id ? (latest as DashboardAction) : null);
      setArtifactPaywallLocked(latest?.artifact_paywall_locked === true);
    } catch {
      if (controller.signal.aborted) return;
      setAction(null);
      setArtifactPaywallLocked(false);
    } finally {
      if (!controller.signal.aborted) {
        setLoadingLatest(false);
      }
    }
  }, []);

  useEffect(() => {
    if (status === 'authenticated') {
      void load();
    }

    return () => {
      loadAbortRef.current?.abort();
    };
  }, [load, status]);

  useEffect(() => {
    if (status !== 'authenticated') {
      setHasActiveIntegration(false);
      return;
    }

    let cancelled = false;
    void fetch('/api/integrations/status', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: IntegrationStatusPayload | null) => {
        if (cancelled) return;
        const integrations = Array.isArray(payload?.integrations) ? payload.integrations : [];
        setHasActiveIntegration(
          integrations.some((integration) => integration?.is_active === true),
        );
      })
      .catch(() => {
        if (!cancelled) {
          setHasActiveIntegration(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [status]);

  useEffect(() => {
    const updateStage = () => setStageMetrics(computeStageMetrics());
    updateStage();
    window.addEventListener('resize', updateStage);
    return () => window.removeEventListener('resize', updateStage);
  }, []);

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const previousHtmlOverflow = html.style.overflow;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyOverflowX = body.style.overflowX;
    const previousBodyOverflowY = body.style.overflowY;

    if (stageMetrics.isDesktop) {
      html.style.overflow = 'hidden';
      body.style.overflow = 'hidden';
      body.style.overflowX = 'hidden';
      body.style.overflowY = 'hidden';
    } else {
      html.style.overflow = previousHtmlOverflow;
      body.style.overflow = previousBodyOverflow;
      body.style.overflowX = previousBodyOverflowX;
      body.style.overflowY = previousBodyOverflowY;
    }

    return () => {
      html.style.overflow = previousHtmlOverflow;
      body.style.overflow = previousBodyOverflow;
      body.style.overflowX = previousBodyOverflowX;
      body.style.overflowY = previousBodyOverflowY;
    };
  }, [stageMetrics.isDesktop]);

  const runDecision = useCallback(
    async (decision: 'approve' | 'skip') => {
      if (!action || executing) return;
      setExecuting(true);

      try {
        const response = await fetch('/api/conviction/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action_id: action.id, decision }),
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          const message = (data as { error?: string }).error ?? `${decision} failed`;
          if (shouldReconcileExecuteFailure(response, message)) {
            await load();
            setStatusNotice({
              id: 'reconciled_stale_action',
              message:
                'This directive was already handled or replaced. Foldera loaded the latest one.',
            });
            return;
          }
          setStatusNotice({ id: 'execute_failed', message });
          return;
        }

        if (decision === 'approve') {
          setExecutedActionId(action.id);
          setOutcomeRecorded(false);
        } else {
          setExecutedActionId(null);
          setOutcomeRecorded(false);
        }
        setStatusNotice(buildDecisionSuccessNotice(action, decision));
        await load();
      } catch (error) {
        const message = error instanceof Error ? error.message : `${decision} failed`;
        if (shouldReconcileExecuteFailure(null, message)) {
          await load();
          setStatusNotice({
            id: 'reconciled_stale_action',
            message:
              'This directive was already handled or replaced. Foldera loaded the latest one.',
          });
          return;
        }
        setStatusNotice({ id: 'execute_failed', message });
      } finally {
        setExecuting(false);
      }
    },
    [action, executing, load],
  );

  const submitOutcome = useCallback(
    async (outcome: 'worked' | 'didnt_work') => {
      if (!executedActionId || outcomeSubmitting || outcomeRecorded) return;
      setOutcomeSubmitting(outcome);
      try {
        await fetch('/api/conviction/outcome', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action_id: executedActionId, outcome }),
        });
        setOutcomeRecorded(true);
      } catch (error) {
        console.error(error);
      } finally {
        setOutcomeSubmitting(null);
      }
    },
    [executedActionId, outcomeRecorded, outcomeSubmitting],
  );

  const startStripeCheckout = useCallback(async () => {
    try {
      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const payload = await response.json().catch(() => ({}));
      if (typeof payload?.url === 'string') {
        window.location.href = payload.url;
      }
    } catch (error) {
      console.error(error);
    }
  }, []);

  const copyDraft = useCallback(async () => {
    const text = artifactClipboardText(action);
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      console.error(error);
    }
  }, [action]);

  const runFirstReadNow = useCallback(async () => {
    if (firstReadRunning) return;
    setFirstReadRunning(true);
    setStatusNotice(null);

    try {
      const response = await fetch('/api/settings/run-brief?force=true&use_llm=true', {
        method: 'POST',
      });
      const payload = await response.json().catch(() => ({}));
      const spend = payload?.spend_policy as
        | { paid_llm_requested?: boolean; pipeline_dry_run?: boolean }
        | undefined;

      if (spend?.paid_llm_requested && spend?.pipeline_dry_run) {
        setStatusNotice({
          id: 'first_read_dry_run_disabled',
          message: 'First read is unavailable on this deployment right now.',
        });
        return;
      }

      if (!response.ok && !payload?.stages) {
        throw new Error(
          typeof payload?.error === 'string'
            ? payload.error
            : 'Could not run your first read right now.',
        );
      }

      await load();
      setStatusNotice({
        id: payload?.ok === true ? 'first_read_generated' : 'first_read_started',
        message:
          payload?.ok === true
            ? 'First read generated.'
            : 'First read ran. Foldera will surface the result as soon as it clears the bar.',
      });
    } catch (error) {
      setStatusNotice({
        id: 'first_read_failed',
        message:
          error instanceof Error ? error.message : 'Could not run your first read right now.',
      });
    } finally {
      setFirstReadRunning(false);
    }
  }, [firstReadRunning, load]);

  const sessionName = session?.user?.name?.trim() || 'Brandon Kapp';
  const firstName = sessionName.split(' ')[0] || 'Brandon';
  const writeDocument = isWriteDocumentAction(action);
  const showArtifactBlur = Boolean(action?.artifact) && artifactPaywallLocked;
  const artifactTitle =
    asTrimmedString(action?.directive) ??
    asTrimmedString(action?.artifact?.title) ??
    asTrimmedString(action?.artifact?.subject) ??
    asTrimmedString(action?.artifact?.type) ??
    '';
  const artifactBody = getArtifactBody(action?.artifact);
  const draftLabel = writeDocument
    ? 'FINISHED DOCUMENT'
    : action?.action_type === 'send_message' || action?.artifact?.type === 'email'
      ? 'FOLLOW-UP EMAIL'
      : action?.artifact?.type === 'wait_rationale' || action?.action_type === 'do_nothing'
        ? 'WAIT RATIONALE'
        : asTrimmedString(action?.artifact?.type)?.replace(/_/g, ' ').toUpperCase() ?? 'ARTIFACT';
  const copyActionLabel = writeDocument ? 'Copy full text' : 'Copy draft';
  const skipActionLabel = writeDocument ? 'Skip and adjust' : 'Snooze 24h';
  const primaryActionLabel = writeDocument ? 'Save document' : 'Approve & send';
  const showOutcomeActions =
    Boolean(executedActionId) &&
    (statusNotice?.id === 'approve_saved_document' || statusNotice?.id === 'approve_sent') &&
    !outcomeRecorded;
  const stageTransform = `translate(${stageMetrics.offsetX}px, ${stageMetrics.offsetY}px) scale(${stageMetrics.scale})`;

  const artifactBodyContent = showArtifactBlur ? (
    <div
      className="relative overflow-hidden rounded-[16px] border border-border bg-panel-raised p-4"
      data-testid="dashboard-pro-blur"
    >
      <div className="pointer-events-none select-none blur-[5px]">
        <div
          data-testid="dashboard-document-body"
          className="max-h-[340px] overflow-y-auto pr-2 text-[15px] leading-7 text-text-primary"
        >
          {writeDocument ? (
            <ReactMarkdown components={DOCUMENT_MARKDOWN_COMPONENTS} remarkPlugins={[remarkGfm]}>
              {artifactBody}
            </ReactMarkdown>
          ) : (
            <div className="whitespace-pre-line">{artifactBody}</div>
          )}
        </div>
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-bg/60 px-6 text-center">
        <p className="max-w-[280px] text-base font-medium text-text-primary">
          Upgrade to Pro to keep receiving finished work.
        </p>
        <button type="button" onClick={() => void startStripeCheckout()} className="foldera-button-primary mt-4">
          Upgrade to Pro
        </button>
      </div>
    </div>
  ) : (
    <div
      data-testid="dashboard-document-body"
      className="max-h-[340px] overflow-y-auto pr-2 text-[15px] leading-7 text-text-primary"
    >
      {writeDocument ? (
        <ReactMarkdown components={DOCUMENT_MARKDOWN_COMPONENTS} remarkPlugins={[remarkGfm]}>
          {artifactBody}
        </ReactMarkdown>
      ) : (
        <div className="whitespace-pre-line">{artifactBody}</div>
      )}
    </div>
  );

  const draftBody = artifactBody ? (
    artifactBodyContent
  ) : (
    <div
      data-testid="dashboard-document-body"
      className="text-[15px] leading-7 text-text-secondary"
    >
      Full text is still being prepared.
    </div>
  );

  const cardActions = action
    ? [
        {
          label: copyActionLabel,
          kind: 'secondary' as const,
          onClick: () => void copyDraft(),
        },
        {
          label: skipActionLabel,
          kind: 'amber' as const,
          onClick: () => void runDecision('skip'),
          disabled: executing,
        },
        {
          label: primaryActionLabel,
          kind: 'primary' as const,
          onClick: () => void runDecision('approve'),
          disabled: executing,
          dataTestId: 'dashboard-primary-action',
        },
      ]
    : [];

  const searchField = (
    <div className="foldera-dashboard-search-field flex h-full min-w-0 items-center gap-3 rounded-[14px] border border-border bg-panel px-4 text-sm text-text-muted">
      <Search className="h-4 w-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 truncate">Search Foldera...</span>
      <span className="hidden shrink-0 rounded-[10px] border border-border px-2 py-1 text-[11px] sm:inline">
        ⌘ K
      </span>
    </div>
  );

  const notificationsButton = (
    <button
      type="button"
      className="foldera-dashboard-notify-btn inline-flex h-full w-full items-center justify-center rounded-[14px] border border-border bg-panel text-text-secondary"
      aria-label="Notifications"
    >
      <Bell className="h-4 w-4" />
    </button>
  );

  const emptyStateCard = (
    <EmptyStateCard
      hasActiveIntegration={hasActiveIntegration}
      firstReadRunning={firstReadRunning}
      onRunFirstRead={() => void runFirstReadNow()}
    />
  );

  const loadingCard = (
    <div className="foldera-dashboard-brief-card foldera-brief-shell flex h-full w-full items-center justify-center px-8 py-10 text-center">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
          Loading
        </p>
        <p className="mt-4 text-[18px] leading-8 text-text-secondary">
          Loading your latest Foldera brief.
        </p>
      </div>
    </div>
  );

  const cardNode = action ? (
    <DailyBriefCard
      className="foldera-dashboard-brief-card foldera-dashboard-money-shot h-full w-full"
      dashboardCta
      stageDesktop={stageMetrics.isDesktop}
      directive={artifactTitle}
      whyNow={
        asTrimmedString(action.reason) ??
        'Foldera surfaced the single move that matters most right now.'
      }
      draftLabel={draftLabel}
      draftBody={draftBody}
      sourcePills={inferSourcePills(action)}
      nextStep={writeDocument ? 'Next: Save to record' : 'Next: Await response'}
      statusText={writeDocument ? 'READY TO FILE' : 'READY TO SEND'}
      footerText="Grounded in connected sources"
      actions={cardActions}
    />
  ) : loadingLatest ? (
    loadingCard
  ) : (
    emptyStateCard
  );

  const statusNoticeNode = statusNotice ? (
    <div
      className="rounded-[14px] border border-border bg-panel-raised px-4 py-3"
      data-testid="dashboard-status-notice"
      data-status-id={statusNotice.id}
    >
      <p className="text-sm text-text-primary">{statusNotice.message}</p>
    </div>
  ) : null;

  const hiddenArtifactNode = (
    <div
      aria-hidden
      className="pointer-events-none absolute left-0 top-0 opacity-0"
    >
      {artifactTitle ? <p data-testid="pixel-lock-artifact-title">{artifactTitle}</p> : null}
      {artifactBody ? <p data-testid="pixel-lock-artifact-body">{artifactBody}</p> : null}
    </div>
  );

  if (stageMetrics.isDesktop) {
    return (
      <main className="foldera-dashboard-stage-root text-text-primary" data-testid="pixel-lock-frame">
        <div
          className="foldera-dashboard-stage"
          style={{ transform: stageTransform, transformOrigin: 'top left' }}
        >
          <DashboardSidebar activeLabel="Executive Briefing" userName={firstName} variant="stage" />

          <p className="foldera-eyebrow absolute" style={{ left: 350, top: 52 }}>
            {getDateLabel()}
          </p>

          <h1
            className="absolute text-[56px] font-semibold leading-[64px] tracking-[-0.045em] text-text-secondary"
            style={{ left: 350, top: 86, width: 700, height: 64 }}
          >
            {getGreetingLabel()},{' '}
            <strong className="font-semibold text-text-primary">{firstName}.</strong>
          </h1>

          <div
            className="absolute flex items-center justify-between text-[28px] text-text-secondary"
            style={{ left: 400, top: 176, width: 900, height: 44 }}
          >
            <div className="flex items-center gap-3">
              <Mail className="h-5 w-5 text-text-muted" aria-hidden />
              <span className="text-[36px] font-semibold tracking-[-0.045em] text-text-primary">
                5
              </span>
              <span className="text-[32px] font-normal">open threads</span>
            </div>
            <div className="flex items-center gap-3">
              <TriangleAlert className="h-5 w-5 text-amber-400" aria-hidden />
              <span className="text-[36px] font-semibold tracking-[-0.045em] text-amber-400">
                2
              </span>
              <span className="text-[32px] font-normal">need attention</span>
            </div>
            <div className="flex items-center gap-3">
              <TrendingUp className="h-5 w-5 text-text-muted" aria-hidden />
              <span className="text-[36px] font-semibold tracking-[-0.045em] text-text-primary">
                1
              </span>
              <span className="text-[32px] font-normal">ready to move</span>
            </div>
          </div>

          <div className="absolute h-14" style={{ left: 1468, top: 36, width: 384 }}>
            {searchField}
          </div>
          <div className="absolute h-14 w-14" style={{ left: 1882, top: 36 }}>
            {notificationsButton}
          </div>

          <div className="absolute" style={{ left: 344, top: 238, width: 1072, height: 850 }}>
            {cardNode}
          </div>

          {statusNoticeNode ? (
            <div className="absolute" style={{ left: 344, top: 1094, width: 1072 }}>
              {statusNoticeNode}
            </div>
          ) : null}

          {showOutcomeActions ? (
            <div className="absolute flex justify-center gap-3" style={{ left: 722, top: 1096, width: 430 }}>
              <button
                type="button"
                onClick={() => void submitOutcome('worked')}
                disabled={Boolean(outcomeSubmitting)}
                className="foldera-button-primary"
              >
                It worked
              </button>
              <button
                type="button"
                onClick={() => void submitOutcome('didnt_work')}
                disabled={Boolean(outcomeSubmitting)}
                className="foldera-button-secondary"
              >
                Didn&apos;t work
              </button>
            </div>
          ) : null}

          <aside className="foldera-dashboard-right-rail absolute" style={{ left: 1574, top: 324, width: 332 }}>
            <RightPanel />
          </aside>

          {hiddenArtifactNode}
        </div>
      </main>
    );
  }

  return (
    <main className="foldera-dashboard-page foldera-page min-h-screen bg-bg text-text-primary" data-testid="pixel-lock-frame">
      <div className="mx-auto w-full max-w-[1400px] px-4 py-4 sm:px-5 lg:px-6 lg:py-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[252px_minmax(0,1fr)] xl:grid-cols-[252px_minmax(0,1fr)_300px] xl:gap-8">
          <DashboardSidebar activeLabel="Executive Briefing" userName={firstName} />

          <div className="min-w-0">
            <div className="foldera-panel mb-5 flex items-center justify-between gap-3 px-4 py-3 lg:hidden">
              <FolderaLogo href="/dashboard" markSize="sm" />
              <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
                <div className="h-11 min-w-0 flex-1">{searchField}</div>
                <div className="h-11 w-11 shrink-0">{notificationsButton}</div>
              </div>
            </div>

            <div className="hidden items-center justify-between gap-4 lg:flex">
              <p className="foldera-eyebrow">{getDateLabel()}</p>
              <div className="flex max-w-md flex-1 items-center justify-end gap-3">
                <div className="h-11 min-w-0 flex-1">{searchField}</div>
                <div className="h-11 w-11 shrink-0">{notificationsButton}</div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 pb-1 pt-2 lg:hidden">
              <p className="foldera-eyebrow">{getDateLabel()}</p>
            </div>

            <header className="pb-10 pt-3 lg:pt-1">
              <h1 className="text-[clamp(2rem,4vw,3.1rem)] font-semibold leading-[1.08] tracking-[-0.04em] text-text-secondary">
                {getGreetingLabel()},{' '}
                <strong className="font-semibold text-text-primary">{firstName}.</strong>
              </h1>
              <div className="mt-6 flex flex-wrap gap-x-10 gap-y-4 text-sm text-text-secondary">
                <div className="flex items-center gap-3">
                  <Mail className="h-4 w-4 text-text-muted" aria-hidden />
                  <span className="text-[28px] font-semibold tracking-[-0.04em] text-text-primary sm:text-[32px]">
                    5
                  </span>
                  <span>open threads</span>
                </div>
                <div className="flex items-center gap-3">
                  <TriangleAlert className="h-4 w-4 text-amber-400" aria-hidden />
                  <span className="text-[28px] font-semibold tracking-[-0.04em] text-amber-400 sm:text-[32px]">
                    2
                  </span>
                  <span>need attention</span>
                </div>
                <div className="flex items-center gap-3">
                  <TrendingUp className="h-4 w-4 text-text-muted" aria-hidden />
                  <span className="text-[28px] font-semibold tracking-[-0.04em] text-text-primary sm:text-[32px]">
                    1
                  </span>
                  <span>ready to move</span>
                </div>
              </div>
            </header>

            {statusNoticeNode ? <div className="mx-auto mb-4 w-full max-w-[860px]">{statusNoticeNode}</div> : null}

            <div className="mx-auto w-full max-w-[860px] pb-12">
              {action ? (
                <DailyBriefCard
                  className="foldera-dashboard-brief-card foldera-dashboard-money-shot w-full"
                  dashboardCta
                  directive={artifactTitle}
                  whyNow={
                    asTrimmedString(action.reason) ??
                    'Foldera surfaced the single move that matters most right now.'
                  }
                  draftLabel={draftLabel}
                  draftBody={draftBody}
                  sourcePills={inferSourcePills(action)}
                  nextStep={writeDocument ? 'Next: Save to record' : 'Next: Await response'}
                  statusText={writeDocument ? 'READY TO FILE' : 'READY TO SEND'}
                  footerText="Grounded in connected sources"
                  actions={cardActions}
                />
              ) : loadingLatest ? (
                loadingCard
              ) : (
                <div className="min-h-[420px]">{emptyStateCard}</div>
              )}

              {showOutcomeActions ? (
                <div className="mt-4 flex flex-wrap justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => void submitOutcome('worked')}
                    disabled={Boolean(outcomeSubmitting)}
                    className="foldera-button-primary"
                  >
                    It worked
                  </button>
                  <button
                    type="button"
                    onClick={() => void submitOutcome('didnt_work')}
                    disabled={Boolean(outcomeSubmitting)}
                    className="foldera-button-secondary"
                  >
                    Didn&apos;t work
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          <aside className="foldera-dashboard-right-rail hidden min-w-0 xl:block">
            <RightPanel />
          </aside>
        </div>
      </div>

      {hiddenArtifactNode}
    </main>
  );
}
