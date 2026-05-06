'use client';

import type { ReactNode } from 'react';
import { formatRelativeTime } from '@/lib/ui/provider-display';
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
  reason?: string;
  evidence?: unknown[];
  artifact?: DashboardArtifact | null;
  discrepancy_card?: DiscrepancyCardFrame | null;
  discrepancy_quality?: DiscrepancyCardQualityResult | null;
  executionResult?: Record<string, unknown>;
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

const DESIGN_W = 2048;
const DESIGN_H = 1152;
const DESKTOP_STAGE_MIN_WIDTH = 1440;

export const DEFAULT_STAGE_METRICS: StageMetrics = {
  isDesktop: false,
  scale: 1,
  offsetX: 0,
  offsetY: 0,
};

export const DASHBOARD_PANEL_LABELS: Record<DashboardPanelKey, string> = {
  briefing: 'Executive Briefing',
  playbooks: 'Playbooks',
  signals: 'Signals',
  'audit-log': 'Audit Log',
  integrations: 'Integrations',
  settings: 'Settings',
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
  return quality.passes ? frame : null;
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
  const viewportHeight = window.innerHeight;
  if (viewportWidth < DESKTOP_STAGE_MIN_WIDTH) {
    return { isDesktop: false, scale: 1, offsetX: 0, offsetY: 0 };
  }

  const scale = Math.min(viewportWidth / DESIGN_W, viewportHeight / DESIGN_H);
  const offsetX = (viewportWidth - DESIGN_W * scale) / 2;
  const offsetY = (viewportHeight - DESIGN_H * scale) / 2;
  return { isDesktop: true, scale, offsetX, offsetY };
}

export function inferSourcePills(action: DashboardAction | null): string[] {
  const frame = getDashboardDiscrepancyFrame(action);
  if (frame?.source_refs.length) {
    return frame.source_refs.slice(0, 4);
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
  if (!integration?.is_active) return 'Not connected';
  if (integration.needs_reauth) return 'Needs re-auth';
  if (integration.needs_reconnect) return 'Needs reconnect';
  if (integration.sync_stale) return 'Sync stale';
  return 'Connected';
}

export function getIntegrationStateClass(integration: IntegrationStatusItem | null | undefined): string {
  if (!integration?.is_active) return 'text-text-muted';
  if (integration.needs_reauth || integration.needs_reconnect || integration.sync_stale) {
    return 'text-amber-300';
  }
  return 'text-emerald-300';
}

export function getIntegrationMetaLine(integration: IntegrationStatusItem | null | undefined): string {
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

export function asPanelLabel(value: string | null | undefined, fallback: string): string {
  const trimmed = asTrimmedString(value);
  return trimmed ? trimmed.replace(/_/g, ' ') : fallback;
}
