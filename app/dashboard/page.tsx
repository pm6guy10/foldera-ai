'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';

async function load(cacheMode: RequestCache = 'default'): Promise<void> {
  void cacheMode;
}

export default function DashboardPage() {
  const { status } = useSession();
  const isReady = status === 'authenticated';
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void (async () => {
      await load('reload');
    })();
  }, []);

  async function handleOpen() {
    setLoading(true);
    await load('reload');
    setLoading(false);
  }

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
                disabled={!isReady || loading}
                onClick={() => void handleOpen()}
                className="inline-flex items-center justify-center rounded-full border border-[#46F4FF] bg-[#030305] px-6 py-3 text-sm font-medium text-[#46F4FF] transition-colors hover:bg-[#46F4FF]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#46F4FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#030305] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-[#030305]"
              >
                {loading ? 'Loading…' : 'Open next move'}
              </button>
            </div>
            <div
              data-testid="trust-rail"
              className="mt-6 rounded-2xl border border-white/10 bg-white/5 px-6 py-4 text-left"
            >
              <p className="text-xs leading-5 text-white/50">
                Foldera reads your connected sources. Nothing is stored raw.
              </p>
              <p className="mt-1 text-xs leading-5 text-white/50">
                Nothing sends without your explicit approval.
              </p>
              <Link
                href="/dashboard/settings"
                className="mt-3 inline-block text-xs text-[#46F4FF]/70 underline-offset-2 hover:text-[#46F4FF] hover:underline"
              >
                Manage sources →
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
