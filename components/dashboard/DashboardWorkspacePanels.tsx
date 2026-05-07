'use client';

import type { ReactNode } from 'react';
import { signOut } from 'next-auth/react';
import { LogOut, Mail, RefreshCw, ShieldCheck } from 'lucide-react';
import { SIGN_OUT_CALLBACK_URL } from '@/lib/auth/constants';
import {
  asPanelLabel,
  asTrimmedString,
  getIntegrationMetaLine,
  getIntegrationStateClass,
  getIntegrationStateLabel,
  type DashboardHistoryItem,
  type IntegrationStatusItem,
} from '@/app/dashboard/dashboard-page-model';
import { providerDisplayName } from '@/lib/ui/provider-display';

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
};

function PanelShell({
  testId,
  label,
  title,
  children,
}: {
  testId: string;
  label: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      className="rounded-[18px] border border-cyan-200/12 bg-[#07111c]/88 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]"
      data-testid={testId}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
        {label}
      </p>
      <h2 className="mt-2 text-[20px] font-semibold leading-6 text-text-primary">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function HistoryRow({ item }: { item: DashboardHistoryItem }) {
  return (
    <li className="rounded-[12px] border border-white/8 bg-white/[0.025] px-3 py-3">
      <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
        <span>{asPanelLabel(item.status, 'status unknown')}</span>
        <span aria-hidden>·</span>
        <span>{asPanelLabel(item.action_type, 'work')}</span>
      </div>
      <p className="mt-2 text-sm font-medium leading-6 text-text-primary">
        {asTrimmedString(item.directive_preview) ?? 'No preview available.'}
      </p>
      {asTrimmedString(item.artifact_preview) ? (
        <p className="mt-1 text-sm leading-6 text-text-secondary">{item.artifact_preview}</p>
      ) : null}
    </li>
  );
}

function SourceRow({
  integration,
  fallbackProvider,
}: {
  integration: IntegrationStatusItem | null;
  fallbackProvider: 'google' | 'azure_ad';
}) {
  const label = providerDisplayName(integration?.provider ?? fallbackProvider);
  const meta = integration?.is_active ? getIntegrationMetaLine(integration) : 'Connect from this dashboard when needed';
  return (
    <div className="rounded-[12px] border border-white/8 bg-white/[0.025] p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-text-primary">{label}</p>
        <p className={`text-xs font-semibold ${getIntegrationStateClass(integration)}`}>
          {getIntegrationStateLabel(integration)}
        </p>
      </div>
      <p className="mt-2 break-all text-xs leading-5 text-text-secondary">
        {meta}
      </p>
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
}: DashboardWorkspacePanelsProps) {
  const initial = userName.trim().charAt(0).toUpperCase() || 'F';

  return (
    <div className="grid gap-4" data-testid="dashboard-workspace-support">
      <PanelShell testId="dashboard-panel-history" label="Recent Work" title="What Foldera has done lately">
        {!historyLoaded ? (
          <p className="text-sm text-text-secondary">Loading recent work...</p>
        ) : hasHistoryIssue ? (
          <p className="text-sm text-text-secondary" data-testid="dashboard-history-empty-state">
            Recent work is unavailable right now.
          </p>
        ) : recentHistory.length === 0 ? (
          <p className="text-sm text-text-secondary" data-testid="dashboard-history-empty-state">
            No recent work yet.
          </p>
        ) : (
          <ul className="space-y-3" data-testid="dashboard-history-list">
            {recentHistory.map((item) => (
              <HistoryRow key={item.id} item={item} />
            ))}
          </ul>
        )}
      </PanelShell>

      <PanelShell testId="dashboard-panel-sources" label="Sources" title="Connected source health">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          <div className="rounded-[12px] border border-white/8 bg-white/[0.025] p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
              Active sources
            </p>
            <p className="mt-2 text-[30px] font-semibold leading-none text-text-primary" data-testid="dashboard-sources-connected-count">
              {connectedSourcesValue}
            </p>
            <p className="mt-2 text-xs leading-5 text-text-secondary">
              {hasIntegrationIssue
                ? 'Source health is unavailable right now.'
                : connectedSourceCount > 0
                  ? `${connectedSourceCount} source${connectedSourceCount === 1 ? '' : 's'} connected.`
                  : 'No active sources connected yet.'}
            </p>
          </div>
          <div className="rounded-[12px] border border-white/8 bg-white/[0.025] p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
              Latest activity
            </p>
            <p className="mt-2 text-sm font-semibold text-text-primary" data-testid="dashboard-sources-latest-label">
              {latestSignalLabel}
            </p>
            <p className="mt-2 text-xs leading-5 text-text-secondary">
              Used only when evidence is current enough to finish work.
            </p>
          </div>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-1" data-testid="dashboard-sources-source-status">
          {hasIntegrationIssue ? (
            <p className="rounded-[12px] border border-white/8 bg-white/[0.025] p-3 text-sm text-text-secondary">
              Source status is unavailable right now.
            </p>
          ) : sourceSummaryRows.length === 0 ? (
            <>
              <p className="rounded-[12px] border border-white/8 bg-white/[0.025] p-3 text-sm text-text-secondary">
                Connect Gmail or Microsoft to give Foldera current facts.
              </p>
              <a href="/api/google/connect" className="foldera-button-secondary">
                <Mail className="h-4 w-4" aria-hidden />
                Connect Google
              </a>
              <a href="/api/microsoft/connect" className="foldera-button-secondary">
                <RefreshCw className="h-4 w-4" aria-hidden />
                Connect Microsoft
              </a>
            </>
          ) : (
            <>
              <SourceRow integration={googleIntegration} fallbackProvider="google" />
              <SourceRow integration={microsoftIntegration} fallbackProvider="azure_ad" />
            </>
          )}
        </div>
      </PanelShell>

      <PanelShell testId="dashboard-panel-account" label="Account" title="Workspace controls">
        <div className="flex items-center gap-3 rounded-[14px] border border-white/8 bg-white/[0.025] p-3">
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
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
          <div className="rounded-[12px] border border-white/8 bg-white/[0.025] p-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
              <ShieldCheck className="h-4 w-4 text-accent" aria-hidden />
              No outbound by default
            </div>
            <p className="mt-2 text-xs leading-5 text-text-secondary">
              Approvals record intent unless the explicit send switch is enabled.
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
    </div>
  );
}
