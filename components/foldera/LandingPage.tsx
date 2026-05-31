import Image from 'next/image';

const debugHitboxes = process.env.NEXT_PUBLIC_FOLDERA_DEBUG_HITBOXES === '1';

type StorySlide = {
  src: string;
  alt: string;
  width: number;
  height: number;
  eager?: boolean;
  cta?: { left: number; top: number; width: number; height: number };
};

const slides: StorySlide[] = [
  {
    src: '/landing/mobile-sections/01.jpg',
    alt: 'Foldera landing section showing scattered work context across apps and one ready next move.',
    width: 3072,
    height: 5460,
    eager: true,
    cta: { left: 19, top: 83.6, width: 62, height: 5.8 },
  },
  {
    src: '/landing/mobile-sections/02.jpg',
    alt: 'Foldera landing section explaining the cost of rebuilding context across work apps.',
    width: 3072,
    height: 5504,
  },
  {
    src: '/landing/mobile-sections/03.jpg',
    alt: 'Foldera landing section describing a presence layer that keeps work context attached.',
    width: 3072,
    height: 5504,
  },
  {
    src: '/landing/mobile-sections/04.jpg',
    alt: 'Foldera landing section contrasting noisy app pings with a single work state.',
    width: 3072,
    height: 5504,
  },
  {
    src: '/landing/mobile-sections/05.jpg',
    alt: 'Foldera landing section showing a Right Now work card in context.',
    width: 3072,
    height: 5504,
  },
  {
    src: '/landing/mobile-sections/06.jpg',
    alt: 'Foldera landing section showing the pilot call to action.',
    width: 3072,
    height: 5504,
    cta: { left: 14, top: 31.4, width: 72, height: 5.8 },
  },
];

const semanticSections = [
  {
    heading: 'You are a high-paid filing clerk.',
    body: 'You spend your day rebuilding context across fractured apps instead of doing the actual work.',
  },
  {
    heading: 'The problem is broken continuity.',
    body: 'Foldera is the ecosystem-neutral layer that remembers the workday across messages, meetings, files, and approvals.',
  },
  {
    heading: 'Stop checking nine apps. Foldera keeps track.',
    body: 'Foldera watches consented signals, remembers your focus, and calculates the state of your work.',
  },
  {
    heading: 'It lives where you work and stays quiet otherwise.',
    body: 'No new dashboard. Foldera interrupts only when there is a clean moment to act.',
  },
  {
    heading: 'Restore your continuity.',
    body: 'Foldera holds the context so the next move is ready where the work is already happening.',
  },
  {
    heading: 'One trusted answer. All the context. Next move ready.',
    body: 'Pilot scope: Slack and Teams execution, cross-app writeback, and automatic sending are not live in this pilot.',
  },
];

function PosterPanel({ slide, index }: { slide: StorySlide; index: number }) {
  return (
    <section className="relative w-full" data-testid={`landing-slide-${index + 1}`}>
      <div className="relative">
        <div className="pointer-events-none absolute -inset-x-3 inset-y-8 -z-10 rounded-[34px] bg-[radial-gradient(circle_at_50%_20%,rgba(109,40,217,0.12),transparent_55%),radial-gradient(circle_at_50%_80%,rgba(6,182,212,0.10),transparent_60%)] blur-sm" aria-hidden="true" />

        <div
          className="relative overflow-hidden bg-black md:rounded-[18px] md:border md:border-white/10 md:shadow-[0_26px_90px_rgba(0,0,0,0.65)]"
          data-testid="landing-slide-frame"
        >
          <div className="relative w-full bg-black" data-testid="landing-slide-aspect">
            <Image
              src={slide.src}
              alt={slide.alt}
              width={slide.width}
              height={slide.height}
              priority={Boolean(slide.eager)}
              loading={slide.eager ? 'eager' : 'lazy'}
              quality={95}
              sizes="(max-width: 767px) 100vw, 520px"
              className="block h-auto w-full select-none"
            />

            {slide.cta ? (
              <>
                <a
                  href="/start"
                  aria-label="Join the pilot"
                  data-testid={`landing-cta-${index + 1}`}
                  className="absolute z-20 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                  style={{
                    left: `${slide.cta.left}%`,
                    top: `${slide.cta.top}%`,
                    width: `${slide.cta.width}%`,
                    height: `${slide.cta.height}%`,
                  }}
                />
                {debugHitboxes ? (
                  <div
                    className="pointer-events-none absolute z-20 rounded-xl border-2 border-fuchsia-500 bg-fuchsia-500/15"
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
            Slide {index + 1} — {slide.width}×{slide.height}
          </div>
        ) : null}

        <div className="sr-only">
          <h2>{semanticSections[index]?.heading}</h2>
          <p>{semanticSections[index]?.body}</p>
        </div>
      </div>
    </section>
  );
}

export function LandingPage({ isAuthenticated: _isAuthenticated = false }: { isAuthenticated?: boolean } = {}) {
  return (
    <main className="min-h-[100dvh] w-full overflow-x-hidden bg-black text-white touch-manipulation">
      <h1 className="sr-only">Foldera — Workday Presence Layer</h1>
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
            data-testid="landing-header-cta"
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

        <div className="mx-auto w-full max-w-[430px] px-0 md:max-w-[520px]">
          <div className="flex flex-col gap-8 pb-8 pt-6 sm:gap-10 sm:pb-10 md:gap-12 md:pb-12 md:pt-8">
            {slides.map((slide, index) => (
              <PosterPanel key={slide.src} slide={slide} index={index} />
            ))}

            <section id="how-it-works" className="sr-only">
              <h2>How it works</h2>
              <ol>
                <li>Foldera checks connected sources.</li>
                <li>When the signal is strong, it prepares the next move.</li>
                <li>You approve, skip, or hold back safely.</li>
              </ol>
              <p>Pilot note: Slack/Teams execution, cross-app writeback, and automatic sending are not live in this pilot.</p>
            </section>

            <footer className="px-4 pb-6 md:px-0" data-testid="landing-footer">
              <div className="flex flex-col items-center justify-center gap-3 border-t border-white/10 pt-6 text-center text-[12px] leading-[1.6] text-slate-500">
                <p>Foldera — Workday Presence Layer.</p>
                <a
                  href="/start"
                  className="inline-flex min-h-[40px] items-center justify-center rounded-[12px] border border-cyan-300/25 px-4 text-[12px] font-semibold text-cyan-200 transition-colors hover:bg-cyan-300/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                >
                  Join the pilot
                </a>
              </div>
            </footer>
          </div>
        </div>
      </div>
    </main>
  );
}
