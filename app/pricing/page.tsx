'use client';

import React, { useState } from 'react';
import { useSession } from 'next-auth/react';
import { Check, ArrowRight, Layers, Sparkles } from 'lucide-react';

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
    <div className="space-y-3">
      <button
        onClick={handleCheckout}
        disabled={loading || status === 'loading'}
        className="w-full py-4 rounded-2xl bg-white text-black font-black uppercase tracking-[0.18em] text-xs hover:bg-zinc-200 transition-all flex items-center justify-center gap-3 shadow-[0_0_40px_rgba(255,255,255,0.16)] hover:scale-[1.01] active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {loading ? (
          <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
        ) : (
          <>
            {status === 'authenticated' ? 'Continue to checkout' : 'Start 14-day free trial'}
            <ArrowRight className="w-4 h-4" />
          </>
        )}
      </button>
      {error && <p className="text-sm text-rose-300">{error}</p>}
    </div>
  );
}

export default function PricingPage() {
  return (
    <div className="min-h-[100dvh] bg-[#07070c] text-white relative overflow-hidden">
      <AmbientBackdrop />

      <nav className="relative z-10 border-b border-white/5 px-6 py-5 flex items-center justify-between bg-black/50 backdrop-blur-xl">
        <a href="/" className="flex items-center gap-3 group">
          <div className="w-10 h-10 rounded-2xl bg-white text-black flex items-center justify-center group-hover:scale-105 transition-transform shadow-[0_0_30px_rgba(255,255,255,0.2)]">
            <Layers className="w-5 h-5 fill-black" aria-hidden="true" />
          </div>
          <span className="text-xl font-black tracking-[0.18em] text-white uppercase">Foldera</span>
        </a>
        <a
          href="/login"
          className="text-[11px] font-black uppercase tracking-[0.2em] text-zinc-500 hover:text-white transition-colors"
        >
          Sign in
        </a>
      </nav>

      <main className="relative z-10 flex-1 flex items-center justify-center px-6 py-20">
        <div className="w-full max-w-6xl grid lg:grid-cols-[0.95fr_1.05fr] gap-10 items-center">
          <section className="max-w-xl">
            <div className="inline-flex items-center gap-2 px-3 py-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 text-cyan-300 text-[11px] font-black uppercase tracking-[0.18em] mb-6">
              One plan. One loop.
            </div>
            <h1 className="text-5xl md:text-6xl font-black tracking-tight leading-[1.02] text-white">
              Pay for the morning directive,
              <span className="text-cyan-300"> not a pile of features.</span>
            </h1>
            <p className="mt-5 text-lg text-zinc-400 leading-relaxed">
              Foldera is simple on purpose: one directive each morning, one drafted artifact, one approve-or-skip decision. That is the product.
            </p>

            <div className="mt-8 grid gap-4">
              {[
                'Email + calendar sync included.',
                'Drafted emails, decision frames, and prepared documents.',
                'Approve or skip feedback makes the loop sharper over time.',
              ].map((text) => (
                <div key={text} className="rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4 text-zinc-300">
                  {text}
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[2.2rem] p-[1px] bg-gradient-to-b from-cyan-400/45 via-blue-500/10 to-white/5 shadow-[0_0_120px_rgba(6,182,212,0.14)]">
            <div className="rounded-[calc(2.2rem-1px)] bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))] backdrop-blur-3xl p-8 md:p-10 relative overflow-hidden">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.12),transparent_58%)]" />
              <div className="relative z-10">
                <div className="flex items-center justify-between gap-4 mb-8">
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.2em] text-cyan-300 mb-3">Professional</p>
                    <div className="flex items-end gap-2">
                      <span className="text-7xl font-black text-white tracking-tight">$29</span>
                      <span className="text-zinc-500 font-bold tracking-widest uppercase text-xs mb-2">/mo</span>
                    </div>
                  </div>
                  <div className="w-14 h-14 rounded-2xl border border-cyan-400/20 bg-cyan-400/10 flex items-center justify-center text-cyan-300">
                    <Sparkles className="w-6 h-6" />
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3 mb-6 text-sm text-zinc-300">
                  14-day free trial. No credit card up front.
                </div>

                <ul className="space-y-4 mb-8">
                  {[
                    'Email + calendar sync',
                    'One directive every morning',
                    'Drafted emails + documents',
                    'Approve or skip in one tap',
                    'Learning loop from your decisions',
                    'Encrypted storage and deletion controls',
                  ].map((feature) => (
                    <li key={feature} className="flex items-start gap-3 text-zinc-300">
                      <div className="w-5 h-5 rounded-full bg-emerald-500/15 flex items-center justify-center mt-0.5 shrink-0">
                        <Check className="w-3.5 h-3.5 text-emerald-300" />
                      </div>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <CheckoutButton />

                <p className="text-zinc-600 text-xs text-center mt-5">
                  One plan. No feature maze.
                </p>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function AmbientBackdrop() {
  return (
    <>
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808010_1px,transparent_1px),linear-gradient(to_bottom,#80808010_1px,transparent_1px)] bg-[size:44px_44px] opacity-60" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.14),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.08),transparent_24%),linear-gradient(180deg,#07070c_0%,#090912_50%,#050508_100%)]" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[70rem] h-[26rem] bg-cyan-500/10 blur-[140px] rounded-full" />
    </>
  );
}
