import Image from 'next/image';

const primaryCta = 'See Foldera in action';
const secondaryCta = 'Join the pilot';

export function LandingPage({ isAuthenticated: _isAuthenticated = false }: { isAuthenticated?: boolean } = {}) {
  return (
    <main className="min-h-screen bg-[#02040a] text-white">
      <section className="relative mx-auto w-full max-w-[1600px] overflow-hidden bg-[#02040a]">
        <div className="relative w-full md:min-h-0">
          <div className="relative aspect-[9/16] min-h-[100svh] w-full overflow-hidden md:hidden">
            <Image
              src="/foldera-homepage-final.png"
              alt="Foldera homepage visual target"
              fill
              priority
              sizes="100vw"
              className="select-none object-cover object-[center_top]"
            />
          </div>
          <Image
            src="/foldera-homepage-final-desktop.png"
            alt="Foldera homepage visual target"
            width={1122}
            height={1402}
            priority
            className="hidden h-auto w-full select-none md:block"
          />

          <div className="pointer-events-none absolute inset-0" aria-hidden="true">
            <a
              href="/demo"
              aria-label={primaryCta}
              className="pointer-events-auto absolute left-[4.5%] top-[43.3%] h-[3.8%] w-[55%] rounded-[1.2%] focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#02040a] md:left-[3.8%] md:top-[32.9%] md:h-[4.9%] md:w-[31%]"
            />
            <a
              href="/start"
              aria-label={secondaryCta}
              className="pointer-events-auto absolute left-[4.5%] top-[48.4%] h-[3.8%] w-[55%] rounded-[1.2%] focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#02040a] md:left-[3.8%] md:top-[39.4%] md:h-[4.6%] md:w-[31%]"
            />
          </div>
        </div>
      </section>
    </main>
  );
}
