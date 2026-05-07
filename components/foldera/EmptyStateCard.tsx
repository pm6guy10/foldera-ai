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
              Today
            </p>
          </div>
          <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-accent">
            Sources checked
          </p>
        </div>

        <div className="max-w-[820px]">
          <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-text-muted">
            Finished work inbox
          </p>
          <h2 className="mt-4 text-[36px] font-semibold leading-[1.08] tracking-[-0.04em] text-text-primary sm:text-[48px]">
            Foldera checked today.
          </h2>
          <p className="mt-5 max-w-[680px] text-[16px] leading-8 text-text-secondary">
            No finished artifact cleared the safety bar, but Foldera is still watching source freshness and recent decisions.
          </p>
        </div>

        <div className="grid gap-4 border-t border-white/8 pt-6 text-sm text-text-secondary sm:grid-cols-3">
          <div>
            <p className="font-semibold text-text-primary">What changed</p>
            <p className="mt-2 leading-6 text-text-muted">Foldera checked the connected source trail for a safe move.</p>
          </div>
          <div>
            <p className="font-semibold text-text-primary">What Foldera protected</p>
            <p className="mt-2 leading-6 text-text-muted">It held back instead of inventing work from weak evidence.</p>
          </div>
          <div>
            <p className="font-semibold text-text-primary">Smallest unlock</p>
            <p className="mt-2 leading-6 text-text-muted">Keep sources fresh so the next strong artifact can clear.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
