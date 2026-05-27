import Image from 'next/image';

const debugHitboxes = process.env.NEXT_PUBLIC_FOLDERA_DEBUG_HITBOXES === '1';

type StorySlide = {
  src: string;
  alt: string;
  width: number;
  height: number;
  eager?: boolean;
  cta?: { left: number; top: number; width: number; height: number };
  label?: string;
  ordinal?: string;
};

const slides: StorySlide[] = [
  {
    src: '/landing/mobile-sections/01.jpg',
    alt: '',
    width: 3072,
    height: 5460,
    eager: true,
    label: 'INSULT',
    ordinal: '01',
    cta: { left: 25, top: 62.5, width: 47, height: 7 },
  },
  {
    src: '/landing/mobile-sections/02.jpg',
    alt: '',
    width: 3072,
    height: 5504,
    label: 'TAX',
    ordinal: '02',
  },
  {
    src: '/landing/mobile-sections/03.jpg',
    alt: '',
    width: 3072,
    height: 5504,
    label: 'ENGINE',
    ordinal: '03',
  },
  {
    src: '/landing/mobile-sections/04.jpg',
    alt: '',
    width: 3072,
    height: 5504,
    label: 'DISTINCT',
    ordinal: '04',
  },
  {
    src: '/landing/mobile-sections/05.jpg',
    alt: '',
    width: 3072,
    height: 5504,
    label: 'HABITAT',
    ordinal: '05',
  },
  {
    src: '/landing/mobile-sections/06.jpg',
    alt: '',
    width: 3072,
    height: 5504,
    label: 'KILL',
    ordinal: '06',
    cta: { left: 12, top: 77.8, width: 75, height: 8.6 },
  },
];

export function LandingPage({ isAuthenticated: _isAuthenticated = false }: { isAuthenticated?: boolean } = {}) {
  return (
    <main className="min-h-[100dvh] w-screen overflow-x-hidden bg-black text-white touch-manipulation">
      <h1 className="sr-only">Foldera â€” Workday Presence Layer</h1>
      <div className="sr-only">
        <p>Stop rebuilding the work. Foldera hands it back ready.</p>
        <p>Context attached: message + meeting + file + blocker</p>
        <p>Pilot scope: recommendation flow only; Slack and Teams execution is not live yet.</p>
        <p>No automatic cross-app writeback or auto-send in the current pilot.</p>
        <p>See Foldera in action</p>
        <p>Join the pilot</p>
      </div>

      <header
        className="sticky top-0 z-50 border-b border-white/10 bg-black/75 backdrop-blur-xl"
        data-testid="landing-header"
      >
        <div className="mx-auto flex h-14 w-full max-w-[1200px] items-center justify-between gap-4 px-4 sm:px-6">
          <a href="/" className="flex min-h-[44px] min-w-[44px] items-center gap-2 rounded-lg px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] border border-white/10 bg-white/[0.04] text-[13px] font-semibold">
              F
            </span>
            <span className="text-[14px] font-semibold tracking-[-0.03em] text-white">Foldera</span>
          </a>

          <nav className="hidden items-center gap-6 text-[12px] font-medium text-slate-300 sm:flex" aria-label="Landing navigation">
            <a href="#how-it-works" className="transition-colors hover:text-white">
              How it works
            </a>
          </nav>

          <a
            href="/start"
            className="inline-flex min-h-[38px] items-center rounded-[10px] border border-cyan-300/25 bg-cyan-300 px-3 text-[12px] font-semibold text-slate-950 shadow-[0_0_18px_rgba(34,211,238,0.16)] transition-colors hover:bg-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
          >
            Join pilot
          </a>
        </div>
      </header>

      <div className="relative">
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          <div className="absolute -left-[40%] top-[-20%] h-[520px] w-[520px] rounded-full bg-violet-500/14 blur-[140px]" />
          <div className="absolute -right-[40%] top-[10%] h-[560px] w-[560px] rounded-full bg-cyan-500/10 blur-[160px]" />
          <div className="absolute left-1/2 top-[30%] h-[700px] w-[700px] -translate-x-1/2 rounded-full bg-sky-500/8 blur-[170px]" />
        </div>

        <div className="mx-auto w-full max-w-none px-0 md:max-w-[520px] md:px-0">
          <div className="flex flex-col gap-10 pb-12 pt-8 sm:gap-12 sm:pb-14 md:gap-16 md:pb-16 md:pt-12 lg:gap-20 lg:pb-20">
            {slides.map((slide, index) => (
              <section key={slide.src} className="relative w-full px-0 md:px-0" data-testid={`landing-slide-${index + 1}`}>
                <div className="relative">
                  <div className="pointer-events-none absolute -inset-6 -z-10 rounded-[28px] bg-[radial-gradient(circle_at_50%_20%,rgba(109,40,217,0.10),transparent_55%),radial-gradient(circle_at_50%_80%,rgba(6,182,212,0.08),transparent_60%)]" aria-hidden="true" />

                  <div className="mb-3 hidden items-center justify-between px-1 md:flex" aria-hidden="true">
                    <div className="text-[11px] font-semibold tracking-[0.14em] text-slate-500">{slide.label}</div>
                    <div className="text-[11px] font-semibold tracking-[0.14em] text-slate-600">{slide.ordinal}</div>
                  </div>

                  <div
                    className="relative overflow-hidden bg-black md:rounded-[18px] md:border md:border-white/10 md:shadow-[0_26px_90px_rgba(0,0,0,0.65)]"
                    data-testid="landing-slide-frame"
                  >
                    <div
                      className="relative w-full overflow-hidden bg-black"
                      style={{ aspectRatio: `${slide.width} / ${slide.height}` }}
                      data-testid="landing-slide-aspect"
                    >
                      <Image
                        src={slide.src}
                        alt={slide.alt}
                        fill
                        priority={Boolean(slide.eager)}
                        loading={slide.eager ? 'eager' : 'lazy'}
                        quality={95}
                        sizes="(max-width: 767px) 100vw, 520px"
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

                  <div className="mt-3 flex items-center justify-center md:mt-5" aria-hidden="true">
                    <div className="h-px w-full bg-gradient-to-r from-transparent via-white/5 to-transparent md:via-white/10" />
                  </div>

                  {debugHitboxes ? (
                    <div className="mt-2 text-center text-[11px] text-slate-500" aria-hidden="true">
                      Slide {index + 1} â€” {slide.width}Ã—{slide.height}
                    </div>
                  ) : null}
                </div>
              </section>
            ))}

            <section id="how-it-works" className="px-4 md:px-0">
              <div className="rounded-[18px] border border-white/10 bg-white/[0.03] p-5 text-slate-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                <h2 className="text-[13px] font-semibold text-white">How it works</h2>
                <ol className="mt-3 grid gap-3 text-[13px] leading-[1.55] text-slate-300">
                  <li>
                    <span className="font-semibold text-slate-200">1.</span> Foldera checks connected sources.
                  </li>
                  <li>
                    <span className="font-semibold text-slate-200">2.</span> When the signal is strong, it prepares the next move.
                  </li>
                  <li>
                    <span className="font-semibold text-slate-200">3.</span> You approve, skip, or hold back safely.
                  </li>
                </ol>
                <p className="mt-3 text-[12px] leading-[1.55] text-slate-400">
                  Pilot note: Slack/Teams execution, cross-app writeback, and automatic sending are not live in this pilot.
                </p>
              </div>
            </section>

            <footer className="px-4 pb-6 md:px-0" data-testid="landing-footer">
              <div className="rounded-[18px] border border-cyan-300/15 bg-[radial-gradient(circle_at_30%_30%,rgba(34,211,238,0.18),transparent_55%),radial-gradient(circle_at_70%_60%,rgba(168,85,247,0.12),transparent_55%)] p-6 text-center shadow-[0_30px_120px_rgba(0,0,0,0.65)]">
                <p className="text-[13px] font-semibold text-white">Join the pilot</p>
                <p className="mt-2 text-[13px] leading-[1.6] text-slate-300">
                  Foldera keeps your place and hands back one Right Now move when it matters.
                </p>
                <a
                  href="/start"
                  className="mt-5 inline-flex min-h-[44px] items-center justify-center rounded-[12px] border border-cyan-300/25 bg-cyan-300 px-5 text-[13px] font-semibold text-slate-950 shadow-[0_0_26px_rgba(34,211,238,0.18)] transition-colors hover:bg-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                >
                  Join pilot
                </a>
              </div>
            </footer>
          </div>
        </div>
      </div>
    </main>
  );
}
