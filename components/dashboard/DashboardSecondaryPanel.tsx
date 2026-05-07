import Link from 'next/link';
import type { DashboardPanelKey } from '@/components/foldera/DashboardSidebar';
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

type DashboardSecondaryPanelProps = {
  activePanel: Exclude<DashboardPanelKey, 'today'>;
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
};

function HistoryRow({ item }: { item: DashboardHistoryItem }) {
  return (
    <li className="rounded-[12px] border border-border-subtle bg-panel px-3 py-3">
      <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted">
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
      {asTrimmedString(item.generated_at) ? (
        <p className="mt-2 text-xs text-text-muted">
          {new Date(item.generated_at as string).toLocaleString(undefined, {
            dateStyle: 'medium',
            timeStyle: 'short',
          })}
        </p>
      ) : null}
    </li>
  );
}

function SourcesCard({
  integration,
  label,
  hasIntegrationIssue,
}: {
  integration: IntegrationStatusItem | null;
  label: string;
  hasIntegrationIssue: boolean;
}) {
  return (
    <article className="rounded-[14px] border border-border bg-panel-raised p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
        {label}
      </p>
      <p className={`mt-2 text-base font-semibold ${hasIntegrationIssue ? 'text-text-primary' : getIntegrationStateClass(integration)}`}>
        {hasIntegrationIssue ? 'Unavailable' : getIntegrationStateLabel(integration)}
      </p>
      <p className="mt-2 min-h-[38px] break-all text-sm leading-6 text-text-secondary">
        {hasIntegrationIssue
          ? 'Source health is unavailable right now.'
          : getIntegrationMetaLine(integration)}
      </p>
    </article>
  );
}

export function DashboardSecondaryPanel({
  activePanel,
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
}: DashboardSecondaryPanelProps) {
  return (
    <section
      className="foldera-dashboard-brief-card foldera-brief-shell flex h-full w-full flex-col gap-5 p-6 sm:p-8"
      data-testid={`dashboard-panel-${activePanel}`}
    >
      {activePanel === 'history' ? (
        <>
          <div>
            <p
              className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted"
              data-testid="dashboard-active-panel-label"
            >
              History
            </p>
            <h2 className="mt-3 text-[clamp(1.8rem,3.5vw,2.2rem)] font-semibold leading-[1.12] tracking-[-0.04em] text-text-primary">
              Recent finished work
            </h2>
            <p className="mt-3 max-w-[64ch] text-[15px] leading-7 text-text-secondary">
              A compact record of recent finished, skipped, and approved work.
            </p>
          </div>

          <article className="rounded-[14px] border border-border bg-panel-raised p-4">
            {!historyLoaded ? (
              <p className="text-sm text-text-secondary">Loading recent work...</p>
            ) : hasHistoryIssue ? (
              <p className="text-sm text-text-secondary" data-testid="dashboard-history-empty-state">
                Recent work is unavailable right now. Open the full history view to retry.
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
          </article>

          <div className="mt-auto flex flex-wrap gap-3">
            <Link
              href="/dashboard/briefings"
              className="foldera-button-primary"
              data-testid="dashboard-panel-open-history"
            >
              Open full history
            </Link>
          </div>
        </>
      ) : null}

      {activePanel === 'sources' ? (
        <>
          <div>
            <p
              className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted"
              data-testid="dashboard-active-panel-label"
            >
              Sources
            </p>
            <h2 className="mt-3 text-[clamp(1.8rem,3.5vw,2.2rem)] font-semibold leading-[1.12] tracking-[-0.04em] text-text-primary">
              Connected source health
            </h2>
            <p className="mt-3 max-w-[64ch] text-[15px] leading-7 text-text-secondary">
              The accounts Foldera can read before it finishes work for you.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <article className="rounded-[14px] border border-border bg-panel-raised p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
                Active sources
              </p>
              <p className="mt-2 text-[34px] font-semibold leading-none text-text-primary" data-testid="dashboard-sources-connected-count">
                {connectedSourcesValue}
              </p>
              <p className="mt-2 text-sm leading-6 text-text-secondary">
                {hasIntegrationIssue
                  ? 'Source health is unavailable right now.'
                  : connectedSourceCount > 0
                    ? `${connectedSourceCount} source${connectedSourceCount === 1 ? '' : 's'} connected.`
                    : 'No active sources connected yet.'}
              </p>
            </article>
            <article className="rounded-[14px] border border-border bg-panel-raised p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
                Latest source activity
              </p>
              <p className="mt-2 text-base font-semibold text-text-primary" data-testid="dashboard-sources-latest-label">
                {latestSignalLabel}
              </p>
              <p className="mt-2 text-sm leading-6 text-text-secondary">
                Used only when the evidence is current enough to finish work.
              </p>
            </article>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <SourcesCard
              label={providerDisplayName('google')}
              integration={googleIntegration}
              hasIntegrationIssue={hasIntegrationIssue}
            />
            <SourcesCard
              label={providerDisplayName('azure_ad')}
              integration={microsoftIntegration}
              hasIntegrationIssue={hasIntegrationIssue}
            />
          </div>

          <article className="rounded-[14px] border border-border bg-panel-raised p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
              Source trail
            </p>
            {hasIntegrationIssue ? (
              <p className="mt-3 text-sm text-text-secondary" data-testid="dashboard-sources-source-status">
                Source status is unavailable right now. Open settings to retry.
              </p>
            ) : sourceSummaryRows.length === 0 ? (
              <p className="mt-3 text-sm text-text-secondary" data-testid="dashboard-sources-source-status">
                Connect Gmail or Microsoft to give Foldera current facts.
              </p>
            ) : (
              <ul className="mt-3 space-y-2" data-testid="dashboard-sources-source-status">
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
              href="/dashboard/settings#connected-accounts"
              className="foldera-button-primary"
              data-testid="dashboard-panel-open-sources"
            >
              Manage connected accounts
            </Link>
            <Link
              href="/dashboard/settings"
              className="foldera-button-secondary"
              data-testid="dashboard-panel-open-settings"
            >
              Open full settings
            </Link>
          </div>
        </>
      ) : null}
    </section>
  );
}
