import {
  ArrowRight,
  BellOff,
  Check,
  Clock3,
  FileText,
  LockKeyhole,
  MessageSquare,
  Pause,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { FolderaMark } from '@/components/nav/FolderaMark';

type LandingPageProps = {
  isAuthenticated?: boolean;
};

const accessHref = '/start';
const loginHref = '/login';

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

/* ---- shared premium surfaces (depth instead of flat) ---- */
const cardStyle: CSSProperties = {
  backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.045), rgba(255,255,255,0.012))',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
};
const cardClass =
  'rounded-xl border border-white/[0.08] transition duration-200 hover:border-cyan-300/30 hover:shadow-[0_24px_60px_-30px_rgba(34,211,238,0.45)]';

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-cyan-300">{children}</p>
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
      className={`inline-flex min-h-[46px] items-center justify-center gap-2 rounded-lg border border-cyan-300/35 bg-cyan-300 px-5 text-sm font-semibold text-slate-950 shadow-[0_0_30px_rgba(34,211,238,0.28)] transition hover:-translate-y-px hover:bg-cyan-200 hover:shadow-[0_8px_36px_-8px_rgba(34,211,238,0.6)] ${className}`}
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
      className="inline-flex min-h-[46px] items-center justify-center rounded-lg border border-white/14 bg-white/[0.03] px-5 text-sm font-semibold text-slate-100 transition-colors hover:border-white/28 hover:bg-white/[0.07]"
    >
      {children}
    </a>
  );
}

function RightNowCard() {
  return (
    <div
      data-testid="landing-right-now-card"
      className="relative overflow-hidden rounded-2xl border border-cyan-300/25 p-5 sm:p-6"
      style={{
        backgroundImage:
          'radial-gradient(120% 80% at 80% 0%, rgba(34,211,238,0.12), transparent 55%), linear-gradient(180deg, #0d1622 0%, #080c12 100%)',
        boxShadow:
          '0 30px 90px -28px rgba(0,0,0,0.85), 0 0 0 1px rgba(34,211,238,0.06), 0 0 70px -22px rgba(34,211,238,0.35)',
      }}
    >
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="inline-flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-[0.2em] text-cyan-200">
          <span className="h-2 w-2 rounded-full bg-cyan-300 shadow-[0_0_16px_rgba(34,211,238,0.85)]" />
          Right Now
        </div>
        <span className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-slate-400">
          2 min ago
        </span>
      </div>

      <div className="mb-5 flex items-center gap-2" aria-label="Consented connectors">
        {connectors.map((c) => (
          <span
            key={c.name}
            title={c.name}
            aria-label={c.name}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-[#0b121c]"
          >
            {c.el}
          </span>
        ))}
      </div>

      <h2 className="text-2xl font-semibold tracking-[-0.025em] text-white sm:text-[28px]">
        Review the Q2 headcount plan.
      </h2>
      <p className="mt-3 text-sm leading-6 text-slate-300 sm:text-base">
        Sarah updated the doc. Finance commented. You were mentioned in Slack. Approval now unlocks the budget timeline.
      </p>

      <div className="mt-5 grid gap-3 rounded-xl border border-white/10 bg-white/[0.025] p-4">
        <div className="flex items-start gap-3">
          <MessageSquare className="mt-0.5 h-4 w-4 text-cyan-200" aria-hidden="true" />
          <p className="text-sm text-slate-300">Mention and finance comment are attached.</p>
        </div>
        <div className="flex items-start gap-3">
          <FileText className="mt-0.5 h-4 w-4 text-amber-200" aria-hidden="true" />
          <p className="text-sm text-slate-300">The current plan is ready to review.</p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3" aria-label="Example Right Now actions">
        {[
          { label: 'Done', Icon: Check, tone: 'bg-cyan-300 text-slate-950 border-cyan-300/40 shadow-[0_0_24px_-6px_rgba(34,211,238,0.6)]' },
          { label: 'Stuck', Icon: X, tone: 'bg-white/[0.04] text-slate-100 border-white/12' },
          { label: 'Break smaller', Icon: RefreshCw, tone: 'bg-white/[0.04] text-slate-100 border-white/12' },
          { label: 'Snooze', Icon: Pause, tone: 'bg-white/[0.04] text-slate-100 border-white/12' },
        ].map(({ label, Icon, tone }) => (
          <div key={label} className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border px-3 text-sm font-semibold ${tone}`}>
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
          </div>
        ))}
      </div>

      <p className="mt-5 border-t border-white/10 pt-4 text-center font-mono text-[11px] uppercase tracking-wider text-slate-500">
        State is attached. Context stays private.
      </p>
    </div>
  );
}

export function LandingPage({ isAuthenticated: _isAuthenticated = false }: LandingPageProps = {}) {
  return (
    <main className="relative min-h-[100dvh] overflow-x-hidden bg-[#05070a] text-white">
      {/* atmosphere — cyan aurora, never a flat canvas */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[820px]"
        style={{
          background:
            'radial-gradient(60% 50% at 82% -5%, rgba(34,211,238,0.14), transparent 60%), radial-gradient(45% 40% at 100% 20%, rgba(14,116,144,0.16), transparent 55%)',
        }}
      />

      <header
        className="sticky top-0 z-[60] border-b border-white/[0.06] bg-[#03060bd9] pt-[env(safe-area-inset-top,0px)] backdrop-blur-xl"
        data-testid="landing-header"
      >
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-5 px-4 sm:px-6 lg:px-8">
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
            className="hidden items-center gap-7 text-[13px] font-medium text-slate-400 md:flex"
          >
            <a href="#how-foldera-works" className="transition-colors hover:text-white">How it works</a>
            <a href="/security" className="transition-colors hover:text-white">Security</a>
            <a href="/pricing" className="transition-colors hover:text-white">Pricing</a>
            <a href="/try" className="transition-colors hover:text-white">Try it</a>
          </nav>

          <div className="flex items-center gap-3">
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
              className="inline-flex min-h-[40px] items-center gap-2 rounded-[9px] border border-cyan-300/25 bg-cyan-300 px-4 text-[12px] font-semibold text-slate-950 shadow-[0_0_22px_rgba(34,211,238,0.22)] transition hover:bg-cyan-200"
            >
              Request access
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>
        </div>
      </header>

      <section className="relative z-10 border-b border-white/10" data-testid="landing-hero">
        <div className="mx-auto grid min-h-[calc(100dvh-64px)] w-full max-w-7xl items-center gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(360px,480px)] lg:px-8 lg:py-14">
          <div>
            <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-300/[0.06] px-3 py-1 font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-cyan-200">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.8)]" />
              The Workday Presence Layer
            </p>
            <h1 className="max-w-3xl text-[2.75rem] font-semibold leading-[1.02] tracking-[-0.04em] text-white sm:text-6xl lg:text-[4.25rem]">
              Stop rebuilding the work.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300/90">
              Foldera restores continuity across fractured apps, messages, meetings, approvals, and decisions so you can stop rebuilding context just to do the work.
            </p>

            <div className="mt-7 flex flex-wrap gap-2.5 text-sm">
              <span className="rounded-lg border border-cyan-300/20 bg-cyan-300/[0.07] px-3 py-2 text-cyan-100">Consent-first</span>
              <span className="rounded-lg border border-emerald-300/20 bg-emerald-300/[0.07] px-3 py-2 text-emerald-100">No surveillance</span>
              <span className="rounded-lg border border-amber-300/20 bg-amber-300/[0.07] px-3 py-2 text-amber-100">Quiet by design</span>
            </div>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <AccessLink testId="landing-primary-access-cta">Request access</AccessLink>
              <SecondaryLink href="#how-foldera-works">See how it works</SecondaryLink>
            </div>
          </div>

          <RightNowCard />
        </div>
      </section>

      <section className="relative z-10 mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24" data-testid="landing-pain">
        <div className="max-w-3xl">
          <Eyebrow>Context collapse</Eyebrow>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] sm:text-[2.5rem]">You are a high-paid filing clerk.</h2>
          <p className="mt-4 text-base leading-7 text-slate-300/90">
            You spend too much of your day rebuilding context across fractured apps just to do a few minutes of actual work.
          </p>
        </div>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {painPoints.map((item) => (
            <article key={item.title} className={`${cardClass} p-6`} style={cardStyle}>
              <h3 className="text-lg font-semibold tracking-[-0.02em] text-white">{item.title}</h3>
              <p className="mt-3 text-sm leading-6 text-slate-300/90">{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="how-foldera-works" className="relative z-10 border-y border-white/10 bg-white/[0.015]" data-testid="landing-doctrine">
        <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <div className="max-w-3xl">
            <Eyebrow>How it works</Eyebrow>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] sm:text-[2.5rem]">
              The problem isn&apos;t lack of AI. The problem is broken continuity.
            </h2>
            <p className="mt-4 text-base leading-7 text-slate-300/90">
              Every app remembers its own slice. Microsoft remembers Microsoft. Google remembers Google. Foldera is the cross-system presence layer that remembers the state of your workday.
            </p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {doctrine.map((item) => (
              <article key={item.label} className={`${cardClass} p-6`} style={cardStyle}>
                <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-300">{item.label}</p>
                <p className="mt-4 text-sm leading-6 text-slate-300/90">{item.body}</p>
              </article>
            ))}
          </div>

          <ol className="mt-10 grid gap-3" data-testid="landing-workflow">
            {howItWorks.map((step, index) => (
              <li key={step} className="flex gap-4 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyan-300 text-sm font-bold text-slate-950 shadow-[0_0_18px_-4px_rgba(34,211,238,0.7)]">
                  {index + 1}
                </span>
                <span className="pt-1 text-sm leading-6 text-slate-300/90">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="trust" className="relative z-10 mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24" data-testid="landing-trust">
        <div className="max-w-3xl">
          <Eyebrow>Habitat</Eyebrow>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] sm:text-[2.5rem]">It lives where you work. And stays quiet otherwise.</h2>
          <p className="mt-4 text-base leading-7 text-slate-300/90">
            Foldera interrupts only when there is a clean moment to act, hands you the next move where you already are, and then disappears.
          </p>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {trustItems.map(({ icon: Icon, title, body }) => (
            <article key={title} className={`${cardClass} p-6`} style={cardStyle}>
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-cyan-300/20 bg-cyan-300/[0.06]">
                <Icon className="h-5 w-5 text-cyan-200" aria-hidden="true" />
              </span>
              <h3 className="mt-4 text-lg font-semibold text-white">{title}</h3>
              <p className="mt-3 text-sm leading-6 text-slate-300/90">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="pilot" className="relative z-10 border-y border-white/10 bg-[#070b11]" data-testid="landing-pilot">
        <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8 lg:py-24">
          <div>
            <Eyebrow>Pilot access</Eyebrow>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] sm:text-[2.5rem]">
              Stop checking nine apps. Foldera keeps track.
            </h2>
            <p className="mt-4 text-base leading-7 text-slate-300/90">
              Foldera is not a dashboard. It watches consented signals, remembers your focus, and calculates the next state of your work.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <AccessLink testId="landing-pilot-access-cta">Join pilot</AccessLink>
              <SecondaryLink href="/demo" testId="landing-demo-link">View existing demo</SecondaryLink>
            </div>
          </div>

          <div className="grid gap-3">
            {pilotScope.map((item) => (
              <div key={item} className="flex gap-3 rounded-xl border border-white/[0.08] bg-white/[0.025] p-4">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" aria-hidden="true" />
                <p className="text-sm leading-6 text-slate-300/90">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative z-10 mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24" data-testid="landing-final-cta">
        <div
          className="relative overflow-hidden rounded-2xl border border-cyan-300/25 p-8 text-center sm:p-12"
          style={{
            backgroundImage:
              'radial-gradient(80% 120% at 50% -10%, rgba(34,211,238,0.12), transparent 60%), linear-gradient(180deg, #0c1521, #080c12)',
            boxShadow: '0 30px 90px -34px rgba(0,0,0,0.8), 0 0 70px -26px rgba(34,211,238,0.3)',
          }}
        >
          <h2 className="text-3xl font-semibold tracking-[-0.03em] sm:text-[2.75rem]">Restore your continuity.</h2>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-slate-300/90">
            Stop acting as the human integration layer. Let Foldera hold the context, so you can do the work.
          </p>
          <p className="mx-auto mt-3 max-w-2xl text-sm font-semibold text-cyan-100">
            One trusted answer. All the context. Next move ready.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <AccessLink testId="landing-final-access-cta">Get started</AccessLink>
            <SecondaryLink href={loginHref} testId="landing-final-login-cta">Login</SecondaryLink>
          </div>
        </div>
      </section>

      <footer className="relative z-10 border-t border-white/10 px-4 py-8 text-sm text-slate-500" data-testid="landing-footer">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p>Foldera - Workday Presence Layer.</p>
          <div className="flex flex-wrap gap-4">
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
