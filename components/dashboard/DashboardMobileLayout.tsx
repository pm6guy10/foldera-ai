'use client';

import type { ComponentProps, ReactNode } from 'react';
import { DailyBriefCard } from '@/components/foldera/DailyBriefCard';
import {
  DashboardMobileNav,
  DashboardSidebar,
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
  secondaryPanelNode: ReactNode;
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
  secondaryPanelNode,
  showOutcomeActions,
  outcomeSubmitting,
  submitOutcome,
  hiddenArtifactNode,
}: DashboardMobileLayoutProps) {
  return (
    <main className="foldera-dashboard-page foldera-page min-h-screen overflow-x-hidden bg-bg text-text-primary" data-testid="pixel-lock-frame">
      <div className="mx-auto w-full max-w-[1400px] px-4 py-4 sm:px-5 lg:px-6 lg:py-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[252px_minmax(0,1fr)] 2xl:gap-8">
          <DashboardSidebar
            activeLabel={activeSidebarLabel}
            userName={sidebarUserName}
            appShell
            activePanel={activePanel}
            onSelectPanel={selectPanel}
          />

          <div className="min-w-0">
            <div className="mb-5 lg:hidden">
              <DashboardMobileNav
                activeLabel={activeSidebarLabel}
                userName={sidebarUserName}
                activePanel={activePanel}
                onSelectPanel={selectPanel}
              />
            </div>

            <div className="hidden items-center justify-between gap-4 lg:flex">
              <p className="foldera-eyebrow">{dateLabel}</p>
            </div>

            <div className="flex items-center justify-between gap-3 pb-1 pt-2 lg:hidden">
              <p className="foldera-eyebrow">{dateLabel}</p>
            </div>

            <header className="pb-7 pt-3 lg:pb-8 lg:pt-1">
              <h1 className="text-[clamp(2rem,4vw,3.1rem)] font-semibold leading-[1.08] tracking-[-0.04em] text-text-secondary">
                {greetingLabel}
                {firstName ? (
                  <>
                    , <strong className="font-semibold text-text-primary">{firstName}.</strong>
                  </>
                ) : (
                  '.'
                )}
              </h1>
            </header>

            {degradedStateNode ? <div className="mx-auto mb-4 w-full max-w-[860px]">{degradedStateNode}</div> : null}
            {statusNoticeNode ? <div className="mx-auto mb-4 w-full max-w-[860px]">{statusNoticeNode}</div> : null}

            <div className="mx-auto w-full max-w-[940px] pb-12">
              {isTodayPanel ? (
                hasAction ? (
                  <div data-testid="dashboard-panel-today">
                    <DailyBriefCard
                      className="foldera-dashboard-brief-card foldera-dashboard-money-shot foldera-dashboard-current-brief w-full"
                      dashboardCta
                      directive={artifactTitle}
                      whyNow={artifactContradiction}
                      eyebrowLabel="Finished work"
                      directiveLabel="Finished work"
                      whyLabel="Why it matters"
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
                )
              ) : (
                <div className="min-h-[420px]">{secondaryPanelNode}</div>
              )}

              {isTodayPanel && showOutcomeActions ? (
                <div className="mt-4 flex flex-wrap justify-center gap-3">
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
          </div>
        </div>
      </div>

      {hiddenArtifactNode}
    </main>
  );
}
