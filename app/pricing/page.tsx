'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { Check, ArrowRight } from 'lucide-react';
import { NavPublic } from '@/components/nav/NavPublic';

const PRO_FEATURES = [
  'Drafted emails, ready to send',
  'Documents and decision frames',
  'Approve and send in one tap',
  'Gets smarter every day',
  'Cancel anytime',
];

const FAQ = [
  {
    q: "What's free?",
    a: "Daily directives (the read) plus a preview of finished work. Upgrade to Pro for full artifacts every morning.",
  },
  {
    q: "What's Pro?",
    a: "Unlimited access to finished work — drafted emails, documents, and decision frames delivered with every directive.",
  },
  {
    q: 'Can I cancel?',
    a: 'Anytime. No contracts.',
  },
  {
    q: 'Is my data safe?',
    a: 'AES-256 encryption. Your data never trains anyone else\'s model. Delete everything anytime.',
  },
];

function ProCheckoutButton() {
  const { data: session, status } = useSession();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCheckout = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: session?.user?.id,
          email: session?.user?.email ?? undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        window.location.href = '/start?plan=pro';
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
  };

  if (status !== 'authenticated') {
    return (
      <Link
        href="/start?plan=pro"
        className="w-full min-h-[56px] py-5 rounded-2xl bg-cyan-500 text-black font-black uppercase tracking-widest text-xs hover:bg-cyan-400 transition-all duration-150 flex items-center justify-center gap-3 shadow-[0_0_20px_rgba(6,182,212,0.22)] hover:scale-[1.02] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#07070c]"
        aria-label="Upgrade to Pro"
      >
        Upgrade to Pro <ArrowRight className="w-4 h-4" aria-hidden="true" />
      </Link>
    );
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={handleCheckout}
        disabled={loading}
        className="w-full min-h-[56px] py-5 rounded-2xl bg-cyan-500 text-black font-black uppercase tracking-widest text-xs hover:bg-cyan-400 transition-all duration-150 flex items-center justify-center gap-3 shadow-[0_0_20px_rgba(6,182,212,0.22)] hover:scale-[1.02] active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed disabled:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#07070c]"
        aria-label="Continue to checkout"
      >
        {loading ? (
          <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
        ) : (
          <>Upgrade to Pro <ArrowRight className="w-4 h-4" aria-hidden="true" /></>
        )}
      </button>
      {error && <p className="text-sm text-rose-300">{error}</p>}
      <p className="text-center text-zinc-600 text-xs">$29/mo — cancel anytime.</p>
      <Link
        href="/dashboard"
        className="block text-center text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 hover:text-white transition-colors pt-2"
      >
        Go to dashboard
      </Link>
    </div>
  );
}

export default function PricingPage() {
  return (
    <div className="min-h-[100dvh] bg-[#07070c] text-white flex flex-col antialiased selection:bg-cyan-500/30 selection:text-white">

      <NavPublic scrolled platformHref="/#product" />

      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,#000_20%,transparent_100%)]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[900px] bg-[radial-gradient(circle_at_50%_50%,rgba(6,182,212,0.06)_0%,transparent_50%)] pointer-events-none" />
      </div>

      <main id="main" className="relative z-10 flex-1 px-6 pt-24 pb-16 md:pb-24 md:pt-28">
        <div className="max-w-5xl mx-auto">

          <div className="text-center mb-14 md:mb-16">
            <h1 className="text-5xl md:text-6xl font-black tracking-tighter text-white mb-5 leading-none">
              Start free.<br />Upgrade when it clicks.
            </h1>
            <p className="text-lg md:text-xl text-zinc-400 font-medium max-w-xl mx-auto leading-relaxed">
              Get the morning read on us. When you want unlimited finished work every day, Pro is $29/mo.
            </p>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-[#0a0a0f]/80 backdrop-blur-xl p-6 md:p-10 shadow-[0_40px_100px_-20px_rgba(0,0,0,0.85)] max-w-5xl mx-auto mb-16 md:mb-20">
          <div className="grid gap-8 md:grid-cols-2 md:gap-10">
            {/* Free */}
            <div className="rounded-[2rem] bg-[#0a0a0f] border border-white/10 p-10 md:p-12 flex flex-col">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-zinc-500 mb-6 bg-white/5 border border-white/10 px-4 py-2 rounded-lg inline-block">
                Free
              </p>
              <div className="flex items-baseline gap-2 mb-3">
                <span className="text-5xl font-black text-white tracking-tighter">$0</span>
              </div>
              <p className="text-zinc-400 font-medium mb-8">Daily directive + previews of finished work.</p>
              <ul className="space-y-3 mb-10 flex-1">
                {['Morning directive with every run', 'Secure OAuth when you choose to connect', 'Preview what full artifacts look like'].map((f) => (
                  <li key={f} className="flex items-center gap-3 text-zinc-300 text-sm font-medium">
                    <div className="p-1 rounded-full bg-white/5 border border-white/10 shrink-0">
                      <Check className="w-3.5 h-3.5 text-zinc-400" aria-hidden="true" />
                    </div>
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/start"
                className="w-full min-h-[56px] py-5 rounded-2xl bg-white text-black font-black uppercase tracking-[0.15em] text-xs hover:bg-zinc-200 transition-all duration-150 flex items-center justify-center gap-3 shadow-[0_0_40px_rgba(255,255,255,0.2)] hover:scale-[1.02] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#07070c]"
                aria-label="Start free"
              >
                Get started free <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </Link>
              <p className="text-center text-zinc-600 text-xs mt-3">No credit card required.</p>
            </div>

            {/* Pro */}
            <div className="rounded-[2rem] bg-[#0a0a0f] border border-cyan-500/30 p-10 md:p-12 shadow-[0_0_80px_rgba(6,182,212,0.12)] flex flex-col">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-cyan-400 mb-6 bg-cyan-500/10 border border-cyan-500/20 px-4 py-2 rounded-lg inline-block">
                Professional
              </p>
              <div className="flex items-baseline gap-2 mb-3">
                <span className="text-6xl font-black text-white tracking-tighter">$29</span>
                <span className="text-zinc-500 font-bold tracking-widest uppercase text-xs">/mo</span>
              </div>
              <p className="text-zinc-400 font-medium mb-8">Finished work, every morning.</p>
              <ul className="space-y-4 mb-10 flex-1">
                {PRO_FEATURES.map((f) => (
                  <li key={f} className="flex items-center gap-4 text-white">
                    <div className="p-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 shrink-0">
                      <Check className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" />
                    </div>
                    <span className="text-sm font-bold tracking-tight text-zinc-200">{f}</span>
                  </li>
                ))}
              </ul>
              <ProCheckoutButton />
            </div>
          </div>
          </div>

          <div className="max-w-2xl mx-auto">
            {FAQ.map(({ q, a }) => (
              <div key={q} className="mb-8">
                <p className="text-white font-bold text-sm mb-2">{q}</p>
                <p className="text-zinc-400 text-sm">{a}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-6 mt-12 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-600">
            <a href="/privacy" className="hover:text-zinc-400 transition-colors">Privacy</a>
            <a href="/terms" className="hover:text-zinc-400 transition-colors">Terms</a>
          </div>

        </div>
      </main>
    </div>
  );
}
