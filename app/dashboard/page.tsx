'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  FileText,
  Layers3,
  Mail,
  Plane,
  TriangleAlert,
  TrendingUp,
} from 'lucide-react';
import { DailyBriefCard } from '@/components/foldera/DailyBriefCard';
import {
  DashboardSidebar,
  type DashboardPanelKey,
} from '@/components/foldera/DashboardSidebar';
import { EmptyStateCard } from '@/components/foldera/EmptyStateCard';
import { FolderaLogo } from '@/components/foldera/FolderaLogo';
import { formatRelativeTime, providerDisplayName } from '@/lib/ui/provider-display';

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
  integrations?: IntegrationStatusItem[];
  newest_mail_signal_at?: string | null;
  mail_ingest_looks_stale?: boolean;
};

type IntegrationStatusItem = {
  provider?: string;
  is_active?: boolean;
  sync_email?: string | null;
  last_synced_at?: string | null;
  needs_reconnect?: boolean;
  needs_reauth?: boolean;
  sync_stale?: boolean;
};

type GraphStatsPayload = {
  signalsTotal?: number;
  commitmentsActive?: number;
  patternsActive?: number;
  lastSignalAt?: string | null;
  lastSignalSource?: string | null;
};

type DashboardHistoryItem = {
  id: string;
  status?: string | null;
  action_type?: string | null;
  generated_at?: string | null;
  directive_preview?: string | null;
  artifact_preview?: string | null;
};

type DashboardHistoryPayload = {
  items?: DashboardHistoryItem[];
};

type LoadLatestResult = {
  action: DashboardAction | null;
  loaded: boolean;
};

type StageMetrics = {
  isDesktop: boolean;
  scale: number;
  offsetX: number;
  offsetY: number;
};

const DESIGN_W = 2048;
const DESIGN_H = 1152;
const DESKTOP_STAGE_MIN_WIDTH = 1440;
const DEFAULT_STAGE_METRICS: StageMetrics = {
  isDesktop: false,
  scale: 1,
  offsetX: 0,
  offsetY: 0,
};

const DASHBOARD_PANEL_LABELS: Record<DashboardPanelKey, string> = {
  briefing: 'Executive Briefing',
  playbooks: 'Playbooks',
  signals: 'Signals',
  'audit-log': 'Audit Log',
  integrations: 'Integrations',
  settings: 'Settings',
};

const FIRST_READ_NO_VISIBLE_ACTION_MESSAGE =
  'No directive cleared the bar. Foldera checked your signals and found nothing ready to act on.';
const FIRST_READ_FAILURE_MESSAGE = 'Could not run your first read right now.';
const FIRST_READ_INTERNAL_FAILURE_PATTERNS = [
  /\bllm_failed\b/i,
  /\bstale_date_in_directive\b/i,
  /\bINFINITE_LOOP\b/i,
  /\bAll \d+ candidates blocked\b/i,
  /\bDirective rejected by persistence validation\b/i,
  /\bOutput blocked by quality gate\b/i,
  /\bHard bottom gate blocked\b/i,
] as const;

function normalizeDashboardPanel(value: string | null): DashboardPanelKey {
  switch (value) {
    case 'playbooks':
    case 'signals':
    case 'audit-log':
    case 'integrations':
    case 'settings':
    case 'briefing':
      return value;
    default:
      return 'briefing';
  }
}

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

async function writeClipboardText(text: string): Promise<boolean> {
  if (!text) return false;

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the textarea copy path for browsers that block clipboard writes.
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', 'true');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(textarea);
    return copied;
  } catch {
    return false;
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

function hasInternalFailureText(value: string | null | undefined): boolean {
  if (!value) return false;
  return FIRST_READ_INTERNAL_FAILURE_PATTERNS.some((pattern) => pattern.test(value));
}

function getDashboardActionArtifact(
  action: DashboardAction | null | undefined,
): DashboardArtifact | null {
  return action?.artifact && typeof action.artifact === 'object' ? action.artifact : null;
}

function getDashboardActionHeadline(action: DashboardAction | null | undefined): string {
  const artifact = getDashboardActionArtifact(action);
  return (
    asTrimmedString(action?.directive) ??
    asTrimmedString(artifact?.title) ??
    asTrimmedString(artifact?.subject) ??
    asTrimmedString(artifact?.type) ??
    ''
  );
}

function dashboardActionContainsInternalFailureText(
  action: DashboardAction | null | undefined,
): boolean {
  const artifact = getDashboardActionArtifact(action);
  const userFacingFields = [
    asTrimmedString(action?.directive),
    asTrimmedString(action?.reason),
    asTrimmedString(artifact?.title),
    asTrimmedString(artifact?.subject),
    asTrimmedString(artifact?.body),
    asTrimmedString(artifact?.text),
    asTrimmedString(artifact?.content),
    asTrimmedString(artifact?.context),
  ];
  return userFacingFields.some((field) => hasInternalFailureText(field));
}

function isVisibleDashboardAction(value: unknown): value is DashboardAction {
  if (!value || typeof value !== 'object') return false;
  const action = value as DashboardAction;
  if (!asTrimmedString((value as Record<string, unknown>).id)) return false;
  if (!getDashboardActionArtifact(action)) return false;
  if (dashboardActionContainsInternalFailureText(action)) return false;
  return (
    getDashboardActionHeadline(action).length > 0 ||
    getArtifactBody(getDashboardActionArtifact(action)).length > 0
  );
}

function sanitizeFirstReadFailureMessage(message: string | null | undefined): string {
  if (hasInternalFailureText(message)) return FIRST_READ_FAILURE_MESSAGE;
  return asTrimmedString(message) ?? FIRST_READ_FAILURE_MESSAGE;
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

function normalizeIntegrationProvider(provider: string | null | undefined): string {
  const normalized = (provider ?? '').trim().toLowerCase();
  if (normalized === 'microsoft' || normalized === 'azure-ad') return 'azure_ad';
  return normalized;
}

function getIntegrationStateLabel(integration: IntegrationStatusItem | null | undefined): string {
  if (!integration?.is_active) return 'Not connected';
  if (integration.needs_reauth) return 'Needs re-auth';
  if (integration.needs_reconnect) return 'Needs reconnect';
  if (integration.sync_stale) return 'Sync stale';
  return 'Connected';
}

function getIntegrationStateClass(integration: IntegrationStatusItem | null | undefined): string {
  if (!integration?.is_active) return 'text-text-muted';
  if (integration.needs_reauth || integration.needs_reconnect || integration.sync_stale) {
    return 'text-amber-300';
  }
  return 'text-emerald-300';
}

function getIntegrationMetaLine(integration: IntegrationStatusItem | null | undefined): string {
  if (!integration?.is_active) return 'Connect from Settings';
  const meta: string[] = [];
  const syncEmail = asTrimmedString(integration.sync_email);
  if (syncEmail) {
    meta.push(syncEmail);
  } else {
    meta.push('Connected');
  }
  if (asTrimmedString(integration.last_synced_at)) {
    meta.push(formatRelativeTime(integration.last_synced_at));
  }
  return meta.join(' · ');
}

function asPanelLabel(value: string | null | undefined, fallback: string): string {
  const trimmed = asTrimmedString(value);
  return trimmed ? trimmed.replace(/_/g, ' ') : fallback;
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const [activePanel, setActivePanel] = useState<DashboardPanelKey>('briefing');
  const isBriefingPanel = activePanel === 'briefing';
  const activeSidebarLabel = DASHBOARD_PANEL_LABELS[activePanel];

  const [action, setAction] = useState<DashboardAction | null>(null);
  const [loadingLatest, setLoadingLatest] = useState(true);
  const [hasActiveIntegration, setHasActiveIntegration] = useState(false);
  const [integrationStatus, setIntegrationStatus] = useState<IntegrationStatusPayload | null>(null);
  const [graphStats, setGraphStats] = useState<GraphStatsPayload | null>(null);
  const [historyItems, setHistoryItems] = useState<DashboardHistoryItem[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [artifactPaywallLocked, setArtifactPaywallLocked] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [firstReadRunning, setFirstReadRunning] = useState(false);
  const [statusNotice, setStatusNotice] = useState<DashboardStatusNotice | null>(null);
  const [outcomeSubmitting, setOutcomeSubmitting] = useState<null | 'worked' | 'didnt_work'>(
    null,
  );
  const [stageMetrics, setStageMetrics] = useState<StageMetrics>(DEFAULT_STAGE_METRICS);
  const [stageMeasured, setStageMeasured] = useState(false);
  const [executedActionId, setExecutedActionId] = useState<string | null>(null);
  const [outcomeRecorded, setOutcomeRecorded] = useState(false);
  const [locallyHiddenActionIds, setLocallyHiddenActionIds] = useState<Set<string>>(() => new Set());

  const loadAbortRef = useRef<AbortController | null>(null);

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
      return { action, loaded: true };
    } catch {
      if (controller.signal.aborted) {
        return { action: null, loaded: false };
      }
      setAction(null);
      setArtifactPaywallLocked(false);
      return { action: null, loaded: false };
    } finally {
      if (!controller.signal.aborted) {
        setLoadingLatest(false);
      }
    }
  }, [locallyHiddenActionIds]);

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
      setIntegrationStatus(null);
      return;
    }

    let cancelled = false;
    void fetch('/api/integrations/status', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: IntegrationStatusPayload | null) => {
        if (cancelled) return;
        setIntegrationStatus(payload);
        const integrations = Array.isArray(payload?.integrations) ? payload.integrations : [];
        setHasActiveIntegration(
          integrations.some((integration) => integration?.is_active === true),
        );
      })
      .catch(() => {
        if (!cancelled) {
          setHasActiveIntegration(false);
          setIntegrationStatus(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [status]);

  useEffect(() => {
    if (status !== 'authenticated') {
      setGraphStats(null);
      return;
    }

    let cancelled = false;
    void fetch('/api/graph/stats', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: GraphStatsPayload | null) => {
        if (!cancelled) {
          setGraphStats(payload);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setGraphStats(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [status]);

  useEffect(() => {
    if (status !== 'authenticated') {
      setHistoryItems([]);
      setHistoryLoaded(false);
      return;
    }

    let cancelled = false;
    setHistoryLoaded(false);
    void fetch('/api/conviction/history?limit=5', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: DashboardHistoryPayload | null) => {
        if (cancelled) return;
        const nextItems = Array.isArray(payload?.items) ? payload.items : [];
        setHistoryItems(nextItems);
      })
      .catch(() => {
        if (!cancelled) {
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
  }, [status]);

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
        setStatusNotice(buildDecisionSuccessNotice(action, decision));
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
          sanitizeFirstReadFailureMessage(
            typeof payload?.error === 'string' ? payload.error : null,
          ),
        );
      }

      const latestResult = await load();
      if (!latestResult.loaded) {
        setStatusNotice({
          id: 'first_read_failed',
          message: FIRST_READ_FAILURE_MESSAGE,
        });
        return;
      }

      setStatusNotice({
        id: latestResult.action ? 'first_read_generated' : 'first_read_no_visible_action',
        message: latestResult.action
          ? 'First read generated.'
          : FIRST_READ_NO_VISIBLE_ACTION_MESSAGE,
      });
    } catch (error) {
      setStatusNotice({
        id: 'first_read_failed',
        message:
          error instanceof Error
            ? sanitizeFirstReadFailureMessage(error.message)
            : FIRST_READ_FAILURE_MESSAGE,
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
    getDashboardActionHeadline(action);
  const artifactBody = getArtifactBody(action?.artifact);
  const draftLabel = 'DRAFT';
  const copyActionLabel = 'Copy draft';
  const skipActionLabel = 'Snooze 24h';
  const primaryActionLabel = 'Approve & send';
  const showOutcomeActions =
    Boolean(executedActionId) &&
    (statusNotice?.id === 'approve_saved_document' || statusNotice?.id === 'approve_sent') &&
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
  const briefWorkRows = [
    {
      icon: Plane,
      label: 'Directive',
      description: 'The single move that matters most right now.',
    },
    {
      icon: FileText,
      label: 'Draft',
      description: 'Ready-to-send wording when writing is the bottleneck.',
    },
    {
      icon: Layers3,
      label: 'Source trail',
      description: 'The evidence behind the recommendation.',
    },
  ];

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

  const secondaryPanelNode = !isBriefingPanel ? (
    <section
      className="foldera-dashboard-brief-card foldera-brief-shell flex h-full w-full flex-col gap-5 p-6 sm:p-8"
      data-testid={`dashboard-panel-${activePanel}`}
    >
      {activePanel === 'signals' ? (
        <>
          <div>
            <p
              className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted"
              data-testid="dashboard-active-panel-label"
            >
              Signals
            </p>
            <h2 className="mt-3 text-[clamp(1.8rem,3.5vw,2.2rem)] font-semibold leading-[1.12] tracking-[-0.04em] text-text-primary">
              Source status summary
            </h2>
            <p className="mt-3 max-w-[64ch] text-[15px] leading-7 text-text-secondary">
              Live source health and recent signal activity from connected accounts.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <article className="rounded-[14px] border border-border bg-panel-raised p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
                Connected sources
              </p>
              <p className="mt-2 text-[34px] font-semibold leading-none text-text-primary" data-testid="dashboard-signals-connected-count">
                {connectedSourceCount}
              </p>
              <p className="mt-2 text-sm text-text-secondary">
                {connectedSourceCount > 0
                  ? `${connectedSourceCount} active source${connectedSourceCount === 1 ? '' : 's'}`
                  : 'No active sources connected yet.'}
              </p>
            </article>
            <article className="rounded-[14px] border border-border bg-panel-raised p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
                Latest signal
              </p>
              <p className="mt-2 text-base font-semibold text-text-primary" data-testid="dashboard-signals-latest-label">
                {latestSignalLabel}
              </p>
              <p className="mt-2 text-sm text-text-secondary">
                {typeof graphStats?.signalsTotal === 'number'
                  ? `${graphStats.signalsTotal} total signals captured`
                  : 'Signal totals unavailable right now.'}
              </p>
            </article>
          </div>

          <article className="rounded-[14px] border border-border bg-panel-raised p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
              Source status
            </p>
            {sourceSummaryRows.length === 0 ? (
              <p className="mt-3 text-sm text-text-secondary" data-testid="dashboard-signals-source-status">
                No active source status yet. Connect Gmail or Microsoft to populate this panel.
              </p>
            ) : (
              <ul className="mt-3 space-y-2" data-testid="dashboard-signals-source-status">
                {sourceSummaryRows.map((integration) => (
                  <li
                    key={`${integration.provider ?? 'unknown'}-${integration.sync_email ?? 'connected'}`}
                    className="flex flex-wrap items-center gap-2 text-sm"
                  >
                    <span className="font-semibold text-text-primary">
                      {providerDisplayName(integration.provider)}
                    </span>
                    <span className={`font-medium ${getIntegrationStateClass(integration)}`}>
                      {getIntegrationStateLabel(integration)}
                    </span>
                    <span className="min-w-0 break-all text-text-secondary">
                      {getIntegrationMetaLine(integration)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </article>

          <div className="mt-auto flex flex-wrap gap-3">
            <Link
              href="/dashboard/signals"
              className="foldera-button-primary"
              data-testid="dashboard-panel-open-signals"
            >
              Open full signals
            </Link>
            <Link
              href="/dashboard/settings#connected-accounts"
              className="foldera-button-secondary"
              data-testid="dashboard-panel-secondary-signals"
            >
              Open connected accounts
            </Link>
          </div>
        </>
      ) : null}

      {activePanel === 'integrations' ? (
        <>
          <div>
            <p
              className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted"
              data-testid="dashboard-active-panel-label"
            >
              Integrations
            </p>
            <h2 className="mt-3 text-[clamp(1.8rem,3.5vw,2.2rem)] font-semibold leading-[1.12] tracking-[-0.04em] text-text-primary">
              Connected account health
            </h2>
            <p className="mt-3 max-w-[64ch] text-[15px] leading-7 text-text-secondary">
              Snapshot of Google and Microsoft connection status with direct access to account management.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { key: 'google', data: googleIntegration },
              { key: 'azure_ad', data: microsoftIntegration },
            ].map(({ key, data }) => (
              <article key={key} className="rounded-[14px] border border-border bg-panel-raised p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
                  {providerDisplayName(key)}
                </p>
                <p className={`mt-2 text-base font-semibold ${getIntegrationStateClass(data)}`}>
                  {getIntegrationStateLabel(data)}
                </p>
                <p className="mt-2 min-h-[38px] break-all text-sm text-text-secondary">
                  {getIntegrationMetaLine(data)}
                </p>
              </article>
            ))}
          </div>

          <div className="mt-auto flex flex-wrap gap-3">
            <Link
              href="/dashboard/integrations"
              className="foldera-button-primary"
              data-testid="dashboard-panel-open-integrations"
            >
              Open full integrations
            </Link>
            <Link
              href="/dashboard/settings#connected-accounts"
              className="foldera-button-secondary"
              data-testid="dashboard-panel-secondary-integrations"
            >
              Manage connected accounts
            </Link>
          </div>
        </>
      ) : null}

      {activePanel === 'settings' ? (
        <>
          <div>
            <p
              className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted"
              data-testid="dashboard-active-panel-label"
            >
              Settings
            </p>
            <h2 className="mt-3 text-[clamp(1.8rem,3.5vw,2.2rem)] font-semibold leading-[1.12] tracking-[-0.04em] text-text-primary">
              Account and control summary
            </h2>
            <p className="mt-3 max-w-[64ch] text-[15px] leading-7 text-text-secondary">
              Quick account context in-shell, with full controls still available on the settings route.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <article className="rounded-[14px] border border-border bg-panel-raised p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">Account</p>
              <p className="mt-2 text-base font-semibold text-text-primary">{sessionName}</p>
              <p className="mt-2 break-all text-sm text-text-secondary">
                {asTrimmedString(session?.user?.email) ?? 'Signed-in session'}
              </p>
            </article>
            <article className="rounded-[14px] border border-border bg-panel-raised p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">Connected accounts</p>
              <p className="mt-2 text-[30px] font-semibold leading-none text-text-primary">{connectedSourceCount}</p>
              <p className="mt-2 text-sm text-text-secondary">{latestSignalLabel}</p>
            </article>
          </div>

          <div className="mt-auto flex flex-wrap gap-3">
            <Link
              href="/dashboard/settings"
              className="foldera-button-primary"
              data-testid="dashboard-panel-open-settings"
            >
              Open full settings
            </Link>
            <Link
              href="/dashboard/settings#connected-accounts"
              className="foldera-button-secondary"
              data-testid="dashboard-panel-secondary-settings"
            >
              Open connected accounts
            </Link>
          </div>
        </>
      ) : null}

      {activePanel === 'audit-log' ? (
        <>
          <div>
            <p
              className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted"
              data-testid="dashboard-active-panel-label"
            >
              Audit Log
            </p>
            <h2 className="mt-3 text-[clamp(1.8rem,3.5vw,2.2rem)] font-semibold leading-[1.12] tracking-[-0.04em] text-text-primary">
              Recent directives history
            </h2>
            <p className="mt-3 max-w-[64ch] text-[15px] leading-7 text-text-secondary">
              Compact summary of recent directives from briefings history.
            </p>
          </div>

          <article className="rounded-[14px] border border-border bg-panel-raised p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
              Recent directives
            </p>
            {!historyLoaded ? (
              <p className="mt-3 text-sm text-text-secondary">Loading recent directives...</p>
            ) : recentHistory.length === 0 ? (
              <p className="mt-3 text-sm text-text-secondary" data-testid="dashboard-audit-empty-state">
                No recent directives yet. Open the full audit log for the complete timeline.
              </p>
            ) : (
              <ul className="mt-3 space-y-3" data-testid="dashboard-audit-history-list">
                {recentHistory.map((item) => (
                  <li key={item.id} className="rounded-[12px] border border-border-subtle bg-panel px-3 py-2">
                    <p className="text-xs uppercase tracking-[0.1em] text-text-muted">
                      {asPanelLabel(item.status, 'status unknown')} · {asPanelLabel(item.action_type, 'action')}
                    </p>
                    <p className="mt-1 text-sm text-text-primary">
                      {asTrimmedString(item.directive_preview) ?? 'No directive preview available.'}
                    </p>
                    {asTrimmedString(item.artifact_preview) ? (
                      <p className="mt-1 text-xs text-text-secondary">{item.artifact_preview}</p>
                    ) : null}
                    {asTrimmedString(item.generated_at) ? (
                      <p className="mt-1 text-xs text-text-muted">
                        {new Date(item.generated_at as string).toLocaleString(undefined, {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </article>

          <div className="mt-auto flex flex-wrap gap-3">
            <Link
              href="/dashboard/audit-log"
              className="foldera-button-primary"
              data-testid="dashboard-panel-open-audit-log"
            >
              Open full audit log
            </Link>
          </div>
        </>
      ) : null}

      {activePanel === 'playbooks' ? (
        <>
          <div>
            <p
              className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted"
              data-testid="dashboard-active-panel-label"
            >
              Playbooks
            </p>
            <h2 className="mt-3 text-[clamp(1.8rem,3.5vw,2.2rem)] font-semibold leading-[1.12] tracking-[-0.04em] text-text-primary">
              Playbook library in progress
            </h2>
            <p className="mt-3 max-w-[64ch] text-[15px] leading-7 text-text-secondary">
              Reusable execution playbooks are still being folded into this shell.
            </p>
          </div>

          <article className="rounded-[14px] border border-border bg-panel-raised p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">Current state</p>
            <p className="mt-2 text-sm text-text-secondary">
              Use the full playbooks route for updates while this in-shell card stays compact.
            </p>
          </article>

          <div className="mt-auto flex flex-wrap gap-3">
            <Link
              href="/dashboard/playbooks"
              className="foldera-button-primary"
              data-testid="dashboard-panel-open-playbooks"
            >
              Open full playbooks
            </Link>
          </div>
        </>
      ) : null}
    </section>
  ) : null;

  const briefingCardNode = action ? (
    <div data-testid="dashboard-panel-briefing" className="h-full w-full">
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
    </div>
  ) : loadingLatest ? (
    loadingCard
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
            userName={firstName}
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
            {getGreetingLabel()},{' '}
            <strong className="font-semibold text-text-primary">{firstName}.</strong>
          </h1>

          {hasStats ? (
            <div
              className="absolute flex items-center justify-between text-[28px] text-text-secondary"
              data-testid="dashboard-truth-stats"
              style={{ left: 400, top: 176, width: 900, height: 44 }}
            >
              {dashboardStats.map(({ icon: Icon, value, label, valueClassName }) => (
                <div key={label} className="flex items-center gap-3">
                  <Icon className="h-5 w-5 text-text-muted" aria-hidden />
                  <span className={`text-[36px] font-semibold tracking-[-0.045em] ${valueClassName}`}>
                    {value}
                  </span>
                  <span className="text-[32px] font-normal">{label}</span>
                </div>
              ))}
            </div>
          ) : null}

          <div className="absolute" style={{ left: 344, top: 238, width: 1072, height: 850 }}>
            {cardNode}
          </div>

          {isBriefingPanel ? (
            <aside
              className="absolute hidden w-[348px] text-text-secondary min-[1440px]:block"
              data-testid="dashboard-brief-work-panel"
              style={{ left: 1460, top: 326 }}
            >
              <h2 className="text-[16px] font-semibold uppercase tracking-[0.14em] text-text-muted">
                How this brief works
              </h2>
              <div className="mt-5 divide-y divide-white/8 border-t border-white/8">
                {briefWorkRows.map(({ icon: Icon, label, description }) => (
                  <div key={label} className="grid grid-cols-[34px_92px_minmax(0,1fr)] gap-5 py-8">
                    <Icon className="mt-1 h-6 w-6 text-text-muted" strokeWidth={1.8} aria-hidden />
                    <p className="text-[16px] font-semibold text-text-secondary">{label}</p>
                    <p className="text-[15px] leading-6 text-text-muted">{description}</p>
                  </div>
                ))}
              </div>
            </aside>
          ) : null}

          {statusNoticeNode ? (
            <div className="absolute" style={{ left: 344, top: 1094, width: 1072 }}>
              {statusNoticeNode}
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
            userName={firstName}
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
                {getGreetingLabel()},{' '}
                <strong className="font-semibold text-text-primary">{firstName}.</strong>
              </h1>
              {hasStats ? (
                <div
                  className="mt-6 flex flex-wrap gap-x-10 gap-y-4 text-sm text-text-secondary"
                  data-testid="dashboard-truth-stats"
                >
                  {dashboardStats.map(({ icon: Icon, value, label, valueClassName }) => (
                    <div key={label} className="flex items-center gap-3">
                      <Icon className="h-4 w-4 text-text-muted" aria-hidden />
                      <span className={`text-[28px] font-semibold tracking-[-0.04em] sm:text-[32px] ${valueClassName}`}>
                        {value}
                      </span>
                      <span>{label}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </header>

            {statusNoticeNode ? <div className="mx-auto mb-4 w-full max-w-[860px]">{statusNoticeNode}</div> : null}

            <div className="mx-auto w-full max-w-[940px] pb-12">
              {isBriefingPanel ? (
                action ? (
                  <div data-testid="dashboard-panel-briefing">
                    <DailyBriefCard
                      className="foldera-dashboard-brief-card foldera-dashboard-money-shot foldera-dashboard-current-brief w-full"
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
                  </div>
                ) : loadingLatest ? (
                  loadingCard
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
