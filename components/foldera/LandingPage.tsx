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
  footer: string;
};

const slides: StorySlide[] = [
  {
    src: '/landing/mobile-sections/01.jpg',
    alt: 'Foldera campaign panel showing fractured app context turning into one approved contract next move.',
    width: 3072,
    height: 5460,
    eager: true,
    label: 'INSULT',
    ordinal: '01',
    footer: 'THE INSULT',
    cta: { left: 25, top: 62.5, width: 47, height: 7 },
  },
  {
    src: '/landing/mobile-sections/02.jpg',
    alt: 'Foldera campaign panel showing the reconstruction tax across Slack, Gmail, Docs, Calendar, and approval tools.',
    width: 3072,
    height: 5504,
    label: 'TAX',
    ordinal: '02',
    footer: 'THE TAX',
  },
  {
    src: '/landing/mobile-sections/03.jpg',
    alt: 'Foldera campaign panel explaining broken continuity and the Foldera Presence Layer.',
    width: 3072,
    height: 5504,
    label: 'ENGINE',
    ordinal: '03',
    footer: 'THE PRESENCE LAYER',
  },
  {
    src: '/landing/mobile-sections/04.jpg',
    alt: 'Foldera campaign panel comparing noisy pings with one clean work state.',
    width: 3072,
    height: 5504,
    label: 'DISTINCT',
    ordinal: '04',
    footer: 'THE DISTINCTIVE',
  },
  {
    src: '/landing/mobile-sections/05.jpg',
    alt: 'Foldera campaign panel showing a Right Now card living inside the workday flow.',
    width: 3072,
    height: 5504,
    label: 'HABITAT',
    ordinal: '05',
    footer: 'THE HABITAT',
  },
  {
    src: '/landing/mobile-sections/06.jpg',
    alt: 'Foldera campaign panel showing the final right now approval card and pilot call to action.',
    width: 3072,
    height: 5504,
    label: 'RELIEF',
    ordinal: '06',
    footer: 'THE RELIEF',
    cta: { left: 12, top: 77.8, width: 75, height: 8.6 },
  },
];

const proofCards = [
  {
    title: 'Operational memory',
    body: 'Foldera keeps the thread, file, meeting, blocker, and deadline attached.',
  },
  {
    title: 'One intervention',
    body: 'No inbox dump. No triage board. One next move when the signal is strong.',
  },
  {
    title: 'Human approval',
    body: 'The pilot prepares the work. The human still approves before anything leaves.',
  },
];

function CampaignFrame({ slide, index, hero = false }: { slide: StorySlide; index: number; hero?: boolean }) {
  return (
    <section className="relative w-full" data-testid={`landing-slide-${index + 1}`}>
      <div className="mb-2 flex items-center justify-between px-1" aria-hidden="true">
        <div className="text-[10px] font-semibold tracking-[0.16em] text-slate-600">{slide.label}</div>
        <div className="text-[10px] font-semibold tracking-[0.16em] text-slate-700">{slide.ordinal}</div>
      </div>

      <div
        className={`relative overflow-hidden bg-black shadow-[0_34px_130px_rgba(0,0,0,0.82)] ${
          hero
            ? 'rounded-[24px] border border-cyan-300/20 ring-1 ring-cyan-300/15'
            : 'rounded-[20px] border border-white/10 ring-1 ring-white/[0.03]'
        }`}
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
            quality={96}
            sizes={hero ? '(max-width: 767px) 100vw, 560px' : '(max-width: 767px) 94vw, 460px'}
            className="select-none object-contain"
          />

          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(34,211,238,0.05),transparent_32%),linear-gradient(180deg,transparent_75%,rgba(0,0,0,0.18))]" />

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

      <div className="mt-2 flex items-center justify-between px-1" aria-hidden="true">
        <div className="text-[10px] font-semibold tracking-[0.16em] text-cyan-500">{index + 1} / 6</div>
        <div className="text-[10px] font-semibold tracking-[0.18em] text-slate-700">{slide.footer}</div>
      </div>
    </section>
  );
}

export function LandingPage({ isAuthenticated: _isAuthenticated = false }: { isAuthenticated?: boolean } = {}) {
  const [heroSlide, ...storySlides] = slides;

  return (
    <main className="min-h-[100dvh] w-screen overflow-x-hidden bg-black text-white touch-manipulation">
      <h1 className="sr-only">Foldera — Operational memory for broken work</h1>
      <div className="sr-only">
        <p>Foldera keeps context attached across messages, meetings, files, blockers, and approvals.</p>
        <p>Pilot scope: recommendation flow only. No automatic sending in this pilot.</p>
        <p>Join the pilot</p>
      </div>

      <header className="sticky top-0 z-50 border-b border-white/10 bg-black/82 backdrop-blur-2xl" data-testid="landing-header">
        <div className="mx-auto flex h-14 w-full max-w-[1220px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <a href="/" className="flex min-h-[44px] min-w-[44px] items-center gap-2 rounded-lg px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] border border-white/10 bg-white text-[13px] font-black text-black shadow-[0_0_26px_rgba(255,255,255,0.12)]">F</span>
            <span className="text-[14px] font-semibold tracking-[0.08em] text-white">FOLDERA</span>
          </a>

          <nav className="hidden items-center gap-6 text-[12px] font-medium text-slate-400 sm:flex" aria-label="Landing navigation">
            <a href="#how-it-works" className="transition-colors hover:text-white">How it works</a>
            <a href="#campaign" className="transition-colors hover:text-white">Campaign</a>
            <a href="#pilot" className="transition-colors hover:text-white">Pilot truth</a>
          </nav>

          <a href="/start" className="inline-flex min-h-[38px] items-center rounded-[10px] border border-cyan-300/25 bg-cyan-300 px-3 text-[12px] font-bold text-slate-950 shadow-[0_0_24px_rgba(34,211,238,0.22)] transition-colors hover:bg-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">
            Join pilot
          </a>
        </div>
      </header>

      <section className="relative overflow-hidden px-4 pb-16 pt-10 sm:px-6 sm:pb-20 md:pt-16 lg:px-8" data-testid="landing-visual-hero">
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="absolute left-1/2 top-[-22rem] h-[48rem] w-[48rem] -translate-x-1/2 rounded-full bg-cyan-400/8 blur-[160px]" />
          <div className="absolute -left-32 top-40 h-[34rem] w-[34rem] rounded-full bg-violet-500/10 blur-[160px]" />
          <div className="absolute -right-36 top-44 h-[36rem] w-[36rem] rounded-full bg-sky-500/8 blur-[150px]" />
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.022)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.022)_1px,transparent_1px)] bg-[size:72px_72px] [mask-image:radial-gradient(circle_at_50%_20%,black,transparent_74%)]" />
        </div>

        <div className="relative mx-auto grid w-full max-w-[1220px] gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(360px,560px)] lg:items-center">
          <div className="max-w-[680px]">
            <p className="mb-5 inline-flex rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-cyan-200">
              Operational memory for broken work
            </p>
            <h2 className="max-w-[720px] text-[clamp(3.6rem,12vw,8rem)] font-black uppercase leading-[0.76] tracking-[-0.09em] text-white">
              Stop rebuilding context.
            </h2>
            <p className="mt-6 max-w-[560px] text-[16px] leading-[1.7] text-slate-300 sm:text-[18px]">
              Foldera keeps the thread, file, meeting, blocker, and deadline attached so your next move comes back ready to review.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a href="/start" className="inline-flex min-h-[52px] items-center justify-center rounded-[14px] border border-cyan-200/30 bg-cyan-300 px-6 text-[14px] font-black uppercase tracking-[0.08em] text-slate-950 shadow-[0_0_42px_rgba(34,211,238,0.26)] transition hover:bg-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">
                Join the pilot →
              </a>
              <a href="#campaign" className="inline-flex min-h-[52px] items-center justify-center rounded-[14px] border border-white/10 bg-white/[0.04] px-6 text-[14px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition hover:bg-white/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">
                See the campaign
              </a>
            </div>
            <p className="mt-4 text-[12px] leading-[1.6] text-slate-500">
              Pilot note: no automatic sending, no cross-app writeback, no hidden monitoring.
            </p>
          </div>

          <div className="relative mx-auto w-full max-w-[560px] lg:max-w-[560px]">
            <div className="pointer-events-none absolute -inset-8 rounded-[42px] bg-[radial-gradient(circle_at_50%_15%,rgba(34,211,238,0.18),transparent_42%),radial-gradient(circle_at_45%_80%,rgba(168,85,247,0.14),transparent_42%)] blur-2xl" aria-hidden="true" />
            <div className="relative">
              <CampaignFrame slide={heroSlide!} index={0} hero />
            </div>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="relative border-y border-white/10 bg-white/[0.022] px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto grid w-full max-w-[1220px] gap-4 md:grid-cols-3">
          {proofCards.map((card) => (
            <div key={card.title} className="rounded-[22px] border border-white/10 bg-black/45 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <h3 className="text-[15px] font-bold text-white">{card.title}</h3>
              <p className="mt-2 text-[13px] leading-[1.6] text-slate-400">{card.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="campaign" className="relative px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-[1220px]">
          <div className="mb-8 max-w-[760px]">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-cyan-200">Six-panel story</p>
            <h2 className="mt-3 text-[clamp(2.8rem,8vw,6rem)] font-black uppercase leading-[0.8] tracking-[-0.085em] text-white">
              The bought visuals become the site.
            </h2>
            <p className="mt-4 max-w-[640px] text-[15px] leading-[1.7] text-slate-400">
              The panels are not recreated. They are the campaign layer, stitched into a real landing page with navigation, proof, and click targets.
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-2 xl:grid-cols-3">
            {storySlides.map((slide, index) => (
              <CampaignFrame key={slide.src} slide={slide} index={index + 1} />
            ))}
          </div>
        </div>
      </section>

      <section id="pilot" className="px-4 pb-8 text-center sm:px-6 lg:px-8" data-testid="landing-footer">
        <div className="mx-auto max-w-[920px] rounded-[28px] border border-cyan-300/15 bg-[radial-gradient(circle_at_30%_30%,rgba(34,211,238,0.20),transparent_55%),radial-gradient(circle_at_70%_60%,rgba(168,85,247,0.16),transparent_55%)] p-8 shadow-[0_30px_120px_rgba(0,0,0,0.65)]">
          <p className="text-[28px] font-black uppercase tracking-[-0.06em] text-white">Join the pilot</p>
          <p className="mx-auto mt-3 max-w-[560px] text-[14px] leading-[1.6] text-slate-300">
            Foldera keeps your place and hands back one Right Now move when it matters.
          </p>
          <a href="/start" className="mt-6 inline-flex min-h-[48px] items-center justify-center rounded-[14px] border border-cyan-300/25 bg-cyan-300 px-7 text-[13px] font-black uppercase tracking-[0.10em] text-slate-950 shadow-[0_0_34px_rgba(34,211,238,0.22)] transition-colors hover:bg-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">
            Join pilot
          </a>
        </div>
      </section>
    </main>
  );
}
