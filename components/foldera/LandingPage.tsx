import type { ReactNode } from 'react';

type LandingPageProps = {
  isAuthenticated?: boolean;
};

const workSignals = ['Message', 'Meeting', 'Draft', 'File', 'Blocker', 'Approval'];

const stateRows = [
  ['Current focus', 'Final review packet for the pilot owner'],
  ['Next move', 'Send the tightened approval summary'],
  ['Blocker', 'Waiting on one source update'],
  ['Waiting on', 'Riley — budget note'],
  ['Last completed', 'Route contract verified'],
];

const loopSteps = [
  {
    eyebrow: '1 / Remember state',
    title: 'Foldera keeps the work attached.',
    body: 'Current focus, next move, blocker, waiting-on, and last completed step stay together instead of disappearing across apps.',
  },
  {
    eyebrow: '2 / Watch consented signals',
    title: 'Connectors become evidence, not noise.',
    body: 'Messages, meetings, files, and approvals help update the work state. Foldera is not screen-reading or watching hidden activity.',
  },
  {
    eyebrow: '3 / Return one move',
    title: 'The output is one Right Now card.',
    body: 'When the signal is strong enough, Foldera interrupts with one reviewable next move and then stays quiet.',
  },
];

const trustBoundaries = [
  'No screen-reading.',
  'No hidden activity monitoring.',
  'No automatic sending in the pilot.',
  'No fake enterprise, SOC 2, or HIPAA claims.',
];

function RightNowCard() {
  return (
    <div
      className="relative overflow-hidden rounded-[28px] border border-cyan-300/20 bg-slate-950/88 p-5 shadow-[0_34px_140px_rgba(8,47,73,0.55)] backdrop-blur"
      data-testid="right-now-card"
    >
      <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-cyan-300/18 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-violet-500/16 blur-3xl" aria-hidden="true" />

      <div className="relative flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-200">Right Now</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-[-0.05em] text-white sm:text-3xl">
            Send the approval summary.
          </h2>
          <p className="mt-3 max-w-[30rem] text-sm leading-6 text-slate-300">
            The message, meeting note, and blocker line up. Review the prepared next move, then approve or hold it.
          </p>
        </div>
        <div className="hidden rounded-full border border-emerald-300/25 bg-emerald-300/10 px-3 py-1 text-[11px] font-semibold text-emerald-200 sm:block">
          Signal strong
        </div>
      </div>

      <dl className="relative mt-6 grid gap-2">
        {stateRows.map(([label, value]) => (
          <div key={label} className="grid gap-1 rounded-2xl border border-white/8 bg-white/[0.035] px-4 py-3 sm:grid-cols-[7.5rem_1fr] sm:gap-4">
            <dt className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</dt>
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

function SectionShell({
  index,
  eyebrow,
  title,
  body,
  children,
}: {
  index: number;
  eyebrow: string;
  title: string;
  body: string;
  children?: ReactNode;
}) {
  return (
    <section className="relative mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20" data-testid={`landing-slide-${index}`}>
      <div className="grid gap-8 lg:grid-cols-[0.82fr_1fr] lg:items-center">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-200">{eyebrow}</p>
          <h2 className="mt-4 text-3xl font-semibold tracking-[-0.06em] text-white sm:text-4xl">{title}</h2>
          <p className="mt-4 max-w-xl text-base leading-7 text-slate-300">{body}</p>
        </div>
        {children}
      </div>
    </section>
  );
}

export function LandingPage({ isAuthenticated: _isAuthenticated = false }: LandingPageProps = {}) {
  return (
    <main className="min-h-[100dvh] w-full overflow-x-hidden bg-black text-white touch-manipulation">
      <header
        className="sticky top-0 z-50 border-b border-white/10 bg-black/78 backdrop-blur-xl"
        data-testid="landing-header"
      >
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

      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="absolute left-1/2 top-[-12rem] h-[34rem] w-[34rem] -translate-x-1/2 rounded-full bg-cyan-400/12 blur-[140px]" />
          <div className="absolute -left-40 top-[22rem] h-[30rem] w-[30rem] rounded-full bg-violet-500/14 blur-[150px]" />
          <div className="absolute -right-44 top-[48rem] h-[34rem] w-[34rem] rounded-full bg-sky-500/10 blur-[160px]" />
        </div>

        <section className="relative mx-auto grid w-full max-w-6xl gap-10 px-4 pb-16 pt-16 sm:px-6 sm:pt-20 lg:grid-cols-[0.92fr_1fr] lg:items-center lg:px-8 lg:pb-24 lg:pt-24" data-testid="landing-slide-1">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-cyan-200">Workday Presence Layer</p>
            <h1 className="mt-5 max-w-4xl text-5xl font-semibold tracking-[-0.075em] text-white sm:text-6xl lg:text-7xl">
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
            <p className="mt-5 text-xs leading-5 text-slate-500">
              Pilot scope: recommendation flow only. Slack and Teams execution is not live yet.
            </p>
          </div>

          <div className="relative">
            <RightNowCard />
          </div>
        </section>

        <SectionShell
          index={2}
          eyebrow="The pain"
          title="Every tool switch forces a context rebuild."
          body="The work is not gone. It is scattered. The message is in one place, the meeting is in another, the blocker is half-remembered, and the next move gets buried."
        >
          <div className="rounded-[28px] border border-white/10 bg-white/[0.035] p-5 shadow-[0_26px_90px_rgba(0,0,0,0.48)]">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {workSignals.map((signal) => (
                <div key={signal} className="rounded-2xl border border-white/10 bg-black/40 p-4">
                  <div className="mb-5 h-2 w-2 rounded-full bg-cyan-300 shadow-[0_0_18px_rgba(34,211,238,0.55)]" />
                  <p className="text-sm font-semibold text-white">{signal}</p>
                  <p className="mt-2 text-xs leading-5 text-slate-500">Useful, but isolated.</p>
                </div>
              ))}
            </div>
          </div>
        </SectionShell>

        <SectionShell
          index={3}
          eyebrow="The shift"
          title="Foldera stores work state, not another pile of tasks."
          body="State is the thing that survives the interruption: current focus, next move, blocker, do-not-touch, waiting-on, and last completed step."
        >
          <div className="rounded-[28px] border border-cyan-300/15 bg-slate-950/80 p-5 shadow-[0_26px_100px_rgba(8,47,73,0.35)]">
            <div className="space-y-3">
              {stateRows.map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-white/8 bg-white/[0.04] p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-200/80">{label}</p>
                  <p className="mt-2 text-sm text-slate-100">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </SectionShell>

        <SectionShell
          index={4}
          eyebrow="The loop"
          title="State plus signals becomes one intervention."
          body="Foldera does not ask you to manage another dashboard. It turns approved work signals into one timely card, then updates state from your response."
        >
          <div id="how-it-works" className="grid gap-3">
            {loopSteps.map((step) => (
              <article key={step.eyebrow} className="rounded-[24px] border border-white/10 bg-white/[0.035] p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-200">{step.eyebrow}</p>
                <h3 className="mt-3 text-xl font-semibold tracking-[-0.04em] text-white">{step.title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-300">{step.body}</p>
              </article>
            ))}
          </div>
        </SectionShell>

        <SectionShell
          index={5}
          eyebrow="The product surface"
          title="One Right Now card. Four safe responses."
          body="The user stays in control. Foldera gives one move to review, and the response updates the work state without pretending to send messages or operate live integrations."
        >
          <RightNowCard />
        </SectionShell>

        <section id="trust" className="relative mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20" data-testid="landing-slide-6">
          <div className="grid gap-8 rounded-[32px] border border-cyan-300/15 bg-[radial-gradient(circle_at_20%_20%,rgba(34,211,238,0.16),transparent_42%),radial-gradient(circle_at_82%_30%,rgba(168,85,247,0.14),transparent_42%),rgba(15,23,42,0.72)] p-6 shadow-[0_38px_140px_rgba(0,0,0,0.62)] sm:p-8 lg:grid-cols-[1fr_0.8fr] lg:p-10">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-200">Pilot trust boundary</p>
              <h2 className="mt-4 text-3xl font-semibold tracking-[-0.06em] text-white sm:text-4xl">
                Serious enough to be useful. Limited enough to be trusted.
              </h2>
              <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">
                Foldera uses consented sources and explicit user state. Nothing is sent automatically. The current pilot is about returning the right next move for review.
              </p>
              <a
                href="/start"
                aria-label="Join the pilot"
                data-testid="landing-cta-6"
                className="mt-7 inline-flex min-h-[48px] items-center justify-center rounded-[14px] border border-cyan-300/25 bg-cyan-300 px-5 text-sm font-semibold text-slate-950 shadow-[0_0_30px_rgba(34,211,238,0.18)] transition-colors hover:bg-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
              >
                Join the pilot
              </a>
            </div>
            <div className="grid gap-3">
              {trustBoundaries.map((boundary) => (
                <div key={boundary} className="rounded-2xl border border-white/10 bg-black/35 p-4 text-sm font-semibold text-slate-100">
                  {boundary}
                </div>
              ))}
            </div>
          </div>
        </section>

        <footer className="relative mx-auto w-full max-w-6xl px-4 pb-8 sm:px-6 lg:px-8" data-testid="landing-footer">
          <div className="flex flex-col gap-3 border-t border-white/10 py-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
            <p>Foldera — Workday Presence Layer.</p>
            <p>No screen-reading. No surveillance. Nothing sent automatically.</p>
          </div>
        </footer>
      </div>
    </main>
  );
}
