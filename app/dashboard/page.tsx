'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Mail,
  TriangleAlert,
  TrendingUp,
} from 'lucide-react';
import { DashboardBriefWorkPanel } from '@/components/dashboard/DashboardBriefWorkPanel';
import { DashboardStatsStrip } from '@/components/dashboard/DashboardStatsStrip';
import { DailyBriefCard } from '@/components/foldera/DailyBriefCard';
import {
  DashboardSidebar,
  type DashboardPanelKey,
} from '@/components/foldera/DashboardSidebar';
import { EmptyStateCard } from '@/components/foldera/EmptyStateCard';
import { FolderaLogo } from '@/components/foldera/FolderaLogo';
import { DashboardSecondaryPanel } from '@/components/dashboard/DashboardSecondaryPanel';
import {
  clearPendingCheckoutPlan,
  resumePendingCheckout,
} from '@/lib/billing/pending-checkout';
import { formatRelativeTime, providerDisplayName } from '@/lib/ui/provider-display';
import {
  DASHBOARD_PANEL_LABELS,
  DEFAULT_STAGE_METRICS,
  DOCUMENT_MARKDOWN_COMPONENTS,
  artifactClipboardText,
  asTrimmedString,
  buildDecisionSuccessNotice,
  computeStageMetrics,
  getArtifactBody,
  getDashboardActionHeadline,
  getDashboardDiscrepancyFrame,
  getDateLabel,
  getGreetingLabel,
  inferSourcePills,
  isVisibleDashboardAction,
  isWriteDocumentAction,
  normalizeDashboardPanel,
  normalizeIntegrationProvider,
  shouldReconcileExecuteFailure,
  writeClipboardText,
  type DashboardAction,
  type DashboardHistoryItem,
  type DashboardHistoryPayload,
  type DashboardLoadIssue,
  type DashboardStatusNotice,
  type GraphStatsPayload,
  type IntegrationStatusPayload,
  type LoadLatestResult,
  type StageMetrics,
} from './dashboard-page-model';
export default function DashboardPage() {
  const { data: session, status } = useSession();
  const [activePanel, setActivePanel] = useState<DashboardPanelKey>('briefing');
  const isBriefingPanel = activePanel === 'briefing';
  const activeSidebarLabel = DASHBOARD_PANEL_LABELS[activePanel];

  const [action, setAction] = useState<DashboardAction | null>(null);
  const [loadingLatest, setLoadingLatest] = useState(true);
  const [integrationStatus, setIntegrationStatus] = useState<IntegrationStatusPayload | null>(null);
  const [graphStats, setGraphStats] = useState<GraphStatsPayload | null>(null);
  const [historyItems, setHistoryItems] = useState<DashboardHistoryItem[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [artifactPaywallLocked, setArtifactPaywallLocked] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [statusNotice, setStatusNotice] = useState<DashboardStatusNotice | null>(null);
  const [outcomeSubmitting, setOutcomeSubmitting] = useState<null | 'worked' | 'didnt_work'>(
    null,
  );
  const [stageMetrics, setStageMetrics] = useState<StageMetrics>(DEFAULT_STAGE_METRICS);
  const [stageMeasured, setStageMeasured] = useState(false);
  const [executedActionId, setExecutedActionId] = useState<string | null>(null);
  const [outcomeRecorded, setOutcomeRecorded] = useState(false);
  const [locallyHiddenActionIds, setLocallyHiddenActionIds] = useState<Set<string>>(() => new Set());
  const [loadIssues, setLoadIssues] = useState<Set<DashboardLoadIssue>>(() => new Set());

  const loadAbortRef = useRef<AbortController | null>(null);
  const checkoutResumeAttemptedRef = useRef(false);

  const setLoadIssue = useCallback((issue: DashboardLoadIssue, failed: boolean) => {
    setLoadIssues((current) => {
      const next = new Set(current);
      if (failed) {
        next.add(issue);
      } else {
        next.delete(issue);
      }
      return next;
    });
  }, []);

  const load = useCallback(async (): Promise<LoadLatestResult> => {
    loadAbortRef.current?.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;
    setLoadingLatest(true);

    try {
      const latestRes = await fetch('/api/conviction/latest', {
        signal: controller.signal,
        cache: 'no-store',
      });
      if (controller.signal.aborted) {
        return { action: null, loaded: false };
      }

      if (!latestRes.ok) {
        setAction(null);
        setArtifactPaywallLocked(false);
        setLoadIssue('latest', true);
        return { action: null, loaded: false };
      }

      const latest = await latestRes.json().catch(() => ({}));
      if (controller.signal.aborted) {
        return { action: null, loaded: false };
      }

      const visibleAction = isVisibleDashboardAction(latest) ? (latest as DashboardAction) : null;
      const action =
        visibleAction && !locallyHiddenActionIds.has(visibleAction.id) ? visibleAction : null;
      setAction(action);
      setArtifactPaywallLocked(action ? latest?.artifact_paywall_locked === true : false);
      setLoadIssue('latest', false);
      return { action, loaded: true };
    } catch {
      if (controller.signal.aborted) {
        return { action: null, loaded: false };
      }
      setAction(null);
      setArtifactPaywallLocked(false);
      setLoadIssue('latest', true);
      return { action: null, loaded: false };
    } finally {
      if (!controller.signal.aborted) {
        setLoadingLatest(false);
      }
    }
  }, [locallyHiddenActionIds, setLoadIssue]);

  useEffect(() => {
    if (status === 'authenticated') {
      void load();
    }

    return () => {
      loadAbortRef.current?.abort();
    };
  }, [load, status]);

  useEffect(() => {
    if (status !== 'authenticated' || typeof window === 'undefined') {
      return;
    }

    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get('upgraded') === 'true') {
      clearPendingCheckoutPlan();
      checkoutResumeAttemptedRef.current = true;
      return;
    }

    if (checkoutResumeAttemptedRef.current) {
      return;
    }

    checkoutResumeAttemptedRef.current = true;
    void resumePendingCheckout({
      onError: (message) =>
        setStatusNotice({ id: 'checkout_resume_failed', message }),
      onUnauthorized: () => {
        checkoutResumeAttemptedRef.current = false;
      },
    });
  }, [status]);

  useEffect(() => {
    if (status !== 'authenticated') {
      setIntegrationStatus(null);
      setLoadIssue('integrations', false);
      return;
    }

    let cancelled = false;
    void fetch('/api/integrations/status', { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) {
          setLoadIssue('integrations', true);
          return null;
        }
        return response.json();
      })
      .then((payload: IntegrationStatusPayload | null) => {
        if (cancelled) return;
        setLoadIssue('integrations', payload === null);
        setIntegrationStatus(payload);
      })
      .catch(() => {
        if (!cancelled) {
          setLoadIssue('integrations', true);
          setIntegrationStatus(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [setLoadIssue, status]);

  useEffect(() => {
    if (status !== 'authenticated') {
      setGraphStats(null);
      setLoadIssue('graph', false);
      return;
    }

    let cancelled = false;
    void fetch('/api/graph/stats', { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) {
          setLoadIssue('graph', true);
          return null;
        }
        return response.json();
      })
      .then((payload: GraphStatsPayload | null) => {
        if (!cancelled) {
          setLoadIssue('graph', payload === null);
          setGraphStats(payload);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoadIssue('graph', true);
          setGraphStats(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [setLoadIssue, status]);

  useEffect(() => {
    if (status !== 'authenticated') {
      setHistoryItems([]);
      setHistoryLoaded(false);
      setLoadIssue('history', false);
      return;
    }

    let cancelled = false;
    setHistoryLoaded(false);
    void fetch('/api/conviction/history?limit=5', { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) {
          setLoadIssue('history', true);
          return null;
        }
        return response.json();
      })
      .then((payload: DashboardHistoryPayload | null) => {
        if (cancelled) return;
        setLoadIssue('history', payload === null);
        const nextItems = Array.isArray(payload?.items) ? payload.items : [];
        setHistoryItems(nextItems);
      })
      .catch(() => {
        if (!cancelled) {
          setLoadIssue('history', true);
          setHistoryItems([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setHistoryLoaded(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [setLoadIssue, status]);

  useEffect(() => {
    const updateStage = () => {
      setStageMetrics(computeStageMetrics());
      setStageMeasured(true);
    };
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

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const syncPanelFromUrl = () => {
      const params = new URLSearchParams(window.location.search);
      setActivePanel(normalizeDashboardPanel(params.get('panel')));
    };

    syncPanelFromUrl();
    window.addEventListener('popstate', syncPanelFromUrl);
    return () => {
      window.removeEventListener('popstate', syncPanelFromUrl);
    };
  }, []);

  const approvalEmailSendEnabled =
    process.env.NEXT_PUBLIC_ALLOW_APPROVAL_EMAIL_SEND === 'true' ||
    process.env.ALLOW_APPROVAL_EMAIL_SEND === 'true';

  const selectPanel = useCallback(
    (panel: DashboardPanelKey) => {
      if (typeof window === 'undefined') return;
      const currentPath = window.location.pathname || '/dashboard';
      if (!currentPath.startsWith('/dashboard')) return;

      const nextParams = new URLSearchParams(window.location.search);
      if (panel === 'briefing') {
        nextParams.delete('panel');
      } else {
        nextParams.set('panel', panel);
      }

      const query = nextParams.toString();
      const nextUrl = query ? `${currentPath}?${query}` : currentPath;
      window.history.replaceState({}, '', nextUrl);
      setActivePanel(panel);
    },
    [],
  );

  const runDecision = useCallback(
    async (decision: 'approve' | 'skip') => {
      if (!action || executing) return;
      setExecuting(true);

      try {
        const response = await fetch('/api/conviction/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action_id: action.id,
            decision,
            ...(decision === 'skip' ? { skip_reason: 'not_relevant' } : {}),
          }),
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

        if (
          (data as { status?: string }).status === 'failed' ||
          typeof (data as { error?: unknown }).error === 'string'
        ) {
          setStatusNotice({
            id: 'execute_failed',
            message:
              typeof (data as { error?: unknown }).error === 'string'
                ? ((data as { error: string }).error)
                : `${decision} failed`,
          });
          return;
        }

        if (decision === 'approve') {
          setExecutedActionId(action.id);
          setOutcomeRecorded(false);
        } else {
          setLocallyHiddenActionIds((current) => {
            const next = new Set(current);
            next.add(action.id);
            return next;
          });
          setAction(null);
          setExecutedActionId(null);
          setOutcomeRecorded(false);
        }
        setStatusNotice(buildDecisionSuccessNotice(action, decision, approvalEmailSendEnabled));
        if (decision === 'approve') {
          await load();
        }
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
    [action, approvalEmailSendEnabled, executing, load],
  );

  const submitOutcome = useCallback(
    async (outcome: 'worked' | 'didnt_work') => {
      if (!executedActionId || outcomeSubmitting || outcomeRecorded) return;
      setOutcomeSubmitting(outcome);
      try {
        const response = await fetch('/api/conviction/outcome', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action_id: executedActionId, outcome }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          setStatusNotice({
            id: 'outcome_record_failed',
            message:
              typeof payload?.error === 'string'
                ? payload.error
                : 'Could not record feedback right now.',
          });
          return;
        }
        setOutcomeRecorded(true);
      } catch (error) {
        console.error(error);
        setStatusNotice({
          id: 'outcome_record_failed',
          message: 'Could not record feedback right now.',
        });
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
    if (!text) {
      setStatusNotice({ id: 'copy_failed', message: 'Nothing available to copy.' });
      return;
    }
    const copied = await writeClipboardText(text);
    setStatusNotice(
      copied
        ? { id: 'copy_succeeded', message: 'Copied full text.' }
        : { id: 'copy_failed', message: 'Copy failed. Select the text manually.' },
    );
  }, [action]);

  const sessionName = asTrimmedString(session?.user?.name) ?? 'Foldera workspace';
  const firstName = asTrimmedString(session?.user?.name)?.split(' ')[0] ?? null;
  const sidebarUserName = firstName ?? sessionName;
  const writeDocument = isWriteDocumentAction(action);
  const showArtifactBlur = Boolean(action?.artifact) && artifactPaywallLocked;
  const discrepancyFrame = getDashboardDiscrepancyFrame(action);
  const artifactTitle =
    discrepancyFrame?.claim ?? getDashboardActionHeadline(action);
  const artifactContradiction =
    discrepancyFrame?.contradiction ??
    asTrimmedString(action?.reason) ??
    'Foldera surfaced the single move that matters most right now.';
  const artifactBody = getArtifactBody(action?.artifact);
  const draftLabel = 'Risk / evidence / next action';
  const copyActionLabel = 'Copy draft';
  const skipActionLabel = 'Skip';
  const primaryActionLabel = writeDocument
    ? 'Save'
    : approvalEmailSendEnabled
      ? 'Approve & send'
      : 'Approve';
  const showOutcomeActions =
    Boolean(executedActionId) &&
    (statusNotice?.id === 'approve_saved_document' ||
      statusNotice?.id === 'approve_sent' ||
      statusNotice?.id === 'approve_recorded' ||
      statusNotice?.id === 'outcome_record_failed') &&
    !outcomeRecorded;
  const stageTransform = `translate(${stageMetrics.offsetX}px, ${stageMetrics.offsetY}px) scale(${stageMetrics.scale})`;
  const integrationRows = Array.isArray(integrationStatus?.integrations)
    ? integrationStatus.integrations
    : [];
  const connectedSources = integrationRows.filter((integration) => integration?.is_active === true);
  const connectedSourceCount = connectedSources.length;
  const latestSignalLabel = asTrimmedString(graphStats?.lastSignalAt)
    ? `${providerDisplayName(graphStats?.lastSignalSource)} · ${formatRelativeTime(
        graphStats?.lastSignalAt,
      )}`
    : asTrimmedString(integrationStatus?.newest_mail_signal_at)
      ? `Mail · ${formatRelativeTime(integrationStatus?.newest_mail_signal_at)}`
      : 'No signal yet';
  const sourceSummaryRows = connectedSources.slice(0, 3);
  const hasLatestIssue = loadIssues.has('latest');
  const hasIntegrationIssue = loadIssues.has('integrations');
  const hasGraphIssue = loadIssues.has('graph');
  const hasHistoryIssue = loadIssues.has('history');
  const connectedSourcesValue = hasIntegrationIssue ? 'Unavailable' : String(connectedSourceCount);
  const googleIntegration =
    integrationRows.find(
      (integration) => normalizeIntegrationProvider(integration.provider) === 'google',
    ) ?? null;
  const microsoftIntegration =
    integrationRows.find(
      (integration) => normalizeIntegrationProvider(integration.provider) === 'azure_ad',
    ) ?? null;
  const recentHistory = historyItems.slice(0, 3);
  const evidenceCount = Array.isArray(action?.evidence) ? action.evidence.length : 0;
  const liveSignalFallback = evidenceCount > 0 ? evidenceCount : connectedSourceCount;
  const openThreadCount =
    typeof graphStats?.signalsTotal === 'number' ? graphStats.signalsTotal : liveSignalFallback;
  const attentionCount =
    typeof graphStats?.commitmentsActive === 'number' ? graphStats.commitmentsActive : evidenceCount;
  const readyCount =
    typeof graphStats?.patternsActive === 'number'
      ? graphStats.patternsActive
      : action
        ? 1
        : 0;
  const dashboardStats = [
    {
      icon: Mail,
      value: openThreadCount,
      label: 'open threads',
      valueClassName: 'text-text-primary',
    },
    {
      icon: TriangleAlert,
      value: attentionCount,
      label: 'need attention',
      valueClassName: attentionCount > 0 ? 'text-amber-400' : 'text-text-primary',
    },
    {
      icon: TrendingUp,
      value: readyCount,
      label: 'ready to move',
      valueClassName: readyCount > 0 ? 'text-success' : 'text-text-primary',
    },
  ];
  const hasStats = dashboardStats.length > 0;
  const degradedIssueLabels = [
    hasLatestIssue ? 'Latest briefing unavailable.' : null,
    hasIntegrationIssue ? 'Connected source status unavailable.' : null,
    hasGraphIssue ? 'Signal summary unavailable.' : null,
    hasHistoryIssue ? 'Recent history unavailable.' : null,
  ].filter((value): value is string => Boolean(value));

  const artifactBodyContent = showArtifactBlur ? (
    <div
      className="relative overflow-hidden rounded-[16px] border border-border bg-panel-raised p-4"
      data-testid="dashboard-pro-blur"
    >
      <div className="pointer-events-none select-none blur-[5px]">
        <div
          data-testid="dashboard-document-body"
          className="foldera-dashboard-artifact-body max-h-[340px] overflow-y-auto pr-2 text-[15px] leading-7 text-text-secondary"
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
      className="foldera-dashboard-artifact-body max-h-[340px] overflow-y-auto pr-2 text-[15px] leading-7 text-text-secondary"
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

  const draftBody = discrepancyFrame ? (
    <div className="space-y-5">
      <section>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">
          Risk
        </p>
        <p className="mt-2 text-text-secondary">{discrepancyFrame.risk}</p>
      </section>
      <section>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">
          Evidence
        </p>
        <ul className="mt-2 list-disc space-y-2 pl-5">
          {discrepancyFrame.evidence.slice(0, 4).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
      <section>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">
          Next action
        </p>
        <p className="mt-2 text-text-primary">{discrepancyFrame.next_action}</p>
      </section>
      {artifactBody ? (
        <section>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">
            Finished work
          </p>
          <div className="mt-2">{artifactBodyContent}</div>
        </section>
      ) : null}
    </div>
  ) : artifactBody ? (
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

  const emptyStateCard = <EmptyStateCard />;

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

  const degradedStateNode = degradedIssueLabels.length > 0 ? (
    <div
      className="rounded-[14px] border border-amber-400/30 bg-amber-400/10 px-4 py-3"
      data-testid="dashboard-degraded-state"
    >
      <p className="text-sm font-semibold text-text-primary">Dashboard is partially unavailable.</p>
      <p className="mt-1 text-sm text-text-secondary">
        Foldera is still loading what it can, but some live data is unavailable right now.
      </p>
      <ul className="mt-3 space-y-1 text-sm text-text-secondary">
        {degradedIssueLabels.map((label) => (
          <li key={label}>{label}</li>
        ))}
      </ul>
    </div>
  ) : null;

  const briefingUnavailableCard = (
    <div
      className="foldera-dashboard-brief-card foldera-brief-shell flex h-full w-full items-center justify-center px-8 py-10 text-center"
      data-testid="dashboard-briefing-unavailable"
    >
      <div className="max-w-[520px]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
          Briefing unavailable
        </p>
        <h2 className="mt-4 text-[32px] font-semibold tracking-[-0.04em] text-text-primary sm:text-[38px]">
          Latest briefing unavailable
        </h2>
        <p className="mt-4 text-[15px] leading-7 text-text-secondary">
          Foldera couldn&apos;t load your latest briefing right now. Refresh to retry.
        </p>
      </div>
    </div>
  );

  const secondaryPanelNode = !isBriefingPanel ? (
    <DashboardSecondaryPanel
      activePanel={activePanel as Exclude<DashboardPanelKey, 'briefing'>}
      connectedSourcesValue={connectedSourcesValue}
      hasIntegrationIssue={hasIntegrationIssue}
      connectedSourceCount={connectedSourceCount}
      latestSignalLabel={latestSignalLabel}
      hasGraphIssue={hasGraphIssue}
      graphStats={graphStats}
      sourceSummaryRows={sourceSummaryRows}
      googleIntegration={googleIntegration}
      microsoftIntegration={microsoftIntegration}
      sessionName={sessionName}
      sessionEmail={asTrimmedString(session?.user?.email)}
      historyLoaded={historyLoaded}
      hasHistoryIssue={hasHistoryIssue}
      recentHistory={recentHistory}
    />
  ) : null;

  const briefingCardNode = action ? (
    <div data-testid="dashboard-panel-briefing" className="h-full w-full">
      <DailyBriefCard
        className="foldera-dashboard-brief-card foldera-dashboard-money-shot h-full w-full"
        dashboardCta
        stageDesktop={stageMetrics.isDesktop}
        directive={artifactTitle}
        whyNow={artifactContradiction}
        eyebrowLabel="Discrepancy card"
        directiveLabel="Claim"
        whyLabel="Contradiction"
        draftLabel={draftLabel}
        draftBody={draftBody}
        sourcePills={inferSourcePills(action)}
        sourceLabel="Source refs"
        nextStep={writeDocument ? 'Next: Save to record' : 'Next: Await response'}
        statusText={writeDocument ? 'READY TO FILE' : 'READY TO SEND'}
        footerText="Grounded in connected sources"
        actions={cardActions}
      />
    </div>
  ) : loadingLatest ? (
    loadingCard
  ) : hasLatestIssue ? (
    briefingUnavailableCard
  ) : (
    emptyStateCard
  );

  const cardNode = isBriefingPanel ? briefingCardNode : secondaryPanelNode;

  const statusNoticeNode = isBriefingPanel && statusNotice ? (
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

  if (!stageMeasured) {
    return (
      <main className="foldera-dashboard-stage-root text-text-primary" data-testid="pixel-lock-frame">
        <div className="foldera-dashboard-preload-shell" aria-hidden>
          <div className="foldera-dashboard-preload-bar" />
          <div className="foldera-dashboard-preload-card" />
        </div>
        {hiddenArtifactNode}
      </main>
    );
  }

  if (stageMetrics.isDesktop) {
    return (
      <main className="foldera-dashboard-stage-root text-text-primary" data-testid="pixel-lock-frame">
        <div
          className="foldera-dashboard-stage foldera-dashboard-stage--ready"
          style={{ transform: stageTransform, transformOrigin: 'top left' }}
        >
          <DashboardSidebar
            activeLabel={activeSidebarLabel}
            userName={sidebarUserName}
            variant="stage"
            appShell
            activePanel={activePanel}
            onSelectPanel={selectPanel}
          />

          <p className="foldera-eyebrow absolute" style={{ left: 350, top: 52 }}>
            {getDateLabel()}
          </p>

          <h1
            className="absolute text-[56px] font-semibold leading-[64px] tracking-[-0.045em] text-text-secondary"
            style={{ left: 350, top: 86, width: 700, height: 64 }}
          >
            {getGreetingLabel()}
            {firstName ? (
              <>
                , <strong className="font-semibold text-text-primary">{firstName}.</strong>
              </>
            ) : (
              '.'
            )}
          </h1>

          {hasStats ? <DashboardStatsStrip stats={dashboardStats} variant="stage" /> : null}

          <div className="absolute" style={{ left: 344, top: 238, width: 1072, height: 850 }}>
            {cardNode}
          </div>

          {isBriefingPanel ? <DashboardBriefWorkPanel /> : null}

          {statusNoticeNode ? (
            <div className="absolute" style={{ left: 344, top: 1094, width: 1072 }}>
              {statusNoticeNode}
            </div>
          ) : null}

          {degradedStateNode ? (
            <div className="absolute" style={{ left: 1460, top: 130, width: 348 }}>
              {degradedStateNode}
            </div>
          ) : null}

          {isBriefingPanel && showOutcomeActions ? (
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

          {hiddenArtifactNode}
        </div>
      </main>
    );
  }

  return (
    <main className="foldera-dashboard-page foldera-page min-h-screen overflow-x-hidden bg-bg text-text-primary" data-testid="pixel-lock-frame">
      <div className="mx-auto w-full max-w-[1400px] px-4 py-4 sm:px-5 lg:px-6 lg:py-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[252px_minmax(0,1fr)] 2xl:gap-8">
          <DashboardSidebar
            activeLabel={activeSidebarLabel}
            userName={sidebarUserName}
            appShell
            activePanel={activePanel}
            onSelectPanel={selectPanel}
          />

          <div className="min-w-0">
            <div className="foldera-panel mb-5 flex items-center justify-between gap-3 px-4 py-3 lg:hidden">
              <FolderaLogo href="/dashboard" markSize="sm" />
            </div>

            <div className="hidden items-center justify-between gap-4 lg:flex">
              <p className="foldera-eyebrow">{getDateLabel()}</p>
            </div>

            <div className="flex items-center justify-between gap-3 pb-1 pt-2 lg:hidden">
              <p className="foldera-eyebrow">{getDateLabel()}</p>
            </div>

            <header className="pb-7 pt-3 lg:pb-8 lg:pt-1">
              <h1 className="text-[clamp(2rem,4vw,3.1rem)] font-semibold leading-[1.08] tracking-[-0.04em] text-text-secondary">
                {getGreetingLabel()}
                {firstName ? (
                  <>
                    , <strong className="font-semibold text-text-primary">{firstName}.</strong>
                  </>
                ) : (
                  '.'
                )}
              </h1>
              {hasStats ? <DashboardStatsStrip stats={dashboardStats} variant="mobile" /> : null}
            </header>

            {degradedStateNode ? <div className="mx-auto mb-4 w-full max-w-[860px]">{degradedStateNode}</div> : null}
            {statusNoticeNode ? <div className="mx-auto mb-4 w-full max-w-[860px]">{statusNoticeNode}</div> : null}

            <div className="mx-auto w-full max-w-[940px] pb-12">
              {isBriefingPanel ? (
                action ? (
                  <div data-testid="dashboard-panel-briefing">
                    <DailyBriefCard
                      className="foldera-dashboard-brief-card foldera-dashboard-money-shot foldera-dashboard-current-brief w-full"
                      dashboardCta
                      directive={artifactTitle}
                      whyNow={artifactContradiction}
                      eyebrowLabel="Discrepancy card"
                      directiveLabel="Claim"
                      whyLabel="Contradiction"
                      draftLabel={draftLabel}
                      draftBody={draftBody}
                      sourcePills={inferSourcePills(action)}
                      sourceLabel="Source refs"
                      nextStep={writeDocument ? 'Next: Save to record' : 'Next: Await response'}
                      statusText={writeDocument ? 'READY TO FILE' : 'READY TO SEND'}
                      footerText="Grounded in connected sources"
                      actions={cardActions}
                    />
                  </div>
                ) : loadingLatest ? (
                  loadingCard
                ) : hasLatestIssue ? (
                  <div className="min-h-[420px]">{briefingUnavailableCard}</div>
                ) : (
                  <div className="min-h-[420px]">{emptyStateCard}</div>
                )
              ) : (
                <div className="min-h-[420px]">{secondaryPanelNode}</div>
              )}

              {isBriefingPanel && showOutcomeActions ? (
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

        </div>
      </div>

      {hiddenArtifactNode}
    </main>
  );
}
