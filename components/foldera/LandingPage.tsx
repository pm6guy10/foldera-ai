'use client';

import { useState, type ReactNode } from 'react';
import Image from 'next/image';
import {
  Activity,
  ArrowRight,
  BellOff,
  Check,
  Clock3,
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
  { title: 'The reconstruction tax.', body: 'Every tool switch leaks context.' },
  { title: 'Every app, its own slice', body: 'Microsoft remembers Microsoft. Google, Google.' },
  { title: 'You are the glue', body: 'A person doing a system’s job.' },
];

const stats = [
  { n: '9.4', u: 'hrs', l: 'lost every week' },
  { n: '2.7', u: '×', l: 'slower to refocus' },
  { n: '31', u: '%', l: 'of work is rework' },
  { n: '$37', u: 'B+', l: 'a year, Fortune 500' },
];

const doctrine = [
  { label: 'State', icon: Layers, body: 'Where you left off.' },
  { label: 'Connectors', icon: Activity, body: 'Only what you consent to.' },
  { label: 'Triggers', icon: Zap, body: 'When it’s worth a nudge.' },
  { label: 'One move', icon: Sparkles, body: 'A single next step.' },
];

const howItWorks = [
  'Work scatters across your tools.',
  'Foldera holds the thread.',
  'One card when it matters.',
  'You click once — then quiet.',
];

const trustItems = [
  { icon: ShieldCheck, title: 'Consent first', body: 'You choose what connects.' },
  { icon: LockKeyhole, title: 'No surveillance', body: 'No screen-reading. Ever.' },
  { icon: BellOff, title: 'Quiet by design', body: 'Not another inbox to babysit.' },
  { icon: Clock3, title: 'Honest pilot', body: 'Staged access. No fake claims.' },
];

const enterprise = [
  { icon: ShieldCheck, t: 'Least privilege', s: 'scoped, revocable access' },
  { icon: LockKeyhole, t: 'Read-only', s: 'connectors by default' },
  { icon: Users, t: 'SSO / SCIM', s: 'SAML 2.0 ready' },
  { icon: ScrollText, t: 'Audit logs', s: 'every action receipted' },
  { icon: UserX, t: 'No training', s: 'on your data, ever' },
];

const evidenceRows: Array<{ brand: Brand; label: string; meta: string }> = [
  { brand: connectors[1], label: '#q2-planning — mentioned you', meta: '3 new' },
  { brand: connectors[0], label: 'Re: Headcount — Finance', meta: '2:14 PM' },
  { brand: connectors[4], label: 'Budget review · Today 4:00', meta: '' },
];

/* ----------------------------------------------------- small primitives */

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

          {/* CONNECTOR STRIP — just the logos, no chrome */}
          <section className="pt-12 pb-4" data-testid="landing-connectors">
            <div className={`${sectionWrap} flex flex-col items-center gap-7`}>
              <p className="ld-mono text-[10px] uppercase tracking-[0.3em] text-[color:var(--ld-fg-dim)]">
                Works where you already work
              </p>
              <div className="flex flex-wrap items-center justify-center gap-x-9 gap-y-6">
                {connectors.map((c) => (
                  <span
                    key={c.name}
                    title={c.name}
                    aria-label={c.name}
                    className="opacity-75 transition-opacity duration-300 hover:opacity-100"
                  >
                    <BrandLogo brand={c} size={26} />
                  </span>
                ))}
              </div>
            </div>
          </section>

          {/* STATS — big numerals, few words, no lines */}
          <section className={`${sectionWrap} py-28 lg:py-36`} data-testid="landing-stats">
            <motion.div
              className="grid grid-cols-2 gap-x-8 gap-y-16 lg:grid-cols-4"
              variants={stagger}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: '-80px' }}
            >
              {stats.map((s) => (
                <motion.div key={s.n} variants={fadeUp}>
                  <div className="ld-display flex items-baseline text-[color:var(--ld-fg)]">
                    <span className="text-[3.25rem] leading-none sm:text-[4.25rem]">{s.n}</span>
                    <span className="ml-1 text-[1.6rem] text-[color:var(--ld-accent)] sm:text-[2rem]">{s.u}</span>
                  </div>
                  <p className="mt-3 text-[14px] uppercase tracking-[0.06em] text-[color:var(--ld-fg-dim)]">{s.l}</p>
                </motion.div>
              ))}
            </motion.div>
          </section>

          {/* PAIN — one big line, three quiet beats */}
          <section className={`${sectionWrap} py-28 lg:py-36`} data-testid="landing-pain">
            <Reveal>
              <h2 className="ld-display max-w-4xl text-[clamp(2.4rem,1.6rem+3.2vw,4rem)] leading-[1.02] tracking-[-0.04em] text-[color:var(--ld-fg)]">
                You are a high-paid <span className="text-[color:var(--ld-accent)]">filing clerk.</span>
              </h2>
            </Reveal>
            <motion.div
              className="mt-20 grid gap-x-12 gap-y-12 sm:grid-cols-3"
              variants={stagger}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: '-80px' }}
            >
              {painPoints.map((item, i) => (
                <motion.div key={item.title} variants={fadeUp}>
                  <span className="ld-mono text-[12px] text-[color:var(--ld-accent)]">{String(i + 1).padStart(2, '0')}</span>
                  <h3 className="ld-display mt-4 text-[1.35rem] tracking-[-0.02em] text-[color:var(--ld-fg)]">{item.title}</h3>
                  <p className="mt-2 text-[15px] leading-6 text-[color:var(--ld-fg-dim)]">{item.body}</p>
                </motion.div>
              ))}
            </motion.div>
          </section>

          {/* DOCTRINE / HOW IT WORKS — open concept, soft seam, no boxes */}
          <section
            id="how-foldera-works"
            className="relative"
            data-testid="landing-doctrine"
            style={{ background: 'radial-gradient(80% 60% at 50% 0%, rgba(245,166,35,0.05), transparent 70%)' }}
          >
            <div className={`${sectionWrap} py-28 lg:py-36`}>
              <Reveal className="mx-auto max-w-3xl text-center">
                <h2 className="ld-display text-[clamp(2rem,1.4rem+2.4vw,3.25rem)] leading-[1.05] tracking-[-0.035em] text-[color:var(--ld-fg)]">
                  Not a lack of AI.{' '}
                  <span className="text-[color:var(--ld-fg-dim)]">A lack of continuity.</span>
                </h2>
                <p className="sr-only">The problem is broken continuity.</p>
              </Reveal>

              <motion.div
                className="mx-auto mt-20 grid max-w-5xl gap-x-10 gap-y-14 sm:grid-cols-2 lg:grid-cols-4"
                variants={stagger}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true, margin: '-80px' }}
              >
                {doctrine.map(({ label, icon: Icon, body }) => (
                  <motion.div key={label} variants={fadeUp} className="flex flex-col items-center text-center">
                    <span className="ld-accent-soft flex h-14 w-14 items-center justify-center rounded-2xl">
                      <Icon className="h-6 w-6" strokeWidth={1.5} aria-hidden="true" />
                    </span>
                    <p className="ld-display mt-5 text-[1.1rem] tracking-[-0.01em] text-[color:var(--ld-fg)]">{label}</p>
                    <p className="mt-1.5 text-[14px] text-[color:var(--ld-fg-dim)]">{body}</p>
                  </motion.div>
                ))}
              </motion.div>

              <motion.ol
                className="mx-auto mt-24 flex max-w-4xl flex-col gap-y-8 sm:flex-row sm:items-start sm:justify-between sm:gap-x-6"
                data-testid="landing-workflow"
                variants={stagger}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true, margin: '-80px' }}
              >
                {howItWorks.map((step, index) => (
                  <motion.li key={step} variants={fadeUp} className="flex items-start gap-3 sm:flex-1 sm:flex-col sm:items-center sm:text-center">
                    <span className="ld-mono text-[20px] leading-none text-[color:var(--ld-accent)]">{String(index + 1).padStart(2, '0')}</span>
                    <span className="text-[15px] leading-6 text-[color:var(--ld-fg-soft)]">{step}</span>
                  </motion.li>
                ))}
              </motion.ol>
            </div>
          </section>

          {/* TRUST — icon-led, no card boxes */}
          <section id="trust" className={`${sectionWrap} py-28 lg:py-36`} data-testid="landing-trust">
            <Reveal>
              <h2 className="ld-display max-w-3xl text-[clamp(2rem,1.4rem+2.4vw,3.25rem)] leading-[1.05] tracking-[-0.035em] text-[color:var(--ld-fg)]">
                It lives where you work.{' '}
                <span className="text-[color:var(--ld-fg-dim)]">And stays quiet.</span>
              </h2>
            </Reveal>
            <motion.div
              className="mt-20 grid gap-x-12 gap-y-14 sm:grid-cols-2 lg:grid-cols-4"
              variants={stagger}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: '-80px' }}
            >
              {trustItems.map(({ icon: Icon, title, body }) => (
                <motion.div key={title} variants={fadeUp}>
                  <Icon className="h-7 w-7 text-[color:var(--ld-accent)]" strokeWidth={1.5} aria-hidden="true" />
                  <h3 className="ld-display mt-5 text-[1.15rem] tracking-[-0.01em] text-[color:var(--ld-fg)]">{title}</h3>
                  <p className="mt-1.5 text-[15px] leading-6 text-[color:var(--ld-fg-dim)]">{body}</p>
                </motion.div>
              ))}
            </motion.div>
          </section>

          {/* ENTERPRISE STRIP — quiet single row */}
          <section data-testid="landing-enterprise">
            <div className={`${sectionWrap} flex flex-wrap items-center justify-center gap-x-10 gap-y-5 pb-8`}>
              {enterprise.map(({ icon: Icon, t }) => (
                <span key={t} className="inline-flex items-center gap-2.5 text-[13px] text-[color:var(--ld-fg-muted)]">
                  <Icon className="h-4 w-4 text-[color:var(--ld-accent)]" strokeWidth={1.75} aria-hidden="true" />
                  {t}
                </span>
              ))}
            </div>
          </section>

          {/* PILOT — product-led, minimal words */}
          <section className={`${sectionWrap} py-28 lg:py-36`} data-testid="landing-pilot">
            <Reveal className="mx-auto max-w-3xl text-center">
              <h2 className="ld-display text-[clamp(2rem,1.4rem+2.4vw,3.25rem)] leading-[1.04] tracking-[-0.035em] text-[color:var(--ld-fg)]">
                Stop checking nine apps.
              </h2>
              <p className="mx-auto mt-5 max-w-lg text-lg leading-8 text-[color:var(--ld-fg-muted)]">
                Foldera keeps track, and shows you the one thing that matters.
              </p>
              <div className="mt-9 flex flex-col items-center justify-center gap-2.5 sm:flex-row">
                <AccessLink testId="landing-pilot-access-cta">Join pilot</AccessLink>
                <GhostLink href="/demo" testId="landing-demo-link">See the demo</GhostLink>
              </div>
            </Reveal>
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
