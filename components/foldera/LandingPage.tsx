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

function sectionIdFor(index: number) {
  if (index === 0) return 'top';
  if (index === 2) return 'how-it-works';
  if (index === 5) return 'join-pilot';
  return undefined;
}

function MobileMenu() {
  return (
    <details className="relative sm:hidden">
      <summary className="flex min-h-[38px] min-w-[38px] cursor-pointer list-none items-center justify-center rounded-[10px] border border-white/10 bg-white/[0.04] text-slate-100 transition-colors hover:bg-white/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 [&::-webkit-details-marker]:hidden">
        <span className="sr-only">Open landing navigation</span>
        <span className="grid gap-1.5" aria-hidden="true">
          <span className="block h-px w-4 bg-slate-100" />
          <span className="block h-px w-4 bg-slate-100" />
          <span className="block h-px w-4 bg-slate-100" />
        </span>
      </summary>
      <div className="absolute right-0 top-12 z-50 grid min-w-[180px] overflow-hidden rounded-2xl border border-white/10 bg-black/95 p-2 text-sm font-semibold text-slate-200 shadow-[0_24px_80px_rgba(0,0,0,0.65)] backdrop-blur-xl">
        <a className="rounded-xl px-3 py-2 transition-colors hover:bg-white/[0.06] hover:text-white" href="#top">
          Top
        </a>
        <a className="rounded-xl px-3 py-2 transition-colors hover:bg-white/[0.06] hover:text-white" href="#how-it-works">
          How it works
        </a>
        <a className="rounded-xl px-3 py-2 transition-colors hover:bg-white/[0.06] hover:text-white" href="/start">
          Join pilot
        </a>
      </div>
    </details>
  );
}

function PosterPanel({ slide, index }: { slide: StorySlide; index: number }) {
  return (
    <section id={sectionIdFor(index)} className="relative w-full scroll-mt-16" data-testid={`landing-slide-${index + 1}`}>
      <div className="relative w-full bg-black" data-testid="landing-slide-frame">
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

        {debugHitboxes ? (
          <div className="absolute bottom-2 left-2 z-30 rounded bg-black/70 px-2 py-1 text-[11px] text-slate-300" aria-hidden="true">
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
        <div className="mx-auto flex h-14 w-full max-w-[1200px] items-center justify-between gap-3 px-4 sm:px-6">
          <a href="/" className="flex min-h-[44px] min-w-[44px] items-center gap-2 rounded-lg px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] border border-white/10 bg-white/[0.04] text-[13px] font-semibold">
              F
            </span>
            <span className="text-[14px] font-semibold tracking-[-0.03em] text-white">Foldera</span>
          </a>

          <div className="flex items-center gap-2 sm:gap-5">
            <nav className="hidden items-center gap-6 text-[12px] font-medium text-slate-300 sm:flex" aria-label="Landing navigation">
              <a href="#how-it-works" className="rounded-lg px-1 py-2 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">
                How it works
              </a>
            </nav>
            <MobileMenu />
            <a
              href="/start"
              data-testid="landing-header-cta"
              className="inline-flex min-h-[38px] items-center rounded-[10px] border border-cyan-300/25 bg-cyan-300 px-3 text-[12px] font-semibold text-slate-950 shadow-[0_0_18px_rgba(34,211,238,0.16)] transition-colors hover:bg-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
            >
              Join pilot
            </a>
          </div>
        </div>
      </header>

      <div className="relative">
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          <div className="absolute -left-[40%] top-[-20%] h-[520px] w-[520px] rounded-full bg-violet-500/14 blur-[140px]" />
          <div className="absolute -right-[40%] top-[10%] h-[560px] w-[560px] rounded-full bg-cyan-500/10 blur-[160px]" />
          <div className="absolute left-1/2 top-[30%] h-[700px] w-[700px] -translate-x-1/2 rounded-full bg-sky-500/8 blur-[170px]" />
        </div>

        <div className="mx-auto w-full max-w-[430px] bg-black md:max-w-[520px] md:shadow-[0_0_120px_rgba(8,47,73,0.28)]">
          <div className="flex flex-col gap-0 pb-0 pt-0">
            {slides.map((slide, index) => (
              <PosterPanel key={slide.src} slide={slide} index={index} />
            ))}

            <footer className="sr-only" data-testid="landing-footer">
              <p>Foldera — Workday Presence Layer.</p>
              <a href="/start">Join the pilot</a>
            </footer>
          </div>
        </div>
      </div>
    </main>
  );
}
