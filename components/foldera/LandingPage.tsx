import Image from 'next/image';

const secondaryCta = 'Join the pilot';

export function LandingPage({ isAuthenticated: _isAuthenticated = false }: { isAuthenticated?: boolean } = {}) {
  return (
    <main className="h-[100dvh] w-screen overflow-hidden bg-black text-white touch-manipulation overflow-x-hidden">
      <section className="relative h-full w-screen overflow-hidden bg-black">
        <div className="relative h-full w-full overflow-hidden md:min-h-0">
          <div className="absolute inset-0 overflow-hidden bg-black md:hidden">
            <Image
              src="/foldera-homepage-final.png"
              alt="Foldera homepage visual target"
              fill
              priority
              sizes="100vw"
              className="pointer-events-none select-none object-contain object-top bg-black"
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
              href="/start"
              aria-label={secondaryCta}
              className="pointer-events-auto absolute left-[20.5%] top-[55.5%] h-[8.8%] w-[59%] rounded-[1.2%] focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-black md:left-[3.8%] md:top-[39.4%] md:h-[4.6%] md:w-[31%]"
            />
          </div>
        </div>
      </section>
    </main>
  );
}
