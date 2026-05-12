'use client';

import type { ReactNode } from 'react';
import { RightPanel } from '@/components/foldera/RightPanel';
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
}: DashboardDesktopStageProps) {
  return (
    <main className="foldera-dashboard-stage-root text-text-primary" data-testid="dashboard-route-shell">
      <div className="foldera-dashboard-stage foldera-dashboard-stage--ready">
        <section
          className="foldera-dashboard-shell grid min-h-[100dvh] w-full grid-cols-[236px_minmax(0,1fr)_320px] overflow-hidden"
          data-testid="dashboard-app-shell"
        >
          <DashboardSidebar
            activeLabel={activeSidebarLabel}
            userName={sidebarUserName}
            variant="stage"
            appShell
            activePanel={activePanel}
            onSelectPanel={selectPanel}
          />

          <section className="flex min-h-[100dvh] min-w-0 flex-col border-l border-white/[0.07]">
            <header className="border-b border-white/[0.07] px-8 py-6">
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#9AA7B6]">
                {dateLabel}
              </p>
              <div className="mt-4 flex items-end justify-between gap-8">
                <div className="min-w-0">
                  <h1 className="text-[38px] font-semibold leading-tight tracking-[-0.05em] text-white">
                    {greetingLabel}
                    {firstName ? (
                      <>
                        , <strong className="font-semibold text-white">{firstName}.</strong>
                      </>
                    ) : (
                      '.'
                    )}
                  </h1>
                  <p className="mt-3 max-w-[760px] text-[16px] leading-7 text-[#A7B3C2]">
                    Foldera keeps Today, sources, history, and account inside one working surface so the dashboard stays grounded in the same artifact context.
                  </p>
                </div>
                <div className="shrink-0 rounded-full border border-cyan-200/14 bg-cyan-300/[0.06] px-4 py-2 text-sm font-semibold text-cyan-100">
                  {activeSidebarLabel}
                </div>
              </div>
            </header>

            <div className="flex min-h-0 flex-1 flex-col px-8 py-6">
              {degradedStateNode ? <div className="mb-4">{degradedStateNode}</div> : null}

              <div className="min-h-0 flex-1">{desktopWorkspaceNode}</div>

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

          <aside className="foldera-dashboard-right-rail flex min-h-[100dvh] min-w-0 flex-col border-l border-white/[0.07] bg-[#06101a]/78 px-5 py-6">
            <div className="mb-4">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#9AA7B6]">
                Support
              </p>
              <h2 className="mt-2 text-[18px] font-semibold text-white">
                {isTodayPanel ? 'Context behind the current move' : `${activeSidebarLabel} support`}
              </h2>
            </div>
            <div className="min-h-0 flex-1">
              {isTodayPanel ? (
                <RightPanel stageDesktop />
              ) : (
                <div className="rounded-[18px] border border-white/[0.07] bg-white/[0.03] p-5">
                  <p className="text-sm leading-6 text-[#8D9AA8]">
                    Foldera keeps this panel inside the same app shell so the artifact, source trail, and account context never jump into a separate mock room.
                  </p>
                </div>
              )}
            </div>
          </aside>
        </section>

        {hiddenArtifactNode}
      </div>
    </main>
  );
}
