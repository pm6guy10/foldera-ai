'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, ShieldCheck } from 'lucide-react';
import { MotionConfig, motion, type Variants } from 'framer-motion';
import { NavPublic } from '@/components/nav/NavPublic';
import { BlogFooter } from '@/components/nav/BlogFooter';

const freeFeatures = [
  'Daily source-backed check',
  'Connect Google or Microsoft',
  'First 3 finished artifacts included',
];

const proFeatures = [
  'Unlimited finished artifacts',
  'Drafted emails, documents, and decision frames',
  'Approve, skip, copy, or save with outbound off by default',
  'Learns from every approve and skip',
];

const trustLine = ['No card to start', 'Outbound off by default', 'Cancel anytime'];

const EASE = [0.16, 1, 0.3, 1] as const;
const fadeUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } },
};
const stagger: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } };

function ProCheckoutButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCheckout = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
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

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={handleCheckout}
        disabled={loading}
        className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full bg-accent px-5 text-[13px] font-semibold text-bg transition-all hover:-translate-y-px hover:bg-accent-hover hover:shadow-[0_10px_32px_-10px_rgba(245,166,35,0.5)] disabled:cursor-wait disabled:opacity-60"
      >
        {loading ? 'Loading…' : 'Upgrade to Pro'}
        {!loading && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
      </button>
      {error && <p className="text-xs text-text-secondary">{error}</p>}
    </div>
  );
}

const faq = [
  {
    question: 'What is free?',
    answer: 'Free includes the daily source-backed check and your first three finished artifacts. No credit card required.',
  },
  {
    question: 'What changes on Pro?',
    answer: 'Pro removes the artifact limit and keeps showing finished work when it is safe, plus the blocker when it is not.',
  },
  {
    question: 'Can I cancel?',
    answer: 'Yes. Cancel anytime from your account controls.',
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
    <MotionConfig reducedMotion="user">
      <div className="foldera-app-surface min-h-[100dvh] text-text-primary">
        <NavPublic scrolled={scrolled} platformHref="/#product" />
        <main id="main" className="relative z-10 pt-28 sm:pt-36">
          {/* hero */}
          <section className="px-5 sm:px-6 lg:px-8">
            <motion.div
              className="mx-auto max-w-6xl"
              variants={stagger}
              initial="hidden"
              animate="show"
            >
              <motion.p
                variants={fadeUp}
                className="font-mono text-[11px] uppercase tracking-[0.28em] text-accent"
              >
                Pricing
              </motion.p>
              <motion.h1
                variants={fadeUp}
                className="mt-6 max-w-3xl font-display text-[clamp(2.4rem,1.6rem+3.2vw,3.75rem)] font-semibold leading-[1.02] tracking-[-0.03em]"
              >
                Start free. Upgrade when it clicks.
              </motion.h1>
              <motion.p
                variants={fadeUp}
                className="mt-6 max-w-2xl text-lg leading-8 text-text-secondary"
              >
                The free tier proves value first. Pro removes limits once you want a daily finished-work inbox.
              </motion.p>
              <motion.div
                variants={fadeUp}
                className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted"
              >
                {trustLine.map((t, i) => (
                  <span key={t} className="inline-flex items-center gap-2">
                    {i > 0 && <span className="text-text-muted/40">·</span>}
                    {t}
                  </span>
                ))}
              </motion.div>
            </motion.div>
          </section>

          {/* plans */}
          <section className="px-5 py-16 sm:px-6 lg:px-8 lg:py-20">
            <motion.div
              className="mx-auto grid max-w-6xl items-start gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.95fr)]"
              variants={stagger}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: '-80px' }}
            >
              {/* Pro — premium card */}
              <motion.article
                variants={fadeUp}
                className="relative overflow-hidden rounded-[var(--r-card)] p-7 sm:p-9"
                style={{
                  border: '1px solid rgba(245,166,35,0.32)',
                  backgroundImage:
                    'radial-gradient(120% 80% at 85% -10%, rgba(245,166,35,0.10), transparent 56%), linear-gradient(180deg, #16161c 0%, #0d0d11 100%)',
                  boxShadow: 'var(--shadow-window)',
                }}
              >
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 top-0 h-px"
                  style={{ background: 'linear-gradient(90deg, transparent, rgba(245,166,35,0.6), transparent)' }}
                />
                <div className="flex items-center justify-between">
                  <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">Pro</p>
                  <span className="rounded-full border border-accent/30 bg-accent/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
                    Recommended
                  </span>
                </div>
                <div className="mt-5 flex items-end gap-2.5">
                  <p className="font-display text-[3.25rem] font-semibold leading-none tracking-[-0.03em]">$29</p>
                  <p className="pb-2 font-mono text-[11px] uppercase tracking-[0.18em] text-text-muted">per month</p>
                </div>
                <p className="mt-4 max-w-md text-[15px] leading-7 text-text-secondary">
                  Keep the full finished-work inbox visible, including source trail, actions, and safe holdbacks.
                </p>
                <ul className="mt-7 space-y-3.5">
                  {proFeatures.map((feature) => (
                    <li key={feature} className="flex items-start gap-3 text-[15px] text-text-primary">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/12">
                        <Check className="h-3 w-3 text-accent" aria-hidden="true" />
                      </span>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-9">
                  <ProCheckoutButton />
                </div>
              </motion.article>

              {/* Free — flat card */}
              <motion.aside
                variants={fadeUp}
                className="rounded-[var(--r-card)] border border-border bg-panel/60 p-7 sm:p-9"
              >
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-text-muted">Free</p>
                <div className="mt-5 flex items-end gap-2.5">
                  <p className="font-display text-[3.25rem] font-semibold leading-none tracking-[-0.03em]">$0</p>
                  <p className="pb-2 font-mono text-[11px] uppercase tracking-[0.18em] text-text-muted">forever</p>
                </div>
                <p className="mt-4 text-[15px] leading-7 text-text-secondary">
                  Start with a daily source-backed check and your first three finished artifacts.
                </p>
                <ul className="mt-7 space-y-3.5">
                  {freeFeatures.map((feature) => (
                    <li key={feature} className="flex items-start gap-3 text-[15px] text-text-primary">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/[0.06]">
                        <Check className="h-3 w-3 text-text-secondary" aria-hidden="true" />
                      </span>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/start"
                  className="mt-9 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full border border-border-strong bg-transparent px-5 text-[13px] font-semibold text-text-primary transition-colors hover:border-text-muted hover:bg-white/[0.03]"
                >
                  Get started free
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </motion.aside>
            </motion.div>

            {/* enterprise line — quiet, no box */}
            <div className="mx-auto mt-10 flex max-w-6xl flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
              <div className="flex items-center gap-3">
                <ShieldCheck className="h-5 w-5 text-accent" strokeWidth={1.5} aria-hidden="true" />
                <p className="text-[15px] text-text-muted">
                  <span className="text-text-secondary">Need team or enterprise?</span> Read-only connectors, least-privilege access, audit logs.
                </p>
              </div>
              <Link
                href="/security"
                className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent transition-colors hover:text-accent-hover"
              >
                See security →
              </Link>
            </div>
          </section>

          {/* FAQ — airy, no dividers */}
          <section className="px-5 pb-28 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-3xl">
              <h2 className="font-display text-[clamp(1.6rem,1.2rem+1.6vw,2.25rem)] font-semibold tracking-[-0.025em]">
                Questions
              </h2>
              <div className="mt-10 space-y-10">
                {faq.map((item) => (
                  <article key={item.question}>
                    <h3 className="text-[16px] font-semibold tracking-[-0.01em] text-text-primary">{item.question}</h3>
                    <p className="mt-2 text-[15px] leading-7 text-text-muted">{item.answer}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <BlogFooter />
        </main>
      </div>
    </MotionConfig>
  );
}
