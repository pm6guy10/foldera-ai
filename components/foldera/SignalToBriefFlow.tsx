const sourceSignals = [
  'Unanswered thread',
  'Calendar hold',
  'Stale draft',
  'Decision waiting',
];

const signalStepClasses = ['signal-step--1', 'signal-step--2', 'signal-step--3', 'signal-step--4'];

export function SignalToBriefFlow() {
  return (
    <section id="product" className="relative overflow-hidden py-12 sm:py-16 lg:py-24">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px] bg-[radial-gradient(65%_70%_at_24%_10%,rgba(124,58,237,0.12),transparent_70%),radial-gradient(55%_60%_at_80%_24%,rgba(34,211,238,0.12),transparent_72%)]" />

      <div className="mx-auto max-w-[1380px] px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <p className="foldera-eyebrow text-accent">Chaos in. One finished move out.</p>
          <h2 className="mt-3 text-balance text-[30px] font-semibold tracking-[-0.04em] text-text-primary sm:text-[42px]">
            Foldera turns scattered context into one finished move.
          </h2>
        </div>

        <div className="mt-10 grid gap-5 lg:grid-cols-[1fr_180px_1fr] lg:items-center">
          <div className="surface-card relative overflow-hidden p-5 sm:p-6">
            <div className="accent-glow absolute inset-x-8 top-0" aria-hidden />
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">
              Signals coming in
            </p>
            <div className="mt-5 grid gap-3">
              {sourceSignals.map((signal, index) => (
                <div
                  key={signal}
                  className={`signal-step ${signalStepClasses[index]} rounded-[18px] border border-border bg-panel-raised px-4 py-4 text-sm text-text-secondary`}
                >
                  <span className="signal-step__dot" aria-hidden />
                  <span className="signal-step__label">{signal}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="signal-core relative flex items-center justify-center py-2">
            <span className="signal-core-connector signal-core-connector--in hidden lg:block" aria-hidden />
            <span className="signal-core-connector signal-core-connector--out hidden lg:block" aria-hidden />
            <div className="relative flex h-[160px] w-[160px] items-center justify-center rounded-full border border-cyan-400/20 bg-panel">
              <div className="signal-core__ring signal-core__ring--outer absolute inset-4 rounded-full border border-cyan-400/25" />
              <div className="signal-core__ring signal-core__ring--inner absolute inset-8 rounded-full border border-purple-400/20" />
              <div className="signal-core__label rounded-full border border-cyan-300/25 bg-accent/10 px-4 py-2 text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
                Foldera
              </div>
            </div>
          </div>

          <div className="surface-card finished-output relative overflow-hidden p-5 sm:p-6">
            <div className="accent-glow absolute inset-x-8 top-0" aria-hidden />
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
              Finished move out
            </p>
            <div className="finished-output__card mt-5 rounded-[20px] border border-cyan-400/20 bg-[#071018] p-5 shadow-[0_0_30px_rgba(34,211,238,0.12)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">Directive</p>
              <h3 className="mt-2 text-[24px] font-semibold leading-tight tracking-[-0.03em] text-text-primary">
                Send the follow-up before noon.
              </h3>
              <p className="mt-3 text-sm leading-7 text-text-secondary">
                Open thread, time-bound ask, and a clean window make this the next move.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
