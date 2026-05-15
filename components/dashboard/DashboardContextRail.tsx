'use client';

import { type DashboardPanelKey } from '@/components/foldera/DashboardSidebar';

type DashboardContextRailProps = {
  activePanel: DashboardPanelKey;
  historyLoaded: boolean;
  recentHistoryCount: number;
  hasIntegrationIssue: boolean;
  connectedSourceCount: number;
  latestSignalLabel: string;
  sidebarUserName: string;
};

export function DashboardContextRail({
  activePanel,
  historyLoaded,
  recentHistoryCount,
  hasIntegrationIssue,
  connectedSourceCount,
  latestSignalLabel,
  sidebarUserName,
}: DashboardContextRailProps) {
  if (activePanel === 'history') {
    return (
      <div className="space-y-3" data-testid="dashboard-context-rail">
        <div className="rounded-[16px] border border-white/[0.07] bg-white/[0.03] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
            Receipt trail
          </p>
          <p className="mt-2 text-sm font-semibold text-text-primary">
            {historyLoaded
              ? `${recentHistoryCount} recent item${recentHistoryCount === 1 ? '' : 's'}`
              : 'Loading recent work'}
          </p>
          <p className="mt-2 text-xs leading-5 text-text-secondary">
            Recent Work shows clean status, date, type, and safe outcome only.
          </p>
        </div>
        <div className="rounded-[16px] border border-emerald-300/20 bg-emerald-300/[0.045] p-4">
          <p className="text-sm font-semibold text-text-primary">No raw artifact bodies</p>
          <p className="mt-2 text-xs leading-5 text-text-secondary">
            Generated packet text stays out of this receipt list.
          </p>
        </div>
      </div>
    );
  }

  if (activePanel === 'sources') {
    return (
      <div className="space-y-3" data-testid="dashboard-context-rail">
        <div className="rounded-[16px] border border-white/[0.07] bg-white/[0.03] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
            Connected sources
          </p>
          <p className="mt-2 text-sm font-semibold text-text-primary">
            {hasIntegrationIssue ? 'Source state unavailable' : `${connectedSourceCount} connected`}
          </p>
          <p className="mt-2 text-xs leading-5 text-text-secondary">
            Last checked: {latestSignalLabel}.
          </p>
        </div>
        <div className="rounded-[16px] border border-emerald-300/20 bg-emerald-300/[0.045] p-4">
          <p className="text-sm font-semibold text-text-primary">Evidence readiness</p>
          <p className="mt-2 text-xs leading-5 text-text-secondary">
            {connectedSourceCount > 0
              ? 'Foldera has connected evidence for the next safe current move.'
              : 'Foldera is waiting for Google or Microsoft source access.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="dashboard-context-rail">
      <div className="rounded-[16px] border border-white/[0.07] bg-white/[0.03] p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
          Signed in
        </p>
        <p className="mt-2 truncate text-sm font-semibold text-text-primary">
          {sidebarUserName}
        </p>
        <p className="mt-2 text-xs leading-5 text-text-secondary">
          Connected sources: {hasIntegrationIssue ? 'unavailable' : connectedSourceCount}.
        </p>
      </div>
      <div className="rounded-[16px] border border-emerald-300/20 bg-emerald-300/[0.045] p-4">
        <p className="text-sm font-semibold text-text-primary">No outbound by default</p>
        <p className="mt-2 text-xs leading-5 text-text-secondary">
          Foldera records approval intent unless a live send path is explicitly enabled.
        </p>
      </div>
    </div>
  );
}
