'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import { NavPublic } from '@/components/nav/NavPublic';
import { BlogFooter } from '@/components/nav/BlogFooter';

function HeroArtifact() {
  return (
    <section className="rounded-card border border-border bg-panel">
      <div className="border-b border-border-subtle px-6 py-6 sm:px-8">
        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-accent">Today&apos;s directive</p>
        <h2 className="mt-3 text-2xl font-bold tracking-tight text-text-primary">
          Reply before this thread dies.
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-text-secondary">
          Response time slipped from hours to days. They reopened today, and a clear ask can still close the loop.
        </p>
      </div>
      <div className="px-6 py-6 sm:px-8">
        <div className="rounded-card border border-border-subtle bg-panel-raised p-6">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-text-secondary">Drafted email</p>
          <p className="mt-3 text-sm text-text-secondary">To Jordan Kim</p>
          <p className="mt-1 text-sm font-semibold text-text-primary">Subject: Updated scope and next step</p>
          <p className="mt-4 text-sm leading-relaxed text-text-primary">
            Thanks for your patience. I tightened the scope and answered the open questions from Friday.
            If this looks right, I can lock 30 minutes Thursday and move this forward.
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-3 border-t border-border-subtle bg-panel px-6 py-6 sm:flex-row sm:px-8">
        <button
          type="button"
          className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-button bg-accent px-4 text-xs font-black uppercase tracking-[0.14em] text-bg"
        >
          <Check className="h-4 w-4" aria-hidden="true" />
          Approve
        </button>
        <button
          type="button"
          className="inline-flex min-h-[48px] items-center justify-center rounded-button border border-border px-6 text-xs font-black uppercase tracking-[0.14em] text-text-secondary"
        >
          Skip
        </button>
      </div>
    </section>
  );
}

const howItWorks = [
  {
    title: 'Read',
    body: 'Foldera reads connected inbox and calendar context in the background.',
  },
  {
    title: 'Decide',
    body: 'It chooses one move that protects the highest-stakes outcome.',
  },
  {
    title: 'Deliver',
    body: 'You get a finished artifact you can approve or skip in seconds.',
  },
];

const outcomes = [
  'Revenue threads that slipped this week',
  'Hiring conversations that lost momentum',
  'Decisions that keep reopening without closure',
];

export default function HomePageClient() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="bg-bg text-text-primary">
      <NavPublic scrolled={scrolled} platformHref="#product" />
      <main id="main">
        <section id="product" className="border-b border-border-subtle pt-24 sm:pt-32">
          <div className="mx-auto grid max-w-6xl gap-12 px-4 pb-20 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:items-start">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-accent">
                Finished work, every morning
              </p>
              <h1 className="mt-6 text-5xl font-black leading-[0.95] tracking-tight sm:text-6xl">
                Finished work.
                <br />
                Before you ask.
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-text-secondary">
                Foldera reads your live threads, chooses one high-leverage move, and drafts the artifact
                so you can approve it fast.
              </p>
              <a
                href="/start"
                className="mt-8 inline-flex min-h-[48px] items-center gap-2 rounded-button bg-accent px-6 text-xs font-black uppercase tracking-[0.14em] text-bg transition-colors hover:bg-accent-hover"
              >
                Get started free
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </a>
              <p className="mt-3 text-xs text-text-muted">No credit card required.</p>
            </div>
            <HeroArtifact />
          </div>
        </section>

        <section className="border-b border-border-subtle py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="grid gap-4 md:grid-cols-3">
              {howItWorks.map((item) => (
                <article key={item.title} className="rounded-card border border-border bg-panel p-6">
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-accent">{item.title}</p>
                  <p className="mt-3 text-sm leading-relaxed text-text-secondary">{item.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="border-b border-border-subtle py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="text-3xl font-black tracking-tight sm:text-4xl">Where this protects outcomes</h2>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-text-secondary">
              Foldera is built for moments where delay costs trust, momentum, or revenue.
            </p>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {outcomes.map((outcome) => (
                <article key={outcome} className="rounded-card border border-border bg-panel p-6">
                  <p className="text-sm leading-relaxed text-text-primary">{outcome}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="pricing" className="py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="text-3xl font-black tracking-tight sm:text-4xl">Pricing</h2>
            <p className="mt-4 text-base text-text-secondary">Start free. Upgrade when you want unlimited finished artifacts.</p>
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              <article className="rounded-card border border-border bg-panel p-8">
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-text-secondary">Free</p>
                <p className="mt-4 text-5xl font-black tracking-tight">$0</p>
                <p className="mt-4 text-sm leading-relaxed text-text-secondary">
                  Daily directive plus your first three finished artifacts.
                </p>
              </article>
              <article className="rounded-card border border-accent-dim bg-panel p-8">
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-accent">Pro</p>
                <p className="mt-4 text-5xl font-black tracking-tight">$29<span className="text-base text-text-secondary">/mo</span></p>
                <p className="mt-4 text-sm leading-relaxed text-text-secondary">
                  Unlimited drafted emails, documents, and decision frames delivered each morning.
                </p>
              </article>
            </div>
          </div>
        </section>

        <BlogFooter />
      </main>
    </div>
  );
}

