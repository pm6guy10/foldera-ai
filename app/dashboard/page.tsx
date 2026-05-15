'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { DashboardArtifactBody } from '@/components/dashboard/DashboardArtifactBody';
import {
  DashboardStatusNoticeCard,
  HiddenDashboardArtifact,
} from '@/components/dashboard/DashboardChromeExtras';
import { DocumentCollectionIntakePanel } from '@/components/dashboard/DocumentCollectionIntakePanel';
import { DashboardMobileLayout } from '@/components/dashboard/DashboardMobileLayout';
import {
  DashboardBriefingUnavailableCard,
  DashboardDegradedState,
  DashboardLoadingCard,
} from '@/components/dashboard/DashboardStateCards';
import { DashboardDesktopStage } from '@/components/dashboard/DashboardDesktopStage';
import { DashboardContextRail } from '@/components/dashboard/DashboardContextRail';
import { DailyBriefCard } from '@/components/foldera/DailyBriefCard';
import { EmptyStateCard } from '@/components/foldera/EmptyStateCard';
import { DailyUtilitySlateCard } from '@/components/foldera/DailyUtilitySlateCard';
import { type DashboardPanelKey } from '@/components/foldera/DashboardSidebar';
import { DashboardWorkspacePanels } from '@/components/dashboard/DashboardWorkspacePanels';
import {
  clearPendingCheckoutPlan,
  resumePendingCheckout,
} from '@/lib/billing/pending-checkout';
import { formatRelativeTime, providerDisplayName } from '@/lib/ui/provider-display';
import {
  DASHBOARD_PANEL_LABELS,
  DEFAULT_STAGE_METRICS,
  artifactClipboardText,
  asTrimmedString,
  buildMissingInputPrompt,
  buildDailyValueState,
  buildNoSafeArtifactSlate,
  buildDecisionSuccessNotice,
  buildDashboardSourceTrail,
  computeStageMetrics,
  dailyUtilitySlateClipboardText,
  getDocumentCollectionIntakePrompt,
  getArtifactBody,
  getDashboardActionHeadline,
  getDashboardDiscrepancyFrame,
  getDateLabel,
  getGreetingLabel,
  inferSourcePills,
  isDashboardActionSummary,
  isDailyUtilitySlate,
  isDocumentCollectionRequirementsAction,
  isVisibleDashboardAction,
  isWriteDocumentAction,
  needsDashboardActionDetail,
  normalizeDashboardPanel,
  normalizeIntegrationProvider,
  shouldReconcileExecuteFailure,
  writeClipboardText,
  type DashboardAction,
  type DashboardHistoryItem,
  type DashboardHistoryPayload,
  type DashboardLoadIssue,
  type DashboardStatusNotice,
  type DailyUtilitySlate,
  type GraphStatsPayload,
  type IntegrationStatusPayload,
  type LoadLatestResult,
  type StageMetrics,
} from './dashboard-page-model';

const DAILY_VALUE_FALLBACK_TIMEOUT_MS = 4500;

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const [activePanel, setActivePanel] = useState<DashboardPanelKey>('today');
  const isTodayPanel = activePanel === 'today';
  const activeSidebarLabel = DASHBOARD_PANEL_LABELS[activePanel];
  const [action, setAction] = useState<DashboardAction | null>(null);
  const [dailyUtilitySlate, setDailyUtilitySlate] = useState<DailyUtilitySlate | null>(null);
  const [loadingLatest, setLoadingLatest] = useState(true);
  const [integrationStatus, setIntegrationStatus] = useState<IntegrationStatusPayload | null>(null);
  const [graphStats, setGraphStats] = useState<GraphStatsPayload | null>(null);
  const [historyItems, setHistoryItems] = useState<DashboardHistoryItem[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [artifactPaywallLocked, setArtifactPaywallLocked] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [statusNotice, setStatusNotice] = useState<DashboardStatusNotice | null>(null);
  const [outcomeSubmitting, setOutcomeSubmitting] = useState<null | 'worked' | 'didnt_work'>(
    null,
  );
  const [documentIntakeSubmissionUrl, setDocumentIntakeSubmissionUrl] = useState('');
  const [documentIntakeCandidateDocuments, setDocumentIntakeCandidateDocuments] = useState('');
  const [documentIntakeSubmitting, setDocumentIntakeSubmitting] = useState(false);
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
  const load = useCallback(async (cacheMode: RequestCache = 'default'): Promise<LoadLatestResult> => {
    loadAbortRef.current?.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;
    setLoadingLatest(true);
    try {
      const latestRes = await fetch('/api/conviction/latest', {
        signal: controller.signal,
        cache: cacheMode,
      });
      if (controller.signal.aborted) {
        return { action: null, dailyUtilitySlate: null, loaded: false };
      }
      if (!latestRes.ok) {
        setAction(null);
        setDailyUtilitySlate(null);
        setArtifactPaywallLocked(false);
        setLoadIssue('latest', true);
        return { action: null, dailyUtilitySlate: null, loaded: false };
      }
      const latest = await latestRes.json().catch(() => ({}));
      if (controller.signal.aborted) {
        return { action: null, dailyUtilitySlate: null, loaded: false };
      }
      const visibleAction =
        isVisibleDashboardAction(latest) || isDashboardActionSummary(latest)
          ? (latest as DashboardAction)
          : null;
      const action =
        visibleAction && !locallyHiddenActionIds.has(visibleAction.id) ? visibleAction : null;
      let slate =
        !action && isDailyUtilitySlate(latest?.daily_utility_slate)
          ? latest.daily_utility_slate
          : buildNoSafeArtifactSlate(latest);
      if (!action) {
        const dailyValueController = new AbortController();
        const abortDailyValue = () => dailyValueController.abort();
        const dailyValueTimeout = window.setTimeout(
          abortDailyValue,
          DAILY_VALUE_FALLBACK_TIMEOUT_MS,
        );
        controller.signal.addEventListener('abort', abortDailyValue, { once: true });
        try {
          const dailyValueRes = await fetch('/api/conviction/daily-value', {
            signal: dailyValueController.signal,
            cache: cacheMode,
          });
          if (!controller.signal.aborted && dailyValueRes.ok) {
            const dailyValue = await dailyValueRes.json().catch(() => ({}));
            if (isDailyUtilitySlate(dailyValue?.daily_utility_slate)) {
              slate = dailyValue.daily_utility_slate;
            }
          }
        } catch {
          // The receipt-backed latest slate remains the fallback if live daily value is unavailable.
        } finally {
          window.clearTimeout(dailyValueTimeout);
          controller.signal.removeEventListener('abort', abortDailyValue);
        }
      }
      if (controller.signal.aborted) {
        return { action: null, dailyUtilitySlate: null, loaded: false };
      }
      setAction(action);
      setDailyUtilitySlate(slate);
      setArtifactPaywallLocked(action ? latest?.artifact_paywall_locked === true : false);
      setLoadIssue('latest', false);
      return { action, dailyUtilitySlate: slate, loaded: true };
    } catch {
      if (controller.signal.aborted) {
        return { action: null, dailyUtilitySlate: null, loaded: false };
      }
      setAction(null);
      setDailyUtilitySlate(null);
      setArtifactPaywallLocked(false);
      setLoadIssue('latest', true);
      return { action: null, dailyUtilitySlate: null, loaded: false };
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
  const loadIntegrationStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/integrations/status');
      if (!response.ok) {
        setLoadIssue('integrations', true);
        setIntegrationStatus(null);
        return;
      }
      const payload = (await response.json().catch(() => null)) as IntegrationStatusPayload | null;
      setLoadIssue('integrations', payload === null);
      setIntegrationStatus(payload);
    } catch {
      setLoadIssue('integrations', true);
      setIntegrationStatus(null);
    }
  }, [setLoadIssue]);
  useEffect(() => {
    if (status !== 'authenticated') {
      setIntegrationStatus(null);
      setLoadIssue('integrations', false);
      return undefined;
    }
    void loadIntegrationStatus();
    return undefined;
  }, [loadIntegrationStatus, setLoadIssue, status]);
  useEffect(() => {
    if (status !== 'authenticated') {
      setGraphStats(null);
      setLoadIssue('graph', false);
      return;
    }
    let cancelled = false;
    void fetch('/api/graph/stats')
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
    void fetch('/api/conviction/history?limit=5')
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
      if (panel === 'today') {
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
            await load('reload');
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
          await load('reload');
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : `${decision} failed`;
        if (shouldReconcileExecuteFailure(null, message)) {
          await load('reload');
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
  const openActionDetail = useCallback(async () => {
    if (!action || !needsDashboardActionDetail(action) || action.artifact || detailLoading) return;
    setDetailLoading(true);
    try {
      const detailUrl = action.detail_url ?? `/api/conviction/actions/${action.id}`;
      const response = await fetch(detailUrl);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !isVisibleDashboardAction(payload)) {
        setStatusNotice({
          id: 'detail_load_failed',
          message: 'Could not load finished work right now.',
        });
        return;
      }
      setAction(payload);
    } catch {
      setStatusNotice({
        id: 'detail_load_failed',
        message: 'Could not load finished work right now.',
      });
    } finally {
      setDetailLoading(false);
    }
  }, [action, detailLoading]);
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
  const copyDailyValue = useCallback(async () => {
    const text = dailyUtilitySlateClipboardText(dailyUtilitySlate);
    if (!text) {
      setStatusNotice({ id: 'copy_failed', message: 'Nothing available to copy.' });
      return;
    }
    const copied = await writeClipboardText(text);
    setStatusNotice(
      copied
        ? { id: 'copy_daily_value_succeeded', message: "Copied today's read." }
        : { id: 'copy_failed', message: 'Copy failed. Select the text manually.' },
    );
  }, [dailyUtilitySlate]);
  const submitDocumentCollectionIntake = useCallback(async () => {
    if (!action?.id || documentIntakeSubmitting) return;
    const submissionUrl = documentIntakeSubmissionUrl.trim();
    const candidateDocuments = documentIntakeCandidateDocuments.trim();
    if (!submissionUrl || !candidateDocuments) {
      setStatusNotice({
        id: 'document_collection_intake_missing',
        message: 'Paste the submission link and list the owned candidate documents first.',
      });
      return;
    }
    setDocumentIntakeSubmitting(true);
    try {
      const response = await fetch(
        `/api/conviction/actions/${action.id}/document-collection-intake`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            submission_url: submissionUrl,
            candidate_documents: candidateDocuments,
          }),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatusNotice({
          id: 'document_collection_intake_failed',
          message:
            typeof payload?.error === 'string'
              ? payload.error
              : 'Could not save document inputs right now.',
        });
        return;
      }
      setStatusNotice({
        id: 'document_collection_intake_saved',
        message:
          'Inputs saved. Foldera can produce the finished submission packet from these owned inputs next.',
      });
    } catch {
      setStatusNotice({
        id: 'document_collection_intake_failed',
        message: 'Could not save document inputs right now.',
      });
    } finally {
      setDocumentIntakeSubmitting(false);
    }
  }, [
    action?.id,
    documentIntakeCandidateDocuments,
    documentIntakeSubmissionUrl,
    documentIntakeSubmitting,
  ]);
  const sessionName = asTrimmedString(session?.user?.name) ?? 'Foldera workspace';
  const firstName = asTrimmedString(session?.user?.name)?.split(' ')[0] ?? null;
  const sidebarUserName = firstName ?? sessionName;
  const writeDocument = isWriteDocumentAction(action);
  const documentCollectionRequirements = isDocumentCollectionRequirementsAction(action);
  const documentCollectionPrompt = getDocumentCollectionIntakePrompt(action);
  const showArtifactBlur = Boolean(action?.artifact) && artifactPaywallLocked;
  const summaryNeedsDetail = Boolean(action && needsDashboardActionDetail(action) && !action.artifact);
  const discrepancyFrame = getDashboardDiscrepancyFrame(action);
  const sourceTrailItems = buildDashboardSourceTrail(action);
  const artifactTitle =
    discrepancyFrame?.claim ?? getDashboardActionHeadline(action);
  const artifactContradiction =
    discrepancyFrame?.contradiction ??
    asTrimmedString(action?.reason) ??
    'Foldera surfaced the single move that matters most right now.';
  const artifactBody = getArtifactBody(action?.artifact);
  const readinessLabel = documentCollectionRequirements ? 'Inputs needed' : 'Finished work';
  const draftLabel = documentCollectionRequirements
    ? 'Requirements packet'
    : writeDocument
      ? 'Document'
      : 'Ready text';
  const copyActionLabel = 'Copy draft';
  const skipActionLabel = 'Skip';
  const primaryActionLabel = writeDocument
    ? documentCollectionRequirements
      ? 'Save packet'
      : 'Save'
    : approvalEmailSendEnabled
      ? 'Approve & send'
      : 'Approve';
  const dashboardNextStep = documentCollectionRequirements
    ? 'Next: Paste the submission link and list/upload the candidate documents.'
    : writeDocument
      ? 'Next: Save to record'
      : 'Next: Await response';
  const dashboardStatusText = documentCollectionRequirements
    ? 'INPUTS NEEDED'
    : writeDocument
      ? 'READY TO SAVE'
      : 'READY TO APPROVE';
  const showOutcomeActions =
    Boolean(executedActionId) &&
    (statusNotice?.id === 'approve_saved_document' ||
      statusNotice?.id === 'approve_sent' ||
      statusNotice?.id === 'approve_recorded' ||
      statusNotice?.id === 'outcome_record_failed') &&
    !outcomeRecorded;
  const integrationRows = Array.isArray(integrationStatus?.integrations)
    ? integrationStatus.integrations
    : [];
  const connectedSources = integrationRows.filter((integration) => integration?.is_active === true);
  const sourceFreshnessNeedsAttention = integrationRows.some(
    (integration) => integration?.needs_sync === true || integration?.sync_stale === true,
  );
  const sourceReconnectNeeded = integrationRows.some(
    (integration) => integration?.needs_reconnect === true || integration?.needs_reauth === true,
  );
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
  const degradedIssueLabels = [
    hasLatestIssue ? 'Latest work unavailable.' : null,
    hasIntegrationIssue ? 'Connected source status unavailable.' : null,
    hasGraphIssue ? 'Signal summary unavailable.' : null,
    hasHistoryIssue ? 'Recent history unavailable.' : null,
  ].filter((value): value is string => Boolean(value));
  const artifactBodyContent = (
    <DashboardArtifactBody
      artifactBody={artifactBody}
      writeDocument={writeDocument}
      showArtifactBlur={showArtifactBlur}
      onUpgrade={() => void startStripeCheckout()}
    />
  );
  const documentCollectionIntakeNode = documentCollectionPrompt ? (
    <DocumentCollectionIntakePanel
      prompt={documentCollectionPrompt}
      submissionUrl={documentIntakeSubmissionUrl}
      candidateDocuments={documentIntakeCandidateDocuments}
      submitting={documentIntakeSubmitting}
      onSubmissionUrlChange={setDocumentIntakeSubmissionUrl}
      onCandidateDocumentsChange={setDocumentIntakeCandidateDocuments}
      onSubmit={() => void submitDocumentCollectionIntake()}
    />
  ) : null;
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
      {documentCollectionIntakeNode}
      {artifactBody ? (
        <section>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">
            {readinessLabel}
          </p>
          <div className="mt-2">{artifactBodyContent}</div>
        </section>
      ) : summaryNeedsDetail ? (
        <section>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">
            {readinessLabel}
          </p>
          <div className="mt-2 rounded-[16px] border border-border bg-panel-raised p-4 text-sm text-text-secondary">
            {documentCollectionRequirements
              ? 'Open the requirements packet to inspect the missing inputs before acting.'
              : 'Open the finished artifact to inspect the exact draft before acting.'}
          </div>
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
        ...(summaryNeedsDetail
          ? [{
              label: detailLoading
                ? 'Opening…'
                : documentCollectionRequirements
                  ? 'Open requirements packet'
                  : 'Open finished work',
              kind: 'secondary' as const,
              onClick: () => void openActionDetail(),
              disabled: detailLoading,
            }]
          : [{
              label: copyActionLabel,
              kind: 'secondary' as const,
              onClick: () => void copyDraft(),
            }]),
        {
          label: skipActionLabel,
          kind: 'amber' as const,
          onClick: () => void runDecision('skip'),
          disabled: executing || detailLoading,
        },
        {
          label: primaryActionLabel,
          kind: 'primary' as const,
          onClick: () => void runDecision('approve'),
          disabled: executing || detailLoading,
          dataTestId: 'dashboard-primary-action',
        },
      ]
    : [];
  const missingInputPrompt = buildMissingInputPrompt(dailyUtilitySlate, {
    hasIntegrationIssue,
    mailIngestLooksStale:
      integrationStatus?.mail_ingest_looks_stale === true || sourceFreshnessNeedsAttention,
  });
  const dailyValueState = buildDailyValueState(
    dailyUtilitySlate,
    hasLatestIssue
      ? 'latest'
      : hasIntegrationIssue
        ? 'integrations'
        : hasGraphIssue
          ? 'graph'
          : hasHistoryIssue
            ? 'history'
            : null,
    integrationStatus,
    historyItems,
  );
  const showSourceNeededBrief =
    !dailyUtilitySlate &&
    (connectedSourceCount === 0 ||
      sourceFreshnessNeedsAttention ||
      sourceReconnectNeeded ||
      integrationStatus?.mail_ingest_looks_stale === true);
  const sourceNeededBriefCard = (
    <div data-testid="dashboard-empty-state" className="h-full w-full"><DailyBriefCard className="foldera-dashboard-brief-card foldera-dashboard-money-shot h-full w-full" dashboardCta stageDesktop={stageMetrics.isDesktop} directive="Connect sources so Foldera can find today’s finished move." whyNow="Foldera needs recent email, calendar, and draft context before it can safely recommend a source-backed action." eyebrowLabel="Daily Brief" directiveLabel="Directive" whyLabel="Why this now" draftLabel="Draft" draftBody={<p>Once your sources are connected, this space will show the directive, why it matters now, the finished draft or document, and the source trail behind it.</p>} sourcePills={['Email', 'Calendar', 'Drafts', 'Decision notes']} sourceLabel="Source trail" nextStep="Next: Connect sources so Foldera can prepare the next safe artifact." statusText="WAITING FOR SOURCES" footerText="Foldera needs current source context first" actions={[{ label: 'View demo', href: '/demo', kind: 'secondary' }, { label: 'Connect sources', href: '/dashboard?panel=sources', kind: 'primary', dataTestId: 'dashboard-connect-sources' }]} /></div>
  );
  const waitingBriefCard = <EmptyStateCard />;
  const emptyStateCard = dailyUtilitySlate ? (
    <DailyUtilitySlateCard
      slate={dailyUtilitySlate}
      missingInputPrompt={missingInputPrompt}
      dailyValueState={dailyValueState}
      onCopyDailyValue={() => void copyDailyValue()}
    />
  ) : showSourceNeededBrief ? (
    sourceNeededBriefCard
  ) : (
    waitingBriefCard
  );
  const loadingCard = <DashboardLoadingCard />;
  const degradedStateNode = <DashboardDegradedState issueLabels={degradedIssueLabels} />;
  const briefingUnavailableCard = <DashboardBriefingUnavailableCard />;
  const renderWorkspacePanel = (focusPanel: 'history' | 'sources' | 'account') => (
    <DashboardWorkspacePanels
      connectedSourcesValue={connectedSourcesValue}
      hasIntegrationIssue={hasIntegrationIssue}
      connectedSourceCount={connectedSourceCount}
      latestSignalLabel={latestSignalLabel}
      sourceSummaryRows={sourceSummaryRows}
      googleIntegration={googleIntegration}
      microsoftIntegration={microsoftIntegration}
      historyLoaded={historyLoaded}
      hasHistoryIssue={hasHistoryIssue}
      recentHistory={recentHistory}
      userName={sidebarUserName}
      onSourceSynced={() => void loadIntegrationStatus()}
      focusPanel={focusPanel}
    />
  );
  const briefingCardNode = action ? (
    <div data-testid="dashboard-panel-today" className="h-full w-full">
      <DailyBriefCard
        className="foldera-dashboard-brief-card foldera-dashboard-money-shot h-full w-full"
        dashboardCta
        stageDesktop={stageMetrics.isDesktop}
        directive={artifactTitle}
        whyNow={artifactContradiction}
        eyebrowLabel={readinessLabel}
        directiveLabel={readinessLabel}
        whyLabel="Why it matters"
        draftLabel={draftLabel}
        draftBody={draftBody}
        sourcePills={inferSourcePills(action)}
        sourceLabel="Source trail"
        nextStep={dashboardNextStep}
        statusText={dashboardStatusText}
        footerText="Source grounded"
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
  const focusedSupportPanelNode =
    activePanel === 'history'
      ? renderWorkspacePanel('history')
      : activePanel === 'sources'
        ? renderWorkspacePanel('sources')
        : activePanel === 'account'
          ? renderWorkspacePanel('account')
          : null;
  const rightRailPanelNode = !isTodayPanel ? (
    <DashboardContextRail
      activePanel={activePanel}
      historyLoaded={historyLoaded}
      recentHistoryCount={recentHistory.length}
      hasIntegrationIssue={hasIntegrationIssue}
      connectedSourceCount={connectedSourceCount}
      latestSignalLabel={latestSignalLabel}
      sidebarUserName={sidebarUserName}
    />
  ) : null;
  const desktopWorkspaceNode = isTodayPanel ? (
    <div data-testid="dashboard-unified-workspace" className="h-full w-full">
      <div className="h-full min-h-0 min-w-0">{briefingCardNode}</div>
    </div>
  ) : (
    focusedSupportPanelNode
  );
  const statusNoticeNode = statusNotice ? (
    <DashboardStatusNoticeCard notice={statusNotice} />
  ) : null;
  const hiddenArtifactNode = <HiddenDashboardArtifact title={artifactTitle} body={artifactBody} />;
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
      <DashboardDesktopStage
        activePanel={activePanel}
        activeSidebarLabel={activeSidebarLabel}
        sidebarUserName={sidebarUserName}
        selectPanel={selectPanel}
        dateLabel={getDateLabel()}
        greetingLabel={getGreetingLabel()}
        firstName={firstName}
        degradedStateNode={degradedStateNode}
        desktopWorkspaceNode={desktopWorkspaceNode}
        statusNoticeNode={statusNoticeNode}
        isTodayPanel={isTodayPanel}
        showOutcomeActions={showOutcomeActions}
        outcomeSubmitting={outcomeSubmitting}
        submitOutcome={submitOutcome}
        hiddenArtifactNode={hiddenArtifactNode}
        sourceTrailItems={sourceTrailItems}
        sidePanelNode={rightRailPanelNode}
      />
    );
  }
  return (
    <DashboardMobileLayout
      activeSidebarLabel={activeSidebarLabel}
      sidebarUserName={sidebarUserName}
      activePanel={activePanel}
      selectPanel={selectPanel}
      dateLabel={getDateLabel()}
      greetingLabel={getGreetingLabel()}
      firstName={firstName}
      degradedStateNode={degradedStateNode}
      statusNoticeNode={statusNoticeNode}
      isTodayPanel={isTodayPanel}
      hasAction={Boolean(action)}
      artifactTitle={artifactTitle}
      artifactContradiction={artifactContradiction}
      draftLabel={draftLabel}
      draftBody={draftBody}
      sourcePills={action ? inferSourcePills(action) : []}
      writeDocument={writeDocument}
      nextStep={dashboardNextStep}
      statusText={dashboardStatusText}
      cardActions={cardActions}
      loadingLatest={loadingLatest}
      loadingCard={loadingCard}
      hasLatestIssue={hasLatestIssue}
      briefingUnavailableCard={briefingUnavailableCard}
      emptyStateCard={emptyStateCard}
      supportPanelNode={isTodayPanel ? null : focusedSupportPanelNode}
      showOutcomeActions={showOutcomeActions}
      outcomeSubmitting={outcomeSubmitting}
      submitOutcome={submitOutcome}
      hiddenArtifactNode={hiddenArtifactNode}
    />
  );
}
