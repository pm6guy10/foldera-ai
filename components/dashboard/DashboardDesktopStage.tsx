'use client';

import type { ReactNode } from 'react';
import { Activity, Bell, Mail, Search, TriangleAlert } from 'lucide-react';
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
  stageTransform: string;
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
  stageTransform,
}: DashboardDesktopStageProps) {
  return (
    <main className="foldera-dashboard-stage-root text-text-primary" data-testid="pixel-lock-frame">
      <div
        className="foldera-dashboard-stage foldera-dashboard-stage--ready"
        style={{ transform: stageTransform, transformOrigin: 'top left' }}
      >
        <section
          className="absolute left-[244px] top-[58px] h-[840px] w-[1420px] overflow-hidden rounded-[30px] border border-white/[0.08] bg-[#04080d]/94 shadow-[0_0_0_1px_rgba(34,211,238,0.08),0_28px_90px_rgba(0,0,0,0.46)]"
          data-testid="dashboard-figma-card-frame"
        >
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#22D3EE] to-transparent opacity-80" />
          <div className="pointer-events-none absolute -right-24 top-8 h-72 w-72 rounded-full bg-[#22D3EE]/10 blur-3xl" />
          <div className="pointer-events-none absolute -left-20 bottom-0 h-64 w-64 rounded-full bg-[#7C3AED]/10 blur-3xl" />

          <div className="relative grid h-full grid-cols-[232px_minmax(0,1fr)_292px]">
            <DashboardSidebar
              activeLabel={activeSidebarLabel}
              userName={sidebarUserName}
              variant="stage"
              appShell
              activePanel={activePanel}
              onSelectPanel={selectPanel}
            />

            <section className="min-w-0 border-l border-[#1B2530]/80 p-7">
              <header className="pointer-events-none flex items-start justify-between gap-6">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.26em] text-[#9AA7B6]">
                    {dateLabel}
                  </p>
                  <h1 className="mt-4 text-[34px] font-semibold leading-tight tracking-[-0.05em] text-white">
                    {greetingLabel}
                    {firstName ? (
                      <>
                        , <strong className="font-semibold text-white">{firstName}.</strong>
                      </>
                    ) : (
                      '.'
                    )}
                  </h1>
                  <div className="mt-4 flex flex-wrap gap-6 text-sm text-[#A7B3C2]">
                    <span className="inline-flex items-center gap-2">
                      <Mail className="h-4 w-4 text-accent" aria-hidden />
                      <strong className="text-xl font-semibold text-white">5</strong>
                      <span>open threads</span>
                    </span>
                    <span className="inline-flex items-center gap-2">
                      <TriangleAlert className="h-4 w-4 text-[#F59E0B]" aria-hidden />
                      <strong className="text-xl font-semibold text-[#F59E0B]">2</strong>
                      <span>need attention</span>
                    </span>
                    <span className="inline-flex items-center gap-2">
                      <Activity className="h-4 w-4 text-accent" aria-hidden />
                      <strong className="text-xl font-semibold text-white">1</strong>
                      <span>ready to move</span>
                    </span>
                  </div>
                </div>

                <div className="pointer-events-auto flex min-w-[300px] items-center gap-3">
                  <div className="foldera-dashboard-search-field flex min-h-[44px] flex-1 items-center gap-3 rounded-[14px] border px-4 text-sm text-[#7A8594]">
                    <Search className="h-4 w-4 text-[#7A8594]" aria-hidden />
                    <span>Search Foldera...</span>
                    <span className="ml-auto rounded-[8px] border border-[#1B2530] px-2 py-1 text-xs">⌘K</span>
                  </div>
                  <button
                    type="button"
                    aria-label="Notifications"
                    className="foldera-dashboard-notify-btn flex h-11 w-11 items-center justify-center rounded-[14px] border text-[#A7B3C2]"
                  >
                    <Bell className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              </header>

              {degradedStateNode ? <div className="mt-5">{degradedStateNode}</div> : null}

              <div className="mt-6 h-[620px] min-h-0">{desktopWorkspaceNode}</div>

              {statusNoticeNode ? <div className="mt-5">{statusNoticeNode}</div> : null}

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
            </section>

            <aside className="foldera-dashboard-right-rail border-l border-[#1B2530]/80 bg-[#050B10]/70 p-6">
              {isTodayPanel ? (
                <RightPanel stageDesktop />
              ) : (
                <div className="rounded-[18px] border border-[#1B2530] bg-[#080F16] p-5">
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#9AA7B6]">
                    {activeSidebarLabel}
                  </p>
                  <p className="mt-4 text-sm leading-6 text-[#8D9AA8]">
                    Foldera keeps this panel inside the same executive briefing shell so the dashboard never jumps to a different room.
                  </p>
                </div>
              )}
            </aside>
          </div>
        </section>

        {hiddenArtifactNode}
      </div>
    </main>
  );
}
