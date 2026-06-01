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
  ['Stop rebuilding the work.', 'Foldera keeps work state attached so the next move comes back ready.'],
  ['Context collapse is the real tax.', 'The pain is rebuilding work state across messages, meetings, files, blockers, and approvals.'],
  ['A Workday Presence Layer.', 'Foldera maintains state across consented sources, useful triggers, and one timely intervention.'],
  ['Quiet until useful.', 'Foldera stays out of the way unless there is a safe, specific next move to review.'],
  ['One Right Now move.', 'No task dump, inbox summary, or chatbot hunt. One prepared action when context is strong enough.'],
  ['Join the pilot.', 'The pilot is bounded: review prepared moves, keep control, and approve the next step yourself.'],
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
      <summary className="flex min-h-[40px] min-w-[40px] cursor-pointer list-none items-center justify-center rounded-[12px] border border-white/12 bg-white/[0.055] text-slate-100 shadow-[0_0_18px_rgba(15,23,42,0.35)] transition-colors hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 [&::-webkit-details-marker]:hidden">
        <span className="sr-only">Open landing navigation</span>
        <span className="grid gap-1.5" aria-hidden="true">
          <span className="block h-px w-4 bg-slate-100" />
          <span className="block h-px w-4 bg-slate-100" />
          <span className="block h-px w-4 bg-slate-100" />
        </span>
      </summary>
      <div className="absolute right-0 top-12 z-50 grid min-w-[190px] overflow-hidden rounded-2xl border border-white/12 bg-black/95 p-2 text-sm font-semibold text-slate-200 shadow-[0_24px_80px_rgba(0,0,0,0.65)] backdrop-blur-xl">
        <a className="rounded-xl px-3 py-2 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300" href="#top">Top</a>
        <a className="rounded-xl px-3 py-2 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300" href="#how-it-works">How it works</a>
        <a className="rounded-xl px-3 py-2 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300" href="#trust-boundary">Trust boundary</a>
        <a className="rounded-xl bg-cyan-300 px-3 py-2 text-slate-950 transition-colors hover:bg-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300" href="/start">Join pilot</a>
      </div>
    </details>
  );
}

function VisiblePosterCta({ slide, index }: { slide: StorySlide; index: number }) {
  if (!slide.cta) return null;

  return (
    <>
      <a
        href="/start"
        aria-label="Join the pilot"
        data-testid={`landing-cta-${index + 1}`}
        className="absolute z-30 flex items-center justify-center rounded-full border border-cyan-200/40 bg-cyan-300 px-4 text-center text-[clamp(0.72rem,2.8vw,0.98rem)] font-black uppercase tracking-[0.12em] text-slate-950 shadow-[0_0_28px_rgba(34,211,238,0.44),0_14px_36px_rgba(0,0,0,0.42)] transition-transform hover:-translate-y-0.5 hover:bg-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-100 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
        style={{ left: `${slide.cta.left}%`, top: `${slide.cta.top}%`, width: `${slide.cta.width}%`, minHeight: `${slide.cta.height}%` }}
      >
        Join pilot
      </a>
      {debugHitboxes ? (
        <div
          className="pointer-events-none absolute z-40 rounded-full border-2 border-fuchsia-500 bg-fuchsia-500/15"
          style={{ left: `${slide.cta.left}%`, top: `${slide.cta.top}%`, width: `${slide.cta.width}%`, minHeight: `${slide.cta.height}%` }}
        />
      ) : null}
    </>
  );
}

function PosterPanel({ slide, index }: { slide: StorySlide; index: number }) {
  const [heading, body] = semanticSections[index] ?? [];

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
          <VisiblePosterCta slide={slide} index={index} />
        </div>
        <div className="sr-only">
          <h2>{heading}</h2>
          <p>{body}</p>
        </div>
      </div>
    </section>
  );
}

function TrustBoundary() {
  return (
    <section id="trust-boundary" className="relative mx-auto w-full max-w-[520px] px-4 py-8" aria-labelledby="trust-boundary-heading">
      <div className="rounded-[28px] border border-cyan-300/18 bg-[radial-gradient(circle_at_30%_20%,rgba(34,211,238,0.14),transparent_42%),radial-gradient(circle_at_70%_80%,rgba(168,85,247,0.13),transparent_45%),rgba(2,6,23,0.92)] p-6 shadow-[0_28px_110px_rgba(0,0,0,0.62)]">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-200">Pilot boundary</p>
        <h2 id="trust-boundary-heading" className="mt-3 text-2xl font-semibold tracking-[-0.06em] text-white">Serious enough to try. Honest about what is live.</h2>
        <div className="mt-5 grid gap-3 text-sm leading-6 text-slate-300">
          <p>Foldera keeps work state attached across consented sources and prepares one next move when the signal is strong enough.</p>
          <p>You stay in control: review the prepared move, approve it, skip it, or hold it.</p>
        </div>
        <a
          href="/start"
          data-testid="landing-final-cta"
          className="mt-6 inline-flex min-h-[48px] w-full items-center justify-center rounded-2xl border border-cyan-200/40 bg-cyan-300 px-5 text-sm font-black uppercase tracking-[0.14em] text-slate-950 shadow-[0_0_34px_rgba(34,211,238,0.34)] transition-colors hover:bg-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-100"
        >
          Join pilot
        </a>
      </div>
    </section>
  );
}

export function LandingPage({ isAuthenticated: _isAuthenticated = false }: { isAuthenticated?: boolean } = {}) {
  return (
    <main className="min-h-[100dvh] w-full overflow-x-hidden bg-black text-white touch-manipulation">
      <h1 className="sr-only">Foldera — Workday Presence Layer</h1>
      <div className="sr-only">
        <p>Stop rebuilding the work. Foldera keeps work state attached and hands back one next move when it matters.</p>
        <p>Context attached: message plus meeting plus file plus blocker.</p>
        <p>Join the pilot.</p>
      </div>

      <header className="sticky top-0 z-50 border-b border-white/10 bg-black/78 backdrop-blur-xl" data-testid="landing-header">
        <div className="mx-auto flex h-14 w-full max-w-[1200px] items-center justify-between gap-3 px-4 sm:px-6">
          <a href="/" className="flex min-h-[44px] min-w-[44px] items-center gap-2 rounded-lg px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] border border-cyan-300/20 bg-cyan-300/10 text-[13px] font-semibold text-cyan-100">F</span>
            <span className="text-[14px] font-semibold tracking-[-0.03em] text-white">Foldera</span>
          </a>

          <div className="flex items-center gap-2 sm:gap-5">
            <nav className="hidden items-center gap-6 text-[12px] font-medium text-slate-300 sm:flex" aria-label="Landing navigation">
              <a href="#how-it-works" className="rounded-lg px-1 py-2 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">How it works</a>
              <a href="#trust-boundary" className="rounded-lg px-1 py-2 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">Trust boundary</a>
            </nav>
            <MobileMenu />
            <a href="/start" data-testid="landing-header-cta" className="inline-flex min-h-[40px] items-center rounded-[12px] border border-cyan-200/40 bg-cyan-300 px-3 text-[12px] font-black uppercase tracking-[0.12em] text-slate-950 shadow-[0_0_22px_rgba(34,211,238,0.22)] transition-colors hover:bg-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">Join pilot</a>
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
            {slides.map((slide, index) => <PosterPanel key={slide.src} slide={slide} index={index} />)}
            <footer data-testid="landing-footer"><TrustBoundary /></footer>
          </div>
        </div>
      </div>
    </main>
  );
}
