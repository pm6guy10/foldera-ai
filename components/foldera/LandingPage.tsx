'use client';

import { useEffect, useState } from 'react';
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Clock3,
  FileText,
  Inbox,
  Layers3,
  Mail,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';
import { DailyBriefCard } from '@/components/foldera/DailyBriefCard';
import { FolderaLogo } from '@/components/foldera/FolderaLogo';
import { NavPublic } from '@/components/nav/NavPublic';

const heroSignalPills = [
  'Unanswered thread',
  'Calendar hold',
  'Stale draft',
  'Decision waiting',
];

const signalInputs = [
  {
    title: 'Unanswered threads',
    body: 'Open loops that have gone quiet while the stakes keep moving.',
    icon: Mail,
  },
  {
    title: 'Calendar holds',
    body: 'Meetings and deadlines that make a reply or decision time-sensitive.',
    icon: CalendarClock,
  },
  {
    title: 'Stale drafts',
    body: 'Half-finished work that already has context but never crossed the line.',
    icon: FileText,
  },
  {
    title: 'Decisions waiting',
    body: 'The exact ask, tradeoff, or unblocker that still needs a finished move.',
    icon: Layers3,
  },
];

const finishedMoveOutputs = [
  {
    title: 'Directive',
    body: 'The move that matters most right now.',
    icon: Zap,
  },
  {
    title: 'Drafted action',
    body: 'Ready-to-send wording or a ready-to-use document.',
    icon: FileText,
  },
  {
    title: 'Source trail',
    body: 'The thread, hold, draft, and evidence behind the move.',
    icon: Inbox,
  },
  {
    title: 'Approval ready',
    body: 'Nothing moves until you approve, skip, or hold it.',
    icon: CheckCircle2,
  },
];

const approvalCards = [
  {
    title: 'Approval before anything sends',
    body: 'Foldera prepares the move. You stay in control of whether it goes out.',
    icon: ShieldCheck,
  },
  {
    title: 'Source trail attached',
    body: 'The connected source basis stays with the brief so you can see why it exists.',
    icon: Layers3,
  },
  {
    title: 'Audit trail visible',
    body: 'The product keeps the decision path visible without pretending it can do more than it can.',
    icon: CheckCircle2,
  },
];

const footerLinks = [
  { label: 'Pricing', href: '/pricing' },
  { label: 'Blog', href: '/blog' },
  { label: 'About', href: '/about' },
  { label: 'Security', href: '/security' },
  { label: 'Status', href: '/status' },
  { label: 'Privacy', href: '/privacy' },
  { label: 'Terms', href: '/terms' },
];

const gridBackdropStyle = {
  backgroundImage:
    'linear-gradient(rgba(148,163,184,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.05) 1px, transparent 1px)',
  backgroundSize: '64px 64px',
};

const heroDraft = (
  <div className="space-y-4">
    <p>Hi Riley — attached is the finalized board update with the churn revisions folded in.</p>
    <p>If this clears your review, I can send the revised version before 11:30 PT today.</p>
  </div>
);

export function LandingPage({ isAuthenticated = false }: { isAuthenticated?: boolean }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#03060b] text-slate-50">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 opacity-70" style={gridBackdropStyle} />
        <div className="absolute left-[-10%] top-8 h-[28rem] w-[28rem] rounded-full bg-cyan-400/12 blur-3xl" />
        <div className="absolute right-[-8%] top-14 h-[24rem] w-[24rem] rounded-full bg-fuchsia-500/10 blur-3xl" />
        <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-[#020409] via-[#020409]/78 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-[#020409] to-transparent" />
      </div>

      <NavPublic
        scrolled={scrolled}
        platformHref="/#how-foldera-works"
        isAuthenticated={isAuthenticated}
      />

      <main id="main" className="relative">
        <section className="px-4 pb-12 pt-28 sm:px-6 sm:pb-14 sm:pt-32 lg:px-8 lg:pb-16">
          <div className="mx-auto max-w-[1440px]">
            <div className="grid gap-10 lg:grid-cols-[minmax(0,0.82fr)_minmax(420px,0.98fr)] lg:items-center lg:gap-12">
              <div className="max-w-[630px]">
                <div className="inline-flex items-center gap-3 rounded-full border border-cyan-300/16 bg-white/[0.04] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-100 shadow-[0_0_24px_rgba(34,211,238,0.10)]">
                  <Sparkles className="h-4 w-4 text-cyan-300" aria-hidden />
                  Finished work, every morning.
                </div>

                <h1
                  data-testid="landing-hero-heading"
                  className="mt-7 max-w-[9.5ch] text-[46px] font-semibold leading-[0.94] tracking-[-0.075em] text-white sm:text-[66px] lg:text-[88px]"
                >
                  One finished move.
                  <span className="mt-2 block bg-gradient-to-r from-white via-cyan-100 to-sky-300 bg-clip-text text-transparent">
                    Every morning.
                  </span>
                </h1>

                <p className="mt-7 max-w-[37rem] text-[17px] leading-8 text-slate-300 sm:text-[18px]">
                  Foldera reads the noise across your connected sources, finds what matters, drafts the next move,
                  and waits for your approval.
                </p>

                <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                  <a
                    href="/demo"
                    className="inline-flex min-h-[56px] items-center justify-center gap-2 rounded-[15px] bg-white px-5 text-[14px] font-semibold text-slate-950 shadow-[0_0_34px_rgba(255,255,255,0.10)] transition-transform duration-150 hover:-translate-y-0.5"
                  >
                    See live demo
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </a>
                  <a
                    href="/start"
                    className="inline-flex min-h-[56px] items-center justify-center gap-2 rounded-[15px] border border-cyan-300/18 bg-cyan-400/[0.08] px-5 text-[14px] font-semibold text-cyan-100 transition-colors hover:bg-cyan-400/[0.12]"
                  >
                    Get started free
                  </a>
                </div>

                <div className="mt-8 grid gap-3 sm:grid-cols-2">
                  {[
                    'Reads connected sources',
                    'Finds the move that matters',
                    'Shows the source trail',
                    'Nothing moves until approval',
                  ].map((item) => (
                    <div
                      key={item}
                      className="inline-flex min-h-[46px] items-center gap-3 rounded-[16px] border border-white/8 bg-white/[0.03] px-4 text-sm text-slate-100/90"
                    >
                      <span className="h-2.5 w-2.5 rounded-full bg-cyan-300 shadow-[0_0_14px_rgba(34,211,238,0.72)]" />
                      {item}
                    </div>
                  ))}
                </div>
              </div>

              <HeroProofRail />
            </div>
          </div>
        </section>

        <section id="how-foldera-works" className="px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-[1440px]">
            <div className="overflow-hidden rounded-[30px] border border-white/10 bg-[#060d16]/94 shadow-[0_22px_80px_rgba(0,0,0,0.42)]">
              <div className="grid gap-px bg-white/10 lg:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)]">
                <div className="bg-[#060d16] px-6 py-8 sm:px-8 sm:py-10 lg:px-10">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-200/82">
                    How Foldera works
                  </p>
                  <h2 className="mt-4 text-[34px] font-semibold leading-[1.02] tracking-[-0.05em] text-white sm:text-[42px]">
                    Signals in. Finished move out.
                  </h2>
                  <p className="mt-4 max-w-[32rem] text-[16px] leading-7 text-slate-300">
                    Foldera keeps the homepage short because the promise is narrow: read the connected context, prepare the move, and keep the approval with you.
                  </p>
                </div>

                <div className="grid gap-px bg-white/10 lg:grid-cols-2">
                  <ProofColumn title="Signals in" items={signalInputs} />
                  <ProofColumn title="Finished move out" items={finishedMoveOutputs} />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-[1440px]">
            <div
              data-testid="landing-trust-line"
              className="rounded-[30px] border border-cyan-300/14 bg-[linear-gradient(180deg,rgba(5,12,20,0.96),rgba(4,9,15,0.98))] px-6 py-8 shadow-[0_0_44px_rgba(34,211,238,0.08)] sm:px-8 sm:py-10 lg:px-10"
            >
              <div className="max-w-[44rem]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-200/82">
                  Approval and safety
                </p>
                <h2 className="mt-4 text-[32px] font-semibold leading-[1.04] tracking-[-0.05em] text-white sm:text-[40px]">
                  Approval before anything sends.
                </h2>
                <p className="mt-4 text-[16px] leading-7 text-slate-300">
                  Foldera can show the source trail, keep the audit path visible, and hold back when the evidence is weak. No outbound by default, and no pretending the move is finished when it is not.
                </p>
              </div>

              <div className="mt-8 grid gap-4 lg:grid-cols-3">
                {approvalCards.map(({ title, body, icon: Icon }) => (
                  <article
                    key={title}
                    className="rounded-[22px] border border-white/8 bg-white/[0.03] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
                  >
                    <div className="inline-flex rounded-2xl border border-cyan-300/14 bg-cyan-400/10 p-3 text-cyan-200">
                      <Icon className="h-5 w-5" aria-hidden />
                    </div>
                    <h3 className="mt-5 text-[20px] font-semibold tracking-[-0.03em] text-white">{title}</h3>
                    <p className="mt-3 text-[15px] leading-7 text-slate-300">{body}</p>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="px-4 pb-8 pt-6 sm:px-6 sm:pb-10 lg:px-8">
          <div className="mx-auto max-w-[1440px]">
            <div className="overflow-hidden rounded-[32px] border border-white/10 bg-[#050c14]/95 px-6 py-8 shadow-[0_24px_90px_rgba(0,0,0,0.48)] sm:px-8 sm:py-10 lg:px-10 lg:py-12">
              <div className="grid gap-10 lg:grid-cols-[minmax(0,0.92fr)_minmax(320px,0.68fr)] lg:items-end">
                <div className="max-w-[38rem]">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-200/82">
                    Final CTA
                  </p>
                  <h2 className="mt-4 text-[34px] font-semibold leading-[1.02] tracking-[-0.05em] text-white sm:text-[42px]">
                    Stop starting at the work. Get the next finished move.
                  </h2>
                  <p className="mt-4 text-[16px] leading-7 text-slate-300">
                    See the live demo first, then decide whether the source-backed move feels finished enough to trust.
                  </p>
                </div>

                <div className="flex flex-col gap-4 lg:items-end">
                  <a
                    href="/demo"
                    className="inline-flex min-h-[56px] items-center justify-center gap-2 rounded-[16px] bg-white px-5 text-[14px] font-semibold text-slate-950 transition-transform duration-150 hover:-translate-y-0.5"
                  >
                    See live demo
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </a>
                  <a
                    href="/start"
                    className="inline-flex min-h-[54px] items-center justify-center gap-2 rounded-[16px] border border-cyan-300/18 bg-cyan-400/[0.08] px-5 text-[14px] font-semibold text-cyan-100 transition-colors hover:bg-cyan-400/[0.12]"
                  >
                    Get started free
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>

        <footer className="border-t border-white/8 px-4 pb-12 pt-8 sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-[1440px] flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <FolderaLogo href="/" />
              <p className="mt-3 max-w-[22rem] text-sm leading-6 text-slate-400">
                Foldera turns scattered context into one finished move.
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

function HeroProofRail() {
  return (
    <article
      data-testid="landing-proof-card"
      className="relative overflow-hidden rounded-[34px] border border-cyan-300/18 bg-[linear-gradient(180deg,rgba(4,8,14,0.97),rgba(5,10,17,0.99))] shadow-[0_0_40px_rgba(34,211,238,0.12),0_28px_96px_rgba(0,0,0,0.56)]"
    >
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.12),transparent_36%),radial-gradient(circle_at_8%_20%,rgba(217,70,239,0.10),transparent_32%)]"
      />
      <div className="relative border-b border-white/8 px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-center gap-2.5">
          {heroSignalPills.map((pill) => (
            <span
              key={pill}
              className="inline-flex min-h-[36px] items-center rounded-full border border-white/10 bg-white/[0.04] px-3.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-200/88"
            >
              {pill}
            </span>
          ))}
        </div>
      </div>

      <div className="space-y-5 px-4 py-5 sm:px-5 sm:py-6">
        <div className="rounded-[24px] border border-cyan-300/14 bg-cyan-400/[0.08] px-5 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-200">What Foldera catches</p>
          <p className="mt-2 text-[16px] leading-7 text-slate-100">
            You have reopened this thread six times, tomorrow&apos;s review still depends on it, and the draft already exists.
          </p>
        </div>

        <DailyBriefCard
          className="shadow-[0_0_34px_rgba(34,211,238,0.12)]"
          directive="Send the board update before the review hold expires."
          whyNow="The thread has been open for six days, tomorrow's board review depends on the answer, and Foldera pulled the exact draft that already matches the latest context."
          draftBody={heroDraft}
          sourcePills={['Email thread', 'Calendar hold', 'Stale draft', 'Decision note']}
          nextStep="Nothing sends until you approve."
          footerText="Source trail attached. Approval stays with you."
          statusText="READY FOR APPROVAL"
          actions={[
            { label: 'View source trail', kind: 'secondary', href: '/demo' },
            { label: 'Hold 24h', kind: 'amber' },
            { label: 'Approve', kind: 'primary' },
          ]}
        />
      </div>
    </article>
  );
}

function ProofColumn({
  title,
  items,
}: {
  title: string;
  items: Array<{ title: string; body: string; icon: typeof Mail }>;
}) {
  return (
    <div className="bg-[#07111b] px-6 py-8 sm:px-7 sm:py-9">
      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-200/82">{title}</p>
      <div className="mt-6 space-y-5">
        {items.map(({ title: itemTitle, body, icon: Icon }) => (
          <article key={itemTitle} className="rounded-[20px] border border-white/8 bg-white/[0.03] p-5">
            <div className="inline-flex rounded-2xl border border-cyan-300/14 bg-cyan-400/10 p-3 text-cyan-200">
              <Icon className="h-5 w-5" aria-hidden />
            </div>
            <h3 className="mt-4 text-[20px] font-semibold tracking-[-0.03em] text-white">{itemTitle}</h3>
            <p className="mt-3 text-[15px] leading-7 text-slate-300">{body}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
