'use client';

import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { signOut } from 'next-auth/react';
import {
  Activity,
  CheckCircle2,
  History,
  Link2,
  LogOut,
  RefreshCw,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { SIGN_OUT_CALLBACK_URL } from '@/lib/auth/constants';
import {
  asPanelLabel,
  asTrimmedString,
  getIntegrationMetaLine,
  getIntegrationStateClass,
  getIntegrationStateLabel,
  normalizeIntegrationProvider,
  type DashboardHistoryItem,
  type IntegrationStatusItem,
} from '@/app/dashboard/dashboard-page-model';
import { providerDisplayName } from '@/lib/ui/provider-display';

type SourceActionState = 'idle' | 'syncing' | 'complete' | 'failed';

type DashboardWorkspacePanelsProps = {
  connectedSourcesValue: string;
  hasIntegrationIssue: boolean;
  connectedSourceCount: number;
  latestSignalLabel: string;
  sourceSummaryRows: IntegrationStatusItem[];
  googleIntegration: IntegrationStatusItem | null;
  microsoftIntegration: IntegrationStatusItem | null;
  historyLoaded: boolean;
  hasHistoryIssue: boolean;
  recentHistory: DashboardHistoryItem[];
  userName: string;
  onSourceSynced?: () => void;
  focusPanel?: 'all' | 'history' | 'sources' | 'account';
};

function PanelShell({
  testId,
  label,
  title,
  description,
  children,
}: {
  testId: string;
  label: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section
      className="overflow-hidden rounded-[18px] border border-white/[0.075] bg-[#07111c]/82 shadow-[0_20px_60px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.045)]"
      data-testid={testId}
    >
      <div className="border-b border-white/[0.06] px-4 py-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
          {label}
        </p>
        <h2 className="mt-2 text-[19px] font-semibold leading-6 text-text-primary">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-text-secondary">{description}</p>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

const RAW_HISTORY_COPY_PATTERNS = [
  /requirements-needed packet/i,
  /final recommendation/i,
  /submit nothing/i,
  /submit high-quality \.docx/i,
  new RegExp('no-safe\\s+art' + 'ifact', 'i'),
  new RegExp('selected\\s+mo' + 've', 'i'),
  /stored winner/i,
];

function includesRawHistoryCopy(value: string | null | undefined): boolean {
  const text = asTrimmedString(value);
  return Boolean(text && RAW_HISTORY_COPY_PATTERNS.some((pattern) => pattern.test(text)));
}

function getHistoryStatusLabel(statusValue: string | null | undefined): string {
  const normalized = asTrimmedString(statusValue)?.toLowerCase() ?? '';
  if (normalized.includes('executed') || normalized.includes('approved') || normalized.includes('saved')) {
    return 'Saved';
  }
  if (normalized.includes('skip')) return 'Skipped';
  if (normalized.includes('pending')) return 'Needs review';
  if (normalized.includes('no_send') || normalized.includes('held')) return 'Held back';
  return asPanelLabel(statusValue, 'Status unknown');
}

function getHistoryTypeLabel(actionTypeValue: string | null | undefined): string {
  const normalized = asTrimmedString(actionTypeValue)?.toLowerCase() ?? '';
  if (normalized.includes('write')) return 'Document';
  if (normalized.includes('send') || normalized.includes('message')) return 'Message';
  if (normalized.includes('no_send') || normalized.includes('do_nothing')) return 'Held-back read';
  return asPanelLabel(actionTypeValue, 'Work');
}

function getHistoryTitle(item: DashboardHistoryItem): string {
  const directive = asTrimmedString(item.directive_preview);
  const artifactPreview = asTrimmedString(item.artifact_preview);
  const combined = `${directive ?? ''} ${artifactPreview ?? ''}`;
  if (/document collection|\.docx/i.test(combined)) {
    return 'Document collection inputs needed';
  }
  if (includesRawHistoryCopy(directive) || !directive) {
    const type = getHistoryTypeLabel(item.action_type);
    return type === 'Work' ? 'Recent work receipt' : `${type} receipt`;
  }
  return directive.replace(/^requirements needed:\s*/i, 'Inputs needed: ');
}

function getHistoryOutcome(item: DashboardHistoryItem): string {
  const status = getHistoryStatusLabel(item.status);
  const type = getHistoryTypeLabel(item.action_type).toLowerCase();
  const preview = asTrimmedString(item.artifact_preview);
  if (includesRawHistoryCopy(preview) || /document collection|\.docx/i.test(preview ?? '')) {
    return 'Safe outcome: Foldera held back until you provide owned documents and a submission link.';
  }
  if (status === 'Saved') return `Safe outcome: ${type} saved with its source trail.`;
  if (status === 'Skipped') return 'Safe outcome: skipped without sending or saving finished work.';
  if (status === 'Needs review') return 'Safe outcome: waiting for Brandon review before action.';
  if (preview) return `Safe outcome: ${preview}`;
  return 'Safe outcome: no outbound action happened without approval.';
}

function HistoryRow({ item }: { item: DashboardHistoryItem }) {
  const status = getHistoryStatusLabel(item.status);
  const actionType = getHistoryTypeLabel(item.action_type);
  const title = getHistoryTitle(item);
  const outcome = getHistoryOutcome(item);
  const generatedAtValue = asTrimmedString(item.generated_at);
  const generatedAt = generatedAtValue
    ? new Date(generatedAtValue).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      })
    : null;

  return (
    <li className="group rounded-[14px] border border-white/[0.07] bg-white/[0.026] px-3.5 py-3.5 transition duration-200 hover:border-cyan-200/20 hover:bg-white/[0.04]">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] border border-cyan-300/20 bg-cyan-300/[0.07] text-accent">
          <History className="h-4 w-4" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
            <span className="rounded-full border border-emerald-300/20 bg-emerald-300/[0.07] px-2 py-1 text-emerald-200">
              {status}
            </span>
            <span>{actionType}</span>
            {generatedAt ? (
              <>
                <span aria-hidden>·</span>
                <span>{generatedAt}</span>
              </>
            ) : null}
          </div>
          <p className="mt-2 text-sm font-medium leading-6 text-text-primary">
            {title}
          </p>
          <p className="mt-1 text-sm leading-6 text-text-secondary">{outcome}</p>
        </div>
      </div>
    </li>
  );
}

function SourceRow({
  integration,
  fallbackProvider,
  actionState,
  onSync,
}: {
  integration: IntegrationStatusItem | null;
  fallbackProvider: 'google' | 'azure_ad';
  actionState?: SourceActionState;
  onSync: (provider: 'google' | 'azure_ad') => void;
}) {
  const provider = normalizeIntegrationProvider(integration?.provider ?? fallbackProvider) as
    | 'google'
    | 'azure_ad';
  const label = providerDisplayName(provider);
  const meta = getIntegrationMetaLine(integration);
  const connectHref = provider === 'azure_ad' ? '/api/microsoft/connect' : '/api/google/connect';
  const shouldReconnect = integration?.needs_reauth === true || integration?.needs_reconnect === true;
  const canSync =
    integration?.is_active === true &&
    (integration.needs_sync === true || integration.sync_stale === true) &&
    !shouldReconnect;
  const syncState = actionState ?? 'idle';
  const actionMessage =
    syncState === 'syncing'
      ? `Foldera is refreshing ${label}...`
      : syncState === 'complete'
        ? `${label} sync complete`
        : syncState === 'failed'
          ? `${label} sync could not finish`
          : null;
  return (
    <div className="rounded-[14px] border border-white/[0.07] bg-white/[0.026] p-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={`h-2.5 w-2.5 shrink-0 rounded-full ${
              integration?.is_active ? 'bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,0.45)]' : 'bg-white/[0.18]'
            }`}
            aria-hidden
          />
          <p className="truncate text-sm font-semibold text-text-primary">{label}</p>
        </div>
        <p className={`shrink-0 text-xs font-semibold ${getIntegrationStateClass(integration)}`}>
          {getIntegrationStateLabel(integration)}
        </p>
      </div>
      <p className="mt-2 break-all text-xs leading-5 text-text-secondary">
        {meta}
      </p>
      {shouldReconnect || !integration?.is_active ? (
        <a href={connectHref} className="foldera-button-secondary mt-3 w-full justify-center">
          <RefreshCw className="h-4 w-4" aria-hidden />
          {shouldReconnect ? `Reconnect ${label}` : `Connect ${label}`}
        </a>
      ) : canSync ? (
        <button
          type="button"
          className="foldera-button-secondary mt-3 w-full justify-center"
          onClick={() => onSync(provider)}
          disabled={syncState === 'syncing'}
        >
          <RefreshCw
            className={`h-4 w-4 ${syncState === 'syncing' ? 'animate-spin' : ''}`}
            aria-hidden
          />
          {syncState === 'syncing' ? `Refreshing ${label}` : `Sync ${label}`}
        </button>
      ) : null}
      {actionMessage ? (
        <p
          className={`mt-2 text-xs font-medium ${
            syncState === 'failed' ? 'text-amber-300' : 'text-emerald-300'
          }`}
          aria-live="polite"
        >
          {actionMessage}
        </p>
      ) : null}
    </div>
  );
}

export function DashboardWorkspacePanels({
  connectedSourcesValue,
  hasIntegrationIssue,
  connectedSourceCount,
  latestSignalLabel,
  sourceSummaryRows,
  googleIntegration,
  microsoftIntegration,
  historyLoaded,
  hasHistoryIssue,
  recentHistory,
  userName,
  onSourceSynced,
  focusPanel = 'all',
}: DashboardWorkspacePanelsProps) {
  const [sourceActionState, setSourceActionState] = useState<
    Partial<Record<'google' | 'azure_ad', SourceActionState>>
  >({});
  const autoRecoveryAttemptedRef = useRef<Set<'google' | 'azure_ad'>>(new Set());
  const initial = userName.trim().charAt(0).toUpperCase() || 'F';
  const connectedSourceLabel = hasIntegrationIssue
    ? 'Unavailable'
    : `${connectedSourceCount} connected`;
  const readySources = sourceSummaryRows.length;
  const evidenceReadinessLabel = hasIntegrationIssue
    ? 'Evidence status unavailable'
    : connectedSourceCount > 0
      ? 'Evidence ready'
      : 'Waiting for a connected source';
  const waitingForLabel = hasIntegrationIssue
    ? 'Source health to recover'
    : connectedSourceCount > 0
      ? 'A source-backed current move'
      : 'Google or Microsoft source access';

  const syncSource = useCallback(async (provider: 'google' | 'azure_ad') => {
    const endpoint = provider === 'azure_ad' ? '/api/microsoft/sync-now' : '/api/google/sync-now';
    setSourceActionState((current) => ({ ...current, [provider]: 'syncing' }));
    try {
      const response = await fetch(endpoint, { method: 'POST' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Sync failed');
      }
      setSourceActionState((current) => ({ ...current, [provider]: 'complete' }));
      onSourceSynced?.();
    } catch {
      setSourceActionState((current) => ({ ...current, [provider]: 'failed' }));
    }
  }, [onSourceSynced]);

  useEffect(() => {
    const integrations = [googleIntegration, microsoftIntegration];
    for (const integration of integrations) {
      const provider = normalizeIntegrationProvider(integration?.provider) as 'google' | 'azure_ad';
      const canAutoRecover =
        (provider === 'google' || provider === 'azure_ad') &&
        integration?.is_active === true &&
        (integration.needs_sync === true || integration.sync_stale === true) &&
        integration.needs_reauth !== true &&
        integration.needs_reconnect !== true &&
        !autoRecoveryAttemptedRef.current.has(provider);

      if (canAutoRecover) {
        autoRecoveryAttemptedRef.current.add(provider);
        void syncSource(provider);
      }
    }
  }, [googleIntegration, microsoftIntegration, syncSource]);

  return (
    <div className="grid gap-4" data-testid="dashboard-workspace-support">
      {focusPanel === 'all' || focusPanel === 'history' ? (
        <PanelShell
          testId="dashboard-panel-history"
          label="Recent Work"
          title="Recent finished work"
          description="A receipt trail of what was approved, skipped, or saved so Today never feels like a black box."
        >
          {!historyLoaded ? (
            <p className="text-sm text-text-secondary">Loading recent work...</p>
          ) : hasHistoryIssue ? (
            <p className="text-sm text-text-secondary" data-testid="dashboard-history-empty-state">
              Recent work is unavailable right now.
            </p>
          ) : recentHistory.length === 0 ? (
            <div
              className="rounded-[14px] border border-white/[0.07] bg-white/[0.026] p-4"
              data-testid="dashboard-history-empty-state"
            >
              <p className="text-sm font-medium text-text-primary">No saved work in this window yet.</p>
              <p className="mt-2 text-sm leading-6 text-text-secondary">
                Foldera still checked today&apos;s sources and will keep the next finished artifact here.
              </p>
            </div>
          ) : (
            <ul className="space-y-3" data-testid="dashboard-history-list">
              {recentHistory.map((item) => (
                <HistoryRow key={item.id} item={item} />
              ))}
            </ul>
          )}
        </PanelShell>
      ) : null}

      {focusPanel === 'all' || focusPanel === 'sources' ? (
        <PanelShell
          testId="dashboard-panel-sources"
          label="Sources"
          title="Source readiness"
          description="Foldera only turns current connected evidence into finished work."
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <div className="rounded-[14px] border border-white/[0.07] bg-white/[0.026] p-3.5">
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
                <Link2 className="h-3.5 w-3.5 text-accent" aria-hidden />
                Active sources
              </div>
              <div className="mt-2 flex items-end justify-between gap-3">
                <p className="text-[30px] font-semibold leading-none text-text-primary" data-testid="dashboard-sources-connected-count">
                  {connectedSourcesValue}
                </p>
                <p className="pb-1 text-xs font-semibold text-text-muted">{connectedSourceLabel}</p>
              </div>
              <p className="mt-2 text-xs leading-5 text-text-secondary">
                {hasIntegrationIssue
                  ? 'Source health is unavailable right now.'
                  : connectedSourceCount > 0
                    ? 'Connected evidence is available for the next finished artifact.'
                    : 'Connect a source to give Foldera current facts.'}
              </p>
            </div>
            <div className="rounded-[14px] border border-white/[0.07] bg-white/[0.026] p-3.5">
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
                <Activity className="h-3.5 w-3.5 text-accent" aria-hidden />
                Last checked
              </div>
              <p className="mt-2 text-sm font-semibold text-text-primary" data-testid="dashboard-sources-latest-label">
                {latestSignalLabel}
              </p>
              <p className="mt-2 text-xs leading-5 text-text-secondary">
                {readySources > 0
                  ? `${readySources} source${readySources === 1 ? '' : 's'} ready for review.`
                  : 'Foldera is waiting on a live source signal.'}
              </p>
            </div>
            <div className="rounded-[14px] border border-emerald-300/20 bg-emerald-300/[0.045] p-3.5">
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" aria-hidden />
                Evidence readiness
              </div>
              <p className="mt-2 text-sm font-semibold text-text-primary">
                {evidenceReadinessLabel}
              </p>
              <p className="mt-2 text-xs leading-5 text-text-secondary">
                What Foldera is waiting for: {waitingForLabel}.
              </p>
            </div>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-1" data-testid="dashboard-sources-source-status">
            {hasIntegrationIssue ? (
              <p className="rounded-[14px] border border-white/[0.07] bg-white/[0.026] p-3.5 text-sm text-text-secondary">
                Source status is unavailable right now.
              </p>
            ) : (
              <>
                <SourceRow
                  integration={googleIntegration}
                  fallbackProvider="google"
                  actionState={sourceActionState.google}
                  onSync={(provider) => void syncSource(provider)}
                />
                <SourceRow
                  integration={microsoftIntegration}
                  fallbackProvider="azure_ad"
                  actionState={sourceActionState.azure_ad}
                  onSync={(provider) => void syncSource(provider)}
                />
              </>
            )}
          </div>
        </PanelShell>
      ) : null}

      {focusPanel === 'all' || focusPanel === 'account' ? (
        <PanelShell
          testId="dashboard-panel-account"
          label="Account"
          title="Trust controls"
          description="Keep identity, source access, and outbound behavior visible in the same dashboard."
        >
          <div className="flex items-center gap-3 rounded-[14px] border border-white/[0.07] bg-white/[0.026] p-3.5">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-600 to-slate-950 text-sm font-semibold text-white"
              aria-hidden
            >
              {initial}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-text-primary">{userName}</p>
              <p className="mt-0.5 text-xs text-text-muted">Signed in</p>
            </div>
            <UserRound className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
            <div className="rounded-[14px] border border-emerald-300/20 bg-emerald-300/[0.045] p-3.5">
              <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                <ShieldCheck className="h-4 w-4 text-emerald-300" aria-hidden />
                No outbound by default
              </div>
              <p className="mt-2 text-xs leading-5 text-text-secondary">
                Approvals record intent unless the explicit send switch is enabled.
              </p>
            </div>
            <div className="rounded-[14px] border border-white/[0.07] bg-white/[0.026] p-3.5">
              <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                <CheckCircle2 className="h-4 w-4 text-accent" aria-hidden />
                Connected sources
              </div>
              <p className="mt-2 text-xs leading-5 text-text-secondary">
                {connectedSourceLabel}; latest check: {latestSignalLabel}.
              </p>
            </div>
            <button
              type="button"
              className="foldera-button-secondary"
              onClick={() => void signOut({ callbackUrl: SIGN_OUT_CALLBACK_URL })}
            >
              <LogOut className="h-4 w-4" aria-hidden />
              Sign out
            </button>
          </div>
        </PanelShell>
      ) : null}
    </div>
  );
}
