'use client';

import { useSession } from 'next-auth/react';

export default function DashboardPage() {
  const { status } = useSession();
  const isReady = status === 'authenticated';

  return (
    <main className="min-h-screen bg-[#030305] text-white">
      <section className="flex min-h-screen items-center justify-center px-6 py-16">
        <div className="w-full max-w-xl rounded-[28px] border border-[#4A3B69] bg-black/50 px-8 py-10 text-center shadow-[0_30px_120px_rgba(0,0,0,0.58)] backdrop-blur-sm sm:px-12 sm:py-12">
          <div className="space-y-6">
            <div className="space-y-3">
              <h1 className="text-balance text-4xl font-semibold tracking-[-0.05em] text-white sm:text-5xl">
                One next move.
              </h1>
              <p className="mx-auto max-w-md text-sm leading-6 text-white/68 sm:text-base">
                A quiet dashboard shell for the first product journey.
              </p>
            </div>
            <div className="flex justify-center">
              <button
                type="button"
                disabled={!isReady}
                className="inline-flex items-center justify-center rounded-full border border-[#46F4FF] bg-[#030305] px-6 py-3 text-sm font-medium text-[#46F4FF] transition-colors hover:bg-[#46F4FF]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#46F4FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#030305] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-[#030305]"
              >
                Open next move
              </button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
