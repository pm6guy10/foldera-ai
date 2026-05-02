export function EmptyStateCard() {
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
          Foldera did not find a move that cleared today&apos;s safety and action checks.
          If a draft is useful but imperfect, it still shows up here with warnings.
        </p>
      </div>
    </div>
  );
}
