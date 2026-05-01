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
          No safe artifact today.
        </h2>
        <p className="mt-4 text-[15px] leading-7 text-text-secondary">
          Foldera checked the command-center signals and did not find a safe artifact to show.
          The dashboard stays empty until a job, interview, benefits, payment, admin, or
          calendar-conflict artifact clears the bar.
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
            {firstReadRunning ? 'Running command-center scan' : 'Run command-center scan'}
          </button>
        ) : null}
      </div>
    </div>
  );
}
