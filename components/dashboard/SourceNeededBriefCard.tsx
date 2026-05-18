'use client';

import { DailyBriefCard } from '@/components/foldera/DailyBriefCard';

type SourceNeededBriefCardProps = {
  stageDesktop: boolean;
};

export function SourceNeededBriefCard({ stageDesktop }: SourceNeededBriefCardProps) {
  return (
    <div data-testid="dashboard-empty-state" className="h-full w-full">
      <DailyBriefCard
        className="foldera-dashboard-brief-card foldera-dashboard-money-shot h-full w-full"
        dashboardCta
        stageDesktop={stageDesktop}
        directive="Connect sources so Foldera can find today’s finished move."
        whyNow="Foldera needs recent email, calendar, and draft context before it can safely recommend a source-backed action."
        eyebrowLabel="Daily Brief"
        directiveLabel="Directive"
        whyLabel="Why this now"
        draftLabel="Draft"
        draftBody={
          <p>
            Once your sources are connected, Today will show one trusted answer, why it matters now,
            the finished draft or document, and the source trail behind it.
          </p>
        }
        sourcePills={['Email', 'Calendar', 'Drafts', 'Decision notes']}
        sourceLabel="Source trail"
        nextStep="Next: Connect sources so Foldera can prepare the next safe artifact."
        statusText="WAITING FOR SOURCES"
        footerText="Foldera needs current source context first"
        actions={[
          { label: 'View demo', href: '/demo', kind: 'secondary' },
          {
            label: 'Connect sources',
            href: '/dashboard?panel=sources',
            kind: 'primary',
            dataTestId: 'dashboard-connect-sources',
          },
        ]}
      />
    </div>
  );
}
