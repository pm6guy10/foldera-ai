'use client';

import type { ReactNode } from 'react';
import { formatRelativeTime } from '@/lib/ui/provider-display';
import { formatSourceRefLabel, formatSourceRefLabels } from '@/lib/briefing/source-ref-labels';
import {
  getDocumentCollectionIntakePrompt,
  isDocumentCollectionRequirementsRecord,
} from '@/lib/conviction/document-collection-intake';
import type { DashboardPanelKey } from '@/components/foldera/DashboardSidebar';
import {
  buildDiscrepancyFrameFromActionPayload,
  evaluateDiscrepancyCardFrame,
  type DiscrepancyCardFrame,
  type DiscrepancyCardQualityResult,
} from '@/lib/briefing/discrepancy-card-frame';

export type DashboardArtifact = {
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

export type DashboardAction = {
  id: string;
  directive?: string;
  action_type?: string;
  artifact_readiness_state?: 'FINISHED_ARTIFACT_READY' | 'REQUIREMENTS_NEEDED' | 'NO_SAFE_ARTIFACT';
  reason?: string;
  evidence?: unknown[];
  artifact?: DashboardArtifact | null;
  discrepancy_card?: DiscrepancyCardFrame | null;
  discrepancy_quality?: DiscrepancyCardQualityResult | null;
  executionResult?: Record<string, unknown>;
  detail_required?: boolean;
  detail_url?: string;
};

export type DailyUtilitySlateItem = {
  title: string;
  status: 'primary_move' | 'open_loop' | 'changed_since_yesterday' | 'blocked_but_real' | 'watch_item';
  evidence: string[];
  why_it_matters: string;
  next_action?: string;
  no_action_reason?: string;
  source_refs: string[];
};

export type DailyUtilitySlate = {
  generated_at?: string;
  finished_artifact_verdict?: 'strict_artifact_selected' | 'no_finished_artifact';
  primary_move?: DailyUtilitySlateItem | null;
  open_loops?: DailyUtilitySlateItem[];
  changed_since_yesterday?: DailyUtilitySlateItem[];
  blocked_but_real?: DailyUtilitySlateItem | null;
  watch_item?: DailyUtilitySlateItem | null;
};

export type DashboardStatusNotice = {
  id: string;
  message: string;
};

export type IntegrationStatusPayload = {
  integrations?: IntegrationStatusItem[];
  newest_mail_signal_at?: string | null;
  mail_ingest_looks_stale?: boolean;
};

export type IntegrationStatusItem = {
  provider?: string;
  is_active?: boolean;
  sync_email?: string | null;
  last_synced_at?: string | null;
  needs_reconnect?: boolean;
  needs_reauth?: boolean;
  needs_sync?: boolean;
  sync_stale?: boolean;
};

export type GraphStatsPayload = {
  signalsTotal?: number;
  commitmentsActive?: number;
  patternsActive?: number;
  lastSignalAt?: string | null;
  lastSignalSource?: string | null;
};

export type DashboardHistoryItem = {
  id: string;
  status?: string | null;
  action_type?: string | null;
  generated_at?: string | null;
  directive_preview?: string | null;
  artifact_preview?: string | null;
};

export type DashboardHistoryPayload = {
  items?: DashboardHistoryItem[];
};

export type DashboardDailyValueBlock = {
  label: 'What changed' | 'What Foldera protected' | 'Smallest unlock';
  body: string;
};

export type DashboardDailyValueState = {
  heading: string;
  statusLabel: string;
  summary: string;
  valueBlocks: DashboardDailyValueBlock[];
  actionHref?: string;
  actionLabel?: string;
  copyText?: string;
  copyLabel?: string;
};

export type DashboardSourceTrailItem = {
  label: string;
  detail: string;
  meta?: string;
};

export type LoadLatestResult = {
  action: DashboardAction | null;
  dailyUtilitySlate: DailyUtilitySlate | null;
  loaded: boolean;
};

export type DashboardLoadIssue = 'latest' | 'integrations' | 'graph' | 'history';

export type StageMetrics = {
  isDesktop: boolean;
  scale: number;
  offsetX: number;
  offsetY: number;
};

const DESKTOP_STAGE_MIN_WIDTH = 1100;

export const DEFAULT_STAGE_METRICS: StageMetrics = {
  isDesktop: false,
  scale: 1,
  offsetX: 0,
  offsetY: 0,
};

export const DASHBOARD_PANEL_LABELS: Record<DashboardPanelKey, string> = {
  today: 'Today',
  history: 'Recent Work',
  sources: 'Sources',
  account: 'Account',
};

const INTERNAL_FAILURE_PATTERNS = [
  /\bllm_failed\b/i,
  /\bstale_date_in_directive\b/i,
  /\bINFINITE_LOOP\b/i,
  /\bAll \d+ candidates blocked\b/i,
  /\bDirective rejected by persistence validation\b/i,
  /\bOutput blocked by quality gate\b/i,
  /\bHard bottom gate blocked\b/i,
] as const;

export function normalizeDashboardPanel(value: string | null): DashboardPanelKey {
  switch (value) {
    case 'briefing':
    case 'today':
    case '':
    case null:
      return 'today';
    case 'audit-log':
    case 'playbooks':
    case 'history':
      return 'history';
    case 'signals':
    case 'integrations':
      return 'sources';
    case 'settings':
      return 'account';
    case 'sources':
      return 'sources';
    case 'account':
      return 'account';
    default:
      return 'today';
  }
}

export type DashboardMissingInputPrompt = {
  kind: 'recipient' | 'source' | 'freshness' | 'outcome';
  heading: string;
  prompt: string;
  detail: string;
  actionHref?: string;
  actionLabel?: string;
};

const INTERNAL_MISSING_INPUT_PATTERNS = [
  /\bmissing_[a-z0-9_]+\b/i,
  /\bweak_[a-z0-9_]+\b/i,
  /\bstale_[a-z0-9_]+\b/i,
  /\b[a-z]+_[a-z0-9_]+_[a-z0-9_]+\b/i,
  /\bcandidate\b/i,
  /\bgate\b/i,
  /\bblocker\b/i,
  /\bwinner\b/i,
  /\bvalidation\b/i,
  /\bpersistence\b/i,
] as const;

function collectSlateReasonText(slate: DailyUtilitySlate | null | undefined): string {
  if (!slate) return '';
  const items = [
    slate.primary_move,
    ...(slate.open_loops ?? []),
    ...(slate.changed_since_yesterday ?? []),
    slate.blocked_but_real,
    slate.watch_item,
  ].filter(Boolean) as DailyUtilitySlateItem[];
  return items
    .flatMap((item) => [
      item.title,
      item.why_it_matters,
      item.next_action ?? '',
      item.no_action_reason ?? '',
      ...(item.evidence ?? []),
      ...(item.source_refs ?? []),
    ])
    .join(' ');
}

export function buildMissingInputPrompt(
  slate: DailyUtilitySlate | null | undefined,
  options: {
    hasIntegrationIssue?: boolean;
    mailIngestLooksStale?: boolean;
  } = {},
): DashboardMissingInputPrompt | null {
  if (slate?.primary_move) return null;

  const text = collectSlateReasonText(slate);
  const normalized = text.toLowerCase();
  const matchText = normalized.replace(/[_-]+/g, ' ');
  const leaksInternalLanguage = INTERNAL_MISSING_INPUT_PATTERNS.some((pattern) => pattern.test(text));

  if (/\bgrounded recipient\b|\bno grounded recipient\b|\bwho should\b|\brecipient\b/.test(matchText)) {
    return {
      kind: 'recipient',
      heading: 'One thing Foldera needs',
      prompt: 'Who should this go to?',
      detail: 'Foldera needs a grounded recipient before it can finish a safe message.',
    };
  }

  if (options.hasIntegrationIssue || options.mailIngestLooksStale || /\bstale\b|\bfresher\b/.test(matchText)) {
    return {
      kind: 'freshness',
      heading: 'One thing Foldera needs',
      prompt: 'Can Foldera get fresher source data?',
      detail: 'The current evidence is too stale to finish safely.',
      actionHref: '/dashboard?panel=sources',
      actionLabel: 'Check sources',
    };
  }

  if (
    /\bsource artifact\b|\bcurrent artifact\b|\bsource bundle\b|\bsource trail\b|\banchor\b|\btoo thin\b/.test(
      matchText,
    )
  ) {
    return {
      kind: 'source',
      heading: 'One thing Foldera needs',
      prompt: 'Which source has the current facts?',
      detail: 'Connect or sync the source that contains the current facts before Foldera finishes this.',
      actionHref: '/dashboard?panel=sources',
      actionLabel: 'Check sources',
    };
  }

  if (/\bconsequence\b|\bdesired outcome\b|\bsafe next step\b|\bnext step\b|\bnext action\b|\brisk\b/.test(matchText)) {
    return {
      kind: 'outcome',
      heading: 'One thing Foldera needs',
      prompt: 'What outcome should this change?',
      detail: 'Foldera needs one concrete consequence or desired outcome before turning this into finished work.',
    };
  }

  if (leaksInternalLanguage) {
    return null;
  }

  return null;
}

function sanitizeDailyValueText(value: string | null | undefined, fallback: string): string {
  const trimmed = asTrimmedString(value);
  if (!trimmed) return fallback;
  if (INTERNAL_MISSING_INPUT_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return fallback;
  }
  return trimmed.replace(/\bFoldera stopped\b/gi, 'Foldera held back');
}

function getSlateItems(slate: DailyUtilitySlate | null | undefined): DailyUtilitySlateItem[] {
  if (!slate) return [];
  return [
    slate.primary_move,
    ...(slate.open_loops ?? []),
    ...(slate.changed_since_yesterday ?? []),
    slate.blocked_but_real,
    slate.watch_item,
  ].filter(Boolean) as DailyUtilitySlateItem[];
}

function dailyUtilityClipboardItemLabel(item: DailyUtilitySlateItem): string {
  switch (item.status) {
    case 'primary_move':
      return 'Current best move';
    case 'open_loop':
      return 'Open loop';
    case 'changed_since_yesterday':
      return 'What changed';
    case 'blocked_but_real':
      return 'Possible issue';
    case 'watch_item':
      return 'Watch item';
    default:
      return 'Foldera read';
  }
}

export function dailyUtilitySlateClipboardText(
  slate: DailyUtilitySlate | null | undefined,
): string {
  const item = getSlateItems(slate)[0] ?? null;
  if (!item) return '';

  const lines = [
    'Foldera',
    dailyUtilityClipboardItemLabel(item),
    '',
    sanitizeDailyValueText(item.title, 'Foldera found a current move worth preparing.'),
    '',
    'Why it matters:',
    sanitizeDailyValueText(
      item.why_it_matters,
      'This is the strongest safe read Foldera can identify from the current source trail.',
    ),
  ];

  const evidence = item.evidence
    .map((entry) => sanitizeDailyValueText(entry, 'Current source trail supports this read.'))
    .filter(Boolean)
    .slice(0, 4);
  if (evidence.length > 0) {
    lines.push('', 'Evidence:', ...evidence.map((entry) => `- ${entry}`));
  }

  const nextAction = sanitizeDailyValueText(item.next_action, '');
  const noActionReason = sanitizeDailyValueText(item.no_action_reason, '');
  if (nextAction) {
    lines.push('', 'Safe next action:', nextAction);
  } else if (noActionReason) {
    lines.push('', 'Why Foldera held back:', noActionReason);
  }

  const sourceRefs = (item.source_refs ?? [])
    .map((entry) => formatSourceRefLabel(entry))
    .map((entry) => sanitizeDailyValueText(entry, ''))
    .filter(Boolean)
    .slice(0, 4);
  if (sourceRefs.length > 0) {
    lines.push('', 'Source trail:', ...sourceRefs.map((entry) => `- ${entry}`));
  }

  return lines.join('\n');
}

function countActiveIntegrations(integrationStatus: IntegrationStatusPayload | null | undefined): number {
  return Array.isArray(integrationStatus?.integrations)
    ? integrationStatus.integrations.filter((integration) => integration?.is_active === true).length
    : 0;
}

function hasSourceFreshnessAttention(integrationStatus: IntegrationStatusPayload | null | undefined): boolean {
  return Array.isArray(integrationStatus?.integrations)
    ? integrationStatus.integrations.some(
        (integration) => integration?.needs_sync === true || integration?.sync_stale === true,
      )
    : false;
}

export function buildDailyValueState(
  slate: DailyUtilitySlate | null | undefined,
  latestIssue: DashboardLoadIssue | null,
  integrationStatus: IntegrationStatusPayload | null | undefined,
  historyItems: DashboardHistoryItem[] = [],
): DashboardDailyValueState {
  const missingInputPrompt = buildMissingInputPrompt(slate, {
    hasIntegrationIssue: latestIssue === 'integrations',
    mailIngestLooksStale:
      integrationStatus?.mail_ingest_looks_stale === true ||
      hasSourceFreshnessAttention(integrationStatus),
  });
  const slateItems = getSlateItems(slate);
  const firstItem = slateItems[0] ?? null;
  const hasPrimaryMove = Boolean(slate?.primary_move);
  const changedItem =
    slate?.changed_since_yesterday?.find((item) => asTrimmedString(item.why_it_matters)) ??
    firstItem;
  const protectedItem = slate?.blocked_but_real ?? slate?.watch_item ?? firstItem;
  const activeSources = countActiveIntegrations(integrationStatus);
  const recentWorkCount = historyItems.length;

  const statusLabel =
    hasPrimaryMove
      ? 'Current best move'
      : missingInputPrompt?.kind === 'freshness'
      ? 'Needs fresher source'
      : missingInputPrompt?.kind === 'recipient'
        ? 'Needs clearer recipient'
        : missingInputPrompt?.kind === 'source'
          ? 'Needs current facts'
          : missingInputPrompt?.kind === 'outcome'
            ? 'Needs clearer outcome'
            : activeSources > 0
              ? 'Sources checked'
              : 'Connect a source';

  const whatChanged = sanitizeDailyValueText(
    changedItem?.why_it_matters ?? changedItem?.title,
    recentWorkCount > 0
      ? `Foldera reviewed today against ${recentWorkCount} recent decision${recentWorkCount === 1 ? '' : 's'}.`
      : activeSources > 0
        ? `Foldera checked ${activeSources} connected source${activeSources === 1 ? '' : 's'} for a safe finished move.`
        : 'Foldera needs a connected inbox or calendar before it can evaluate finished work.',
  );
  const protectedBody = hasPrimaryMove
    ? 'Foldera has not sent, saved, or claimed this as finished work yet; it is showing the current move it can safely see.'
    : sanitizeDailyValueText(
        protectedItem?.no_action_reason ?? protectedItem?.why_it_matters,
        'Foldera held back rather than inventing a draft from weak or stale evidence.',
      );
  const smallestUnlock =
    (hasPrimaryMove
      ? sanitizeDailyValueText(firstItem?.next_action, 'Turn this into finished work on the next safe generation run.')
      : missingInputPrompt?.detail) ??
    (activeSources > 0
      ? 'Keep sources fresh; Foldera will finish the next safe artifact when the evidence supports it.'
      : 'Connect Gmail or Microsoft so Foldera has current facts to work from.');
  const copyText = dailyUtilitySlateClipboardText(slate);

  return {
    heading: hasPrimaryMove ? 'Foldera found the next move' : 'Foldera checked today',
    statusLabel,
    summary:
      (hasPrimaryMove
        ? sanitizeDailyValueText(firstItem?.title, 'Foldera found a current move worth preparing.')
        : missingInputPrompt?.prompt) ??
      'No finished artifact cleared the safety bar, but the dashboard still shows the useful read.',
    valueBlocks: [
      { label: 'What changed', body: whatChanged },
      { label: 'What Foldera protected', body: protectedBody },
      { label: 'Smallest unlock', body: smallestUnlock },
    ],
    actionHref: missingInputPrompt?.actionHref ?? (activeSources > 0 ? undefined : '/api/google/connect'),
    actionLabel: missingInputPrompt?.actionLabel ?? (activeSources > 0 ? undefined : 'Connect Google'),
    copyText: copyText || undefined,
    copyLabel: hasPrimaryMove ? 'Copy brief' : copyText ? 'Copy read' : undefined,
  };
}

export const DOCUMENT_MARKDOWN_COMPONENTS = {
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

export function shouldReconcileExecuteFailure(res: Response | null, errorMessage: string): boolean {
  if (res && res.status === 404) return true;
  const message = errorMessage.toLowerCase();
  return message.includes('already claimed') || message.includes('not found');
}

export function asTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function artifactClipboardText(action: DashboardAction | null): string {
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

export async function writeClipboardText(text: string): Promise<boolean> {
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

export function getArtifactBody(artifact: DashboardArtifact | null | undefined): string {
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
  return INTERNAL_FAILURE_PATTERNS.some((pattern) => pattern.test(value));
}

function getDashboardActionArtifact(
  action: DashboardAction | null | undefined,
): DashboardArtifact | null {
  return action?.artifact && typeof action.artifact === 'object' ? action.artifact : null;
}

export function getDashboardDiscrepancyFrame(
  action: DashboardAction | null | undefined,
): DiscrepancyCardFrame | null {
  if (!action) return null;
  const directFrame = action.discrepancy_card ?? null;
  const frame = directFrame ?? buildDiscrepancyFrameFromActionPayload(action as Record<string, unknown>);
  if (!frame) return null;
  const quality = action.discrepancy_quality ?? evaluateDiscrepancyCardFrame(frame);
  if (!quality.passes && isDocumentCollectionRequirementsRecord(action)) return frame;
  return quality.passes ? frame : null;
}

function evidenceItemToText(value: unknown): string | null {
  const direct = asTrimmedString(value);
  if (direct) return direct;
  if (!value || typeof value !== 'object') return null;

  const record = value as Record<string, unknown>;
  return (
    asTrimmedString(record.description) ??
    asTrimmedString(record.detail) ??
    asTrimmedString(record.summary) ??
    asTrimmedString(record.title) ??
    asTrimmedString(record.subject) ??
    asTrimmedString(record.body) ??
    asTrimmedString(record.text) ??
    null
  );
}

function evidenceItemToLabel(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  return (
    formatSourceRefLabel(record.source_ref) ??
    formatSourceRefLabel(record.sourceRef) ??
    formatSourceRefLabel(record.ref) ??
    formatSourceRefLabel(record.provider) ??
    formatSourceRefLabel(record.type) ??
    null
  );
}

export function buildDashboardSourceTrail(
  action: DashboardAction | null | undefined,
): DashboardSourceTrailItem[] {
  if (!action) return [];

  const frame = getDashboardDiscrepancyFrame(action);
  const frameEvidence = frame?.evidence
    .map((entry) => asTrimmedString(entry))
    .filter((entry): entry is string => Boolean(entry)) ?? [];
  const actionEvidence = (action.evidence ?? [])
    .map((entry) => evidenceItemToText(entry))
    .filter((entry): entry is string => Boolean(entry));
  const evidence = (frameEvidence.length > 0 ? frameEvidence : actionEvidence).slice(0, 4);
  if (evidence.length === 0) return [];

  const frameLabels = frame?.source_refs
    .map((entry) => formatSourceRefLabel(entry))
    .filter((entry): entry is string => Boolean(entry)) ?? [];
  const actionLabels = (action.evidence ?? [])
    .map((entry) => evidenceItemToLabel(entry))
    .filter((entry): entry is string => Boolean(entry));
  const labels = Array.from(new Set([...frameLabels, ...actionLabels])).slice(0, 4);

  return evidence.map((detail, index) => ({
    label: labels[index] ?? labels[0] ?? 'Connected source evidence',
    detail,
    meta: index === 0 ? 'Current' : undefined,
  }));
}

export function getDashboardActionHeadline(action: DashboardAction | null | undefined): string {
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

export function isVisibleDashboardAction(value: unknown): value is DashboardAction {
  if (!value || typeof value !== 'object') return false;
  const action = value as DashboardAction;
  if (!asTrimmedString((value as Record<string, unknown>).id)) return false;
  if (!getDashboardActionArtifact(action)) return false;
  if (dashboardActionContainsInternalFailureText(action)) return false;
  if (!getDashboardDiscrepancyFrame(action)) return false;
  return (
    getDashboardActionHeadline(action).length > 0 ||
    getArtifactBody(getDashboardActionArtifact(action)).length > 0
  );
}

export function needsDashboardActionDetail(value: unknown): value is DashboardAction {
  if (!value || typeof value !== 'object') return false;
  const action = value as DashboardAction;
  return asTrimmedString(action.id) !== null && action.detail_required === true;
}

export function isDashboardActionSummary(value: unknown): value is DashboardAction {
  if (!needsDashboardActionDetail(value)) return false;
  const action = value as DashboardAction;
  if (dashboardActionContainsInternalFailureText(action)) return false;
  if (!getDashboardDiscrepancyFrame(action)) return false;
  return getDashboardActionHeadline(action).length > 0;
}

function isDailyUtilitySlateItem(value: unknown): value is DailyUtilitySlateItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as DailyUtilitySlateItem;
  return (
    asTrimmedString(item.title) !== null &&
    asTrimmedString(item.status) !== null &&
    Array.isArray(item.evidence) &&
    item.evidence.some((entry) => asTrimmedString(entry) !== null) &&
    asTrimmedString(item.why_it_matters) !== null
  );
}

export function isDailyUtilitySlate(value: unknown): value is DailyUtilitySlate {
  if (!value || typeof value !== 'object') return false;
  const slate = value as DailyUtilitySlate;
  return Boolean(
    isDailyUtilitySlateItem(slate.primary_move) ||
      (Array.isArray(slate.open_loops) && slate.open_loops.some(isDailyUtilitySlateItem)) ||
      (Array.isArray(slate.changed_since_yesterday) &&
        slate.changed_since_yesterday.some(isDailyUtilitySlateItem)) ||
      isDailyUtilitySlateItem(slate.blocked_but_real) ||
      isDailyUtilitySlateItem(slate.watch_item),
  );
}

export function isWriteDocumentAction(action: DashboardAction | null): boolean {
  return action?.action_type === 'write_document' || action?.artifact?.type === 'document';
}

export function isDocumentCollectionRequirementsAction(action: DashboardAction | null): boolean {
  return isDocumentCollectionRequirementsRecord(action);
}

export { getDocumentCollectionIntakePrompt };

export function buildDecisionSuccessNotice(
  action: DashboardAction | null,
  decision: 'approve' | 'skip',
  approvalEmailSendEnabled = false,
): DashboardStatusNotice {
  if (decision === 'skip') {
    return {
      id: 'skip_snoozed',
      message: isWriteDocumentAction(action)
        ? 'Skipped. Foldera will adjust the next document.'
        : 'Skipped. Foldera will adjust the next directive.',
    };
  }

  return isWriteDocumentAction(action)
    ? {
        id: 'approve_saved_document',
        message: 'Saved. Your document is in Foldera Signals.',
      }
    : !approvalEmailSendEnabled
      ? {
          id: 'approve_recorded',
          message: 'Approved. Outbound email is disabled.',
        }
      : {
          id: 'approve_sent',
          message: 'Sent. Check your outbox.',
        };
}

export function getDateLabel(): string {
  return new Date()
    .toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    })
    .toUpperCase();
}

export function getGreetingLabel(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function computeStageMetrics(): StageMetrics {
  if (typeof window === 'undefined') {
    return { isDesktop: false, scale: 1, offsetX: 0, offsetY: 0 };
  }

  const viewportWidth = window.innerWidth;
  if (viewportWidth < DESKTOP_STAGE_MIN_WIDTH) {
    return { isDesktop: false, scale: 1, offsetX: 0, offsetY: 0 };
  }

  return { isDesktop: true, scale: 1, offsetX: 0, offsetY: 0 };
}

export function inferSourcePills(action: DashboardAction | null): string[] {
  const frame = getDashboardDiscrepancyFrame(action);
  if (frame?.source_refs.length) {
    return formatSourceRefLabels(frame.source_refs, 'Connected source evidence').slice(0, 4);
  }

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

export function normalizeIntegrationProvider(provider: string | null | undefined): string {
  const normalized = (provider ?? '').trim().toLowerCase();
  if (normalized === 'microsoft' || normalized === 'azure-ad') return 'azure_ad';
  return normalized;
}

export function getIntegrationStateLabel(integration: IntegrationStatusItem | null | undefined): string {
  if (integration?.needs_reauth) return 'Needs re-auth';
  if (integration?.needs_reconnect) return 'Needs reconnect';
  if (!integration?.is_active) return 'Not connected';
  if (integration.needs_sync) return 'Needs sync';
  if (integration.sync_stale) return 'Sync stale';
  return 'Connected';
}

export function getIntegrationStateClass(integration: IntegrationStatusItem | null | undefined): string {
  if (
    integration?.needs_reauth ||
    integration?.needs_reconnect ||
    integration?.needs_sync ||
    integration?.sync_stale
  ) {
    return 'text-amber-300';
  }
  if (!integration?.is_active) return 'text-text-muted';
  return 'text-emerald-300';
}

export function getIntegrationMetaLine(integration: IntegrationStatusItem | null | undefined): string {
  if (integration?.needs_reauth || integration?.needs_reconnect) return 'Reconnect required';
  if (!integration?.is_active) return 'Connect from this dashboard';
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
  if (integration.needs_sync) {
    meta.push('Fresh sync needed');
  }
  return meta.join(' · ');
}

export function asPanelLabel(value: string | null | undefined, fallback: string): string {
  const trimmed = asTrimmedString(value);
  return trimmed ? trimmed.replace(/_/g, ' ') : fallback;
}
