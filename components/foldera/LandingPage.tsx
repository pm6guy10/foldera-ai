import Image from 'next/image';

const debugHitboxes = process.env.NEXT_PUBLIC_FOLDERA_DEBUG_HITBOXES === '1';

type StorySlide = {
  src: string;
  alt: string;
  width: number;
  height: number;
  eager?: boolean;
  cta?: { left: number; top: number; width: number; height: number };
  label: string;
  ordinal: string;
};

const slides: StorySlide[] = [
  {
    src: '/landing/mobile-sections/01.jpg',
    alt: 'Foldera landing section one showing the opening problem and pilot call to action.',
    width: 3072,
    height: 5460,
    eager: true,
    label: 'INSULT',
    ordinal: '01',
    cta: { left: 25, top: 62.5, width: 47, height: 7 },
  },
  {
    src: '/landing/mobile-sections/02.jpg',
    alt: 'Foldera landing section two showing the cost of rebuilding work context.',
    width: 3072,
    height: 5504,
    label: 'TAX',
    ordinal: '02',
  },
  {
    src: '/landing/mobile-sections/03.jpg',
    alt: 'Foldera landing section three showing work signals becoming one next move.',
    width: 3072,
    height: 5504,
    label: 'ENGINE',
    ordinal: '03',
  },
  {
    src: '/landing/mobile-sections/04.jpg',
    alt: 'Foldera landing section four showing focused workday intervention.',
    width: 3072,
    height: 5504,
    label: 'DISTINCT',
    ordinal: '04',
  },
  {
    src: '/landing/mobile-sections/05.jpg',
    alt: 'Foldera landing section five showing the product surface in the workday flow.',
    width: 3072,
    height: 5504,
    label: 'HABITAT',
    ordinal: '05',
  },
  {
    src: '/landing/mobile-sections/06.jpg',
    alt: 'Foldera landing section six showing the closing pilot call to action.',
    width: 3072,
    height: 5504,
    label: 'RELIEF',
    ordinal: '06',
    cta: { left: 12, top: 77.8, width: 75, height: 8.6 },
  },
];

const sourceSignals = [
  { name: 'Slack', detail: 'approval thread', accent: 'bg-fuchsia-400/90 shadow-fuchsia-400/30' },
  { name: 'Gmail', detail: 'vendor reply', accent: 'bg-rose-400/90 shadow-rose-400/30' },
  { name: 'Docs', detail: 'final draft', accent: 'bg-sky-400/90 shadow-sky-400/30' },
  { name: 'Calendar', detail: 'review window', accent: 'bg-emerald-400/90 shadow-emerald-400/30' },
];

const proofCards = [
  {
    title: 'Context rebuilt',
    body: 'Foldera keeps the thread, file, meeting, and blocker together.',
  },
  {
    title: 'One Right Now move',
    body: 'No dashboard dump. No inbox triage. One next intervention.',
  },
  {
    title: 'Approval stays yours',
    body: 'The pilot prepares the work. Nothing is sent without approval.',
  },
];

const steps = [
  ['01', 'Connect the places work collapses.'],
  ['02', 'Foldera watches for strong, consented signals.'],
  ['03', 'It hands back one ready-to-review move.'],
];

export function LandingPage({ isAuthenticated: _isAuthenticated = false }: { isAuthenticated?: boolean } = {}) {
  return (
    <main className="min-h-[100dvh] w-screen overflow-x-hidden bg-black text-white touch-manipulation">
      <h1 className="sr-only">Foldera — Workday Presence Layer</h1>
      <div className="sr-only">
        <p>Foldera hands back the work ready to review.</p>
        <p>Context attached: message, meeting, file, and blocker.</p>
        <p>Pilot scope: recommendation flow only.</p>
        <p>Nothing is sent without approval.</p>
        <p>Join the pilot</p>
      </div>

      <header className="sticky top-0 z-50 border-b border-white/10 bg-black/80 backdrop-blur-2xl" data-testid="landing-header">
        <div className="mx-auto flex h-14 w-full max-w-[1200px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <a href="/" className="flex min-h-[44px] min-w-[44px] items-center gap-2 rounded-lg px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">
            <span className="relative inline-flex h-8 w-8 items-center justify-center overflow-hidden rounded-[10px] border border-cyan-300/25 bg-white/[0.04] text-[13px] font-black shadow-[0_0_28px_rgba(34,211,238,0.18)]">
              <span className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(34,211,238,0.35),transparent_45%),radial-gradient(circle_at_70%_80%,rgba(168,85,247,0.28),transparent_50%)]" />
              <span className="relative">F</span>
            </span>
            <span className="text-[14px] font-semibold tracking-[-0.03em] text-white">Foldera</span>
          </a>

          <nav className="hidden items-center gap-6 text-[12px] font-medium text-slate-300 sm:flex" aria-label="Landing navigation">
            <a href="#how-it-works" className="transition-colors hover:text-white">How it works</a>
            <a href="#visual-proof" className="transition-colors hover:text-white">Proof</a>
          </nav>

          <a href="/start" className="inline-flex min-h-[38px] items-center rounded-[10px] border border-cyan-300/25 bg-cyan-300 px-3 text-[12px] font-semibold text-slate-950 shadow-[0_0_24px_rgba(34,211,238,0.22)] transition-colors hover:bg-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">
            Join pilot
          </a>
        </div>
      </header>

      <section className="relative overflow-hidden px-4 pb-14 pt-10 sm:px-6 sm:pb-20 md:pt-16 lg:px-8" data-testid="landing-visual-hero">
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="absolute left-1/2 top-[-18rem] h-[36rem] w-[36rem] -translate-x-1/2 rounded-full bg-cyan-400/10 blur-[120px]" />
          <div className="absolute -left-24 top-32 h-[28rem] w-[28rem] rounded-full bg-violet-500/15 blur-[140px]" />
          <div className="absolute -right-32 top-44 h-[30rem] w-[30rem] rounded-full bg-sky-500/10 blur-[130px]" />
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/30 to-transparent" />
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:radial-gradient(circle_at_50%_20%,black,transparent_72%)]" />
        </div>

        <div className="relative mx-auto grid w-full max-w-[1180px] gap-10 lg:grid-cols-[0.92fr_1.08fr] lg:items-center">
          <div className="max-w-[650px]">
            <p className="mb-5 inline-flex rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-200">
              Workday Presence Layer
            </p>
            <h2 className="max-w-[760px] text-[clamp(3.4rem,13vw,7.25rem)] font-black uppercase leading-[0.78] tracking-[-0.08em] text-white">
              Foldera hands back the work.
            </h2>
            <p className="mt-6 max-w-[560px] text-[16px] leading-[1.65] text-slate-300 sm:text-[18px]">
              It rebuilds the context across messages, meetings, and files, then gives you one Right Now move ready to review.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <a href="/start" className="inline-flex min-h-[52px] items-center justify-center rounded-[14px] border border-cyan-200/30 bg-cyan-300 px-6 text-[14px] font-black uppercase tracking-[0.08em] text-slate-950 shadow-[0_0_42px_rgba(34,211,238,0.26)] transition hover:bg-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">
                Join the pilot →
              </a>
              <a href="#visual-proof" className="inline-flex min-h-[52px] items-center justify-center rounded-[14px] border border-white/10 bg-white/[0.04] px-6 text-[14px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition hover:bg-white/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">
                See the flow
              </a>
            </div>
            <p className="mt-4 text-[12px] leading-[1.6] text-slate-500">
              Pilot note: Slack/Teams execution and cross-app writeback are not live in this pilot.
            </p>
          </div>

          <div className="relative mx-auto w-full max-w-[620px] lg:max-w-none" aria-label="Foldera product visual">
            <div className="absolute -inset-8 rounded-[44px] bg-[radial-gradient(circle_at_25%_20%,rgba(34,211,238,0.22),transparent_34%),radial-gradient(circle_at_75%_80%,rgba(168,85,247,0.18),transparent_40%)] blur-2xl" aria-hidden="true" />
            <div className="relative overflow-hidden rounded-[30px] border border-white/10 bg-slate-950/72 p-4 shadow-[0_42px_160px_rgba(0,0,0,0.76),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-2xl">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(34,211,238,0.14),transparent_40%)]" aria-hidden="true" />
              <div className="relative grid gap-3 sm:grid-cols-[0.86fr_0.18fr_1fr] sm:items-center">
                <div className="rounded-[22px] border border-white/10 bg-black/50 p-3">
                  <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Signals</p>
                  <div className="grid gap-2">
                    {sourceSignals.map((signal) => (
                      <div key={signal.name} className="flex items-center gap-3 rounded-[14px] border border-white/10 bg-white/[0.04] p-3">
                        <span className={`h-8 w-8 rounded-xl shadow-lg ${signal.accent}`} />
                        <span>
                          <span className="block text-[12px] font-semibold text-white">{signal.name}</span>
                          <span className="block text-[11px] text-slate-500">{signal.detail}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="hidden justify-center sm:flex" aria-hidden="true">
                  <div className="relative h-[220px] w-8 rounded-full border border-cyan-200/20 bg-cyan-200/10 shadow-[0_0_44px_rgba(34,211,238,0.22)]">
                    <div className="absolute inset-x-1 top-5 h-16 rounded-full bg-cyan-200/30 blur-md" />
                    <div className="absolute inset-x-1 bottom-5 h-16 rounded-full bg-violet-300/30 blur-md" />
                  </div>
                </div>

                <div className="rounded-[24px] border border-cyan-300/20 bg-black/70 p-4 shadow-[0_0_60px_rgba(34,211,238,0.16),inset_0_1px_0_rgba(255,255,255,0.08)]">
                  <div className="mb-4 flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-200">Right Now</span>
                    <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2 py-1 text-[10px] font-semibold text-emerald-200">Ready</span>
                  </div>
                  <h3 className="text-[25px] font-black leading-[0.95] tracking-[-0.05em] text-white">
                    Launch approval is ready for sign-off.
                  </h3>
                  <div className="mt-5 grid gap-2 text-[12px] text-slate-300">
                    <div className="rounded-[14px] border border-white/10 bg-white/[0.04] p-3">Draft attached</div>
                    <div className="rounded-[14px] border border-white/10 bg-white/[0.04] p-3">Approver thread attached</div>
                    <div className="rounded-[14px] border border-white/10 bg-white/[0.04] p-3">Deadline window attached</div>
                  </div>
                  <div className="mt-5 rounded-[16px] border border-cyan-300/25 bg-cyan-300 px-4 py-3 text-center text-[12px] font-black uppercase tracking-[0.12em] text-slate-950 shadow-[0_0_36px_rgba(34,211,238,0.28)]">
                    Review & sign off
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="relative border-y border-white/10 bg-white/[0.025] px-4 py-8 sm:px-6 lg:px-8" data-testid="landing-proof-strip">
        <div className="mx-auto grid w-full max-w-[1180px] gap-3 md:grid-cols-3">
          {proofCards.map((card) => (
            <div key={card.title} className="rounded-[22px] border border-white/10 bg-black/45 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
              <h3 className="text-[15px] font-bold text-white">{card.title}</h3>
              <p className="mt-2 text-[13px] leading-[1.55] text-slate-400">{card.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="how-it-works" className="relative px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-[920px]">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-200">How it works</p>
          <h2 className="mt-3 text-[clamp(2.5rem,10vw,5.5rem)] font-black uppercase leading-[0.84] tracking-[-0.075em] text-white">
            Stop checking nine apps.
          </h2>
          <div className="mt-8 grid gap-3 md:grid-cols-3">
            {steps.map(([number, text]) => (
              <div key={number} className="rounded-[24px] border border-white/10 bg-white/[0.035] p-5">
                <p className="text-[11px] font-black tracking-[0.16em] text-cyan-200">{number}</p>
                <p className="mt-4 text-[16px] font-semibold leading-[1.35] text-white">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div id="visual-proof" className="relative px-0 pb-14 sm:px-4 lg:px-8">
        <div className="mx-auto w-full max-w-[760px]">
          <div className="px-4 pb-5 sm:px-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Visual flow</p>
            <h2 className="mt-2 text-[28px] font-black uppercase leading-[0.9] tracking-[-0.06em] text-white sm:text-[42px]">
              The full pitch, tightened.
            </h2>
          </div>

          <div className="flex flex-col gap-5 sm:gap-6 md:gap-9">
            {slides.map((slide, index) => (
              <section key={slide.src} className="relative w-full" data-testid={`landing-slide-${index + 1}`}>
                <div className="relative">
                  <div className="mb-3 hidden items-center justify-between px-1 sm:flex" aria-hidden="true">
                    <div className="text-[11px] font-semibold tracking-[0.14em] text-slate-500">{slide.label}</div>
                    <div className="text-[11px] font-semibold tracking-[0.14em] text-slate-600">{slide.ordinal}</div>
                  </div>

                  <div className="relative overflow-hidden bg-black sm:rounded-[24px] sm:border sm:border-white/10 sm:shadow-[0_26px_90px_rgba(0,0,0,0.65)]" data-testid="landing-slide-frame">
                    <div className="relative w-full overflow-hidden bg-black" style={{ aspectRatio: `${slide.width} / ${slide.height}` }} data-testid="landing-slide-aspect">
                      <Image
                        src={slide.src}
                        alt={slide.alt}
                        fill
                        priority={Boolean(slide.eager)}
                        loading={slide.eager ? 'eager' : 'lazy'}
                        quality={95}
                        sizes="(max-width: 767px) 100vw, 760px"
                        className="select-none object-contain"
                      />

                      {slide.cta ? (
                        <>
                          <a
                            href="/start"
                            aria-label="Join the pilot"
                            data-testid={`landing-cta-${index + 1}`}
                            className="absolute z-10 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                            style={{
                              left: `${slide.cta.left}%`,
                              top: `${slide.cta.top}%`,
                              width: `${slide.cta.width}%`,
                              height: `${slide.cta.height}%`,
                            }}
                          />
                          {debugHitboxes ? (
                            <div
                              className="pointer-events-none absolute z-10 rounded-md border-2 border-fuchsia-500 bg-fuchsia-500/15"
                              style={{
                                left: `${slide.cta.left}%`,
                                top: `${slide.cta.top}%`,
                                width: `${slide.cta.width}%`,
                                height: `${slide.cta.height}%`,
                              }}
                            />
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  </div>

                  {debugHitboxes ? (
                    <div className="mt-2 text-center text-[11px] text-slate-500" aria-hidden="true">
                      Slide {index + 1} — {slide.width}×{slide.height}
                    </div>
                  ) : null}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>

      <footer className="px-4 pb-8 sm:px-6 lg:px-8" data-testid="landing-footer">
        <div className="mx-auto max-w-[920px] rounded-[28px] border border-cyan-300/15 bg-[radial-gradient(circle_at_30%_30%,rgba(34,211,238,0.20),transparent_55%),radial-gradient(circle_at_70%_60%,rgba(168,85,247,0.16),transparent_55%)] p-7 text-center shadow-[0_30px_120px_rgba(0,0,0,0.65)]">
          <p className="text-[22px] font-black uppercase tracking-[-0.04em] text-white">Join the pilot</p>
          <p className="mx-auto mt-2 max-w-[520px] text-[14px] leading-[1.6] text-slate-300">
            Foldera keeps your place and hands back one Right Now move when it matters.
          </p>
          <a href="/start" className="mt-5 inline-flex min-h-[48px] items-center justify-center rounded-[14px] border border-cyan-300/25 bg-cyan-300 px-6 text-[13px] font-black uppercase tracking-[0.10em] text-slate-950 shadow-[0_0_34px_rgba(34,211,238,0.22)] transition-colors hover:bg-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">
            Join pilot
          </a>
        </div>
      </footer>
    </main>
  );
}
