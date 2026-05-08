'use client';

import type { ComponentProps, ReactNode } from 'react';
import { Activity, Bell, Mail, TriangleAlert } from 'lucide-react';
import { DailyBriefCard } from '@/components/foldera/DailyBriefCard';
import {
  DashboardMobileNav,
  type DashboardPanelKey,
} from '@/components/foldera/DashboardSidebar';

type DailyBriefActions = NonNullable<ComponentProps<typeof DailyBriefCard>['actions']>;
type OutcomeValue = 'worked' | 'didnt_work';

type DashboardMobileLayoutProps = {
  activeSidebarLabel: string;
  sidebarUserName: string;
  activePanel: DashboardPanelKey;
  selectPanel: (panel: DashboardPanelKey) => void;
  dateLabel: string;
  greetingLabel: string;
  firstName: string | null;
  degradedStateNode: ReactNode;
  statusNoticeNode: ReactNode;
  isTodayPanel: boolean;
  hasAction: boolean;
  artifactTitle: string;
  artifactContradiction: string;
  draftLabel: string;
  draftBody: ReactNode;
  sourcePills: string[];
  writeDocument: boolean;
  cardActions: DailyBriefActions;
  loadingLatest: boolean;
  loadingCard: ReactNode;
  hasLatestIssue: boolean;
  briefingUnavailableCard: ReactNode;
  emptyStateCard: ReactNode;
  supportPanelNode: ReactNode;
  showOutcomeActions: boolean;
  outcomeSubmitting: OutcomeValue | null;
  submitOutcome: (outcome: OutcomeValue) => void;
  hiddenArtifactNode: ReactNode;
};

export function DashboardMobileLayout({
  activeSidebarLabel,
  sidebarUserName,
  activePanel,
  selectPanel,
  dateLabel,
  greetingLabel,
  firstName,
  degradedStateNode,
  statusNoticeNode,
  isTodayPanel,
  hasAction,
  artifactTitle,
  artifactContradiction,
  draftLabel,
  draftBody,
  sourcePills,
  writeDocument,
  cardActions,
  loadingLatest,
  loadingCard,
  hasLatestIssue,
  briefingUnavailableCard,
  emptyStateCard,
  supportPanelNode,
  showOutcomeActions,
  outcomeSubmitting,
  submitOutcome,
  hiddenArtifactNode,
}: DashboardMobileLayoutProps) {
  return (
    <main
      className="foldera-dashboard-page foldera-page min-h-screen overflow-x-hidden bg-bg text-text-primary"
      data-testid="pixel-lock-frame"
    >
      <div className="mx-auto w-full max-w-[420px] px-3 pb-6 pt-3">
        <div className="rounded-[32px] border border-white/10 bg-[#030a12]/96 p-3 shadow-[0_24px_80px_rgba(0,0,0,0.46)]">
          <div className="flex items-center justify-between px-2 pb-3 pt-1">
            <p className="text-[11px] font-semibold tracking-[0.02em] text-white">9:41</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Notifications"
                className="flex h-9 w-9 items-center justify-center rounded-[12px] border border-white/10 bg-white/[0.04] text-text-primary"
              >
                <Bell className="h-4 w-4" aria-hidden />
              </button>
              <DashboardMobileNav
                activeLabel={activeSidebarLabel}
                userName={sidebarUserName}
                activePanel={activePanel}
                onSelectPanel={selectPanel}
                compact
              />
            </div>
          </div>

          <div className="px-2">
            <p className="foldera-eyebrow">{dateLabel}</p>

            <header className="pb-5 pt-3">
              <h1 className="max-w-[12ch] text-[34px] font-semibold leading-[1.08] tracking-[-0.05em] text-white">
                {greetingLabel}
                {firstName ? (
                  <>
                    , <strong className="font-semibold text-white">{firstName}.</strong>
                  </>
                ) : (
                  '.'
                )}
              </h1>
            </header>

            <div className="grid grid-cols-3 gap-2 rounded-[18px] border border-white/8 bg-white/[0.025] p-3">
              <div className="rounded-[14px] border border-white/7 bg-white/[0.03] px-2 py-2.5">
                <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
                  <Mail className="h-3.5 w-3.5 text-accent" aria-hidden />
                  <span className="font-semibold text-white">5</span>
                </div>
                <p className="mt-1 text-[10px] leading-4 text-text-muted">open</p>
              </div>
              <div className="rounded-[14px] border border-white/7 bg-white/[0.03] px-2 py-2.5">
                <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
                  <TriangleAlert className="h-3.5 w-3.5 text-[#F59E0B]" aria-hidden />
                  <span className="font-semibold text-[#F59E0B]">2</span>
                </div>
                <p className="mt-1 text-[10px] leading-4 text-text-muted">attention</p>
              </div>
              <div className="rounded-[14px] border border-white/7 bg-white/[0.03] px-2 py-2.5">
                <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
                  <Activity className="h-3.5 w-3.5 text-accent" aria-hidden />
                  <span className="font-semibold text-white">1</span>
                </div>
                <p className="mt-1 text-[10px] leading-4 text-text-muted">ready</p>
              </div>
            </div>

            {degradedStateNode ? <div className="mt-4">{degradedStateNode}</div> : null}
            {statusNoticeNode ? <div className="mt-4">{statusNoticeNode}</div> : null}

            <div className="mt-4 grid gap-4 pb-4">
              <div>
                {hasAction ? (
                  <div data-testid="dashboard-panel-today">
                    <DailyBriefCard
                      className="foldera-dashboard-brief-card foldera-dashboard-money-shot foldera-dashboard-current-brief w-full"
                      dashboardCta
                      compact
                      directive={artifactTitle}
                      whyNow={artifactContradiction}
                      eyebrowLabel="Daily Brief"
                      directiveLabel="Directive"
                      whyLabel="Why this now"
                      draftLabel={draftLabel}
                      draftBody={draftBody}
                      sourcePills={sourcePills}
                      sourceLabel="Source trail"
                      nextStep={writeDocument ? 'Next: Save to record' : 'Next: Await response'}
                      statusText={writeDocument ? 'READY TO SAVE' : 'READY TO APPROVE'}
                      footerText="Grounded in connected sources"
                      actions={cardActions}
                    />
                  </div>
                ) : loadingLatest ? (
                  loadingCard
                ) : hasLatestIssue ? (
                  <div className="min-h-[420px]">{briefingUnavailableCard}</div>
                ) : (
                  <div className="min-h-[420px]">{emptyStateCard}</div>
                )}
              </div>

              {supportPanelNode}

              {isTodayPanel && showOutcomeActions ? (
                <div className="mt-1 flex flex-wrap justify-center gap-3">
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

            <div className="grid grid-cols-4 gap-2 rounded-[18px] border border-white/8 bg-white/[0.02] p-2 text-center text-[11px] text-text-muted">
              <button
                type="button"
                className={`rounded-[14px] px-2 py-2 ${activePanel === 'today' ? 'bg-cyan-300/[0.12] text-accent' : 'bg-transparent text-text-muted'}`}
                onClick={() => selectPanel('today')}
              >
                Briefing
              </button>
              <a href="/dashboard/playbooks" className="rounded-[14px] px-2 py-2">
                Playbooks
              </a>
              <a href="/dashboard/signals" className="rounded-[14px] px-2 py-2">
                Signals
              </a>
              <button
                type="button"
                className={`rounded-[14px] px-2 py-2 ${activePanel !== 'today' ? 'bg-white/[0.05] text-text-primary' : 'bg-transparent text-text-muted'}`}
                onClick={() => selectPanel(activePanel === 'account' ? 'history' : 'account')}
              >
                More
              </button>
            </div>
          </div>
        </div>
      </div>

      {hiddenArtifactNode}
    </main>
  );
}
