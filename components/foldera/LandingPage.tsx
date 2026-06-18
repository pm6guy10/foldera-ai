'use client';

import { useState, type ReactNode } from 'react';
import Image from 'next/image';
import {
  Activity,
  ArrowRight,
  BellOff,
  Check,
  Clock3,
  FileText,
  Inbox,
  Layers,
  LockKeyhole,
  Menu,
  ScrollText,
  Settings,
  ShieldCheck,
  Sparkles,
  UserX,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { MotionConfig, motion, type Variants } from 'framer-motion';
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

/* ----------------------------------------------------- real brand logos */

type Brand = { name: string; src: string };

const connectors: Brand[] = [
  { name: 'Gmail', src: '/logos/gmail.svg' },
  { name: 'Slack', src: '/logos/slack.svg' },
  { name: 'Notion', src: '/logos/notion.svg' },
  { name: 'Linear', src: '/logos/linear.svg' },
  { name: 'Google Calendar', src: '/logos/google-calendar.svg' },
  { name: 'GitHub', src: '/logos/github.svg' },
  { name: 'Microsoft Outlook', src: '/logos/outlook.svg' },
  { name: 'Google Drive', src: '/logos/google-drive.svg' },
];

function BrandLogo({ brand, size = 20 }: { brand: Brand; size?: number }) {
  return (
    <Image
      src={brand.src}
      alt={brand.name}
      title={brand.name}
      width={size}
      height={size}
      unoptimized
      className="object-contain"
      style={{ width: size, height: size }}
    />
  );
}

/* ----------------------------------------------------- copy / content */

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

const stats = [
  { n: '9.4', u: 'hrs', l: 'lost per knowledge worker each week to context switching.' },
  { n: '2.7', u: '×', l: 'longer to ramp back into deep work after an interruption.' },
  { n: '31', u: '%', l: 'of work time spent reconstructing context, not doing the work.' },
  { n: '$37', u: 'B+', l: 'annual cost of fractured context to the Fortune 500.' },
];

const doctrine = [
  { label: 'State', icon: Layers, body: 'Current focus, next move, blocker, do-not-touch, waiting-on, and last completed step.' },
  { label: 'Connectors', icon: Activity, body: 'Consented systems provide evidence. Foldera does not screen-read or secretly monitor work.' },
  { label: 'Triggers', icon: Zap, body: 'Meetings, mentions, replies, waiting-on changes, user actions, and end-of-day carry-forward.' },
  { label: 'One intervention', icon: Sparkles, body: 'A single Right Now card with one useful next move and one clear response path.' },
];

const howItWorks = [
  'Work happens across messages, meetings, documents, files, and approvals.',
  'Foldera keeps the workday state attached to the evidence you consented to connect.',
  'When something meaningful changes, Foldera decides whether it is worth interrupting.',
  'One Right Now card appears where the work is already happening.',
  'You click once. Foldera updates state and goes quiet again.',
];

const trustItems = [
  { icon: ShieldCheck, title: 'Consent first', body: 'You choose what connects and what Foldera can use.' },
  { icon: LockKeyhole, title: 'No surveillance', body: 'No hidden activity monitoring, no screen-reading, and no surveillance framing.' },
  { icon: BellOff, title: 'Quiet by design', body: 'Foldera is not another inbox, task list, or dashboard to babysit.' },
  { icon: Clock3, title: 'Pilot honest', body: 'Pilot access is staged. Live claims stay inside what the repo already supports.' },
];

const enterprise = [
  { icon: ShieldCheck, t: 'Least privilege', s: 'scoped, revocable access' },
  { icon: LockKeyhole, t: 'Read-only', s: 'connectors by default' },
  { icon: Users, t: 'SSO / SCIM', s: 'SAML 2.0 ready' },
  { icon: ScrollText, t: 'Audit logs', s: 'every action receipted' },
  { icon: UserX, t: 'No training', s: 'on your data, ever' },
];

const pilotScope = [
  'Public access starts at the existing /start route.',
  'Login stays on the existing /login route.',
  'Pricing is shaped through pilot usage; no fake public price promise here.',
  'Demo remains the existing product demo route, not a new fake flow.',
];

const evidenceRows: Array<{ brand: Brand; label: string; meta: string }> = [
  { brand: connectors[1], label: '#q2-planning — mentioned you', meta: '3 new' },
  { brand: connectors[0], label: 'Re: Headcount — Finance', meta: '2:14 PM' },
  { brand: connectors[4], label: 'Budget review · Today 4:00', meta: '' },
];

/* ----------------------------------------------------- small primitives */

function SectionLabel({ index, children }: { index: string; children: ReactNode }) {
  return (
    <div className="ld-mono flex items-center gap-3 text-[11px] uppercase tracking-[0.28em] text-[color:var(--ld-fg-dim)]">
      <span className="text-[color:var(--ld-accent)]">{index}</span>
      <span className="h-px w-8 bg-white/15" />
      <span>{children}</span>
    </div>
  );
}

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
      className={`ld-btn-primary inline-flex min-h-[46px] items-center justify-center gap-2 px-6 text-sm ${className}`}
    >
      {children}
      <ArrowRight className="h-4 w-4" aria-hidden="true" />
    </a>
  );
}

function GhostLink({
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
      className="ld-btn-ghost inline-flex min-h-[46px] items-center justify-center gap-2 px-6 text-sm"
    >
      {children}
    </a>
  );
}

/* ----------------------------------------------------- the product window */

function ProductWindow() {
  const rail = [
    { icon: Inbox, label: 'Today', active: true },
    { icon: Activity, label: 'Signals' },
    { icon: Layers, label: 'State' },
    { icon: Zap, label: 'Moves' },
  ];
  return (
    <motion.div
      className="relative"
      initial={{ opacity: 0, y: 26, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.85, delay: 0.15, ease: EASE }}
    >
      <div data-testid="landing-right-now-card" className="ld-panel overflow-hidden">
        {/* window chrome */}
        <div className="flex items-center gap-3 border-b border-white/[0.07] px-4 py-3">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-white/12" />
            <span className="h-2.5 w-2.5 rounded-full bg-white/12" />
            <span className="h-2.5 w-2.5 rounded-full bg-white/12" />
          </div>
          <div className="ld-mono mx-auto flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-[color:var(--ld-fg-dim)]">
            <span className="relative flex h-2 w-2">
              <span className="ld-signal absolute inline-flex h-full w-full rounded-full bg-[color:var(--ld-green)]" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[color:var(--ld-green)]" />
            </span>
            foldera · watching
          </div>
          <span className="w-[34px]" />
        </div>

        <div className="flex">
          {/* left rail */}
          <nav
            aria-hidden="true"
            className="hidden shrink-0 flex-col items-center gap-1 border-r border-white/[0.06] py-4 sm:flex"
          >
            {rail.map(({ icon: Icon, label, active }) => (
              <span
                key={label}
                title={label}
                className={`flex h-9 w-9 items-center justify-center rounded-[10px] ${
                  active
                    ? 'ld-accent-soft'
                    : 'text-[color:var(--ld-fg-dim)]'
                }`}
              >
                <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
              </span>
            ))}
            <span className="mt-auto flex h-9 w-9 items-center justify-center rounded-[10px] text-[color:var(--ld-fg-dim)]">
              <Settings className="h-[18px] w-[18px]" strokeWidth={1.75} />
            </span>
          </nav>

          {/* main */}
          <div className="min-w-0 flex-1 p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <span className="ld-mono text-[10px] uppercase tracking-[0.24em] text-[color:var(--ld-accent)]">
                Right Now
              </span>
              <div className="flex items-center gap-2">
                {connectors.slice(0, 5).map((c) => (
                  <BrandLogo key={c.name} brand={c} size={17} />
                ))}
                <span className="ld-mono text-[10px] text-[color:var(--ld-fg-dim)]">9:42 AM</span>
              </div>
            </div>

            <h2 className="ld-display mt-4 text-[22px] tracking-[-0.025em] text-[color:var(--ld-fg)] sm:text-[26px]">
              Review the Q2 headcount plan.
            </h2>
            <p className="mt-3 text-[14px] leading-6 text-[color:var(--ld-fg-muted)]">
              Sarah updated the doc. Finance commented. You were mentioned in Slack. Approval now unlocks the budget timeline.
            </p>

            <motion.div
              className="mt-5 overflow-hidden rounded-xl border border-white/[0.07]"
              variants={stagger}
              initial="hidden"
              animate="show"
            >
              {evidenceRows.map((row, i) => (
                <motion.div
                  key={row.label}
                  variants={fadeUp}
                  className={`flex items-center gap-3 bg-white/[0.015] px-4 py-3 ${
                    i > 0 ? 'border-t border-white/[0.06]' : ''
                  }`}
                >
                  <BrandLogo brand={row.brand} size={16} />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-[color:var(--ld-fg-soft)]">
                    {row.label}
                  </span>
                  <Check className="h-3.5 w-3.5 shrink-0 text-[color:var(--ld-green)]" aria-hidden="true" />
                  {row.meta ? (
                    <span className="ld-mono shrink-0 text-[10px] text-[color:var(--ld-fg-dim)]">{row.meta}</span>
                  ) : null}
                </motion.div>
              ))}
            </motion.div>

            <div className="mt-5 flex items-center gap-2.5">
              <button className="ld-btn-primary inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 px-5 text-[13px]">
                Open the doc
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
              <button className="ld-icon-btn inline-flex h-11 w-11 items-center justify-center" aria-label="Mark done">
                <Check className="h-4 w-4" aria-hidden="true" />
              </button>
              <button className="ld-icon-btn inline-flex h-11 w-11 items-center justify-center" aria-label="Snooze">
                <Clock3 className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <p className="ld-mono mt-5 text-[10px] uppercase tracking-[0.18em] text-[color:var(--ld-fg-dim)]">
              State attached · context private
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* ----------------------------------------------------- header */

const navLinks = [
  { href: '#how-foldera-works', label: 'How it works' },
  { href: '/security', label: 'Security' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/try', label: 'Try it' },
];

function Header() {
  const [open, setOpen] = useState(false);
  return (
    <header
      data-testid="landing-header"
      className="sticky top-0 z-[60] border-b border-white/[0.06] bg-[#0a0a0c]/85 pt-[env(safe-area-inset-top,0px)] backdrop-blur-xl"
    >
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-5 px-5 sm:px-6 lg:px-8">
        <a
          href="/"
          aria-label="Foldera"
          className="inline-flex min-h-[44px] items-center gap-2.5 rounded-[12px] px-1"
        >
          <FolderaMark size="sm" decorative />
          <span className="text-[16px] font-semibold tracking-[-0.025em] text-[color:var(--ld-fg)]">Foldera</span>
        </a>

        <nav aria-label="Landing navigation" className="hidden items-center gap-8 text-[13px] font-medium md:flex">
          {navLinks.map((l) => (
            <a key={l.href} href={l.href} className="ld-nav-link">
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <a
            href={loginHref}
            data-testid="landing-login-cta"
            className="ld-nav-link hidden text-[13px] font-medium sm:inline-flex"
          >
            Sign in
          </a>
          <a
            href={accessHref}
            data-testid="landing-header-cta"
            className="ld-btn-primary hidden min-h-[38px] items-center gap-2 px-4 text-[12px] sm:inline-flex"
          >
            Start free
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
          <button
            type="button"
            data-testid="nav-mobile-menu-toggle"
            aria-label={open ? 'Close menu (toggle)' : 'Open menu'}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="ld-icon-btn inline-flex h-10 w-10 items-center justify-center md:hidden"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open ? (
        <div className="fixed inset-0 z-[70] md:hidden" role="dialog" aria-modal="true" aria-label="Site menu">
          <button
            type="button"
            className="absolute inset-0 bg-[#0a0a0c]/95 backdrop-blur-xl"
            role="presentation"
            onClick={() => setOpen(false)}
            aria-label="Dismiss overlay"
          />
          <div className="relative mx-4 mt-[calc(4rem+env(safe-area-inset-top,0px))] overflow-hidden rounded-[18px] border border-white/10 bg-[color:var(--ld-bg-2)] p-5 shadow-[0_24px_90px_rgba(0,0,0,0.72)]">
            <button
              type="button"
              data-testid="nav-mobile-overlay-close"
              onClick={() => setOpen(false)}
              className="ld-icon-btn absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center"
              aria-label="Close menu"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
            <nav className="mt-12 flex flex-col gap-1">
              {navLinks.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="flex min-h-[44px] items-center rounded-[10px] px-3 text-[15px] text-[color:var(--ld-fg-soft)] transition-colors hover:bg-white/[0.045]"
                >
                  {l.label}
                </a>
              ))}
              <a
                href={loginHref}
                onClick={() => setOpen(false)}
                className="flex min-h-[44px] items-center rounded-[10px] px-3 text-[15px] text-[color:var(--ld-fg-soft)] transition-colors hover:bg-white/[0.045]"
              >
                Sign in
              </a>
              <a
                href={accessHref}
                onClick={() => setOpen(false)}
                className="ld-btn-primary mt-2 inline-flex min-h-[46px] items-center justify-center gap-2 px-5 text-sm"
              >
                Start free
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </a>
            </nav>
          </div>
        </div>
      ) : null}
    </header>
  );
}

/* ----------------------------------------------------- page */

const sectionWrap = 'mx-auto w-full max-w-6xl px-5 sm:px-6 lg:px-8';

export function LandingPage({ isAuthenticated: _isAuthenticated = false }: LandingPageProps = {}) {
  return (
    <MotionConfig reducedMotion="user">
      <main className="ld relative min-h-[100dvh] overflow-x-hidden">
        <div className="ld-aurora" aria-hidden="true" />
        <div className="relative z-10">
          <Header />

          {/* HERO */}
          <section className="ld-gridlines relative border-b border-white/[0.07]" data-testid="landing-hero">
            <div className={`${sectionWrap} grid items-center gap-12 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:py-24`}>
              <motion.div variants={stagger} initial="hidden" animate="show">
                <motion.p variants={fadeUp} className="ld-eyebrow">
                  The Workday Presence Layer
                </motion.p>
                <motion.h1
                  variants={fadeUp}
                  className="ld-display mt-6 max-w-2xl text-[2.9rem] tracking-[-0.045em] text-[color:var(--ld-fg)] sm:text-6xl lg:text-[4.3rem]"
                >
                  Stop rebuilding the work.
                  <span className="ld-text-fade block">The reconstruction tax ends here.</span>
                </motion.h1>
                <motion.p variants={fadeUp} className="mt-7 max-w-xl text-lg leading-8 text-[color:var(--ld-fg-muted)]">
                  Foldera restores continuity across fractured apps, messages, meetings, approvals, and decisions so you can stop rebuilding context just to do the work.
                </motion.p>

                <motion.div
                  variants={fadeUp}
                  className="ld-mono mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] uppercase tracking-[0.14em] text-[color:var(--ld-fg-dim)]"
                >
                  <span>Consent-first</span>
                  <span className="text-white/15">/</span>
                  <span>No surveillance</span>
                  <span className="text-white/15">/</span>
                  <span>Quiet by design</span>
                </motion.div>

                <motion.div variants={fadeUp} className="mt-9 flex flex-col gap-2.5 sm:flex-row sm:items-center">
                  <AccessLink testId="landing-primary-access-cta">Start free</AccessLink>
                  <GhostLink href="#how-foldera-works">See how it works</GhostLink>
                </motion.div>
              </motion.div>

              <ProductWindow />
            </div>
          </section>

          {/* CONNECTOR STRIP */}
          <section className="border-b border-white/[0.07]" data-testid="landing-connectors">
            <div className={`${sectionWrap} flex flex-col items-center gap-7 py-12 sm:flex-row sm:gap-10`}>
              <p className="ld-mono shrink-0 text-[11px] uppercase tracking-[0.22em] text-[color:var(--ld-fg-dim)]">
                Works where you already work
              </p>
              <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-4 sm:justify-start">
                {connectors.map((c) => (
                  <span key={c.name} className="ld-conn-chip" title={c.name} aria-label={c.name}>
                    <BrandLogo brand={c} size={20} />
                  </span>
                ))}
              </div>
            </div>
          </section>

          {/* STATS */}
          <section className={`${sectionWrap} py-16 lg:py-20`} data-testid="landing-stats">
            <motion.div
              className="grid grid-cols-2 gap-x-8 gap-y-10 lg:grid-cols-4"
              variants={stagger}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: '-80px' }}
            >
              {stats.map((s) => (
                <motion.div key={s.n} variants={fadeUp} className="border-t border-white/12 pt-5">
                  <div className="ld-display flex items-baseline text-[color:var(--ld-fg)]">
                    <span className="text-[2.6rem] leading-none sm:text-[3rem]">{s.n}</span>
                    <span className="ml-0.5 text-[1.4rem] text-[color:var(--ld-accent)]">{s.u}</span>
                  </div>
                  <p className="mt-3 max-w-[15rem] text-[14px] leading-6 text-[color:var(--ld-fg-muted)]">{s.l}</p>
                </motion.div>
              ))}
            </motion.div>
          </section>

          {/* PAIN */}
          <section className={`${sectionWrap} py-20 lg:py-28`} data-testid="landing-pain">
            <Reveal>
              <SectionLabel index="01">Context collapse</SectionLabel>
              <h2 className="ld-display mt-6 max-w-3xl text-[2rem] tracking-[-0.035em] text-[color:var(--ld-fg)] sm:text-[2.75rem]">
                You are a high-paid filing clerk.
              </h2>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-[color:var(--ld-fg-muted)]">
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
                  <span className="ld-mono text-[11px] text-[color:var(--ld-accent)]">{String(i + 1).padStart(2, '0')}</span>
                  <h3 className="ld-display mt-3 text-lg tracking-[-0.02em] text-[color:var(--ld-fg)]">{item.title}</h3>
                  <p className="mt-3 text-[15px] leading-7 text-[color:var(--ld-fg-muted)]">{item.body}</p>
                </motion.div>
              ))}
            </motion.div>
          </section>

          {/* DOCTRINE / HOW IT WORKS */}
          <section
            id="how-foldera-works"
            className="border-y border-white/[0.07] bg-white/[0.012]"
            data-testid="landing-doctrine"
          >
            <div className={`${sectionWrap} py-20 lg:py-28`}>
              <Reveal>
                <SectionLabel index="02">How it works</SectionLabel>
                <h2 className="ld-display mt-6 max-w-4xl text-[2rem] tracking-[-0.035em] text-[color:var(--ld-fg)] sm:text-[2.75rem]">
                  The problem isn&apos;t lack of AI.{' '}
                  <span className="text-[color:var(--ld-fg-dim)]">The problem is broken continuity.</span>
                </h2>
                <p className="mt-5 max-w-2xl text-lg leading-8 text-[color:var(--ld-fg-muted)]">
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
                {doctrine.map(({ label, icon: Icon, body }) => (
                  <motion.div key={label} variants={fadeUp} className="border-t border-white/12 pt-5">
                    <Icon className="h-5 w-5 text-[color:var(--ld-accent)]" strokeWidth={1.75} aria-hidden="true" />
                    <p className="ld-mono mt-4 text-[11px] font-medium uppercase tracking-[0.18em] text-[color:var(--ld-fg)]">
                      {label}
                    </p>
                    <p className="mt-3 text-[15px] leading-7 text-[color:var(--ld-fg-muted)]">{body}</p>
                  </motion.div>
                ))}
              </motion.div>

              <ol className="mt-16 divide-y divide-white/[0.07] border-y border-white/[0.07]" data-testid="landing-workflow">
                {howItWorks.map((step, index) => (
                  <li key={step} className="flex items-baseline gap-5 py-5">
                    <span className="ld-mono text-sm text-[color:var(--ld-accent)]">{String(index + 1).padStart(2, '0')}</span>
                    <span className="text-[15px] leading-7 text-[color:var(--ld-fg-soft)]">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          </section>

          {/* TRUST */}
          <section id="trust" className={`${sectionWrap} py-20 lg:py-28`} data-testid="landing-trust">
            <Reveal>
              <SectionLabel index="03">Habitat</SectionLabel>
              <h2 className="ld-display mt-6 max-w-3xl text-[2rem] tracking-[-0.035em] text-[color:var(--ld-fg)] sm:text-[2.75rem]">
                It lives where you work.{' '}
                <span className="text-[color:var(--ld-fg-dim)]">And stays quiet otherwise.</span>
              </h2>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-[color:var(--ld-fg-muted)]">
                Foldera interrupts only when there is a clean moment to act, hands you the next move where you already are, and then disappears.
              </p>
            </Reveal>
            <motion.div
              className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4"
              variants={stagger}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: '-80px' }}
            >
              {trustItems.map(({ icon: Icon, title, body }) => (
                <motion.div key={title} variants={fadeUp} className="ld-card-interactive p-6">
                  <span className="ld-accent-soft flex h-10 w-10 items-center justify-center rounded-[10px]">
                    <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
                  </span>
                  <h3 className="ld-display mt-5 text-lg tracking-[-0.02em] text-[color:var(--ld-fg)]">{title}</h3>
                  <p className="mt-2.5 text-[15px] leading-7 text-[color:var(--ld-fg-muted)]">{body}</p>
                </motion.div>
              ))}
            </motion.div>
          </section>

          {/* ENTERPRISE STRIP */}
          <section className="border-y border-white/[0.07] bg-white/[0.012]" data-testid="landing-enterprise">
            <div className={`${sectionWrap} py-14`}>
              <p className="ld-mono mb-9 text-center text-[11px] uppercase tracking-[0.24em] text-[color:var(--ld-fg-dim)]">
                Enterprise-ready from the ground up
              </p>
              <div className="grid grid-cols-2 gap-x-8 gap-y-8 sm:grid-cols-3 lg:grid-cols-5">
                {enterprise.map(({ icon: Icon, t, s }) => (
                  <div key={t} className="flex items-start gap-3">
                    <Icon className="mt-0.5 h-5 w-5 shrink-0 text-[color:var(--ld-accent)]" strokeWidth={1.75} aria-hidden="true" />
                    <span className="text-[13px] leading-snug">
                      <span className="block text-[color:var(--ld-fg)]">{t}</span>
                      <span className="text-[color:var(--ld-fg-muted)]">{s}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* PILOT */}
          <section className={`${sectionWrap} py-20 lg:py-28`} data-testid="landing-pilot">
            <div className="grid gap-12 lg:grid-cols-[0.95fr_1.05fr] lg:gap-16">
              <Reveal>
                <SectionLabel index="04">Pilot access</SectionLabel>
                <h2 className="ld-display mt-6 text-[2rem] tracking-[-0.035em] text-[color:var(--ld-fg)] sm:text-[2.75rem]">
                  Stop checking nine apps.{' '}
                  <span className="text-[color:var(--ld-fg-dim)]">Foldera keeps track.</span>
                </h2>
                <p className="mt-5 max-w-xl text-lg leading-8 text-[color:var(--ld-fg-muted)]">
                  Foldera is not a dashboard. It watches consented signals, remembers your focus, and calculates the next state of your work.
                </p>
                <div className="mt-9 flex flex-col gap-2.5 sm:flex-row sm:items-center">
                  <AccessLink testId="landing-pilot-access-cta">Join pilot</AccessLink>
                  <GhostLink href="/demo" testId="landing-demo-link">View existing demo</GhostLink>
                </div>
              </Reveal>

              <motion.div
                className="divide-y divide-white/[0.07] border-y border-white/[0.07] lg:mt-2"
                variants={stagger}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true, margin: '-80px' }}
              >
                {pilotScope.map((item) => (
                  <motion.div key={item} variants={fadeUp} className="flex items-start gap-4 py-4">
                    <FileText className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--ld-accent)]" strokeWidth={1.75} aria-hidden="true" />
                    <p className="text-[15px] leading-7 text-[color:var(--ld-fg-muted)]">{item}</p>
                  </motion.div>
                ))}
              </motion.div>
            </div>
          </section>

          {/* FINAL CTA */}
          <section className={`${sectionWrap} py-24 lg:py-32`} data-testid="landing-final-cta">
            <Reveal className="mx-auto max-w-3xl text-center">
              <h2 className="ld-display text-[2.4rem] tracking-[-0.04em] text-[color:var(--ld-fg)] sm:text-[3.5rem]">
                Restore your continuity.
              </h2>
              <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-[color:var(--ld-fg-muted)]">
                Stop acting as the human integration layer. Let Foldera hold the context, so you can do the work.
              </p>
              <p className="ld-mono mx-auto mt-4 text-[12px] uppercase tracking-[0.16em] text-[color:var(--ld-accent)]">
                One trusted answer. All the context. Next move ready.
              </p>
              <div className="mt-9 flex flex-col items-center justify-center gap-2.5 sm:flex-row">
                <AccessLink testId="landing-final-access-cta">Get started</AccessLink>
                <GhostLink href={loginHref} testId="landing-final-login-cta">Sign in</GhostLink>
              </div>
            </Reveal>
          </section>

          {/* FOOTER */}
          <footer
            data-testid="landing-footer"
            className="border-t border-white/[0.07] px-5 py-14 sm:px-6 lg:px-8"
          >
            <div className="mx-auto grid w-full max-w-6xl gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
              <div>
                <a href="/" aria-label="Foldera" className="inline-flex items-center gap-2.5">
                  <FolderaMark size="sm" decorative />
                  <span className="text-[16px] font-semibold tracking-[-0.025em] text-[color:var(--ld-fg)]">Foldera</span>
                </a>
                <p className="ld-mono mt-4 max-w-xs text-[12px] uppercase leading-5 tracking-[0.14em] text-[color:var(--ld-fg-dim)]">
                  The Workday Presence Layer.
                </p>
              </div>
              <FooterCol
                title="Product"
                links={[
                  { href: '#how-foldera-works', label: 'How it works' },
                  { href: '/pricing', label: 'Pricing' },
                  { href: '/try', label: 'Try it' },
                  { href: '/demo', label: 'Demo' },
                ]}
              />
              <FooterCol
                title="Company"
                links={[
                  { href: '/about', label: 'About' },
                  { href: '/security', label: 'Security' },
                  { href: loginHref, label: 'Sign in' },
                  { href: accessHref, label: 'Start free' },
                ]}
              />
              <FooterCol
                title="Legal"
                links={[
                  { href: '/privacy', label: 'Privacy' },
                  { href: '/terms', label: 'Terms' },
                ]}
              />
            </div>
            <div className="mx-auto mt-12 flex w-full max-w-6xl flex-col gap-2 border-t border-white/[0.06] pt-6 text-[12px] text-[color:var(--ld-fg-dim)] sm:flex-row sm:items-center sm:justify-between">
              <span>© {new Date().getFullYear()} Foldera. All rights reserved.</span>
              <span className="ld-mono uppercase tracking-[0.14em]">Consent-first · No surveillance · Quiet by design</span>
            </div>
          </footer>
        </div>
      </main>
    </MotionConfig>
  );
}

function FooterCol({ title, links }: { title: string; links: Array<{ href: string; label: string }> }) {
  return (
    <div>
      <p className="ld-mono text-[11px] uppercase tracking-[0.2em] text-[color:var(--ld-fg-dim)]">{title}</p>
      <ul className="mt-4 space-y-2.5">
        {links.map((l) => (
          <li key={l.label}>
            <a href={l.href} className="text-[14px] text-[color:var(--ld-fg-muted)] transition-colors hover:text-[color:var(--ld-fg)]">
              {l.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
