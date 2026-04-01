'use client';

import React, { useState } from 'react';
import { useSession } from 'next-auth/react';
import { Check, ArrowRight, Layers, Lock, ChevronRight } from 'lucide-react';

// ─── Checkout CTA ─────────────────────────────────────────────────────────────
// Never disabled. When not authenticated → plain <a> to /start.
// When authenticated → Stripe checkout.
function CheckoutButton() {
  const { status } = useSession();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status !== 'authenticated') {
    return (
      <div className="space-y-3">
        <a
          href="/start"
          className="w-full py-5 rounded-2xl bg-white text-black font-black uppercase tracking-[0.2em] text-xs hover:bg-zinc-200 transition-all flex items-center justify-center gap-3 shadow-[0_0_40px_rgba(255,255,255,0.2)] hover:scale-[1.02] active:scale-95"
        >
          Get started free <ArrowRight className="w-4 h-4" />
        </a>
        <p className="text-center text-zinc-500 text-[10px] uppercase tracking-[0.2em] font-black leading-relaxed">
          No credit card required.
        </p>
      </div>
    );
  }

  async function handleCheckout() {
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
        disabled={loading}
        className="w-full py-5 rounded-2xl bg-white text-black font-black uppercase tracking-[0.2em] text-xs hover:bg-zinc-200 transition-all flex items-center justify-center gap-3 shadow-[0_0_40px_rgba(255,255,255,0.2)] hover:scale-[1.02] active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed disabled:scale-100"
      >
        {loading ? (
          <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
        ) : (
          <>Continue to checkout <ArrowRight className="w-4 h-4" /></>
        )}
      </button>
      {error && <p className="text-sm text-rose-300">{error}</p>}
    </div>
  );
}

// ─── Free Tier CTA ─────────────────────────────────────────────────────────────
function FreeCTA() {
  const { status } = useSession();
  if (status === 'authenticated') {
    return (
      <a
        href="/dashboard"
        className="w-full py-4 rounded-2xl border border-white/20 text-zinc-300 font-black uppercase tracking-[0.2em] text-xs hover:border-white/40 hover:text-white transition-all flex items-center justify-center gap-3 active:scale-95"
      >
        Go to dashboard <ChevronRight className="w-4 h-4" />
      </a>
    );
  }
  return (
    <a
      href="/start"
      className="w-full py-4 rounded-2xl border border-white/20 text-zinc-300 font-black uppercase tracking-[0.2em] text-xs hover:border-white/40 hover:text-white transition-all flex items-center justify-center gap-3 active:scale-95"
    >
      Start free — no card <ChevronRight className="w-4 h-4" />
    </a>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function PricingPage() {
  return (
    <div className="min-h-[100dvh] bg-[#07070c] text-white flex flex-col antialiased selection:bg-cyan-500/30 selection:text-white">

      {/* Nav */}
      <nav className="border-b border-white/5 px-6 py-5 flex items-center justify-between bg-black/80 backdrop-blur-xl sticky top-0 z-50">
        <a href="/" className="flex items-center gap-3 group">
          <div className="w-10 h-10 rounded-2xl bg-white text-black flex items-center justify-center group-hover:scale-105 transition-transform shadow-[0_0_30px_rgba(255,255,255,0.2)]">
            <Layers className="w-5 h-5 fill-black" aria-hidden="true" />
          </div>
          <span className="hidden sm:inline text-xl font-black tracking-tighter text-white uppercase">Foldera</span>
        </a>
        <div className="hidden md:flex items-center gap-10 text-[11px] font-black uppercase tracking-[0.2em] text-zinc-500">
          <a href="/#product" className="hover:text-white transition-colors">Platform</a>
          <a href="/pricing" className="text-white">Pricing</a>
          <a href="/blog" className="hover:text-white transition-colors">Blog</a>
        </div>
        <div className="flex items-center gap-5">
          <a href="/login" className="hidden sm:block text-[11px] font-black uppercase tracking-[0.2em] text-zinc-500 hover:text-white transition-colors">
            Sign in
          </a>
          <a
            href="/start"
            className="px-5 py-2.5 rounded-full bg-white text-black text-[10px] font-black uppercase tracking-[0.2em] hover:bg-zinc-200 transition-all flex items-center gap-2 hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(255,255,255,0.2)]"
          >
            Get started <ChevronRight className="w-3.5 h-3.5" />
          </a>
        </div>
      </nav>

      {/* Ambient grid */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,#000_20%,transparent_100%)]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[900px] bg-[radial-gradient(circle_at_50%_50%,rgba(6,182,212,0.06)_0%,transparent_50%)] pointer-events-none" />
      </div>

      {/* Main */}
      <main className="relative z-10 flex-1 flex items-start justify-center px-6 py-16 md:py-24">
        <div className="w-full max-w-5xl">

          {/* Heading */}
          <div className="text-center mb-14 md:mb-20">
            <h1 className="text-5xl md:text-7xl font-black tracking-tighter text-white mb-5 leading-none">
              One plan.<br />Full power.
            </h1>
            <p className="text-zinc-400 text-lg md:text-xl font-medium">
              Start free. Upgrade when you want the finished work.
            </p>
          </div>

          {/* Two-tier grid */}
          <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">

            {/* FREE TIER */}
            <div className="rounded-[2.5rem] bg-zinc-950/80 border border-white/10 p-10 md:p-12 flex flex-col">
              <div className="mb-8">
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-zinc-400 mb-4 bg-white/5 border border-white/10 px-4 py-2 rounded-lg inline-block">
                  Free forever
                </p>
                <div className="flex items-baseline gap-2">
                  <span className="text-6xl font-black text-white tracking-tighter">$0</span>
                  <span className="text-zinc-500 font-bold tracking-widest uppercase text-xs">/mo</span>
                </div>
                <p className="text-zinc-400 text-sm mt-3 font-medium leading-relaxed">
                  The read — Foldera finds what matters and tells you every morning.
                </p>
              </div>

              <ul className="space-y-4 mb-10 flex-1">
                {[
                  'Email + calendar sync',
                  'One directive every morning',
                  'See what matters and why',
                  'Approve or skip in one tap',
                  'Encrypted at rest',
                ].map((f) => (
                  <li key={f} className="flex items-center gap-4 text-zinc-300">
                    <div className="p-1 rounded-full bg-white/5 border border-white/15 shrink-0">
                      <Check className="w-3.5 h-3.5 text-zinc-400" aria-hidden="true" />
                    </div>
                    <span className="text-sm font-medium tracking-tight">{f}</span>
                  </li>
                ))}
              </ul>

              <FreeCTA />
            </div>

            {/* PRO TIER */}
            <div className="rounded-[2.5rem] p-[1px] bg-gradient-to-b from-cyan-400/50 via-blue-500/10 to-transparent shadow-[0_0_150px_rgba(6,182,212,0.2)] hover:shadow-[0_0_200px_rgba(6,182,212,0.3)] transition-shadow duration-1000 group">
              <div className="rounded-[calc(2.5rem-1px)] bg-zinc-950/90 backdrop-blur-3xl p-10 md:p-12 relative overflow-hidden flex flex-col h-full group-hover:-translate-y-1 transition-transform duration-700">
                <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />

                <div className="mb-8 relative z-10">
                  <p className="text-[11px] font-black uppercase tracking-[0.2em] text-cyan-400 mb-4 bg-cyan-500/10 border border-cyan-500/20 px-4 py-2 rounded-lg inline-block shadow-inner">
                    Professional
                  </p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-6xl font-black text-white tracking-tighter">$29</span>
                    <span className="text-zinc-500 font-bold tracking-widest uppercase text-xs">/mo</span>
                  </div>
                  <p className="text-zinc-400 text-sm mt-3 font-medium leading-relaxed">
                    The finished work — drafted emails and documents, ready to approve and send.
                  </p>
                </div>

                <ul className="space-y-4 mb-10 relative z-10 flex-1">
                  <li className="flex items-center gap-4 text-zinc-400">
                    <div className="p-1 rounded-full bg-white/5 border border-white/10 shrink-0">
                      <Check className="w-3.5 h-3.5 text-zinc-500" aria-hidden="true" />
                    </div>
                    <span className="text-sm font-medium tracking-tight italic">Everything in Free, plus:</span>
                  </li>
                  {[
                    'Drafted emails, ready to send',
                    'Drafted documents and decision frames',
                    'Approve & send in one tap',
                    'Artifacts delivered every morning',
                    'Gets smarter every day',
                  ].map((f) => (
                    <li key={f} className="flex items-center gap-4 text-white">
                      <div className="p-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 shrink-0">
                        <Check className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" />
                      </div>
                      <span className="text-sm font-bold tracking-tight text-zinc-200">{f}</span>
                    </li>
                  ))}
                </ul>

                <div className="relative z-10">
                  <CheckoutButton />
                </div>
              </div>
            </div>

          </div>

          {/* Trust line */}
          <div className="flex items-center justify-center gap-2 mt-10 text-zinc-600">
            <Lock className="w-3.5 h-3.5" aria-hidden="true" />
            <p className="text-[11px] font-semibold uppercase tracking-[0.15em]">AES-256 encrypted · Cancel anytime · No lock-in</p>
          </div>

        </div>
      </main>
    </div>
  );
}
