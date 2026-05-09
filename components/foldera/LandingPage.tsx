'use client';

import { useEffect, useState } from 'react';
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Mail,
  ShieldCheck,
  SkipForward,
  Zap,
} from 'lucide-react';
import { FolderaLogo } from '@/components/foldera/FolderaLogo';
import { NavPublic } from '@/components/nav/NavPublic';

const heroPromises = ['Source trail included', 'Approval stays yours', 'No outbound by default'];

const valueSteps = [
  {
    title: 'Checks the real sources',
    body: 'Foldera reads connected inbox and calendar context so the day starts from evidence instead of memory.',
    icon: Mail,
  },
  {
    title: 'Ships the artifact',
    body: 'When the signal is strong, you get the drafted reply, decision frame, or document instead of a vague reminder.',
    icon: CheckCircle2,
  },
  {
    title: 'Stops safely',
    body: 'If the evidence is weak, Foldera holds back and shows the blocker instead of pretending the work is finished.',
    icon: CalendarClock,
  },
];

const trustItems = [
  'Gmail and Microsoft first',
  'No outbound by default',
  'Approval stays yours',
  'Honest holdback when evidence is weak',
];

const footerLinks = [
  { label: 'Pricing', href: '/pricing' },
  { label: 'Blog', href: '/blog' },
  { label: 'Security', href: '/security' },
  { label: 'Status', href: '/status' },
  { label: 'Privacy', href: '/privacy' },
  { label: 'Terms', href: '/terms' },
];

const gridBackdropStyle = {
  backgroundImage:
    'linear-gradient(rgba(148,163,184,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.08) 1px, transparent 1px)',
  backgroundSize: '72px 72px',
};

export function LandingPage() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#04070c] text-slate-50">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 opacity-50" style={gridBackdropStyle} />
        <div className="absolute left-[-12%] top-[6%] h-[34rem] w-[34rem] rounded-full bg-cyan-500/16 blur-3xl" />
        <div className="absolute right-[-10%] top-[2%] h-[30rem] w-[30rem] rounded-full bg-fuchsia-500/12 blur-3xl" />
        <div className="absolute right-[12%] top-[18%] h-[24rem] w-[24rem] rounded-full bg-sky-500/14 blur-3xl" />
        <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-[#02040a] via-[#02040a]/80 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-[#02040a] to-transparent" />
      </div>

      <NavPublic scrolled={scrolled} platformHref="#product" />

      <main id="main" className="relative">
        <section className="px-4 pb-14 pt-28 sm:px-6 sm:pb-18 sm:pt-32 lg:px-8 lg:pb-20">
          <div className="mx-auto max-w-[1440px]">
            <div className="grid gap-12 lg:grid-cols-[minmax(0,0.92fr)_minmax(440px,0.88fr)] lg:items-center lg:gap-16">
              <div className="max-w-[660px]">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-100/90 shadow-[0_0_24px_rgba(34,211,238,0.10)]">
                  <CheckCircle2 className="h-4 w-4 text-cyan-300" aria-hidden />
                  One finished move from your real sources
                </div>

                <h1
                  data-testid="landing-hero-heading"
                  className="mt-7 max-w-[10ch] text-[46px] font-semibold leading-[0.94] tracking-[-0.07em] text-white sm:text-[64px] lg:text-[88px]"
                >
                  One finished move.
                  <span className="mt-2 block bg-gradient-to-r from-white via-cyan-100 to-sky-300 bg-clip-text text-transparent">
                    Already prepared.
                  </span>
                </h1>

                <p className="mt-7 max-w-[36rem] text-[17px] leading-8 text-slate-300 sm:text-[18px]">
                  Foldera checks connected inbox and calendar context, drafts the move that matters, and waits for your approval instead of inventing work.
                </p>

                <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                  <a
                    href="/start"
                    className="inline-flex min-h-[54px] items-center justify-center gap-2 rounded-[14px] border border-cyan-200/35 bg-cyan-300 px-5 text-[14px] font-semibold text-slate-950 shadow-[0_0_30px_rgba(34,211,238,0.22)] transition-transform duration-150 hover:-translate-y-0.5 hover:bg-cyan-200"
                  >
                    Get started free
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </a>
                  <a
                    href="#product"
                    className="inline-flex min-h-[54px] items-center justify-center gap-2 rounded-[14px] border border-white/12 bg-white/[0.04] px-5 text-[14px] font-semibold text-slate-100 transition-colors hover:bg-white/[0.08]"
                  >
                    See how it works
                  </a>
                </div>

                <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                  {heroPromises.map((item) => (
                    <div
                      key={item}
                      className="inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-slate-200/90"
                    >
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_16px_rgba(74,222,128,0.70)]" />
                      {item}
                    </div>
                  ))}
                </div>
              </div>

              <HeroProofCard />
            </div>
          </div>
        </section>

        <section id="product" className="px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-[1440px]">
            <div className="overflow-hidden rounded-[28px] border border-white/10 bg-[#07101a]/90 shadow-[0_24px_90px_rgba(0,0,0,0.46)]">
              <div className="grid gap-8 px-6 py-8 sm:px-8 sm:py-10 lg:grid-cols-[minmax(0,0.72fr)_minmax(0,1fr)] lg:gap-10 lg:px-10">
                <div className="max-w-[34rem]">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-200/80">
                    Why the page stays short
                  </p>
                  <h2 className="mt-4 max-w-[14ch] text-[34px] font-semibold leading-[1.02] tracking-[-0.05em] text-white sm:text-[42px]">
                    Checks sources. Ships the artifact. Stops safely.
                  </h2>
                  <p className="mt-4 text-[16px] leading-7 text-slate-300">
                    Foldera is not promising a giant autonomous control plane. It is promising one truthful finished move when the signal is ready.
                  </p>
                </div>

                <div className="grid gap-px overflow-hidden rounded-[24px] border border-white/10 bg-white/10 lg:grid-cols-3">
                  {valueSteps.map(({ title, body, icon: Icon }) => (
                    <article key={title} className="bg-[#060d16] p-6 sm:p-7">
                      <div className="inline-flex rounded-2xl border border-cyan-300/15 bg-cyan-400/10 p-3 text-cyan-200">
                        <Icon className="h-5 w-5" aria-hidden />
                      </div>
                      <h3 className="mt-6 text-[22px] font-semibold tracking-[-0.03em] text-white">{title}</h3>
                      <p className="mt-4 text-[15px] leading-7 text-slate-300">{body}</p>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-[1440px]">
            <div
              data-testid="landing-trust-line"
              className="rounded-[26px] border border-cyan-300/14 bg-[linear-gradient(180deg,rgba(5,12,20,0.94),rgba(4,8,14,0.96))] px-6 py-7 shadow-[0_0_40px_rgba(34,211,238,0.08)] sm:px-8 lg:px-10"
            >
              <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                <div className="max-w-[34rem]">
                  <div className="inline-flex items-center gap-2 text-sm font-semibold text-cyan-200">
                    <ShieldCheck className="h-4 w-4" aria-hidden />
                    Protected by the trust line
                  </div>
                  <p className="mt-3 text-[15px] leading-7 text-slate-300 sm:text-[16px]">
                    Source-backed, approval-controlled, and narrow enough to stay honest about what Foldera can do today.
                  </p>
                </div>

                <div className="flex flex-wrap gap-3">
                  {trustItems.map((item) => (
                    <span
                      key={item}
                      className="inline-flex min-h-[42px] items-center rounded-full border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-slate-100/90"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="px-4 pb-8 pt-6 sm:px-6 sm:pb-10 lg:px-8">
          <div className="mx-auto max-w-[1440px]">
            <div className="overflow-hidden rounded-[30px] border border-white/10 bg-[#050c14]/95 px-6 py-8 shadow-[0_24px_90px_rgba(0,0,0,0.48)] sm:px-8 sm:py-10 lg:px-10 lg:py-12">
              <div className="grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(300px,0.72fr)] lg:items-end">
                <div className="max-w-[36rem]">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-200/80">
                    Start with one source
                  </p>
                  <h2 className="mt-4 text-[34px] font-semibold leading-[1.02] tracking-[-0.05em] text-white sm:text-[42px]">
                    See the Daily Brief before you give Foldera more to do.
                  </h2>
                  <p className="mt-4 text-[16px] leading-7 text-slate-300">
                    Connect a source, let Foldera read the current context, and judge the product by whether the move is already finished when it appears.
                  </p>
                </div>

                <div className="flex flex-col gap-4 lg:items-end">
                  <a
                    href="/start"
                    className="inline-flex min-h-[56px] items-center justify-center gap-2 rounded-[16px] bg-white px-5 text-[14px] font-semibold text-slate-950 transition-transform duration-150 hover:-translate-y-0.5"
                  >
                    Get started free
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </a>
                  <p className="text-sm text-slate-400">No credit card required. No outbound messages without approval.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <footer className="border-t border-white/8 px-4 pb-12 pt-8 sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-[1440px] flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <FolderaLogo href="/" />
              <p className="mt-3 max-w-[20rem] text-sm leading-6 text-slate-400">
                Finished work when it is safe.
              </p>
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

function HeroProofCard() {
  return (
    <article
      data-testid="landing-proof-card"
      className="relative overflow-hidden rounded-[32px] border border-cyan-300/22 bg-[linear-gradient(180deg,rgba(4,8,14,0.96),rgba(5,11,18,0.98))] shadow-[0_0_40px_rgba(34,211,238,0.12),0_26px_90px_rgba(0,0,0,0.52)]"
    >
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.12),transparent_38%),radial-gradient(circle_at_10%_18%,rgba(168,85,247,0.12),transparent_34%)]" />
      <div className="relative">
        <div className="flex items-center justify-between gap-4 border-b border-white/8 px-5 py-4 sm:px-7 sm:py-5">
          <span className="inline-flex items-center rounded-full border border-cyan-300/15 bg-cyan-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-100">
            Daily brief
          </span>
          <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-300">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_16px_rgba(74,222,128,0.72)]" />
            Ready to approve
          </span>
        </div>

        <div className="space-y-6 px-5 py-5 sm:px-7 sm:py-7">
          <div className="inline-flex rounded-full border border-rose-300/18 bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-100">
            Needs your reply today
          </div>

          <div>
            <h2 className="max-w-[16ch] text-[32px] font-semibold leading-[1.02] tracking-[-0.05em] text-white sm:text-[42px]">
              Send the follow-up to Alex Morgan before noon.
            </h2>
            <p className="mt-4 max-w-[34rem] text-[15px] leading-7 text-slate-300 sm:text-[16px]">
              The thread is open, the ask is time-bound, and Foldera already drafted the cleanest unblocker instead of handing you a reminder.
            </p>
          </div>

          <div className="rounded-[28px] border border-cyan-300/18 bg-cyan-400/[0.08] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-200">
              <Mail className="h-4 w-4" aria-hidden />
              Drafted reply
            </div>
            <p className="mt-4 text-[18px] leading-8 text-slate-50">
              Hi Alex, attached is the finalized update for the board packet. If this clears your review, I can send the revised version before 12:00 PT today.
            </p>
          </div>

          <div className="flex flex-wrap gap-3 border-t border-white/8 pt-6">
            <button
              type="button"
              className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-[14px] border border-emerald-300/35 bg-emerald-500 px-4 text-[14px] font-semibold text-white shadow-[0_0_24px_rgba(74,222,128,0.22)]"
            >
              <Zap className="h-4 w-4" aria-hidden />
              Approve
            </button>
            <button
              type="button"
              className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-[14px] border border-white/10 bg-white/[0.04] px-4 text-[14px] font-semibold text-slate-100"
            >
              <Clock3 className="h-4 w-4 text-amber-300" aria-hidden />
              Hold 24h
            </button>
            <button
              type="button"
              className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-[14px] border border-white/10 bg-white/[0.04] px-4 text-[14px] font-semibold text-slate-100"
            >
              <SkipForward className="h-4 w-4 text-slate-300" aria-hidden />
              Skip
            </button>
          </div>

          <div className="flex flex-wrap gap-2 border-t border-white/8 pt-5 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-300/85">
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-2">Email thread</span>
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-2">Calendar timing</span>
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-2">Source trail attached</span>
          </div>
        </div>
      </div>
    </article>
  );
}
