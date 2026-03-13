'use client';

import React, { useState } from 'react';
import { Check, ArrowRight, Brain } from 'lucide-react';

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
      className="w-full py-4 rounded-xl bg-white text-black font-semibold hover:bg-zinc-200 transition-all flex items-center justify-center gap-2 group disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {loading ? (
        <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
      ) : (
        <>
          Start free trial
          <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
        </>
      )}
    </button>
  );
}

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      {/* Nav */}
      <nav className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <a href="/" className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
            <Brain className="w-4 h-4 text-white" />
          </div>
          <span className="text-lg font-semibold tracking-tight">Foldera</span>
        </a>
        <a href="/start" className="text-sm text-zinc-400 hover:text-white transition-colors">
          Sign in
        </a>
      </nav>

      {/* Main */}
      <main className="flex-1 flex items-center justify-center px-6 py-24">
        <div className="w-full max-w-lg">
          <div className="text-center mb-12">
            <h1 className="text-4xl md:text-5xl font-semibold tracking-tight text-white mb-4">
              One plan. Full power.
            </h1>
            <p className="text-zinc-400 text-lg">
              $99/month. 14 days free. Cancel anytime.
            </p>
          </div>

          <div className="rounded-3xl bg-gradient-to-b from-zinc-800 to-zinc-900 p-[1px]">
            <div className="rounded-[calc(1.5rem-1px)] bg-zinc-950 p-8 md:p-12">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <p className="text-cyan-400 text-sm font-medium uppercase tracking-wider mb-1">Pro</p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-5xl font-semibold text-white">$99</span>
                    <span className="text-zinc-500">/month</span>
                  </div>
                </div>
                <div className="px-4 py-2 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-medium">
                  14 days free
                </div>
              </div>

              <div className="space-y-4 mb-8">
                {[
                  'Unlimited integrations',
                  'Unlimited daily actions',
                  'Full autonomous queue',
                  'All specialist agents',
                  'Priority processing',
                  'Email + calendar sync',
                ].map((feature) => (
                  <div key={feature} className="flex items-center gap-3 text-zinc-300">
                    <div className="w-5 h-5 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0">
                      <Check className="w-3 h-3 text-cyan-400" />
                    </div>
                    <span className="text-sm">{feature}</span>
                  </div>
                ))}
              </div>

              <CheckoutButton />

              <p className="text-center text-zinc-500 text-xs mt-4">
                No credit card required. Cancel in one click.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
