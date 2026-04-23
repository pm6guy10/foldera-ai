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
      <div className="pointer-events-none absolute -right-20 -top-14 h-52 w-52 rounded-full bg-accent-dim/20 blur-3xl" />
      <div className="pointer-events-none absolute left-10 top-16 h-40 w-40 rounded-full bg-panel-raised/80 blur-3xl" />

      <div className="relative flex items-center justify-between gap-3 border-b border-border-subtle bg-panel-raised/60 px-5 py-3.5 sm:px-6">
        <div className="flex items-center gap-2.5">
          <span className="h-1.5 w-1.5 rounded-full bg-text-muted" />
          <span className="h-1.5 w-1.5 rounded-full bg-text-muted" />
          <span className="h-1.5 w-1.5 rounded-full bg-text-muted" />
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-text-secondary">TODAY’S DIRECTIVE</p>
        </div>
        <span className="inline-flex items-center rounded-badge border border-accent-dim px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-accent">
          READY TO SEND
        </span>
      </div>

      <div className="relative space-y-6 px-5 py-6 sm:px-7 sm:py-7">
        <div className="rounded-[18px] border border-border-subtle bg-panel-raised p-4 sm:p-5">
          <p className="text-base font-semibold leading-relaxed text-text-primary sm:text-[17px]">
            Send the follow-up to Darlene Craig before noon.
          </p>
        </div>

        <div className="border-t border-border-subtle pt-4">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-text-secondary">WHY THIS NOW</p>
          <p className="mt-2 text-sm leading-relaxed text-text-secondary">
            You have an open thread with no reply, the ask is time-bound, and the current hold on your calendar
            makes this the cleanest unblocker today.
          </p>
        </div>

        <div className="rounded-[18px] border border-border-subtle bg-panel-raised p-4 sm:p-5">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-text-secondary">READY-TO-SEND DRAFT</p>
          <p className="mt-2 text-sm leading-relaxed text-text-primary">
            Hi Darlene — following up on the MEDS item from yesterday. I pulled the current status and can send the
            finalized version by noon unless you want one adjustment first.
          </p>
        </div>

        <div className="rounded-[18px] border border-border-subtle bg-panel-raised/60 p-4 sm:p-5">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-text-secondary">SOURCE BASIS</p>
          <div className="mt-2 flex flex-wrap gap-2">
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
          <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px]">
            <div className="absolute left-1/2 top-10 h-[470px] w-[980px] -translate-x-1/2 rounded-[48px] border border-border-subtle" />
            <div className="absolute right-[8%] top-16 h-72 w-72 rounded-full bg-accent-dim/20 blur-3xl" />
            <div className="absolute left-[12%] top-28 h-56 w-56 rounded-full bg-panel-raised/80 blur-3xl" />
          </div>
          <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
            <div className="grid gap-10 pb-20 lg:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)] lg:items-start lg:gap-14 lg:pb-24">
              <div className="max-w-lg lg:pt-6">
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
              <div className="relative lg:-mr-2">
                <div className="pointer-events-none absolute -inset-4 hidden rounded-[34px] border border-border-subtle lg:block" />
                <div className="relative">
                  <HeroArtifactCard />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-b border-border-subtle py-8 sm:py-9">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="grid border-y border-border-subtle md:grid-cols-3">
              {proofStrip.map((item, index) => (
                <p
                  key={item}
                  className={`px-4 py-4 text-sm leading-relaxed text-text-secondary sm:px-5 ${index > 0 ? 'border-t border-border-subtle md:border-l md:border-t-0' : ''}`}
                >
                  {item}
                </p>
              ))}
            </div>
          </div>
        </section>

        <section className="border-b border-border-subtle py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="text-3xl font-black tracking-tight sm:text-4xl">How Foldera works</h2>
            <div className="mt-10 grid gap-5 md:grid-cols-3">
              {howItWorks.map((item) => (
                <article key={item.title} className="flex h-full flex-col border-l border-border-subtle pl-4 pr-2">
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
            <div className="mt-10 overflow-hidden rounded-[24px] border border-border-subtle bg-panel-raised/60">
              {briefRows.map((row, index) => (
                <article
                  key={row.title}
                  className={`px-5 py-6 sm:px-6 ${index > 0 ? 'border-t border-border-subtle' : ''}`}
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
            <div className="rounded-[24px] border border-border-subtle bg-panel-raised/40 p-6 sm:p-8">
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
