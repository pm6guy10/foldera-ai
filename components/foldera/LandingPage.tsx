'use client';

import {
  ArrowRight,
  BellOff,
  Check,
  Clock3,
  LockKeyhole,
  Pause,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { motion, type Variants } from 'framer-motion';
import type { ReactNode } from 'react';
import { FolderaMark } from '@/components/nav/FolderaMark';

type LandingPageProps = {
  isAuthenticated?: boolean;
};

const accessHref = '/start';
const loginHref = '/login';

const EASE = [0.16, 1, 0.3, 1] as const;

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 22 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } },
};
const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};

function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      variants={fadeUp}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '-80px' }}
    >
      {children}
    </motion.div>
  );
}

const painPoints = [
  {
    title: 'The reconstruction tax.',
    body: 'Every tool switch leaks context. You are not working; you are scavenging.',
  },
  {
    title: 'Every app remembers its own slice',
    body: 'Microsoft remembers Microsoft. Google remembers Google. Your workday still has to move across both.',
  },
  {
    title: 'The human integration layer',
    body: 'The person doing the work becomes the system that reconnects messages, meetings, approvals, and decisions.',
  },
];

const doctrine = [
  {
    label: 'State',
    body: 'Current focus, next move, blocker, do-not-touch, waiting-on, and last completed step.',
  },
  {
    label: 'Connectors',
    body: 'Consented systems provide evidence. Foldera does not screen-read or secretly monitor work.',
  },
  {
    label: 'Triggers',
    body: 'Meetings, mentions, replies, waiting-on changes, user actions, and end-of-day carry-forward.',
  },
  {
    label: 'One intervention',
    body: 'A single Right Now card with one useful next move and one clear response path.',
  },
];

const howItWorks = [
  'Work happens across messages, meetings, documents, files, and approvals.',
  'Foldera keeps the workday state attached to the evidence you consented to connect.',
  'When something meaningful changes, Foldera decides whether it is worth interrupting.',
  'One Right Now card appears where the work is already happening.',
  'You click once. Foldera updates state and goes quiet again.',
];

const trustItems = [
  {
    icon: ShieldCheck,
    title: 'Consent first',
    body: 'You choose what connects and what Foldera can use.',
  },
  {
    icon: LockKeyhole,
    title: 'No surveillance',
    body: 'No hidden activity monitoring, no screen-reading, and no surveillance framing.',
  },
  {
    icon: BellOff,
    title: 'Quiet by design',
    body: 'Foldera is not another inbox, task list, or dashboard to babysit.',
  },
  {
    icon: Clock3,
    title: 'Pilot honest',
    body: 'Pilot access is staged. Live claims stay inside what the repo already supports.',
  },
];

const pilotScope = [
  'Public access starts at the existing /start route.',
  'Login stays on the existing /login route.',
  'Pricing is shaped through pilot usage; no fake public price promise here.',
  'Demo remains the existing product demo route, not a new fake flow.',
];

function SectionLabel({ index, children }: { index: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline gap-3 font-mono text-[11px] uppercase tracking-[0.28em] text-slate-500">
      <span className="text-cyan-300/80">{index}</span>
      <span className="h-px w-8 bg-white/15" />
      <span>{children}</span>
    </div>
  );
}

/* ---- consented connector marks ---- */
const Gmail = () => (
  <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden="true">
    <path d="M2 6.5A1.5 1.5 0 0 1 3.5 5H4l8 6 8-6h.5A1.5 1.5 0 0 1 22 6.5V18a1 1 0 0 1-1 1h-2V9.7l-7 5.25L5 9.7V19H3a1 1 0 0 1-1-1z" fill="#EA4335" />
    <path d="M2 6.5V18a1 1 0 0 0 1 1h2V9.7z" fill="#C5221F" />
    <path d="M22 6.5V18a1 1 0 0 1-1 1h-2V9.7z" fill="#FBBC04" />
  </svg>
);
const Slack = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
    <path d="M5.5 15a2 2 0 1 1-2-2h2zm1 0a2 2 0 0 1 4 0v5a2 2 0 1 1-4 0z" fill="#E01E5A" />
    <path d="M9 5.5a2 2 0 1 1 2-2v2zm0 1a2 2 0 0 1 0 4H4a2 2 0 1 1 0-4z" fill="#36C5F0" />
    <path d="M18.5 9a2 2 0 1 1 2 2h-2zm-1 0a2 2 0 0 1-4 0V4a2 2 0 1 1 4 0z" fill="#2EB67D" />
    <path d="M15 18.5a2 2 0 1 1-2 2v-2zm0-1a2 2 0 0 1 0-4h5a2 2 0 1 1 0 4z" fill="#ECB22E" />
  </svg>
);
const Notion = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
    <rect x="2" y="2" width="20" height="20" rx="4" fill="#fff" />
    <path d="M7 7.4v9.2M7 7.4l8 9.4M16 7v9.4" stroke="#0a0e14" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </svg>
);
const Linear = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
    <rect x="2" y="2" width="20" height="20" rx="4" fill="#5E6AD2" />
    <path d="M6 13.5 10.5 18M6 10l8 8M6.5 6.8 17.2 17.5" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);
const GCal = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
    <rect x="3" y="4" width="18" height="17" rx="3" fill="#fff" />
    <rect x="3" y="4" width="18" height="4" rx="3" fill="#4285F4" />
    <text x="12" y="17.6" textAnchor="middle" fontFamily="Arial, sans-serif" fontWeight="700" fontSize="9" fill="#4285F4">31</text>
  </svg>
);
const connectors: Array<{ name: string; el: ReactNode }> = [
  { name: 'Gmail', el: <Gmail /> },
  { name: 'Slack', el: <Slack /> },
  { name: 'Notion', el: <Notion /> },
  { name: 'Linear', el: <Linear /> },
  { name: 'Google Calendar', el: <GCal /> },
];

const evidenceRows = [
  { el: <Slack />, label: '#q2-planning — mentioned you', meta: '3 new' },
  { el: <Gmail />, label: 'Re: Headcount — Finance', meta: '2:14 PM' },
  { el: <GCal />, label: 'Budget review · Today 4:00', meta: '' },
];

function AccessLink({
  children,
  className = '',
  testId,
}: {
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <a
      href={accessHref}
      data-testid={testId}
      className={`inline-flex min-h-[46px] items-center justify-center gap-2 rounded-full bg-cyan-300 px-6 text-sm font-semibold text-slate-950 transition hover:-translate-y-px hover:bg-cyan-200 ${className}`}
    >
      {children}
      <ArrowRight className="h-4 w-4" aria-hidden="true" />
    </a>
  );
}

function SecondaryLink({
  href,
  children,
  testId,
}: {
  href: string;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <a
      href={href}
      data-testid={testId}
      className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold text-slate-200 transition-colors hover:text-white"
    >
      {children}
      <ArrowRight className="h-4 w-4 opacity-60" aria-hidden="true" />
    </a>
  );
}

function RightNowCard() {
  return (
    <motion.div
      className="relative"
      initial={{ opacity: 0, y: 26, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.85, delay: 0.15, ease: EASE }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-x-10 -top-16 bottom-0 -z-10"
        style={{ background: 'radial-gradient(45% 45% at 62% 28%, rgba(34,211,238,0.16), transparent 72%)' }}
      />
      <div
        data-testid="landing-right-now-card"
        className="overflow-hidden rounded-2xl"
        style={{
          border: '1px solid rgba(255,255,255,0.10)',
          backgroundImage: 'linear-gradient(180deg, #0e151f 0%, #0a0e15 100%)',
          boxShadow: '0 1px 0 rgba(255,255,255,0.07) inset, 0 60px 110px -45px rgba(0,0,0,0.95)',
        }}
      >
        <div className="flex items-center justify-between border-b border-white/8 px-5 py-3.5">
          <div className="inline-flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-400">Watching</span>
          </div>
          <div className="flex items-center gap-2">
            {connectors.map((c) => (
              <span key={c.name} title={c.name} aria-label={c.name} className="opacity-85">
                {c.el}
              </span>
            ))}
          </div>
        </div>

        <div className="p-6 sm:p-7">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-cyan-300/90">Right Now</span>
            <span className="font-mono text-[10px] text-slate-500">9:42 AM</span>
          </div>

          <h2 className="mt-4 text-[24px] font-semibold leading-[1.15] tracking-[-0.025em] text-white sm:text-[28px]">
            Review the Q2 headcount plan.
          </h2>
          <p className="mt-3 text-[14px] leading-6 text-slate-400">
            Sarah updated the doc. Finance commented. You were mentioned in Slack. Approval now unlocks the budget timeline.
          </p>

          <motion.div
            className="mt-6 overflow-hidden rounded-xl border border-white/8"
            variants={stagger}
            initial="hidden"
            animate="show"
          >
            {evidenceRows.map((row, i) => (
              <motion.div
                key={i}
                variants={fadeUp}
                className={`flex items-center gap-3 bg-white/[0.02] px-4 py-3 ${i > 0 ? 'border-t border-white/6' : ''}`}
              >
                <span className="shrink-0 opacity-90">{row.el}</span>
                <span className="flex-1 truncate text-[13px] text-slate-300">{row.label}</span>
                {row.meta ? <span className="font-mono text-[10px] text-slate-500">{row.meta}</span> : null}
              </motion.div>
            ))}
          </motion.div>

          <div className="mt-6 flex items-center gap-2.5">
            <button className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-full bg-cyan-300 px-5 text-[13px] font-semibold text-slate-950 transition hover:bg-cyan-200">
              Open the doc
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
            <button className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/12 text-slate-300 transition-colors hover:text-white" aria-label="Mark done">
              <Check className="h-4 w-4" aria-hidden="true" />
            </button>
            <button className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/12 text-slate-300 transition-colors hover:text-white" aria-label="Snooze">
              <Pause className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.18em] text-slate-600">
            State attached · context private
          </p>
        </div>
      </div>
    </motion.div>
  );
}

const sectionWrap = 'mx-auto w-full max-w-6xl px-5 sm:px-6 lg:px-8';

export function LandingPage({ isAuthenticated: _isAuthenticated = false }: LandingPageProps = {}) {
  return (
    <main className="relative min-h-[100dvh] overflow-x-hidden bg-[#06080c] text-white">
      <header
        className="sticky top-0 z-[60] border-b border-white/[0.06] bg-[#06080c]/85 pt-[env(safe-area-inset-top,0px)] backdrop-blur-xl"
        data-testid="landing-header"
      >
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-5 px-5 sm:px-6 lg:px-8">
          <a
            href="/"
            aria-label="Foldera"
            className="inline-flex min-h-[44px] min-w-[44px] items-center gap-2.5 rounded-[12px] px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
          >
            <FolderaMark size="sm" decorative />
            <span className="text-[16px] font-semibold tracking-[-0.025em] text-white">Foldera</span>
          </a>

          <nav
            aria-label="Landing navigation"
            className="hidden items-center gap-8 text-[13px] font-medium text-slate-400 md:flex"
          >
            <a href="#how-foldera-works" className="transition-colors hover:text-white">How it works</a>
            <a href="/security" className="transition-colors hover:text-white">Security</a>
            <a href="/pricing" className="transition-colors hover:text-white">Pricing</a>
            <a href="/try" className="transition-colors hover:text-white">Try it</a>
          </nav>

          <div className="flex items-center gap-4">
            <a
              href={loginHref}
              data-testid="landing-login-cta"
              className="hidden text-[13px] font-medium text-slate-400 transition-colors hover:text-white sm:inline-flex"
            >
              Login
            </a>
            <a
              href={accessHref}
              data-testid="landing-header-cta"
              className="inline-flex min-h-[38px] items-center gap-2 rounded-full bg-cyan-300 px-4 text-[12px] font-semibold text-slate-950 transition hover:bg-cyan-200"
            >
              Request access
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="relative border-b border-white/[0.07]" data-testid="landing-hero">
        <div className={`${sectionWrap} grid items-center gap-12 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:py-24`}>
          <motion.div variants={stagger} initial="hidden" animate="show">
            <motion.p variants={fadeUp} className="font-mono text-[11px] uppercase tracking-[0.28em] text-cyan-300/90">
              The Workday Presence Layer
            </motion.p>
            <motion.h1 variants={fadeUp} className="mt-6 max-w-2xl text-[2.9rem] font-semibold leading-[0.98] tracking-[-0.045em] text-white sm:text-6xl lg:text-[4.4rem]">
              Stop rebuilding the work.
            </motion.h1>
            <motion.p variants={fadeUp} className="mt-7 max-w-xl text-lg leading-8 text-slate-400">
              Foldera restores continuity across fractured apps, messages, meetings, approvals, and decisions so you can stop rebuilding context just to do the work.
            </motion.p>

            <motion.div variants={fadeUp} className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[12px] uppercase tracking-[0.14em] text-slate-500">
              <span>Consent-first</span>
              <span className="text-slate-700">/</span>
              <span>No surveillance</span>
              <span className="text-slate-700">/</span>
              <span>Quiet by design</span>
            </motion.div>

            <motion.div variants={fadeUp} className="mt-9 flex flex-col gap-2 sm:flex-row sm:items-center">
              <AccessLink testId="landing-primary-access-cta">Request access</AccessLink>
              <SecondaryLink href="#how-foldera-works">See how it works</SecondaryLink>
            </motion.div>
          </motion.div>

          <RightNowCard />
        </div>
      </section>

      {/* PAIN */}
      <section className={`${sectionWrap} py-20 lg:py-28`} data-testid="landing-pain">
        <Reveal>
          <SectionLabel index="01">Context collapse</SectionLabel>
          <h2 className="mt-6 max-w-3xl text-[2rem] font-semibold leading-[1.08] tracking-[-0.035em] sm:text-[2.75rem]">
            You are a high-paid filing clerk.
          </h2>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-400">
            You spend too much of your day rebuilding context across fractured apps just to do a few minutes of actual work.
          </p>
        </Reveal>
        <motion.div
          className="mt-14 grid gap-x-10 gap-y-12 sm:grid-cols-3"
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-80px' }}
        >
          {painPoints.map((item, i) => (
            <motion.div key={item.title} variants={fadeUp} className="border-t border-white/12 pt-5">
              <span className="font-mono text-[11px] text-cyan-300/70">{String(i + 1).padStart(2, '0')}</span>
              <h3 className="mt-3 text-lg font-semibold tracking-[-0.02em] text-white">{item.title}</h3>
              <p className="mt-3 text-[15px] leading-7 text-slate-400">{item.body}</p>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* DOCTRINE / HOW IT WORKS */}
      <section id="how-foldera-works" className="border-y border-white/[0.07] bg-white/[0.012]" data-testid="landing-doctrine">
        <div className={`${sectionWrap} py-20 lg:py-28`}>
          <Reveal>
            <SectionLabel index="02">How it works</SectionLabel>
            <h2 className="mt-6 max-w-4xl text-[2rem] font-semibold leading-[1.08] tracking-[-0.035em] sm:text-[2.75rem]">
              The problem isn&apos;t lack of AI. <span className="text-slate-500">The problem is broken continuity.</span>
            </h2>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-400">
              Every app remembers its own slice. Microsoft remembers Microsoft. Google remembers Google. Foldera is the cross-system presence layer that remembers the state of your workday.
            </p>
          </Reveal>

          <motion.div
            className="mt-14 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-4"
            variants={stagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-80px' }}
          >
            {doctrine.map((item) => (
              <motion.div key={item.label} variants={fadeUp} className="border-t border-white/12 pt-5">
                <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-cyan-300/90">{item.label}</p>
                <p className="mt-4 text-[15px] leading-7 text-slate-400">{item.body}</p>
              </motion.div>
            ))}
          </motion.div>

          <ol className="mt-16 divide-y divide-white/8 border-y border-white/8" data-testid="landing-workflow">
            {howItWorks.map((step, index) => (
              <li key={step} className="flex items-baseline gap-5 py-5">
                <span className="font-mono text-sm text-cyan-300/70">{String(index + 1).padStart(2, '0')}</span>
                <span className="text-[15px] leading-7 text-slate-300">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* TRUST */}
      <section id="trust" className={`${sectionWrap} py-20 lg:py-28`} data-testid="landing-trust">
        <Reveal>
          <SectionLabel index="03">Habitat</SectionLabel>
          <h2 className="mt-6 max-w-3xl text-[2rem] font-semibold leading-[1.08] tracking-[-0.035em] sm:text-[2.75rem]">
            It lives where you work. <span className="text-slate-500">And stays quiet otherwise.</span>
          </h2>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-400">
            Foldera interrupts only when there is a clean moment to act, hands you the next move where you already are, and then disappears.
          </p>
        </Reveal>
        <motion.div
          className="mt-14 grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-4"
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-80px' }}
        >
          {trustItems.map(({ icon: Icon, title, body }) => (
            <motion.div key={title} variants={fadeUp} className="border-t border-white/12 pt-5">
              <Icon className="h-5 w-5 text-cyan-300/80" aria-hidden="true" />
              <h3 className="mt-4 text-lg font-semibold tracking-[-0.02em] text-white">{title}</h3>
              <p className="mt-3 text-[15px] leading-7 text-slate-400">{body}</p>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* PILOT */}
      <section id="pilot" className="border-y border-white/[0.07] bg-white/[0.012]" data-testid="landing-pilot">
        <div className={`${sectionWrap} grid gap-12 py-20 lg:grid-cols-[0.95fr_1.05fr] lg:gap-16 lg:py-28`}>
          <Reveal>
            <SectionLabel index="04">Pilot access</SectionLabel>
            <h2 className="mt-6 text-[2rem] font-semibold leading-[1.08] tracking-[-0.035em] sm:text-[2.75rem]">
              Stop checking nine apps. <span className="text-slate-500">Foldera keeps track.</span>
            </h2>
            <p className="mt-5 max-w-xl text-lg leading-8 text-slate-400">
              Foldera is not a dashboard. It watches consented signals, remembers your focus, and calculates the next state of your work.
            </p>
            <div className="mt-9 flex flex-col gap-2 sm:flex-row sm:items-center">
              <AccessLink testId="landing-pilot-access-cta">Join pilot</AccessLink>
              <SecondaryLink href="/demo" testId="landing-demo-link">View existing demo</SecondaryLink>
            </div>
          </Reveal>

          <motion.div
            className="divide-y divide-white/8 border-y border-white/8 lg:mt-2"
            variants={stagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-80px' }}
          >
            {pilotScope.map((item) => (
              <motion.div key={item} variants={fadeUp} className="flex items-start gap-4 py-4">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300/70" aria-hidden="true" />
                <p className="text-[15px] leading-7 text-slate-400">{item}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className={`${sectionWrap} py-24 lg:py-32`} data-testid="landing-final-cta">
        <Reveal className="mx-auto max-w-3xl text-center">
          <h2 className="text-[2.4rem] font-semibold leading-[1.03] tracking-[-0.04em] sm:text-[3.5rem]">
            Restore your continuity.
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-slate-400">
            Stop acting as the human integration layer. Let Foldera hold the context, so you can do the work.
          </p>
          <p className="mx-auto mt-4 font-mono text-[12px] uppercase tracking-[0.16em] text-cyan-300/90">
            One trusted answer. All the context. Next move ready.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-2 sm:flex-row">
            <AccessLink testId="landing-final-access-cta">Get started</AccessLink>
            <SecondaryLink href={loginHref} testId="landing-final-login-cta">Login</SecondaryLink>
          </div>
        </Reveal>
      </section>

      <footer className="border-t border-white/[0.07] px-5 py-10 text-sm text-slate-500 sm:px-6 lg:px-8" data-testid="landing-footer">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-mono text-[12px] uppercase tracking-[0.16em]">Foldera — Workday Presence Layer.</p>
          <div className="flex flex-wrap gap-5">
            <a href="/pricing" className="hover:text-slate-300">Pricing</a>
            <a href="/security" className="hover:text-slate-300">Security</a>
            <a href="/about" className="hover:text-slate-300">About</a>
            <a href="/privacy" className="hover:text-slate-300">Privacy</a>
            <a href="/terms" className="hover:text-slate-300">Terms</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
