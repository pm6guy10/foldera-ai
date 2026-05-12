'use client';

import type { ComponentProps, ReactNode } from 'react';
import { DailyBriefCard } from '@/components/foldera/DailyBriefCard';
import { type DashboardPanelKey } from '@/components/foldera/DashboardSidebar';

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
  const mobileTabs: Array<{ panel: DashboardPanelKey; label: string }> = [
    { panel: 'today', label: 'Today' },
    { panel: 'sources', label: 'Sources' },
    { panel: 'history', label: 'Recent Work' },
    { panel: 'account', label: 'Account' },
  ];

  return (
    <main
      className="foldera-dashboard-page foldera-page min-h-[100dvh] overflow-x-hidden bg-bg text-text-primary"
      data-testid="dashboard-route-shell"
    >
      <div className="flex min-h-[100dvh] flex-col">
        <header
          className="sticky top-0 z-20 border-b border-white/[0.07] bg-[#030a12]/94 px-4 pb-4 backdrop-blur"
          style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}
        >
          <p className="foldera-eyebrow">{dateLabel}</p>
          <div className="mt-3 flex items-end justify-between gap-4">
            <div className="min-w-0">
              <h1 className="max-w-[14ch] text-[34px] font-semibold leading-[1.08] tracking-[-0.05em] text-white">
                {greetingLabel}
                {firstName ? (
                  <>
                    , <strong className="font-semibold text-white">{firstName}.</strong>
                  </>
                ) : (
                  '.'
                )}
              </h1>
              <p className="mt-3 max-w-[28rem] text-sm leading-6 text-text-secondary">
                Foldera keeps the current artifact and support panels in one responsive dashboard surface.
              </p>
            </div>
            <div className="shrink-0 rounded-full border border-cyan-200/14 bg-cyan-300/[0.06] px-3 py-1.5 text-xs font-semibold text-cyan-100">
              {activeSidebarLabel}
            </div>
          </div>

          {degradedStateNode ? <div className="mt-4">{degradedStateNode}</div> : null}
          {statusNoticeNode ? <div className="mt-4">{statusNoticeNode}</div> : null}
        </header>

        <div className="flex-1 px-4 py-4 pb-24">
          {isTodayPanel ? (
            hasAction ? (
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
            )
          ) : (
            supportPanelNode
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

        <nav
          className="fixed inset-x-0 bottom-0 z-30 border-t border-white/[0.08] bg-[#030a12]/96 px-3 pt-3 backdrop-blur"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
          aria-label="Dashboard sections"
        >
          <div className="grid grid-cols-4 gap-2">
            {mobileTabs.map((tab) => {
              const isActive = tab.panel === activePanel;
              return (
                <button
                  key={tab.panel}
                  type="button"
                  data-testid={`dashboard-mobile-tab-${tab.panel}`}
                  aria-current={isActive ? 'page' : undefined}
                  className={`rounded-[14px] px-2 py-3 text-center text-[11px] font-semibold transition-colors ${
                    isActive
                      ? 'bg-cyan-300/[0.12] text-accent'
                      : 'bg-transparent text-text-muted'
                  }`}
                  onClick={() => selectPanel(tab.panel)}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </nav>
      </div>

      {hiddenArtifactNode}
    </main>
  );
}
