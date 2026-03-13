'use client';

import React, { useState } from 'react';
import { Check, ArrowRight, Layers } from 'lucide-react';

function CheckoutButton() {
  const [loading, setLoading] = useState(false);

  async function handleCheckout() {
    setLoading(true);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ price_id: 'price_1T9coR2NLOgC3SAaVxcM0rEn' }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleCheckout}
      disabled={loading}
      className="w-full py-5 rounded-2xl bg-white text-black font-black uppercase tracking-[0.2em] text-xs hover:bg-zinc-200 transition-all flex items-center justify-center gap-3 shadow-[0_0_40px_rgba(255,255,255,0.2)] hover:scale-[1.02] active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed disabled:scale-100"
    >
      {loading ? (
        <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
      ) : (
        <>
          Start 14-day free trial
          <ArrowRight className="w-4 h-4" />
        </>
      )}
    </button>
  );
}

export default function PricingPage() {
  return (
    <div className="min-h-[100dvh] bg-[#000] text-white flex flex-col antialiased" style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* Nav */}
      <nav className="border-b border-white/5 px-6 py-5 flex items-center justify-between bg-black/80 backdrop-blur-xl">
        <a href="/" className="flex items-center gap-3 group">
          <div className="w-10 h-10 rounded-2xl bg-white text-black flex items-center justify-center group-hover:scale-105 transition-transform shadow-[0_0_30px_rgba(255,255,255,0.2)]">
            <Layers className="w-5 h-5 fill-black" aria-hidden="true" />
          </div>
          <span className="text-xl font-black tracking-tighter text-white uppercase">Foldera</span>
        </a>
        <a
          href="/login"
          className="text-[11px] font-black uppercase tracking-[0.2em] text-zinc-500 hover:text-white transition-colors"
        >
          Sign in
        </a>
      </nav>

      {/* Main */}
      <main className="flex-1 flex items-center justify-center px-6 py-24">
        <div className="w-full max-w-lg">
          <div className="text-center mb-16">
            <h1 className="text-6xl md:text-7xl font-black tracking-tighter text-white mb-6 leading-none">
              One plan.<br />Full power.
            </h1>
            <p className="text-zinc-400 text-xl font-medium">
              Stop managing. Start executing.
            </p>
          </div>

          <div className="rounded-[3rem] p-[1px] bg-gradient-to-b from-cyan-400/50 via-blue-500/10 to-transparent shadow-[0_0_150px_rgba(6,182,212,0.2)] hover:shadow-[0_0_200px_rgba(6,182,212,0.3)] transition-shadow duration-1000 group">
            <div className="rounded-[calc(3rem-1px)] bg-zinc-950/90 backdrop-blur-3xl p-12 md:p-16 relative overflow-hidden text-center group-hover:-translate-y-1 transition-transform duration-700">
              <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />

              <div className="mb-12 relative z-10">
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-cyan-400 mb-5 bg-cyan-500/10 border border-cyan-500/20 px-4 py-2 rounded-lg inline-block shadow-inner">Professional</p>
                <div className="flex items-baseline justify-center gap-2">
                  <span className="text-8xl font-black text-white tracking-tighter">$99</span>
                  <span className="text-zinc-500 font-bold tracking-widest uppercase text-xs">/mo</span>
                </div>
              </div>

              <ul className="space-y-5 mb-12 relative z-10 text-left">
                {[
                  'Unlimited integrations',
                  'Unlimited daily actions',
                  'Full autonomous queue',
                  'All specialist agents',
                  'Priority processing',
                  'Email + calendar sync',
                ].map((feature) => (
                  <li key={feature} className="flex items-center gap-4 text-white">
                    <div className="p-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 shrink-0">
                      <Check className="w-4 h-4 text-cyan-400" aria-hidden="true" />
                    </div>
                    <span className="text-base font-bold tracking-tight text-zinc-200">{feature}</span>
                  </li>
                ))}
              </ul>

              <div className="relative z-10">
                <CheckoutButton />
                <p className="text-center text-zinc-500 text-[10px] uppercase tracking-[0.2em] font-black mt-6 leading-relaxed">
                  14 days free. Cancel anytime.<br />No credit card required.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
