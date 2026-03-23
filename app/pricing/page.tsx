'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { ArrowRight, Check, Lock } from 'lucide-react';

const features = [
  'Email and calendar sync',
  'One morning directive each day',
  'Prepared emails, decision frames, and documents',
  'Approve or skip in one tap',
  'Encrypted at rest',
  'Learns from your feedback over time',
];

function CheckoutButton() {
  const { status } = useSession();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCheckout() {
    if (status === 'loading') return;
    if (status !== 'authenticated') {
      window.location.href = '/start';
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        window.location.href = '/start';
        return;
      }
      if (!res.ok || !data.url) {
        throw new Error(data.error || 'Could not start checkout');
      }
      window.location.href = data.url;
    } catch {
      setError('Could not start checkout right now. Try again in a moment.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        onClick={handleCheckout}
        disabled={loading || status === 'loading'}
        className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-6 py-4 text-sm font-semibold text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-400 border-t-zinc-900" />
        ) : (
          <>
            {status === 'authenticated' ? 'Continue to checkout' : 'Start free'}
            <ArrowRight className="h-4 w-4" />
          </>
        )}
      </button>
      {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}
    </div>
  );
}

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-[#07080d] px-6 py-10 text-white">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between">
          <Link href="/" className="text-xl font-black tracking-tight">
            Foldera
          </Link>
          <div className="flex items-center gap-5 text-sm text-zinc-400">
            <Link href="/login" className="hover:text-white">
              Sign in
            </Link>
            <Link href="/start" className="hover:text-white">
              Get started
            </Link>
          </div>
        </div>

        <div className="mt-16 grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
          <section className="max-w-xl">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-300">
              Pricing
            </p>
            <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl">
              One plan. One clear promise.
            </h1>
            <p className="mt-5 text-lg leading-8 text-zinc-300">
              Foldera is not selling a giant workspace. It is selling one prepared move every morning. Pricing should match that simplicity.
            </p>
            <div className="mt-8 flex items-center gap-2 text-sm text-zinc-500">
              <Lock className="h-4 w-4" />
              Free forever. No credit card required.
            </div>
          </section>

          <section className="rounded-[2rem] border border-cyan-400/20 bg-gradient-to-b from-cyan-400/10 to-white/[0.02] p-1 shadow-2xl shadow-black/30">
            <div className="rounded-[calc(2rem-1px)] border border-white/8 bg-zinc-950/90 p-8 sm:p-10">
              <div className="flex flex-wrap items-end gap-3">
                <span className="text-7xl font-black tracking-tight">$29</span>
                <span className="pb-3 text-sm uppercase tracking-[0.18em] text-zinc-500">per month</span>
              </div>
              <p className="mt-3 max-w-lg text-sm leading-7 text-zinc-400">
                Connect your accounts free. The morning read is yours. Artifacts and execution unlock at $29/mo.
              </p>

              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                {features.map((feature) => (
                  <div key={feature} className="flex items-start gap-3 rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
                    <p className="text-sm leading-6 text-zinc-300">{feature}</p>
                  </div>
                ))}
              </div>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CheckoutButton />
                <p className="text-sm text-zinc-500">
                  Cancel any time.
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
