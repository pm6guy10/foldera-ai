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
    <article
      id="example-brief"
      className="relative overflow-hidden rounded-[30px] border border-border-strong bg-panel"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-44 border-b border-border-subtle bg-panel-raised/60" />
      <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-accent-dim/20 blur-3xl" />

      <div className="relative border-b border-border-subtle px-5 py-4 sm:px-7">
        <div className="flex items-center justify-between gap-4">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-text-secondary">DAILY BRIEF</p>
          <span className="inline-flex items-center rounded-badge border border-accent-dim px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-accent">
            READY TO SEND
          </span>
        </div>
        <p className="mt-3 text-[10px] font-black uppercase tracking-[0.14em] text-text-secondary">TODAY&apos;S DIRECTIVE</p>
      </div>

      <div className="relative space-y-7 px-5 py-7 sm:px-7 sm:py-8">
        <div className="rounded-[20px] border border-border bg-panel-raised px-4 py-5 sm:px-6">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-text-secondary">DIRECTIVE</p>
          <p className="mt-3 text-base font-semibold leading-relaxed text-text-primary sm:text-[19px]">
            Send the follow-up to Casey Hunter before noon.
          </p>
        </div>

        <div className="border-y border-border-subtle py-5">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-text-secondary">WHY THIS NOW</p>
          <p className="mt-3 text-sm leading-relaxed text-text-secondary">
            You have an open thread with no reply, the ask is time-bound, and the current hold on your calendar
            makes this the cleanest unblocker today.
          </p>
        </div>

        <div className="rounded-[20px] border border-border-subtle bg-panel-raised px-4 py-5 sm:px-6">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-text-secondary">READY-TO-SEND DRAFT</p>
          <p className="mt-3 text-sm leading-relaxed text-text-primary">
            Hi Casey — following up on the MEDS item from yesterday. I pulled the current status and can send the
            finalized version by noon unless you want one adjustment first.
          </p>
        </div>

        <div className="rounded-[20px] border border-border-subtle bg-panel-raised/50 px-4 py-5 sm:px-6">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-text-secondary">SOURCE BASIS</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-badge border border-border px-2 py-1 text-xs text-text-secondary">Email thread</span>
            <span className="rounded-badge border border-border px-2 py-1 text-xs text-text-secondary">Calendar hold</span>
            <span className="rounded-badge border border-border px-2 py-1 text-xs text-text-secondary">Last draft</span>
            <span className="rounded-badge border border-border px-2 py-1 text-xs text-text-secondary">Connected inbox</span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border-subtle px-5 py-3 text-xs sm:px-6">
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
        <section id="product" className="relative overflow-hidden border-b border-border-subtle pt-24 sm:pt-32 lg:pt-36">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-[700px]">
            <div className="absolute left-1/2 top-6 h-[620px] w-[min(96%,1320px)] -translate-x-1/2 rounded-[52px] border border-border-subtle" />
            <div className="absolute right-[8%] top-16 h-80 w-80 rounded-full bg-accent-dim/20 blur-3xl" />
            <div className="absolute left-[8%] top-24 h-64 w-64 rounded-full bg-panel-raised/80 blur-3xl" />
          </div>
          <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
            <div className="relative overflow-hidden rounded-[40px] border border-border bg-panel pb-10 pt-8 sm:pb-12 sm:pt-11 lg:pb-14 lg:pt-12">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-52 border-b border-border-subtle bg-panel-raised/25" />
              <div className="grid gap-10 px-5 sm:px-8 lg:grid-cols-[minmax(0,0.45fr)_minmax(0,1.55fr)] lg:items-start lg:gap-14 lg:px-10">
                <div className="max-w-sm lg:pt-8">
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-accent">FINISHED WORK, EVERY MORNING</p>
                  <h1 className="mt-6 text-5xl font-black leading-[0.95] tracking-tight sm:text-6xl">
                    One finished move.
                    <br />
                    Every morning.
                  </h1>
                  <p className="mt-6 text-lg leading-relaxed text-text-secondary">
                    Foldera reads the signals around your real work and delivers the one directive worth acting on —
                    with the reasoning, draft, and source trail already assembled.
                  </p>
                  <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
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
                  <p className="mt-4 max-w-xs text-xs leading-relaxed text-text-muted">
                    Read-only source sync. No fake automation theater. Real artifacts you can use.
                  </p>
                </div>
                <div className="relative">
                  <div className="pointer-events-none absolute -inset-4 hidden rounded-[34px] border border-border-subtle lg:block" />
                  <div className="relative">
                    <HeroArtifactCard />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-b border-border-subtle py-12 sm:py-14">
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <div className="divide-y divide-border-subtle border-y border-border-subtle">
              {proofStrip.map((item) => (
                <p
                  key={item}
                  className="px-1 py-4 text-sm leading-relaxed text-text-secondary sm:px-2 sm:py-5"
                >
                  {item}
                </p>
              ))}
            </div>
          </div>
        </section>

        <section className="border-b border-border-subtle py-16 sm:py-20">
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <h2 className="text-3xl font-black tracking-tight sm:text-4xl">How Foldera works</h2>
            <div className="mt-10 divide-y divide-border-subtle border-y border-border-subtle">
              {howItWorks.map((item, index) => (
                <article key={item.title} className="grid gap-3 py-6 sm:grid-cols-[84px_minmax(0,1fr)] sm:gap-8 sm:py-7">
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-text-muted">0{index + 1}</p>
                  <div>
                    <h3 className="text-base font-semibold tracking-tight text-text-primary">{item.title}</h3>
                    <p className="mt-3 text-sm leading-relaxed text-text-secondary">{item.body}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="border-b border-border-subtle py-14 sm:py-16">
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <div className="grid gap-8 lg:grid-cols-[minmax(0,0.54fr)_minmax(0,1fr)] lg:items-start">
              <h2 className="text-3xl font-black tracking-tight sm:text-4xl">What shows up in the brief</h2>
              <div className="divide-y divide-border-subtle border-y border-border-subtle">
                {briefRows.map((row) => (
                  <article key={row.title} className="py-5 sm:py-6">
                    <h3 className="text-base font-semibold tracking-tight text-text-primary">{row.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-text-secondary">{row.body}</p>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="py-16 sm:py-20">
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <div className="border-t border-border-subtle pt-10 sm:pt-12">
              <h2 className="text-3xl font-black leading-tight tracking-tight sm:text-4xl">
                Stop staring at the work.
                <br />
                Get the next finished move.
              </h2>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
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
