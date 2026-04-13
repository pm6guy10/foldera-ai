'use client';

import React, { useEffect, useState } from 'react';
import { NavPublic } from '@/components/nav/NavPublic';
import { FolderaMark } from '@/components/nav/FolderaMark';
import { ArrowRight, Check } from 'lucide-react';

function Atmosphere() {
  return (
    <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden" aria-hidden="true">
      {/* Deep base */}
      <div className="absolute inset-0 bg-[#030305]" />
      {/* Faint structure — not a loud grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.018)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.018)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:radial-gradient(ellipse_90%_65%_at_50%_38%,#000_12%,transparent_72%)] opacity-35" />
      {/* Center-stage spotlight */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_95%_70%_at_50%_-5%,rgba(34,211,238,0.14),transparent_58%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_55%_50%_at_50%_42%,rgba(34,211,238,0.06),transparent_62%)]" />
      {/* Edge depth */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_100%,rgba(0,0,0,0.5),transparent_55%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_40%_35%_at_85%_55%,rgba(255,255,255,0.035),transparent_50%)]" />
    </div>
  );
}

function ArtifactCard() {
  return (
    <div className="relative w-full max-w-[min(100%,72rem)] mx-auto">
      {/* Stage glow */}
      <div
        className="absolute -inset-[min(8%,4rem)] rounded-[2.5rem] bg-gradient-to-b from-cyan-400/[0.12] via-cyan-500/[0.05] to-transparent blur-[80px] md:blur-[100px]"
        aria-hidden="true"
      />
      <div
        className="absolute -inset-4 md:-inset-8 rounded-[2rem] md:rounded-[2.5rem] bg-cyan-400/[0.06] blur-3xl"
        aria-hidden="true"
      />

      <div
        className="relative rounded-[1.5rem] sm:rounded-[1.75rem] md:rounded-[2rem] overflow-hidden border border-white/[0.11] bg-[linear-gradient(165deg,#0a0c10_0%,#050608_45%,#030304_100%)] shadow-[0_100px_220px_-70px_rgba(0,0,0,1),0_0_0_1px_rgba(255,255,255,0.04)_inset,inset_0_1px_0_rgba(255,255,255,0.08)]"
      >
        {/* Top edge light */}
        <div className="h-[2px] bg-gradient-to-r from-transparent via-cyan-400/70 to-transparent" />

        {/* Machine header: directive + status */}
        <div className="px-6 py-5 sm:px-10 sm:py-7 md:px-12 md:py-8 border-b border-white/[0.07] flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 bg-[linear-gradient(180deg,rgba(255,255,255,0.03)_0%,transparent_100%)]">
          <div>
            <p className="text-[11px] sm:text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400/80 mb-2">Directive</p>
            <p className="text-white text-xl sm:text-2xl md:text-3xl lg:text-[2rem] font-semibold tracking-[-0.03em] leading-[1.12] max-w-[42rem]">
              Reply before this thread dies.
            </p>
          </div>
          <span className="shrink-0 self-start sm:self-auto inline-flex items-center rounded-full border border-cyan-400/35 bg-cyan-400/10 px-4 py-1.5 text-xs font-semibold text-cyan-200 tabular-nums shadow-[0_0_24px_-4px_rgba(34,211,238,0.35)]">
            Ready
          </span>
        </div>

        {/* Why it matters */}
        <div className="px-6 py-6 sm:px-10 sm:py-7 md:px-12 md:py-8 border-b border-white/[0.06] bg-black/25">
          <p className="text-[11px] sm:text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 mb-3">Why it matters</p>
          <p className="text-zinc-200 text-base sm:text-lg md:text-xl leading-relaxed max-w-[48rem] font-medium">
            Response time went from hours to days. They reopened this morning—the draft is already written.
          </p>
        </div>

        {/* Drafted artifact — single integrated surface */}
        <div className="px-5 py-6 sm:px-8 sm:py-8 md:px-10 md:py-10 bg-[linear-gradient(180deg,#020203_0%,#050608_100%)]">
          <div className="rounded-[1rem] sm:rounded-[1.25rem] md:rounded-[1.5rem] border border-cyan-400/25 bg-[linear-gradient(145deg,rgba(34,211,238,0.09)_0%,rgba(6,8,12,0.95)_38%,#030304_100%)] shadow-[0_40px_100px_-50px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.06),0_0_80px_-30px_rgba(34,211,238,0.2)] px-6 py-7 sm:px-8 sm:py-8 md:px-10 md:py-9">
            <p className="text-xs sm:text-sm font-semibold text-cyan-200/95 tracking-wide mb-5 md:mb-6">Drafted email</p>
            <div className="space-y-3.5 md:space-y-4 text-left text-[15px] sm:text-base md:text-[17px]">
              <p>
                <span className="text-zinc-500 font-medium">To </span>
                <span className="text-white font-medium">Jordan Kim</span>
              </p>
              <p>
                <span className="text-zinc-500 font-medium">Subject </span>
                <span className="text-white font-medium">Updated scope and next step</span>
              </p>
              <p className="text-zinc-100 leading-[1.65] pt-4 border-t border-white/[0.08] mt-4 text-[15px] sm:text-base md:text-[17px]">
                Thanks for your patience — here’s the updated scope and pricing we discussed.
                <br />
                <br />
                I tightened the timeline and answered the two open questions from Friday. If this looks right, I can lock a
                30-minute call Thursday and move this forward.
              </p>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="px-5 py-5 sm:px-8 sm:py-6 md:px-10 md:py-7 bg-[#020203] border-t border-white/[0.07] flex flex-col sm:flex-row gap-3 sm:gap-4">
          <button
            type="button"
            className="flex-1 min-h-[56px] md:min-h-[60px] rounded-xl md:rounded-2xl bg-white text-black text-[15px] md:text-base font-semibold inline-flex items-center justify-center gap-2.5 shadow-[0_0_60px_rgba(255,255,255,0.18),0_20px_50px_-24px_rgba(255,255,255,0.25)] hover:bg-zinc-100 transition-colors"
          >
            <Check className="w-5 h-5" aria-hidden="true" />
            Approve
          </button>
          <button
            type="button"
            className="sm:w-auto sm:min-w-[9rem] min-h-[56px] md:min-h-[60px] rounded-xl md:rounded-2xl border border-white/[0.12] bg-white/[0.03] text-zinc-300 text-[15px] md:text-base font-semibold hover:text-white hover:bg-white/[0.06] transition-colors"
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}

function ProofStrip() {
  const items = ['Reads email and threads', 'Finds what needs action', 'Drafts the reply or document', 'You approve or skip'];
  return (
    <div
      className="relative border-y border-white/[0.06] bg-[#050508]/90 backdrop-blur-sm"
      aria-label="What Foldera does"
    >
      <div className="max-w-[min(100%,80rem)] mx-auto px-4 sm:px-6 py-5 md:py-6">
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 md:gap-x-5 text-center">
          {items.map((label, i) => (
            <React.Fragment key={label}>
              {i > 0 && (
                <span className="hidden sm:inline text-cyan-500/40 select-none" aria-hidden="true">
                  ·
                </span>
              )}
              <span className="text-zinc-300 text-sm sm:text-[15px] md:text-base font-medium tracking-tight">{label}</span>
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

function MiddleSection() {
  const steps = [
    {
      title: 'Reads your live threads',
      body: 'Foldera connects to your email and ongoing conversations, so it sees what actually changed overnight.',
    },
    {
      title: 'Finds the highest-stakes move',
      body: 'It picks the one reply or decision that would hurt most if it slipped—not a pile of reminders.',
    },
    {
      title: 'Drafts the artifact before you open the day',
      body: 'You wake up to a finished email or document—your move, already written. Approve, send, or skip—and Foldera learns what you care about.',
    },
  ];
  return (
    <section id="how" className="relative bg-[#07070c] border-t border-white/[0.05]">
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_70%_50%_at_50%_0%,rgba(34,211,238,0.05),transparent_55%)]" />
      <div className="relative z-10 max-w-[min(100%,72rem)] mx-auto px-4 sm:px-6 py-20 md:py-28 lg:py-32">
        <h2 className="text-white text-center text-3xl sm:text-4xl md:text-5xl lg:text-[3.25rem] font-semibold tracking-[-0.03em] leading-[1.1] mb-14 md:mb-20 max-w-4xl mx-auto">
          How Foldera works
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-8 lg:gap-12">
          {steps.map((s, idx) => (
            <div
              key={s.title}
              className="relative rounded-2xl border border-white/[0.08] bg-[linear-gradient(165deg,rgba(255,255,255,0.04)_0%,transparent_45%,#050608_100%)] p-8 md:p-9 lg:p-10 shadow-[0_40px_100px_-60px_rgba(0,0,0,0.85)]"
            >
              <span className="text-cyan-400/90 text-xs font-bold uppercase tracking-[0.25em] mb-4 block">
                {String(idx + 1).padStart(2, '0')}
              </span>
              <h3 className="text-white text-2xl md:text-3xl font-semibold tracking-tight mb-4">{s.title}</h3>
              <p className="text-zinc-400 text-base md:text-lg leading-relaxed">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function BusinessOutcomesSection() {
  const panels = [
    {
      title: 'Revenue waiting on your reply',
      body: 'A buyer reopened the thread, the proposal is sitting there, and response time keeps stretching.',
      output: 'Foldera drafts the follow-up, scope update, or close-the-loop reply.',
    },
    {
      title: 'Hiring threads cooling down',
      body: 'A recruiter, hiring manager, or candidate thread has gone quiet and momentum is fading.',
      output: 'Foldera drafts the next-step reply, follow-up, or interview coordination note.',
    },
    {
      title: 'Decisions you keep reopening',
      body: 'The same issue keeps resurfacing, but nobody has written the recommendation clearly enough to move.',
      output: 'Foldera drafts the decision memo, written recommendation, or frame for approval.',
    },
  ];
  return (
    <section
      className="relative bg-[#050508] border-t border-white/[0.05]"
      aria-labelledby="business-outcomes-heading"
    >
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_65%_45%_at_50%_0%,rgba(34,211,238,0.04),transparent_58%)]" />
      <div className="relative z-10 max-w-[min(100%,72rem)] mx-auto px-4 sm:px-6 py-20 md:py-24 lg:py-28">
        <h2
          id="business-outcomes-heading"
          className="text-white text-center text-2xl sm:text-3xl md:text-4xl lg:text-[2.75rem] font-semibold tracking-[-0.03em] leading-[1.12] mb-5 md:mb-6 max-w-3xl mx-auto"
        >
          Where Foldera protects outcomes
        </h2>
        <p className="text-zinc-400 text-center text-base sm:text-lg md:text-xl leading-relaxed max-w-2xl mx-auto font-medium mb-14 md:mb-16 lg:mb-20">
          Foldera is built for the moments where delay costs revenue, momentum, or trust.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-7 lg:gap-10">
          {panels.map((p) => (
            <div
              key={p.title}
              className="relative rounded-2xl border border-white/[0.08] bg-[linear-gradient(165deg,rgba(255,255,255,0.03)_0%,transparent_42%,#07080c_100%)] p-7 md:p-8 lg:p-9 shadow-[0_32px_80px_-56px_rgba(0,0,0,0.85)] flex flex-col"
            >
              <h3 className="text-white text-xl md:text-2xl font-semibold tracking-tight mb-3">{p.title}</h3>
              <p className="text-zinc-400 text-base md:text-[17px] leading-relaxed flex-1">{p.body}</p>
              <p className="mt-5 pt-5 border-t border-white/[0.07] text-zinc-200 text-sm md:text-[15px] leading-relaxed font-medium">
                {p.output}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function PricingSection() {
  return (
    <section id="pricing" className="relative bg-[#050508] overflow-hidden scroll-mt-20 border-t border-white/[0.06]">
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_80%_55%_at_50%_15%,rgba(34,211,238,0.09),transparent_55%)]" />
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_50%_40%_at_50%_100%,rgba(0,0,0,0.6),transparent_50%)]" />
      <div className="relative z-10 max-w-[min(100%,72rem)] mx-auto px-4 sm:px-6 py-24 md:py-32 lg:py-36">
        <div className="text-center mb-16 md:mb-20 lg:mb-24">
          <h2 className="text-white text-4xl sm:text-5xl md:text-6xl lg:text-[3.75rem] font-semibold tracking-[-0.035em] leading-[1.05]">
            Pricing
          </h2>
          <p className="mt-5 md:mt-6 text-zinc-400 text-lg md:text-xl max-w-xl mx-auto font-medium">
            Start free. Upgrade when the work proves itself.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8 items-stretch max-w-5xl mx-auto">
          <div className="rounded-[1.5rem] md:rounded-[2rem] border border-white/[0.1] bg-[linear-gradient(165deg,#0c0e14_0%,#07080c_100%)] p-10 md:p-12 lg:p-14 flex flex-col shadow-[0_50px_120px_-60px_rgba(0,0,0,0.9)]">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-zinc-500 mb-8">Free</p>
            <p className="text-white text-6xl md:text-7xl lg:text-8xl font-semibold tracking-[-0.04em] mb-6">$0</p>
            <p className="text-zinc-400 text-lg md:text-xl leading-relaxed flex-1 font-medium">
              Daily directive plus your first three finished artifacts. No credit card required.
            </p>
          </div>

          <div className="relative rounded-[1.5rem] md:rounded-[2rem] border border-cyan-400/35 bg-[linear-gradient(165deg,rgba(34,211,238,0.08)_0%,#07090e_42%,#030405_100%)] p-10 md:p-12 lg:p-14 flex flex-col shadow-[0_60px_140px_-50px_rgba(0,0,0,0.95),0_0_100px_-40px_rgba(34,211,238,0.25),inset_0_1px_0_rgba(255,255,255,0.06)]">
            <div className="absolute top-6 right-6 md:top-8 md:right-8 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-200/90">
              Recommended
            </div>
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-cyan-300/95 mb-8">Professional</p>
            <div className="flex items-baseline gap-2 mb-4">
              <span className="text-white text-6xl md:text-7xl lg:text-8xl font-semibold tracking-[-0.04em]">$29</span>
              <span className="text-zinc-400 text-xl md:text-2xl font-medium">/mo</span>
            </div>
            <p className="text-white text-xl md:text-2xl font-semibold mb-10 md:mb-12">Finished work, every morning.</p>
            <ul className="space-y-4 mb-12 flex-1">
              {[
                'Drafted emails, decision frames, and documents',
                'Approve and send in one tap',
                'Learns from every approve and skip',
                'Cancel anytime',
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-zinc-200 text-base md:text-lg">
                  <Check className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
            <a
              href="/start"
              className="w-full min-h-[58px] md:min-h-[60px] rounded-xl md:rounded-2xl bg-white text-black text-base md:text-lg font-semibold inline-flex items-center justify-center gap-2 shadow-[0_0_60px_rgba(255,255,255,0.15)] hover:bg-zinc-100 transition-colors"
            >
              Get started free <ArrowRight className="w-5 h-5" aria-hidden="true" />
            </a>
            <p className="mt-5 text-center text-zinc-500 text-sm">No credit card required.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function HomePageClient() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="min-h-[100dvh] bg-[#07070c] text-zinc-50 selection:bg-cyan-500/25 selection:text-white font-sans antialiased overflow-x-hidden">
      <style
        dangerouslySetInnerHTML={{
          __html: `
            html { scroll-behavior: smooth; background: #07070c; }
            ::-webkit-scrollbar { width: 10px; }
            ::-webkit-scrollbar-track { background: #07070c; }
            ::-webkit-scrollbar-thumb { background: #222; border-radius: 10px; border: 2px solid #07070c; }
            @media (prefers-reduced-motion: reduce) {
              *, ::before, ::after {
                animation-duration: 0.01ms !important;
                transition-duration: 0.01ms !important;
                scroll-behavior: auto !important;
              }
            }
          `,
        }}
      />

      <NavPublic scrolled={scrolled} platformHref="#product" />

      <main id="main">
        <section
          id="product"
          className="relative overflow-hidden border-b border-white/[0.06] bg-[#07070c] scroll-mt-20"
        >
          <Atmosphere />

          <div className="relative z-10 max-w-[min(100%,80rem)] mx-auto px-4 sm:px-6 lg:px-8 pt-[calc(5.25rem+env(safe-area-inset-top,0px))] md:pt-[calc(6rem+env(safe-area-inset-top,0px))] pb-8 md:pb-12 lg:pb-14">
            <header className="text-center mb-8 sm:mb-10 md:mb-12 lg:mb-14">
              <h1 className="text-white text-[2.75rem] sm:text-6xl md:text-7xl lg:text-8xl xl:text-[5.5rem] font-semibold tracking-[-0.045em] leading-[0.95] max-w-[22ch] mx-auto">
                Finished work.
                <br />
                Before you ask.
              </h1>
              <p className="mt-6 sm:mt-7 md:mt-8 text-zinc-300 text-lg sm:text-xl md:text-2xl leading-snug max-w-[42rem] mx-auto font-medium">
                Foldera reads your email and live threads, finds the one thing that needs action, and drafts the response
                for you.
              </p>
              <p className="mt-4 sm:mt-5 text-zinc-400 text-base sm:text-lg md:text-xl leading-snug max-w-[36rem] mx-auto font-medium">
                Approve it, send it, or skip it. Foldera learns what matters to you over time.
              </p>
            </header>

            <p className="text-center text-[11px] sm:text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500 mb-4 sm:mb-5 md:mb-6">
              What Foldera delivers each morning
            </p>
            <ArtifactCard />

            <div className="mt-8 sm:mt-9 md:mt-10 flex flex-col items-center gap-2.5">
              <a
                href="/start"
                className="w-full sm:w-auto min-h-[58px] md:min-h-[60px] px-12 md:px-14 rounded-xl md:rounded-2xl bg-white text-black text-base md:text-lg font-semibold inline-flex items-center justify-center gap-2.5 shadow-[0_0_64px_rgba(255,255,255,0.2),0_24px_60px_-28px_rgba(255,255,255,0.15)] hover:bg-zinc-100 transition-colors"
              >
                Get started free <ArrowRight className="w-5 h-5" aria-hidden="true" />
              </a>
              <p className="text-zinc-500 text-sm mt-1">No credit card required</p>
            </div>
          </div>
        </section>

        <ProofStrip />
        <MiddleSection />
        <BusinessOutcomesSection />
        <PricingSection />

        <footer className="relative border-t border-white/[0.06] bg-[#07070c]">
          <div className="max-w-[min(100%,80rem)] mx-auto px-4 sm:px-6 py-16 md:py-20">
            <div className="flex flex-col md:flex-row items-center md:items-end justify-between gap-10">
              <div className="text-center md:text-left">
                <div className="flex items-center justify-center md:justify-start gap-3 mb-3">
                  <FolderaMark className="shadow-[0_0_20px_rgba(255,255,255,0.12)]" />
                  <span className="text-white text-lg font-semibold tracking-tight">Foldera</span>
                </div>
                <p className="text-zinc-600 text-xs tracking-wide">Finished work, every morning.</p>
              </div>

              <nav className="flex flex-wrap items-center justify-center gap-6 text-xs text-zinc-500">
                <a href="#pricing" className="min-h-[44px] inline-flex items-center hover:text-zinc-300 transition-colors">
                  Pricing
                </a>
                <a href="/blog" className="min-h-[44px] inline-flex items-center hover:text-zinc-300 transition-colors">
                  Blog
                </a>
                <a href="/login" className="min-h-[44px] inline-flex items-center hover:text-zinc-300 transition-colors">
                  Sign in
                </a>
              </nav>
            </div>

            <div className="mt-12 pt-8 border-t border-white/[0.06] flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
              <p className="text-zinc-600 text-xs">AES-256 encryption at rest and in transit.</p>
              <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-zinc-600">
                <a href="/privacy" className="hover:text-zinc-400 transition-colors">
                  Privacy
                </a>
                <a href="/terms" className="hover:text-zinc-400 transition-colors">
                  Terms
                </a>
                <p suppressHydrationWarning>&copy; {new Date().getFullYear()} Foldera AI</p>
              </div>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
