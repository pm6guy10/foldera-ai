import Image from 'next/image';

const debugHitboxes = process.env.NEXT_PUBLIC_FOLDERA_DEBUG_HITBOXES === '1';

const DEFAULT_TOP_CROP_PERCENT = 6.5;
const DEFAULT_BOTTOM_CROP_PERCENT = 5.8;

type StorySlide = {
  src: string;
  alt: string;
  width: number;
  height: number;
  eager?: boolean;
  topCrop?: number;
  bottomCrop?: number;
  cta?: { left: number; top: number; width: number; height: number };
};

const slides: StorySlide[] = [
  {
    src: '/landing/mobile-sections/01.jpg',
    alt: 'Foldera campaign panel showing fractured app context turning into one approved contract next move.',
    width: 3072,
    height: 5460,
    eager: true,
    topCrop: 0,
    cta: { left: 25, top: 62.5, width: 47, height: 7 },
  },
  {
    src: '/landing/mobile-sections/02.jpg',
    alt: 'Foldera campaign panel showing the reconstruction tax across work apps.',
    width: 3072,
    height: 5504,
  },
  {
    src: '/landing/mobile-sections/03.jpg',
    alt: 'Foldera campaign panel explaining broken continuity and the presence layer.',
    width: 3072,
    height: 5504,
  },
  {
    src: '/landing/mobile-sections/04.jpg',
    alt: 'Foldera campaign panel comparing noisy pings with one clean work state.',
    width: 3072,
    height: 5504,
  },
  {
    src: '/landing/mobile-sections/05.jpg',
    alt: 'Foldera campaign panel showing a Right Now card inside the workday flow.',
    width: 3072,
    height: 5504,
  },
  {
    src: '/landing/mobile-sections/06.jpg',
    alt: 'Foldera campaign panel showing the final approval card and pilot call to action.',
    width: 3072,
    height: 5504,
    cta: { left: 12, top: 77.8, width: 75, height: 8.6 },
  },
];

function getCrop(slide: StorySlide) {
  return {
    topCrop: slide.topCrop ?? DEFAULT_TOP_CROP_PERCENT,
    bottomCrop: slide.bottomCrop ?? DEFAULT_BOTTOM_CROP_PERCENT,
  };
}

function getCtaStyle(slide: StorySlide, topCrop: number, bottomCrop: number) {
  if (!slide.cta) return null;

  const visiblePercent = 100 - topCrop - bottomCrop;

  return {
    left: `${slide.cta.left}%`,
    top: `${((slide.cta.top - topCrop) / visiblePercent) * 100}%`,
    width: `${slide.cta.width}%`,
    height: `${(slide.cta.height / visiblePercent) * 100}%`,
  };
}

function CampaignSection({ slide, index }: { slide: StorySlide; index: number }) {
  const { topCrop, bottomCrop } = getCrop(slide);
  const visibleHeight = slide.height * (1 - (topCrop + bottomCrop) / 100);
  const imageHeightPercent = (slide.height / visibleHeight) * 100;
  const imageTopPercent = -(topCrop / 100) * imageHeightPercent;
  const ctaStyle = getCtaStyle(slide, topCrop, bottomCrop);

  return (
    <section
      className={`relative w-full overflow-hidden bg-black ${index > 0 ? '-mt-px' : ''}`}
      style={{ aspectRatio: `${slide.width} / ${visibleHeight}` }}
      data-testid={`landing-slide-${index + 1}`}
    >
      <Image
        src={slide.src}
        alt={slide.alt}
        fill
        priority={Boolean(slide.eager)}
        loading={slide.eager ? 'eager' : 'lazy'}
        quality={96}
        sizes="(max-width: 767px) 100vw, 620px"
        className="select-none object-cover"
        style={{
          height: `${imageHeightPercent}%`,
          top: `${imageTopPercent}%`,
          bottom: 'auto',
        }}
      />

      {slide.cta && ctaStyle ? (
        <>
          <a
            href="/start"
            aria-label="Join the pilot"
            data-testid={`landing-cta-${index + 1}`}
            className="absolute z-10 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
            style={ctaStyle}
          />
          {debugHitboxes ? <div className="pointer-events-none absolute z-10 rounded-md border-2 border-fuchsia-500 bg-fuchsia-500/15" style={ctaStyle} /> : null}
        </>
      ) : null}
    </section>
  );
}

export function LandingPage({ isAuthenticated: _isAuthenticated = false }: { isAuthenticated?: boolean } = {}) {
  return (
    <main className="min-h-[100dvh] w-screen overflow-x-hidden bg-black touch-manipulation">
      <h1 className="sr-only">Foldera — operational memory for broken work</h1>
      <div className="sr-only">
        <p>Foldera keeps context attached across messages, meetings, files, blockers, and approvals.</p>
        <p>Pilot scope: recommendation flow only. No automatic sending in this pilot.</p>
        <p>Join the pilot</p>
      </div>

      <div className="mx-auto flex w-full max-w-[620px] flex-col gap-0 px-0 py-0" data-testid="landing-campaign-stack">
        {slides.map((slide, index) => (
          <CampaignSection key={slide.src} slide={slide} index={index} />
        ))}
      </div>
    </main>
  );
}
