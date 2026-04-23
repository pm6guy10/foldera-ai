'use client';

import { useEffect, useState } from 'react';
import { NavPublic } from '@/components/nav/NavPublic';
import { BlogFooter } from '@/components/nav/BlogFooter';

const proofStrip = [
  'Connected sources, not manual copy-paste',
  'Reasoning + draft + source trail in one brief',
  'Built for real work, not idea generation',
];

const howItWorks = [
  {
    title: 'Connect your sources',
    body: 'Foldera reads your email, calendar, and other approved context.',
  },
  {
    title: 'It finds the real blocker',
    body: 'Not the loudest task — the one that actually moves the outcome.',
  },
  {
    title: 'You get a finished move',
    body: 'A directive, draft, and source trail you can use immediately.',
  },
];

const briefRows = [
  {
    title: 'Directive',
    body: 'The single move that matters most right now.',
  },
  {
    title: 'Draft',
    body: 'Ready-to-send wording when writing is the bottleneck.',
  },
  {
    title: 'Source trail',
    body: 'The evidence behind the recommendation.',
  },
];

function HeroArtifactCard() {
  return (
    <article id="example-brief" className="rounded-card border border-border-strong bg-panel">
      <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-5 py-4 sm:px-6">
        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-text-secondary">TODAY’S DIRECTIVE</p>
        <span className="inline-flex items-center rounded-badge border border-accent-dim px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-accent">
          READY TO SEND
        </span>
      </div>

      <div className="space-y-5 px-5 py-5 sm:px-6 sm:py-6">
        <div>
          <p className="text-sm font-semibold leading-relaxed text-text-primary">
            Send the follow-up to Darlene Craig before noon.
          </p>
        </div>

        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-text-secondary">WHY THIS NOW</p>
          <p className="mt-2 text-sm leading-relaxed text-text-secondary">
            You have an open thread with no reply, the ask is time-bound, and the current hold on your calendar
            makes this the cleanest unblocker today.
          </p>
        </div>

        <div className="rounded-card border border-border-subtle bg-panel-raised p-4 sm:p-5">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-text-secondary">READY-TO-SEND DRAFT</p>
          <p className="mt-2 text-sm leading-relaxed text-text-primary">
            Hi Darlene — following up on the MEDS item from yesterday. I pulled the current status and can send the
            finalized version by noon unless you want one adjustment first.
          </p>
        </div>

        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-text-secondary">SOURCE BASIS</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="rounded-badge border border-border px-2 py-1 text-xs text-text-secondary">Email thread</span>
            <span className="rounded-badge border border-border px-2 py-1 text-xs text-text-secondary">Calendar hold</span>
            <span className="rounded-badge border border-border px-2 py-1 text-xs text-text-secondary">Last draft</span>
            <span className="rounded-badge border border-border px-2 py-1 text-xs text-text-secondary">Connected inbox</span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border-subtle px-5 py-4 text-xs sm:px-6">
        <p className="text-text-muted">Grounded in connected sources</p>
        <span className="font-semibold text-text-secondary">View full brief →</span>
      </div>
    </article>
  );
}

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
          <div className="mx-auto grid max-w-6xl gap-10 px-4 pb-16 sm:px-6 lg:grid-cols-[1fr_1.05fr] lg:items-start lg:gap-12 lg:pb-20">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-accent">FINISHED WORK, EVERY MORNING</p>
              <h1 className="mt-6 text-5xl font-black leading-[0.95] tracking-tight sm:text-6xl">
                One finished move.
                <br />
                Every morning.
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-text-secondary">
                Foldera reads the signals around your real work and delivers the one directive worth acting on — with
                the reasoning, draft, and source trail already assembled.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <a
                  href="/start"
                  className="inline-flex min-h-[48px] items-center justify-center rounded-button bg-accent px-6 text-xs font-black uppercase tracking-[0.14em] text-bg transition-colors hover:bg-accent-hover"
                >
                  Start free
                </a>
                <a
                  href="#example-brief"
                  className="inline-flex min-h-[48px] items-center justify-center rounded-button border border-border px-6 text-xs font-black uppercase tracking-[0.14em] text-text-secondary transition-colors hover:text-text-primary"
                >
                  See example brief
                </a>
              </div>
              <p className="mt-4 max-w-lg text-xs leading-relaxed text-text-muted">
                Read-only source sync. No fake automation theater. Real artifacts you can use.
              </p>
            </div>
            <HeroArtifactCard />
          </div>
        </section>

        <section className="border-b border-border-subtle py-8 sm:py-10">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="rounded-card border border-border bg-panel">
              <div className="grid divide-y divide-border-subtle md:grid-cols-3 md:divide-x md:divide-y-0">
                {proofStrip.map((item) => (
                  <p key={item} className="px-4 py-4 text-sm leading-relaxed text-text-secondary sm:px-5">
                    {item}
                  </p>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="border-b border-border-subtle py-14 sm:py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="text-3xl font-black tracking-tight sm:text-4xl">How Foldera works</h2>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {howItWorks.map((item) => (
                <article key={item.title} className="flex h-full flex-col rounded-card border border-border bg-panel p-6">
                  <h3 className="text-base font-semibold tracking-tight text-text-primary">{item.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-text-secondary">{item.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="border-b border-border-subtle py-14 sm:py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="text-3xl font-black tracking-tight sm:text-4xl">What shows up in the brief</h2>
            <div className="mt-8 overflow-hidden rounded-card border border-border bg-panel">
              {briefRows.map((row, index) => (
                <article
                  key={row.title}
                  className={`px-5 py-5 sm:px-6 ${index > 0 ? 'border-t border-border-subtle' : ''}`}
                >
                  <h3 className="text-base font-semibold tracking-tight text-text-primary">{row.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-text-secondary">{row.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="py-14 sm:py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="rounded-card border border-border bg-panel p-6 sm:p-8">
              <h2 className="text-3xl font-black leading-tight tracking-tight sm:text-4xl">
                Stop staring at the work.
                <br />
                Get the next finished move.
              </h2>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <a
                  href="/start"
                  className="inline-flex min-h-[48px] items-center justify-center rounded-button bg-accent px-6 text-xs font-black uppercase tracking-[0.14em] text-bg transition-colors hover:bg-accent-hover"
                >
                  Start free
                </a>
                <a
                  href="/pricing"
                  className="inline-flex min-h-[48px] items-center justify-center rounded-button border border-border px-6 text-xs font-black uppercase tracking-[0.14em] text-text-secondary transition-colors hover:text-text-primary"
                >
                  Pricing
                </a>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-text-secondary">
                Foldera is built to turn scattered signals into one usable action.
              </p>
            </div>
          </div>
        </section>

        <BlogFooter />
      </main>
    </div>
  );
}
