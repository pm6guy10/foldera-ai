'use client';

import type { ReactNode } from 'react';
import { Bell } from 'lucide-react';
import { RightPanel, type SourceTrailItem } from '@/components/foldera/RightPanel';
import {
  DashboardSidebar,
  type DashboardPanelKey,
} from '@/components/foldera/DashboardSidebar';

type DashboardDesktopStageProps = {
  activePanel: DashboardPanelKey;
  activeSidebarLabel: string;
  sidebarUserName: string;
  selectPanel: (panel: DashboardPanelKey) => void;
  dateLabel: string;
  greetingLabel: string;
  firstName: string | null;
  degradedStateNode: ReactNode;
  desktopWorkspaceNode: ReactNode;
  statusNoticeNode: ReactNode;
  isTodayPanel: boolean;
  showOutcomeActions: boolean;
  outcomeSubmitting: 'worked' | 'didnt_work' | null;
  submitOutcome: (outcome: 'worked' | 'didnt_work') => void | Promise<void>;
  hiddenArtifactNode: ReactNode;
  sourceTrailItems: SourceTrailItem[];
  sidePanelNode?: ReactNode;
};

export function DashboardDesktopStage({
  activePanel,
  activeSidebarLabel,
  sidebarUserName,
  selectPanel,
  dateLabel,
  greetingLabel,
  firstName,
  degradedStateNode,
  desktopWorkspaceNode,
  statusNoticeNode,
  isTodayPanel,
  showOutcomeActions,
  outcomeSubmitting,
  submitOutcome,
  hiddenArtifactNode,
  sourceTrailItems,
  sidePanelNode,
}: DashboardDesktopStageProps) {
  const rightRailLabel = isTodayPanel ? 'Source trail' : activeSidebarLabel;
  const rightRailTitle = isTodayPanel
    ? 'Why this answer'
    : activePanel === 'history'
      ? 'Clean work receipts'
      : activePanel === 'sources'
        ? 'Source state'
        : 'Trust controls';

  return (
    <main className="foldera-dashboard-stage-root h-[100dvh] overflow-hidden text-text-primary" data-testid="dashboard-route-shell">
      <div className="foldera-dashboard-stage foldera-dashboard-stage--ready h-full">
        <section
          className={`foldera-dashboard-shell grid h-[100dvh] min-h-0 w-full justify-center overflow-hidden ${
            isTodayPanel
              ? 'grid-cols-[188px_minmax(0,1160px)_clamp(248px,19vw,300px)]'
              : 'grid-cols-[236px_minmax(0,1160px)_clamp(292px,22vw,340px)]'
          }`}
          data-testid="dashboard-app-shell"
        >
          <div className={isTodayPanel ? 'opacity-65 saturate-[0.82] transition' : ''}>
            <DashboardSidebar
              activeLabel={activeSidebarLabel}
              userName={sidebarUserName}
              variant="stage"
              appShell
              activePanel={activePanel}
              onSelectPanel={selectPanel}
            />
          </div>

          <section className="foldera-dashboard-main-column flex h-[100dvh] min-h-0 min-w-0 flex-col border-l border-white/[0.07]">
            <header className="foldera-dashboard-stage-header shrink-0 border-b border-white/[0.07] px-7 py-4 2xl:px-8 2xl:py-5">
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#9AA7B6]">
                {dateLabel}
              </p>
              <div className="mt-3 flex items-end justify-between gap-8">
                <div className="min-w-0">
                  <h1 className="text-[clamp(30px,2.35vw,38px)] font-semibold leading-tight tracking-[-0.05em] text-white">
                    {greetingLabel}
                    {firstName ? (
                      <>
                        , <strong className="font-semibold text-white">{firstName}.</strong>
                      </>
                    ) : (
                      '.'
                    )}
                  </h1>
                  <p className="mt-2 max-w-[760px] text-[clamp(14px,0.95vw,16px)] leading-6 text-[#A7B3C2]">
                    {isTodayPanel
                      ? 'One trusted answer for today, grounded in your connected sources.'
                      : 'Today shows the current safe move, why it matters, the source trail, and the next action.'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <div
                    role="status"
                    aria-label="Notifications unavailable until live alerts are connected"
                    title="Notifications unavailable until live alerts are connected"
                    className={`inline-flex h-10 w-10 cursor-not-allowed items-center justify-center rounded-full border border-accent-hover/14 bg-white/[0.04] text-accent-hover ${
                      isTodayPanel ? 'opacity-45' : 'opacity-70'
                    }`}
                  >
                    <Bell className="h-4 w-4" aria-hidden />
                  </div>
                  <div
                    role="status"
                    aria-label={`Current dashboard section: ${activeSidebarLabel}`}
                    className="rounded-full border border-accent-hover/14 bg-accent/[0.06] px-4 py-2 text-sm font-semibold text-accent-hover"
                  >
                    {activeSidebarLabel}
                  </div>
                </div>
              </div>
            </header>

            <div className="foldera-dashboard-stage-body flex min-h-0 flex-1 flex-col px-7 py-4 2xl:px-8 2xl:py-5">
              {degradedStateNode ? <div className="mb-4">{degradedStateNode}</div> : null}

              <div
                className={`min-h-0 flex-1 ${isTodayPanel ? 'mx-auto w-full max-w-[940px]' : ''}`}
              >
                {desktopWorkspaceNode}
              </div>

              {statusNoticeNode ? <div className="mt-4">{statusNoticeNode}</div> : null}

              {isTodayPanel && showOutcomeActions ? (
                <div className="mt-4 flex justify-center gap-3">
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
          </section>

          <aside
            className={`foldera-dashboard-right-rail flex h-[100dvh] min-h-0 min-w-0 flex-col border-l border-white/[0.07] bg-[#06101a]/78 px-5 py-4 2xl:py-5 ${
              isTodayPanel ? 'opacity-75 saturate-[0.88]' : ''
            }`}
          >
            <div className="mb-3 shrink-0">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#9AA7B6]">
                {rightRailLabel}
              </p>
              <h2 className="mt-2 text-[18px] font-semibold text-white">
                {rightRailTitle}
              </h2>
            </div>
            <div className="min-h-0 flex-1">
              {isTodayPanel ? (
                <RightPanel stageDesktop sourceTrailItems={sourceTrailItems} />
              ) : sidePanelNode}
            </div>
          </aside>
        </section>

        {hiddenArtifactNode}
      </div>
    </main>
  );
}
