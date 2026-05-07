export function EmptyStateCard() {
  return (
    <div
      data-testid="dashboard-empty-state"
      className="foldera-dashboard-brief-card foldera-brief-shell flex h-full w-full px-6 py-6 text-left sm:px-10 sm:py-10"
    >
      <div className="flex min-h-full w-full flex-col justify-between gap-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="h-3 w-3 rounded-full bg-accent shadow-[0_0_22px_rgba(34,211,238,0.68)]" />
            <p className="text-[15px] font-semibold uppercase tracking-[0.14em] text-text-secondary">
              Daily Brief
            </p>
          </div>
          <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-accent">
            No action queued
          </p>
        </div>

        <div className="max-w-[820px]">
          <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-text-muted">
            Today&apos;s read
          </p>
          <h2 className="mt-4 text-[36px] font-semibold leading-[1.08] tracking-[-0.04em] text-text-primary sm:text-[48px]">
            No safe artifact today.
          </h2>
          <p className="mt-5 max-w-[680px] text-[16px] leading-8 text-text-secondary">
            Foldera did not find a move that cleared today&apos;s safety and action checks.
            If a draft is useful but imperfect, it still shows up here with warnings.
          </p>
        </div>

        <div className="grid gap-4 border-t border-white/8 pt-6 text-sm text-text-secondary sm:grid-cols-3">
          <div>
            <p className="font-semibold text-text-primary">No forced draft</p>
            <p className="mt-2 leading-6 text-text-muted">The brief stays empty rather than inventing work.</p>
          </div>
          <div>
            <p className="font-semibold text-text-primary">Warnings stay visible</p>
            <p className="mt-2 leading-6 text-text-muted">Useful but imperfect drafts can still appear with context.</p>
          </div>
          <div>
            <p className="font-semibold text-text-primary">Next read continues</p>
            <p className="mt-2 leading-6 text-text-muted">New connected evidence can promote the next safe artifact.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
