import Image from 'next/image';

const secondaryCta = 'Join the pilot';
const debugHitboxes = process.env.NEXT_PUBLIC_FOLDERA_DEBUG_HITBOXES === '1';

export function LandingPage({ isAuthenticated: _isAuthenticated = false }: { isAuthenticated?: boolean } = {}) {
  return (
    <main className="h-[100dvh] w-screen overflow-hidden bg-black text-white touch-manipulation overflow-x-hidden">
      <section className="relative h-full w-screen overflow-hidden bg-black">
        <div className="relative h-full w-full overflow-hidden md:min-h-0">
          <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-black md:hidden">
            <div className="relative h-full max-w-full w-auto overflow-hidden bg-black" style={{ aspectRatio: '941 / 1672' }}>
            <Image
              src="/foldera-homepage-final.png"
              alt="Foldera homepage visual target"
              fill
              priority
              sizes="(max-width: 768px) 100vw, 0px"
              className="pointer-events-none select-none object-contain object-top bg-black"
            />
            <div className="pointer-events-none absolute inset-0" aria-hidden="true">
              <a
                href="/start"
                aria-label={secondaryCta}
                className="pointer-events-auto absolute rounded-[1.2%] focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                style={{ left: '23.8%', top: '57.3%', width: '51.6%', height: '10.2%' }}
              />
              {debugHitboxes ? (
                <div
                  className="absolute rounded-[1.2%] border-2 border-red-500 bg-red-500/15"
                  style={{ left: '23.8%', top: '57.3%', width: '51.6%', height: '10.2%' }}
                />
              ) : null}
            </div>
          </div>
          </div>
          <Image
            src="/foldera-homepage-final-desktop.png"
            alt="Foldera homepage visual target"
            width={1122}
            height={1402}
            priority
            className="hidden h-auto w-full select-none md:block"
          />
        </div>
      </section>
    </main>
  );
}
