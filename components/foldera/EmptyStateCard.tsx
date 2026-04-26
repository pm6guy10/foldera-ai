type EmptyStateCardProps = {
  hasActiveIntegration: boolean;
  firstReadRunning: boolean;
  onRunFirstRead: () => void;
};

export function EmptyStateCard({
  hasActiveIntegration,
  firstReadRunning,
  onRunFirstRead,
}: EmptyStateCardProps) {
  return (
    <div
      data-testid="dashboard-empty-state"
      className="foldera-dashboard-brief-card foldera-brief-shell flex h-full w-full items-center justify-center px-8 py-10 text-center"
    >
      <div className="max-w-[520px]">
        <div className="mx-auto h-2.5 w-2.5 rounded-full bg-accent shadow-[0_0_18px_rgba(34,211,238,0.55)]" />
        <h2 className="mt-6 text-[32px] font-semibold tracking-[-0.04em] text-text-primary sm:text-[38px]">
          You&apos;re set until tomorrow morning.
        </h2>
        <p className="mt-4 text-[15px] leading-7 text-text-secondary">
          No directive is queued in the app right now. Your next read still lands in email.
          {!hasActiveIntegration ? ' Connect accounts in Settings if you want deeper context.' : ''}
        </p>
        {hasActiveIntegration ? (
          <button
            type="button"
            onClick={onRunFirstRead}
            disabled={firstReadRunning}
            data-testid="dashboard-run-first-read"
            className="foldera-button-primary mt-7"
          >
            {firstReadRunning ? 'Running first read' : 'Run first read now'}
          </button>
        ) : null}
      </div>
    </div>
  );
}
