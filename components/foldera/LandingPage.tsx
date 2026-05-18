'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, Sparkles } from 'lucide-react';
import { DailyBriefCard } from '@/components/foldera/DailyBriefCard';
import { FolderaLogo } from '@/components/foldera/FolderaLogo';
import { NavPublic } from '@/components/nav/NavPublic';

const sourceCategories = ['Email', 'Calendar', 'Docs', 'Tasks', 'Notes', 'Chat'];

const trustPoints = [
  'Approval before anything sends',
  'Source trail visible',
  'Private by design',
  'You stay in control',
];

const heroDraft = (
  <div className="space-y-4">
    <p>Hi Riley - finalized plan preview attached with the latest context included.</p>
    <p>If you approve, this is ready to move this morning.</p>
  </div>
);

const footerLinks = [
  { label: 'Pricing', href: '/pricing' },
  { label: 'Blog', href: '/blog' },
  { label: 'About', href: '/about' },
  { label: 'Security', href: '/security' },
  { label: 'Status', href: '/status' },
  { label: 'Privacy', href: '/privacy' },
  { label: 'Terms', href: '/terms' },
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
    <div className="relative min-h-screen overflow-x-hidden bg-[#02050a] text-slate-50">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_52%_8%,rgba(56,189,248,0.16),transparent_32%),radial-gradient(circle_at_16%_24%,rgba(56,189,248,0.10),transparent_28%),radial-gradient(circle_at_84%_28%,rgba(167,139,250,0.11),transparent_30%),linear-gradient(180deg,#01040a_0%,#040914_52%,#01040a_100%)]" />
        <div className="absolute left-1/2 top-[10%] h-[34rem] w-[34rem] -translate-x-1/2 rounded-full bg-cyan-300/10 blur-3xl" />
        <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-[#010308] to-transparent" />
      </div>

      <NavPublic scrolled={scrolled} platformHref="/#artifact" isAuthenticated={isAuthenticated} />

      <main id="main" className="relative">
        <section className="px-4 pb-14 pt-28 sm:px-6 sm:pt-32 lg:px-8 lg:pb-20">
          <div className="mx-auto max-w-[1320px]">
            <div className="mx-auto max-w-[920px] text-center">
              <div className="inline-flex items-center gap-3 rounded-full bg-white/[0.04] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-100">
                <Sparkles className="h-4 w-4 text-cyan-300" aria-hidden />
                Your day. Already done.
              </div>

              <h1
                data-testid="landing-hero-heading"
                className="mx-auto mt-8 max-w-[10ch] text-[56px] font-semibold leading-[0.9] tracking-[-0.08em] text-white sm:text-[84px] lg:text-[112px]"
              >
                One finished move.
                <span className="mt-2 block bg-gradient-to-r from-white via-cyan-100 to-sky-300 bg-clip-text text-transparent">
                  Every morning.
                </span>
              </h1>

              <p className="mx-auto mt-8 max-w-[42rem] text-[18px] leading-8 text-slate-300 sm:text-[21px]">
                Foldera reads connected context, prepares the next move, shows the source trail, and waits for your approval.
              </p>

              <div className="mt-11 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <a
                  href="/start"
                  className="inline-flex min-h-[58px] items-center justify-center gap-2 rounded-[16px] bg-white px-6 text-[14px] font-semibold text-slate-950 shadow-[0_0_42px_rgba(255,255,255,0.14)] transition-transform duration-150 hover:-translate-y-0.5"
                >
                  Get started free
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </a>
                <a
                  href="/demo"
                  className="inline-flex min-h-[58px] items-center justify-center rounded-[16px] bg-cyan-400/[0.11] px-6 text-[14px] font-semibold text-cyan-100 transition-colors hover:bg-cyan-400/[0.16]"
                >
                  See live demo
                </a>
              </div>

              <div className="mt-10 flex flex-wrap items-center justify-center gap-2.5 text-sm text-slate-300">
                {sourceCategories.map((category) => (
                  <span key={category} className="rounded-full bg-white/[0.04] px-3.5 py-1.5">
                    {category}
                  </span>
                ))}
              </div>
            </div>

            <div id="artifact" className="mx-auto mt-16 max-w-[980px] sm:mt-20 lg:mt-24">
              <HeroArtifact />
            </div>
          </div>
        </section>

        <section className="px-4 pb-10 pt-4 sm:px-6 sm:pb-12 lg:px-8">
          <div className="mx-auto max-w-[1120px]">
            <div data-testid="landing-trust-line" className="rounded-[28px] bg-white/[0.03] px-6 py-8 sm:px-8 sm:py-10">
              <h2 className="text-center text-[30px] font-semibold leading-[1.05] tracking-[-0.05em] text-white sm:text-[38px]">
                Source trail visible. Approval stays with you.
              </h2>
              <div className="mt-7 grid gap-3 text-sm text-slate-300 sm:grid-cols-2">
                {trustPoints.map((point) => (
                  <div key={point} className="inline-flex items-center gap-3 rounded-[14px] bg-white/[0.03] px-4 py-3">
                    <CheckCircle2 className="h-4 w-4 text-cyan-300" aria-hidden />
                    {point}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <footer className="border-t border-white/8 px-4 pb-12 pt-8 sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-[1120px] flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <FolderaLogo href="/" />
              <p className="mt-3 max-w-[22rem] text-sm leading-6 text-slate-400">One finished move every morning.</p>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-3 text-sm text-slate-300/80">
              {footerLinks.map((link) => (
                <a key={link.label} href={link.href} className="transition-colors hover:text-white">
                  {link.label}
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
      className="relative overflow-hidden rounded-[36px] bg-[linear-gradient(180deg,rgba(4,10,18,0.88),rgba(3,7,13,0.94))] p-4 shadow-[0_0_90px_rgba(34,211,238,0.20),0_40px_140px_rgba(0,0,0,0.62)] sm:p-6"
    >
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-[-20%] h-[26rem] w-[26rem] -translate-x-1/2 rounded-full bg-cyan-300/18 blur-3xl" />
        <div className="absolute right-[-10%] top-[25%] h-56 w-56 rounded-full bg-violet-400/14 blur-3xl" />
      </div>

      <div className="relative rounded-[24px] bg-[#071220]/80 p-4 sm:p-5">
        <p className="text-center text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-200/92">Daily Brief / Plan Preview</p>
        <div className="mt-4">
          <DailyBriefCard
            className="shadow-[0_0_58px_rgba(34,211,238,0.28)]"
            directive="Send the board update before the review hold expires."
            whyNow="The thread is still open, the review hold is this morning, and the prepared draft already matches the latest context."
            draftBody={heroDraft}
            sourcePills={['Email', 'Calendar', 'Docs', 'Tasks']}
            nextStep="Nothing sends until you approve."
            footerText="Source trail visible. Approval stays with you."
            statusText="READY FOR APPROVAL"
            actions={[
              { label: 'View source trail', kind: 'secondary', href: '/demo' },
              { label: 'Hold', kind: 'amber' },
              { label: 'Approve', kind: 'primary' },
            ]}
          />
        </div>
      </div>
    </article>
  );
}
