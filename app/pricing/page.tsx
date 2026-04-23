'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { ArrowRight, Check } from 'lucide-react';
import { NavPublic } from '@/components/nav/NavPublic';
import { BlogFooter } from '@/components/nav/BlogFooter';

const freeFeatures = [
  'Daily directive each morning',
  'Connect Google or Microsoft',
  'First 3 finished artifacts included',
];

const proFeatures = [
  'Unlimited finished artifacts',
  'Drafted emails, documents, and decision frames',
  'Approve and send in one step',
  'Learns from every approve and skip',
];

function ProCheckoutButton() {
  const { data: session, status } = useSession();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCheckout = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: session?.user?.id,
          email: session?.user?.email ?? undefined,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401) {
        window.location.href = '/start?plan=pro';
        return;
      }
      if (!response.ok || !payload.url) {
        throw new Error(payload.error || 'Could not start checkout');
      }
      window.location.href = payload.url;
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
        className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-button bg-accent px-4 text-xs font-black uppercase tracking-[0.14em] text-bg transition-colors hover:bg-accent-hover"
      >
        Upgrade to Pro
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    );
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={handleCheckout}
        disabled={loading}
        className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-button bg-accent px-4 text-xs font-black uppercase tracking-[0.14em] text-bg transition-colors hover:bg-accent-hover disabled:cursor-wait disabled:opacity-60"
      >
        {loading ? 'Loading…' : 'Continue to checkout'}
      </button>
      {error && <p className="text-xs text-text-secondary">{error}</p>}
    </div>
  );
}

const faq = [
  {
    question: 'What is free?',
    answer: 'Free includes your daily directive and your first three finished artifacts. No credit card is required.',
  },
  {
    question: 'What changes on Pro?',
    answer: 'Pro removes the artifact limit and keeps delivering full finished work every morning.',
  },
  {
    question: 'Can I cancel?',
    answer: 'Yes. Cancel anytime from dashboard settings.',
  },
];

export default function PricingPage() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="bg-bg text-text-primary">
      <NavPublic scrolled={scrolled} platformHref="/#product" />
      <main id="main" className="pt-24 sm:pt-32">
        <section className="border-b border-border-subtle pb-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-accent">Pricing</p>
            <h1 className="mt-6 text-5xl font-black tracking-tight sm:text-6xl">Start free. Upgrade when it clicks.</h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-text-secondary">
              The free tier proves value first. Pro removes limits once you want finished artifacts every morning.
            </p>
          </div>
        </section>

        <section className="border-b border-border-subtle py-16">
          <div className="mx-auto grid max-w-6xl gap-5 px-4 sm:px-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,0.9fr)]">
            <article className="rounded-card border border-accent-dim bg-panel p-7 sm:p-8">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-accent">Pro</p>
              <div className="mt-4 flex items-end gap-3">
                <p className="text-5xl font-black tracking-tight">$29</p>
                <p className="pb-1 text-xs font-black uppercase tracking-[0.14em] text-text-secondary">per month</p>
              </div>
              <p className="mt-4 max-w-2xl text-sm leading-relaxed text-text-secondary">
                Keep the full brief visible and ready to act on every morning.
              </p>
              <ul className="mt-7 divide-y divide-border-subtle border-y border-border-subtle">
                {proFeatures.map((feature) => (
                  <li key={feature} className="flex items-start gap-3 py-3 text-sm text-text-primary">
                    <Check className="mt-0.5 h-4 w-4 text-success" aria-hidden="true" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-8">
                <ProCheckoutButton />
              </div>
            </article>

            <aside className="rounded-card border border-border bg-panel p-7 sm:p-8">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-text-secondary">Free</p>
              <p className="mt-4 text-4xl font-black tracking-tight">$0</p>
              <p className="mt-4 text-sm leading-relaxed text-text-secondary">
                Start with one daily directive and your first three finished artifacts.
              </p>
              <ul className="mt-6 space-y-3">
                {freeFeatures.map((feature) => (
                  <li key={feature} className="flex items-start gap-3 text-sm text-text-primary">
                    <Check className="mt-0.5 h-4 w-4 text-success" aria-hidden="true" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <Link
                href="/start"
                className="mt-8 inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-button border border-border bg-panel-raised px-4 text-xs font-black uppercase tracking-[0.14em] text-text-primary transition-colors hover:border-border-strong"
              >
                Get started free
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </aside>
          </div>
        </section>

        <section className="py-16">
          <div className="mx-auto max-w-4xl px-4 sm:px-6">
            <h2 className="text-2xl font-black tracking-tight sm:text-3xl">Questions</h2>
            <div className="mt-8 divide-y divide-border-subtle border-y border-border-subtle">
              {faq.map((item) => (
                <article key={item.question} className="py-5 sm:py-6">
                  <h3 className="text-sm font-black uppercase tracking-[0.12em] text-text-primary">{item.question}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-text-secondary">{item.answer}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <BlogFooter />
      </main>
    </div>
  );
}
