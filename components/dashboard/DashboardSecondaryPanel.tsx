import Link from 'next/link';
import type { DashboardPanelKey } from '@/components/foldera/DashboardSidebar';
import {
  asPanelLabel,
  asTrimmedString,
  getIntegrationMetaLine,
  getIntegrationStateClass,
  getIntegrationStateLabel,
  type DashboardHistoryItem,
  type GraphStatsPayload,
  type IntegrationStatusItem,
} from '@/app/dashboard/dashboard-page-model';
import { providerDisplayName } from '@/lib/ui/provider-display';

type DashboardSecondaryPanelProps = {
  activePanel: Exclude<DashboardPanelKey, 'briefing'>;
  connectedSourcesValue: string;
  hasIntegrationIssue: boolean;
  connectedSourceCount: number;
  latestSignalLabel: string;
  hasGraphIssue: boolean;
  graphStats: GraphStatsPayload | null;
  sourceSummaryRows: IntegrationStatusItem[];
  googleIntegration: IntegrationStatusItem | null;
  microsoftIntegration: IntegrationStatusItem | null;
  sessionName: string;
  sessionEmail: string | null;
  historyLoaded: boolean;
  hasHistoryIssue: boolean;
  recentHistory: DashboardHistoryItem[];
};

export function DashboardSecondaryPanel({
  activePanel,
  connectedSourcesValue,
  hasIntegrationIssue,
  connectedSourceCount,
  latestSignalLabel,
  hasGraphIssue,
  graphStats,
  sourceSummaryRows,
  googleIntegration,
  microsoftIntegration,
  sessionName,
  sessionEmail,
  historyLoaded,
  hasHistoryIssue,
  recentHistory,
}: DashboardSecondaryPanelProps) {
  return (
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
                {connectedSourcesValue}
              </p>
              <p className="mt-2 text-sm text-text-secondary">
                {hasIntegrationIssue
                  ? 'Connected source status unavailable right now.'
                  : connectedSourceCount > 0
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
                {hasGraphIssue
                  ? 'Signal summary unavailable right now.'
                  : typeof graphStats?.signalsTotal === 'number'
                    ? `${graphStats.signalsTotal} total signals captured`
                    : 'Signal totals unavailable right now.'}
              </p>
            </article>
          </div>

          <article className="rounded-[14px] border border-border bg-panel-raised p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
              Source status
            </p>
            {hasIntegrationIssue ? (
              <p className="mt-3 text-sm text-text-secondary" data-testid="dashboard-signals-source-status">
                Connected source status is unavailable right now. Open settings to retry.
              </p>
            ) : sourceSummaryRows.length === 0 ? (
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
              href="/dashboard/settings#connected-accounts"
              className="foldera-button-primary"
              data-testid="dashboard-panel-open-signals"
            >
              Open connected accounts
            </Link>
            <Link
              href="/dashboard/settings"
              className="foldera-button-secondary"
              data-testid="dashboard-panel-secondary-signals"
            >
              Open full settings
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
                <p className={`mt-2 text-base font-semibold ${hasIntegrationIssue ? 'text-text-primary' : getIntegrationStateClass(data)}`}>
                  {hasIntegrationIssue ? 'Unavailable' : getIntegrationStateLabel(data)}
                </p>
                <p className="mt-2 min-h-[38px] break-all text-sm text-text-secondary">
                  {hasIntegrationIssue
                    ? 'Connected source status unavailable right now.'
                    : getIntegrationMetaLine(data)}
                </p>
              </article>
            ))}
          </div>

          <div className="mt-auto flex flex-wrap gap-3">
            <Link
              href="/dashboard/settings#connected-accounts"
              className="foldera-button-primary"
              data-testid="dashboard-panel-open-integrations"
            >
              Manage connected accounts
            </Link>
            <Link
              href="/dashboard/settings"
              className="foldera-button-secondary"
              data-testid="dashboard-panel-secondary-integrations"
            >
              Open full settings
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
                {sessionEmail ?? 'Signed-in session'}
              </p>
            </article>
            <article className="rounded-[14px] border border-border bg-panel-raised p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">Connected accounts</p>
              <p className="mt-2 text-[30px] font-semibold leading-none text-text-primary">{connectedSourcesValue}</p>
              <p className="mt-2 text-sm text-text-secondary">
                {hasIntegrationIssue ? 'Connected source status unavailable right now.' : latestSignalLabel}
              </p>
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
            ) : hasHistoryIssue ? (
              <p className="mt-3 text-sm text-text-secondary" data-testid="dashboard-audit-empty-state">
                Recent history is unavailable right now. Open briefings history to retry.
              </p>
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
              href="/dashboard/briefings"
              className="foldera-button-primary"
              data-testid="dashboard-panel-open-audit-log"
            >
              Open briefings history
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
              Use briefings history while reusable playbooks are still being folded into the shell.
            </p>
          </article>

          <div className="mt-auto flex flex-wrap gap-3">
            <Link
              href="/dashboard/briefings"
              className="foldera-button-primary"
              data-testid="dashboard-panel-open-playbooks"
            >
              Open briefings history
            </Link>
          </div>
        </>
      ) : null}
    </section>
  );
}
