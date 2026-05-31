import type { ReactNode } from 'react';

type LandingPageProps = {
  isAuthenticated?: boolean;
};

type PosterSectionProps = {
  index: number;
  eyebrow: string;
  title: string;
  body: string;
  children: ReactNode;
  anchorId?: string;
  reverse?: boolean;
};

const stateRows = [
  ['Current focus', 'Pilot approval packet'],
  ['Next move', 'Send the tightened summary'],
  ['Blocker', 'Waiting on one source update'],
  ['Waiting on', 'Riley — budget note'],
  ['Last completed', 'Route contract verified'],
];

const signalTiles = [
  ['Message', 'Budget answer buried in thread'],
  ['Meeting', 'Decision changed after standup'],
  ['Draft', 'Summary half-written'],
  ['File', 'Latest version moved'],
  ['Blocker', 'Owner approval pending'],
  ['Approval', 'Safe to send after review'],
];

const loopSteps = [
  ['Remember', 'Foldera keeps current focus, next move, blocker, waiting-on, and last completed step attached.'],
  ['Trigger', 'Consented work signals update the state when something meaningful changes.'],
  ['Intervene', 'One Right Now card appears when there is a safe next move to review.'],
];

const trustBoundaries = ['Consented sources only', 'Explicit user state', 'Nothing sent automatically', 'No unsupported compliance claims'];

function GlowField() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="absolute left-1/2 top-[-18rem] h-[42rem] w-[42rem] -translate-x-1/2 rounded-full bg-cyan-400/10 blur-[150px]" />
      <div className="absolute -left-48 top-[24rem] h-[34rem] w-[34rem] rounded-full bg-violet-500/14 blur-[150px]" />
      <div className="absolute -right-48 top-[54rem] h-[38rem] w-[38rem] rounded-full bg-sky-500/10 blur-[165px]" />
      <div className="absolute bottom-[-20rem] left-1/2 h-[40rem] w-[40rem] -translate-x-1/2 rounded-full bg-cyan-300/8 blur-[180px]" />
    </div>
  );
}

function RightNowPanel({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className="relative overflow-hidden rounded-[34px] border border-cyan-300/20 bg-slate-950/[0.88] p-5 shadow-[0_34px_140px_rgba(8,47,73,0.58)] backdrop-blur-xl sm:p-6"
      data-testid="right-now-card"
    >
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-cyan-300/20 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -bottom-20 -left-12 h-56 w-56 rounded-full bg-violet-500/16 blur-3xl" aria-hidden="true" />

      <div className="relative flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-cyan-200">Right Now</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-[-0.055em] text-white sm:text-3xl">
            Send the approval summary.
          </h2>
          <p className="mt-3 max-w-[30rem] text-sm leading-6 text-slate-300">
            The thread, meeting note, and blocker finally line up. Review one prepared move, then approve or hold it.
          </p>
        </div>
        <div className="hidden rounded-full border border-emerald-300/25 bg-emerald-300/10 px-3 py-1 text-[11px] font-semibold text-emerald-200 sm:block">
          Signal strong
        </div>
      </div>

      <dl className="relative mt-6 grid gap-2">
        {stateRows.slice(0, compact ? 3 : stateRows.length).map(([label, value]) => (
          <div key={label} className="grid gap-1 rounded-2xl border border-white/8 bg-white/[0.04] px-4 py-3 sm:grid-cols-[7.5rem_1fr] sm:gap-4">
            <dt className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</dt>
            <dd className="text-sm text-slate-100">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="relative mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {['Done', 'Stuck', 'Break smaller', 'Snooze'].map((action) => (
          <button
            key={action}
            type="button"
            className="min-h-[42px] rounded-xl border border-white/10 bg-white/[0.045] px-3 text-xs font-semibold text-slate-200 transition-colors hover:border-cyan-300/35 hover:bg-cyan-300/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
          >
            {action}
          </button>
        ))}
      </div>
    </div>
  );
}

function SignalOrbit() {
  return (
    <div className="relative min-h-[420px] overflow-hidden rounded-[34px] border border-white/10 bg-white/[0.035] p-5 shadow-[0_34px_120px_rgba(0,0,0,0.56)] sm:min-h-[520px] sm:p-7">
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-56 w-56 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-300/15 bg-cyan-300/8 blur-[1px]" aria-hidden="true" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-80 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full border border-violet-300/10" aria-hidden="true" />
      <div className="relative z-10 grid h-full gap-3 sm:grid-cols-2">
        {signalTiles.map(([label, detail], index) => (
          <div
            key={label}
            className={`rounded-[24px] border border-white/10 bg-black/45 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ${index % 2 === 0 ? 'sm:translate-y-7' : ''}`}
          >
            <div className="mb-8 h-2 w-2 rounded-full bg-cyan-300 shadow-[0_0_22px_rgba(34,211,238,0.7)]" />
            <p className="text-sm font-semibold text-white">{label}</p>
            <p className="mt-2 text-xs leading-5 text-slate-500">{detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function StateStack() {
  return (
    <div className="relative overflow-hidden rounded-[34px] border border-cyan-300/15 bg-slate-950/[0.78] p-5 shadow-[0_34px_130px_rgba(8,47,73,0.44)] sm:p-7">
      <div className="pointer-events-none absolute -right-20 top-12 h-60 w-60 rounded-full bg-cyan-300/14 blur-3xl" aria-hidden="true" />
      <div className="relative space-y-3">
        {stateRows.map(([label, value], index) => (
          <div
            key={label}
            className={`rounded-[24px] border border-white/10 bg-white/[0.045] p-4 ${index === 1 ? 'border-cyan-300/25 bg-cyan-300/10 shadow-[0_0_46px_rgba(34,211,238,0.14)]' : ''}`}
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-200/80">{label}</p>
            <p className="mt-2 text-sm text-slate-100">{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function LoopPoster() {
  return (
    <div className="grid gap-3">
      {loopSteps.map(([label, detail], index) => (
        <article key={label} className="group rounded-[28px] border border-white/10 bg-white/[0.035] p-5 transition-colors hover:border-cyan-300/25 hover:bg-cyan-300/[0.055]">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 text-sm font-semibold text-cyan-100">
              {index + 1}
            </div>
            <div>
              <p className="text-lg font-semibold tracking-[-0.04em] text-white">{label}</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">{detail}</p>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function TrustPanel() {
  return (
    <div className="grid gap-3">
      {trustBoundaries.map((boundary) => (
        <div key={boundary} className="rounded-[24px] border border-white/10 bg-black/40 p-4 text-sm font-semibold text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          {boundary}
        </div>
      ))}
    </div>
  );
}

function PosterSection({ index, eyebrow, title, body, children, anchorId, reverse = false }: PosterSectionProps) {
  return (
    <section
      id={anchorId}
      className="relative mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8"
      data-testid={`landing-slide-${index}`}
    >
      <div className="relative min-h-[680px] overflow-hidden rounded-[42px] border border-white/10 bg-[radial-gradient(circle_at_20%_15%,rgba(34,211,238,0.14),transparent_34%),radial-gradient(circle_at_86%_22%,rgba(168,85,247,0.14),transparent_34%),rgba(2,6,23,0.84)] p-6 shadow-[0_42px_160px_rgba(0,0,0,0.72)] sm:p-8 lg:p-10">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-200/30 to-transparent" aria-hidden="true" />
        <div className="pointer-events-none absolute bottom-6 right-7 text-[7rem] font-semibold tracking-[-0.12em] text-white/[0.025] sm:text-[10rem]" aria-hidden="true">
          0{index}
        </div>
        <div className={`relative z-10 grid min-h-[600px] gap-10 lg:grid-cols-[0.92fr_1.08fr] lg:items-center ${reverse ? 'lg:[&>*:first-child]:order-2' : ''}`}>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-cyan-200">{eyebrow}</p>
            <h2 className="mt-5 max-w-2xl text-4xl font-semibold tracking-[-0.075em] text-white sm:text-5xl lg:text-6xl">
              {title}
            </h2>
            <p className="mt-5 max-w-xl text-base leading-7 text-slate-300 sm:text-lg sm:leading-8">{body}</p>
          </div>
          <div>{children}</div>
        </div>
      </div>
    </section>
  );
}

export function LandingPage({ isAuthenticated: _isAuthenticated = false }: LandingPageProps = {}) {
  return (
    <main className="min-h-[100dvh] w-full overflow-x-hidden bg-black text-white touch-manipulation">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-black/78 backdrop-blur-xl" data-testid="landing-header">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <a href="/" className="flex min-h-[44px] min-w-[44px] items-center gap-2 rounded-lg px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] border border-cyan-300/20 bg-cyan-300/10 text-[13px] font-semibold text-cyan-100">
              F
            </span>
            <span className="text-sm font-semibold tracking-[-0.03em] text-white">Foldera</span>
          </a>

          <nav className="hidden items-center gap-6 text-xs font-medium text-slate-300 sm:flex" aria-label="Landing navigation">
            <a href="#how-it-works" className="transition-colors hover:text-white">
              How it works
            </a>
            <a href="#trust" className="transition-colors hover:text-white">
              Trust boundary
            </a>
          </nav>

          <a
            href="/start"
            data-testid="landing-header-cta"
            className="inline-flex min-h-[40px] items-center rounded-[12px] border border-cyan-300/25 bg-cyan-300 px-3 text-xs font-semibold text-slate-950 shadow-[0_0_22px_rgba(34,211,238,0.18)] transition-colors hover:bg-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
          >
            Join pilot
          </a>
        </div>
      </header>

      <div className="relative overflow-hidden pb-8">
        <GlowField />

        <section className="relative mx-auto w-full max-w-6xl px-4 pb-8 pt-8 sm:px-6 lg:px-8" data-testid="landing-slide-1">
          <div className="relative min-h-[720px] overflow-hidden rounded-[46px] border border-cyan-300/15 bg-[radial-gradient(circle_at_16%_18%,rgba(34,211,238,0.18),transparent_36%),radial-gradient(circle_at_82%_24%,rgba(168,85,247,0.16),transparent_34%),linear-gradient(180deg,rgba(15,23,42,0.72),rgba(2,6,23,0.92))] p-6 shadow-[0_48px_180px_rgba(0,0,0,0.78)] sm:p-8 lg:p-10">
            <div className="pointer-events-none absolute -bottom-28 left-1/2 h-72 w-[120%] -translate-x-1/2 rounded-[100%] border border-cyan-300/10 bg-cyan-300/[0.03]" aria-hidden="true" />
            <div className="relative z-10 grid min-h-[640px] gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-cyan-200">Workday Presence Layer</p>
                <h1 className="mt-5 max-w-4xl text-5xl font-semibold tracking-[-0.085em] text-white sm:text-6xl lg:text-7xl">
                  Pick work back up without rebuilding the whole room.
                </h1>
                <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
                  Foldera keeps the state of work attached across apps, meetings, files, blockers, and approvals so the next move comes back ready to review.
                </p>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <a
                    href="/start"
                    aria-label="Join the pilot"
                    data-testid="landing-cta-1"
                    className="inline-flex min-h-[48px] items-center justify-center rounded-[14px] border border-cyan-300/25 bg-cyan-300 px-5 text-sm font-semibold text-slate-950 shadow-[0_0_30px_rgba(34,211,238,0.18)] transition-colors hover:bg-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                  >
                    Join the pilot
                  </a>
                  <a
                    href="#how-it-works"
                    className="inline-flex min-h-[48px] items-center justify-center rounded-[14px] border border-white/12 bg-white/[0.045] px-5 text-sm font-semibold text-slate-100 transition-colors hover:bg-white/[0.075] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                  >
                    See how it works
                  </a>
                </div>
                <p className="mt-5 max-w-lg text-xs leading-5 text-slate-500">
                  Pilot scope: recommendation flow only. Slack and Teams execution is not live yet.
                </p>
              </div>

              <div className="relative">
                <RightNowPanel />
              </div>
            </div>
          </div>
        </section>

        <PosterSection
          index={2}
          eyebrow="The reset"
          title="The work is not gone. It is scattered."
          body="Every app has one piece of the room. The message, meeting, file, blocker, and approval each know something, but none of them knows the next move."
        >
          <SignalOrbit />
        </PosterSection>

        <PosterSection
          index={3}
          eyebrow="The state"
          title="Foldera keeps the room assembled."
          body="Instead of making another pile, Foldera preserves the operating state: what matters, what changed, what is blocked, and what should happen next."
          reverse
        >
          <StateStack />
        </PosterSection>

        <PosterSection
          index={4}
          anchorId="how-it-works"
          eyebrow="The loop"
          title="State plus signals becomes one intervention."
          body="The product does not ask you to manage another dashboard. It waits until the work state is clear enough, then brings back one Right Now move."
        >
          <LoopPoster />
        </PosterSection>

        <PosterSection
          index={5}
          eyebrow="The surface"
          title="One card. Four safe responses. Then quiet."
          body="Done, Stuck, Break smaller, or Snooze updates the work state without pretending to send messages or operate live integrations for you."
          reverse
        >
          <RightNowPanel compact />
        </PosterSection>

        <section id="trust" className="relative mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8" data-testid="landing-slide-6">
          <div className="relative min-h-[640px] overflow-hidden rounded-[46px] border border-cyan-300/15 bg-[radial-gradient(circle_at_18%_16%,rgba(34,211,238,0.18),transparent_36%),radial-gradient(circle_at_84%_22%,rgba(168,85,247,0.16),transparent_34%),rgba(2,6,23,0.88)] p-6 shadow-[0_48px_180px_rgba(0,0,0,0.78)] sm:p-8 lg:p-10">
            <div className="relative z-10 grid min-h-[560px] gap-10 lg:grid-cols-[1fr_0.86fr] lg:items-center">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-cyan-200">Pilot trust boundary</p>
                <h2 className="mt-5 max-w-3xl text-4xl font-semibold tracking-[-0.075em] text-white sm:text-5xl lg:text-6xl">
                  Serious enough to be useful. Limited enough to be trusted.
                </h2>
                <p className="mt-5 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg sm:leading-8">
                  Foldera uses consented sources and explicit user state. Nothing is sent automatically. The pilot returns the right next move for review.
                </p>
                <a
                  href="/start"
                  aria-label="Join the pilot"
                  data-testid="landing-cta-6"
                  className="mt-8 inline-flex min-h-[48px] items-center justify-center rounded-[14px] border border-cyan-300/25 bg-cyan-300 px-5 text-sm font-semibold text-slate-950 shadow-[0_0_30px_rgba(34,211,238,0.18)] transition-colors hover:bg-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                >
                  Join the pilot
                </a>
              </div>
              <TrustPanel />
            </div>
          </div>
        </section>

        <footer className="relative mx-auto w-full max-w-6xl px-4 pb-4 sm:px-6 lg:px-8" data-testid="landing-footer">
          <div className="flex flex-col gap-3 border-t border-white/10 py-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
            <p>Foldera — Workday Presence Layer.</p>
            <p>Consented sources. Explicit state. Nothing sent automatically.</p>
          </div>
        </footer>
      </div>
    </main>
  );
}
