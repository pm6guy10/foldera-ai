'use client';

import React, { useEffect, useState } from 'react';
import { NavPublic } from '@/components/nav/NavPublic';
import { FolderaMark } from '@/components/nav/FolderaMark';
import { ArrowRight, Check } from 'lucide-react';

function Atmosphere() {
  return (
    <div className="absolute inset-0 pointer-events-none z-0" aria-hidden="true">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(128,128,128,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(128,128,128,0.04)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(ellipse_85%_70%_at_50%_42%,#000_18%,transparent_100%)] opacity-60" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_55%_at_50%_0%,rgba(34,211,238,0.07),transparent_55%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_50%_40%_at_80%_60%,rgba(255,255,255,0.04),transparent_50%)]" />
    </div>
  );
}

function ArtifactCard() {
  return (
    <div className="relative w-full max-w-[min(100%,42rem)] mx-auto">
      <div
        className="absolute -inset-3 md:-inset-6 rounded-[2rem] bg-cyan-400/[0.07] blur-3xl"
        aria-hidden="true"
      />
      <div className="relative rounded-[1.35rem] md:rounded-[1.75rem] overflow-hidden border border-white/[0.09] bg-[#060708] shadow-[0_80px_200px_-60px_rgba(0,0,0,1),inset_0_1px_0_rgba(255,255,255,0.06)]">
        <div className="h-px bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent" />

        <div className="px-5 py-4 md:px-8 md:py-5 border-b border-white/[0.06] flex items-center justify-between gap-4">
          <p className="text-sm md:text-base text-white font-semibold tracking-tight">Reply before this thread dies.</p>
          <span className="shrink-0 text-[11px] md:text-xs font-medium text-cyan-300/90 tabular-nums">Ready</span>
        </div>

        <div className="px-5 py-5 md:px-8 md:py-7 border-b border-white/[0.06]">
          <p className="text-zinc-500 text-xs md:text-sm leading-relaxed max-w-prose">
            Response time went from hours to days. They reopened this morning—the draft is already written.
          </p>
        </div>

        <div className="px-4 py-4 md:px-6 md:py-6 bg-black/40">
          <div className="rounded-[1rem] md:rounded-[1.15rem] border border-cyan-400/20 bg-gradient-to-b from-cyan-500/[0.06] to-transparent px-4 py-5 md:px-6 md:py-6">
            <p className="text-[11px] md:text-xs text-cyan-200/90 font-medium mb-4">Drafted email</p>
            <div className="space-y-3 text-left text-sm md:text-[15px]">
              <p>
                <span className="text-zinc-500">To </span>
                <span className="text-zinc-100">Jordan Kim</span>
              </p>
              <p>
                <span className="text-zinc-500">Subject </span>
                <span className="text-zinc-100">Updated scope and next step</span>
              </p>
              <p className="text-zinc-200 leading-relaxed pt-1 border-t border-white/[0.06] mt-3">
                Thanks for your patience — here’s the updated scope and pricing we discussed.
                <br />
                <br />
                I tightened the timeline and answered the two open questions from Friday. If this looks right, I can lock a
                30-minute call Thursday and move this forward.
              </p>
            </div>
          </div>
        </div>

        <div className="px-4 py-4 md:px-6 md:py-5 bg-[#030304] border-t border-white/[0.06] flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            className="flex-1 min-h-[52px] rounded-xl bg-white text-black text-sm font-semibold inline-flex items-center justify-center gap-2 shadow-[0_0_40px_rgba(255,255,255,0.12)] hover:bg-zinc-100 transition-colors"
          >
            <Check className="w-4 h-4" aria-hidden="true" />
            Approve
          </button>
          <button
            type="button"
            className="sm:w-auto sm:min-w-[7.5rem] min-h-[52px] rounded-xl border border-white/[0.1] bg-transparent text-zinc-400 text-sm font-medium hover:text-zinc-200 hover:bg-white/[0.03] transition-colors"
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}

function ProofStrip() {
  return (
    <div
      className="relative border-y border-white/[0.05] bg-[#050508]/80"
      aria-label="What Foldera does"
    >
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 md:py-10 text-center">
        <p className="text-zinc-400 text-sm md:text-base leading-relaxed tracking-tight">
          Notices what shifted · Ranks one move · Drafts the artifact before you chase tabs
        </p>
      </div>
    </div>
  );
}

function HowSection() {
  return (
    <section id="how" className="relative bg-[#07070c]">
      <Atmosphere />
      <div className="relative z-10 max-w-2xl mx-auto px-4 sm:px-6 py-20 md:py-28 text-center">
        <h2 className="text-white text-2xl sm:text-3xl md:text-4xl font-semibold tracking-tight leading-[1.15] mb-10 md:mb-12">
          Intelligence layer—not another inbox.
        </h2>
        <div className="space-y-8 text-left max-w-lg mx-auto">
          <p className="text-zinc-300 text-base md:text-lg leading-relaxed">
            <span className="text-cyan-400/90 font-medium">Drift.</span> Threads cooling, deadlines slipping, decisions
            stalling—Foldera surfaces it.
          </p>
          <p className="text-zinc-300 text-base md:text-lg leading-relaxed">
            <span className="text-cyan-400/90 font-medium">One move.</span> Not a dashboard of possibilities. The
            highest-stakes action right now.
          </p>
          <p className="text-zinc-300 text-base md:text-lg leading-relaxed">
            <span className="text-cyan-400/90 font-medium">Finished work.</span> The email or frame is drafted before
            you open the day—approve or skip.
          </p>
        </div>
      </div>
    </section>
  );
}

function PricingSection() {
  return (
    <section id="pricing" className="relative bg-[#07070c] overflow-hidden scroll-mt-20">
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_50%_0%,rgba(34,211,238,0.06),transparent_50%)]" />
      <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 py-20 md:py-28">
        <div className="text-center mb-14 md:mb-16">
          <h2 className="text-white text-3xl md:text-4xl lg:text-[2.75rem] font-semibold tracking-tight leading-tight">
            Pricing
          </h2>
          <p className="mt-4 text-zinc-500 text-sm md:text-base max-w-md mx-auto">
            Start free. Upgrade when the work proves itself.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6 items-stretch">
          <div className="rounded-2xl border border-white/[0.08] bg-zinc-950/50 p-8 md:p-10 flex flex-col">
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-500 mb-6">Free</p>
            <p className="text-white text-5xl md:text-6xl font-semibold tracking-tight mb-4">$0</p>
            <p className="text-zinc-400 text-sm md:text-base leading-relaxed flex-1">
              Daily directive plus your first three finished artifacts. No credit card required.
            </p>
          </div>

          <div className="rounded-2xl border border-cyan-400/25 bg-[#08090d] p-8 md:p-10 flex flex-col shadow-[0_40px_100px_-40px_rgba(0,0,0,0.9),0_0_60px_-20px_rgba(34,211,238,0.12)]">
            <p className="text-xs font-medium uppercase tracking-wider text-cyan-300/90 mb-6">Professional</p>
            <div className="flex items-baseline gap-1 mb-2">
              <span className="text-white text-5xl md:text-6xl font-semibold tracking-tight">$29</span>
              <span className="text-zinc-500 text-sm font-medium">/mo</span>
            </div>
            <p className="text-zinc-200 text-base md:text-lg mb-8">Finished work, every morning.</p>
            <ul className="space-y-3 mb-10 flex-1">
              {[
                'Drafted emails, decision frames, and documents',
                'Approve and send in one tap',
                'Learns from every approve and skip',
                'Cancel anytime',
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-zinc-300 text-sm md:text-base">
                  <Check className="w-4 h-4 text-cyan-400/80 shrink-0 mt-0.5" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
            <a
              href="/start"
              className="w-full min-h-[52px] rounded-xl bg-white text-black text-sm font-semibold inline-flex items-center justify-center gap-2 hover:bg-zinc-100 transition-colors"
            >
              Get started free <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </a>
            <p className="mt-4 text-center text-zinc-600 text-xs">No credit card required.</p>
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

          <div className="relative z-10 max-w-[56rem] mx-auto px-4 sm:px-6 pt-[calc(5.25rem+env(safe-area-inset-top,0px))] md:pt-[calc(6.25rem+env(safe-area-inset-top,0px))] pb-12 md:pb-16">
            <header className="text-center mb-10 md:mb-14">
              <h1 className="text-white text-[2.35rem] sm:text-5xl md:text-6xl lg:text-[3.75rem] font-semibold tracking-[-0.035em] leading-[1.05]">
                Finished work.
                <br />
                Before you ask.
              </h1>
              <p className="mt-5 md:mt-6 text-zinc-400 text-base md:text-lg lg:text-xl leading-relaxed max-w-xl mx-auto">
                Foldera notices what changed, ranks the one move that matters, and drafts the artifact before the day gets
                away from you.
              </p>
            </header>

            <ArtifactCard />

            <div className="mt-10 md:mt-12 flex flex-col items-center gap-4">
              <a
                href="/start"
                className="w-full sm:w-auto min-h-[54px] px-10 rounded-xl bg-white text-black text-sm font-semibold inline-flex items-center justify-center gap-2 shadow-[0_0_48px_rgba(255,255,255,0.14)] hover:bg-zinc-100 transition-colors"
              >
                Get started free <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </a>
              <p className="text-zinc-600 text-xs">No credit card required</p>
            </div>
          </div>
        </section>

        <ProofStrip />
        <HowSection />
        <PricingSection />

        <footer className="relative border-t border-white/[0.06] bg-[#07070c]">
          <div className="max-w-[56rem] mx-auto px-4 sm:px-6 py-16 md:py-20">
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
