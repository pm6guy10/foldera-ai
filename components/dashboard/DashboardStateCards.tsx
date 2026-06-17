export function DashboardLoadingCard() {
  return (
    <article
      className="foldera-dashboard-brief-card foldera-brief-shell foldera-dashboard-loading-brief h-full w-full overflow-hidden"
      data-testid="dashboard-loading-card"
    >
      <header className="flex items-center justify-between border-b border-white/[0.028] px-5 py-4 sm:px-6">
        <div className="h-3.5 w-24 animate-pulse rounded-full bg-white/[0.08]" />
        <div className="flex items-center gap-3">
          <div className="h-3.5 w-32 animate-pulse rounded-full bg-accent/[0.15]" />
          <div className="h-3 w-3 animate-pulse rounded-full bg-accent/[0.3]" />
        </div>
      </header>
      <div className="space-y-6 px-5 py-6 sm:px-6 sm:py-6">
        <section className="grid gap-4 border-b border-white/[0.028] pb-5 md:grid-cols-[72px_minmax(0,1fr)]">
          <div className="h-12 w-12 animate-pulse rounded-[16px] bg-accent/[0.12]" />
          <div className="space-y-3">
            <div className="h-3 w-28 animate-pulse rounded-full bg-white/[0.08]" />
            <div className="h-8 w-full max-w-[680px] animate-pulse rounded-[14px] bg-white/[0.06]" />
            <div className="h-8 w-4/5 max-w-[560px] animate-pulse rounded-[14px] bg-white/[0.04]" />
          </div>
        </section>
        <section className="grid gap-4 border-b border-white/[0.028] pb-5 md:grid-cols-[72px_minmax(0,1fr)]">
          <div className="h-12 w-12 animate-pulse rounded-[16px] bg-amber-300/[0.12]" />
          <div className="space-y-3">
            <div className="h-3 w-32 animate-pulse rounded-full bg-amber-300/[0.16]" />
            <div className="h-4 w-full animate-pulse rounded-full bg-white/[0.06]" />
            <div className="h-4 w-[92%] animate-pulse rounded-full bg-white/[0.05]" />
            <div className="h-4 w-[84%] animate-pulse rounded-full bg-white/[0.04]" />
          </div>
        </section>
        <section className="grid gap-4 border-b border-white/[0.028] pb-5 md:grid-cols-[72px_minmax(0,1fr)]">
          <div className="h-12 w-12 animate-pulse rounded-[16px] bg-white/[0.08]" />
          <div className="space-y-3">
            <div className="h-3 w-20 animate-pulse rounded-full bg-white/[0.08]" />
            <div className="h-24 w-full animate-pulse rounded-[18px] bg-white/[0.05]" />
          </div>
        </section>
        <section className="grid gap-4 md:grid-cols-[72px_minmax(0,1fr)]">
          <div className="h-9 w-9 animate-pulse rounded-[12px] bg-white/[0.08]" />
          <div className="space-y-3">
            <div className="h-3 w-24 animate-pulse rounded-full bg-white/[0.08]" />
            <div className="flex flex-wrap gap-2">
              <div className="h-9 w-24 animate-pulse rounded-[10px] bg-white/[0.05]" />
              <div className="h-9 w-28 animate-pulse rounded-[10px] bg-white/[0.05]" />
              <div className="h-9 w-24 animate-pulse rounded-[10px] bg-white/[0.05]" />
              <div className="h-9 w-32 animate-pulse rounded-[10px] bg-white/[0.05]" />
            </div>
          </div>
        </section>
      </div>
    </article>
  );
}

export function DashboardBriefingUnavailableCard() {
  return (
    <div
      className="foldera-dashboard-brief-card foldera-brief-shell flex h-full w-full items-center justify-center px-8 py-10 text-center"
      data-testid="dashboard-briefing-unavailable"
    >
      <div className="max-w-[520px]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
          Inbox unavailable
        </p>
        <h2 className="mt-4 text-[32px] font-semibold tracking-[-0.04em] text-text-primary sm:text-[38px]">
          Latest work unavailable
        </h2>
        <p className="mt-4 text-[15px] leading-7 text-text-secondary">
          Foldera couldn&apos;t load your latest work right now. Refresh to retry.
        </p>
      </div>
    </div>
  );
}

export function DashboardDegradedState({ issueLabels }: { issueLabels: string[] }) {
  if (issueLabels.length === 0) return null;

  return (
    <div
      className="rounded-[14px] border border-amber-400/30 bg-amber-400/10 px-4 py-3"
      data-testid="dashboard-degraded-state"
    >
      <p className="text-sm font-semibold text-text-primary">Dashboard is partially unavailable.</p>
      <p className="mt-1 text-sm text-text-secondary">
        Foldera is still loading what it can, but some live data is unavailable right now.
      </p>
      <ul className="mt-3 space-y-1 text-sm text-text-secondary">
        {issueLabels.map((label) => (
          <li key={label}>{label}</li>
        ))}
      </ul>
    </div>
  );
}
