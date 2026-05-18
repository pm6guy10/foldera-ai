'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, Sparkles } from 'lucide-react';
import { DailyBriefCard } from '@/components/foldera/DailyBriefCard';
import { FolderaLogo } from '@/components/foldera/FolderaLogo';
import { NavPublic } from '@/components/nav/NavPublic';

const sourceCategories = ['Email', 'Calendar', 'Docs', 'Tasks', 'Notes', 'Chat'];

const proofRow = [
  'One directive, not another task list',
  'Grounded in your connected sources',
  'Approval before anything moves',
];

const howItWorks = [
  {
    step: '1',
    title: 'Understand your inputs',
    body: 'Foldera reviews your messages, events, docs, and notes to spot what counts.',
  },
  {
    step: '2',
    title: 'Prioritize with context',
    body: 'It surfaces what matters and why, with linked source trail context.',
  },
  {
    step: '3',
    title: 'One finished next move',
    body: 'Review, approve, and send when you are ready.',
  },
];

const trustPoints = [
  'Approval before anything sends',
  'Source trail visible',
  'Private by design',
  'You stay in control',
];

const heroDraft = (
  <div className="space-y-4">
    <p>Send the follow-up to Alex Morgan before noon.</p>
    <p>Open thread, time-bound ask, and a clean window today.</p>
  </div>
);

const footerLinks = [
  { label: 'Platform', href: '/#platform' },
  { label: 'How it works', href: '/#how-it-works' },
  { label: 'Integrations', href: '/#integrations' },
  { label: 'Security', href: '/security' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Resources', href: '/blog' },
];

export function LandingPage({ isAuthenticated = false }: { isAuthenticated?: boolean }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#030912] text-slate-50">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(56,189,248,0.12),transparent_32%),radial-gradient(circle_at_80%_18%,rgba(139,92,246,0.12),transparent_32%),radial-gradient(circle_at_56%_40%,rgba(56,189,248,0.10),transparent_36%),linear-gradient(180deg,#020711_0%,#040b17_52%,#020711_100%)]" />
        <div className="absolute left-1/2 top-[18%] h-[30rem] w-[30rem] -translate-x-1/2 rounded-full bg-cyan-400/12 blur-3xl" />
      </div>

      <NavPublic scrolled={scrolled} platformHref="/#platform" isAuthenticated={isAuthenticated} />

      <main id="main" className="relative">
        <section id="platform" className="px-4 pb-14 pt-28 sm:px-6 sm:pt-32 lg:px-8 lg:pb-20">
          <div className="mx-auto max-w-[1480px]">
            <div className="grid gap-10 lg:grid-cols-[minmax(0,0.56fr)_minmax(0,0.44fr)] lg:items-center lg:gap-12">
              <div className="max-w-[680px]">
                <div className="inline-flex items-center gap-3 rounded-full bg-white/[0.04] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-100">
                  <Sparkles className="h-4 w-4 text-cyan-300" aria-hidden />
                  Your day. Already done.
                </div>

                <h1 data-testid="landing-hero-heading" className="mt-7 text-[58px] font-semibold leading-[0.9] tracking-[-0.08em] text-white sm:text-[82px] lg:text-[106px]">
                  One finished move.
                  <span className="block bg-gradient-to-r from-violet-400 via-blue-400 to-cyan-300 bg-clip-text text-transparent">Every morning.</span>
                </h1>

                <p className="mt-7 max-w-[42rem] text-[18px] leading-8 text-slate-300 sm:text-[21px]">
                  Foldera reads connected context, prepares the next move, shows the source trail, and waits for your approval.
                </p>

                <div className="mt-10 flex flex-col gap-3 sm:flex-row">
                  <a href="/start" className="inline-flex min-h-[56px] items-center justify-center gap-2 rounded-[14px] bg-gradient-to-r from-cyan-400 to-violet-500 px-6 text-[14px] font-semibold text-white shadow-[0_0_36px_rgba(56,189,248,0.35)] transition hover:brightness-110">
                    Get started free
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </a>
                  <a href="/demo" className="inline-flex min-h-[56px] items-center justify-center rounded-[14px] bg-white/[0.05] px-6 text-[14px] font-semibold text-slate-100 transition hover:bg-white/[0.09]">
                    See live demo
                  </a>
                </div>
              </div>

              <HeroArtifact />
            </div>

            <div className="mt-10 flex flex-wrap gap-6 text-sm text-slate-300">
              {proofRow.map((item) => (
                <div key={item} className="inline-flex items-center gap-2.5">
                  <CheckCircle2 className="h-4 w-4 text-cyan-300" aria-hidden />
                  {item}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="how-it-works" className="px-4 py-10 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-[1480px]">
            <h2 className="text-center text-[38px] font-semibold tracking-[-0.05em] text-white">How it works</h2>
            <div className="mt-8 grid gap-5 md:grid-cols-3">
              {howItWorks.map((item) => (
                <article key={item.step} className="rounded-[22px] bg-white/[0.03] p-6">
                  <p className="text-sm font-semibold text-cyan-200">{item.step}</p>
                  <h3 className="mt-2 text-[22px] font-semibold tracking-[-0.03em] text-white">{item.title}</h3>
                  <p className="mt-3 text-[15px] leading-7 text-slate-300">{item.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="integrations" className="px-4 py-8 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-[1480px] rounded-[26px] bg-white/[0.03] px-6 py-8 sm:px-8">
            <h2 className="text-center text-[34px] font-semibold tracking-[-0.05em] text-white">Works with the tools you already use</h2>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-3 text-sm text-slate-200">
              {sourceCategories.map((category) => (
                <span key={category} className="rounded-full bg-white/[0.05] px-4 py-2">
                  {category}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section id="security" className="px-4 py-8 sm:px-6 lg:px-8">
          <div data-testid="landing-trust-line" className="mx-auto max-w-[1480px] rounded-[26px] bg-white/[0.03] px-6 py-8 sm:px-8">
            <h2 className="text-center text-[34px] font-semibold tracking-[-0.05em] text-white">Built with trust in mind</h2>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {trustPoints.map((point) => (
                <div key={point} className="rounded-[14px] bg-white/[0.03] px-4 py-3 text-sm text-slate-200">
                  {point}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 pb-12 pt-8 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-[1480px] rounded-[28px] bg-[linear-gradient(90deg,rgba(8,36,64,0.75),rgba(70,24,122,0.55))] px-6 py-9 sm:px-8 sm:py-10">
            <h2 className="text-[44px] font-semibold leading-[1.02] tracking-[-0.05em] text-white">Your day. Already done.</h2>
            <p className="mt-3 text-[18px] text-slate-100">Start free and keep approval in your control.</p>
            <a href="/start" className="mt-6 inline-flex min-h-[54px] items-center justify-center gap-2 rounded-[12px] bg-white px-6 text-[14px] font-semibold text-slate-950">
              Get started free
              <ArrowRight className="h-4 w-4" aria-hidden />
            </a>
          </div>
        </section>

        <footer className="border-t border-white/10 px-4 pb-10 pt-8 sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-[1480px] flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <FolderaLogo href="/" />
              <p className="mt-3 max-w-[24rem] text-sm leading-6 text-slate-400">Foldera reads connected context and prepares one finished next move.</p>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-3 text-sm text-slate-300/80">
              {footerLinks.map((item) => (
                <a key={item.label} href={item.href} className="transition-colors hover:text-white">
                  {item.label}
                </a>
              ))}
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}

function HeroArtifact() {
  return (
    <article
      data-testid="landing-proof-card"
      className="relative overflow-hidden rounded-[28px] bg-[linear-gradient(180deg,rgba(5,11,22,0.96),rgba(5,10,20,0.98))] p-4 shadow-[0_0_0_1px_rgba(59,130,246,0.45),0_0_80px_rgba(56,189,248,0.34),0_0_120px_rgba(124,58,237,0.24)] sm:p-5"
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_14%_16%,rgba(56,189,248,0.18),transparent_35%),radial-gradient(circle_at_90%_80%,rgba(167,139,250,0.18),transparent_40%)]" />
      <div className="relative">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white">Today&apos;s Brief</p>
        <div className="mt-4">
          <DailyBriefCard
            className="shadow-none"
            directive="Send the follow-up to Alex Morgan before noon."
            whyNow="Open thread, time-bound ask, and a clean window today."
            draftBody={heroDraft}
            sourcePills={['Email', 'Calendar', 'Docs', 'Notes']}
            nextStep="Nothing sends until you approve."
            footerText="Source trail visible."
            statusText="READY"
            actions={[
              { label: 'Review & send', kind: 'primary' },
              { label: 'Snooze 24h', kind: 'amber' },
              { label: 'Skip', kind: 'secondary' },
            ]}
          />
        </div>
      </div>
    </article>
  );
}
