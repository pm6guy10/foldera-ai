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
import type { ReactNode } from 'react';
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
      className={`inline-flex min-h-[46px] items-center justify-center gap-2 rounded-lg border border-cyan-300/35 bg-cyan-300 px-5 text-sm font-semibold text-slate-950 shadow-[0_0_24px_rgba(34,211,238,0.18)] transition-colors hover:bg-cyan-200 ${className}`}
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
      className="inline-flex min-h-[46px] items-center justify-center rounded-lg border border-white/12 bg-white/[0.035] px-5 text-sm font-semibold text-slate-100 transition-colors hover:border-white/22 hover:bg-white/[0.06]"
    >
      {children}
    </a>
  );
}

function RightNowCard() {
  return (
    <div
      data-testid="landing-right-now-card"
      className="relative overflow-hidden rounded-lg border border-cyan-300/20 bg-[#0b1118] p-5 shadow-[0_28px_90px_rgba(0,0,0,0.45)] sm:p-6"
    >
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="inline-flex items-center gap-2 text-[11px] font-bold uppercase text-cyan-200">
          <span className="h-2 w-2 rounded-full bg-cyan-300 shadow-[0_0_16px_rgba(34,211,238,0.75)]" />
          Right Now
        </div>
        <span className="rounded-md border border-white/10 px-2 py-1 text-xs text-slate-400">2 min ago</span>
      </div>

      <h2 className="text-2xl font-semibold tracking-[-0.02em] text-white sm:text-3xl">
        Review the Q2 headcount plan.
      </h2>
      <p className="mt-4 text-sm leading-6 text-slate-300 sm:text-base">
        Sarah updated the doc. Finance commented. You were mentioned in Slack. Approval now unlocks the budget timeline.
      </p>

      <div className="mt-5 grid gap-3 rounded-lg border border-white/10 bg-white/[0.035] p-4">
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
          { label: 'Done', Icon: Check, tone: 'bg-cyan-300 text-slate-950 border-cyan-300/40' },
          { label: 'Stuck', Icon: X, tone: 'bg-white/[0.035] text-slate-100 border-white/10' },
          { label: 'Break smaller', Icon: RefreshCw, tone: 'bg-white/[0.035] text-slate-100 border-white/10' },
          { label: 'Snooze', Icon: Pause, tone: 'bg-white/[0.035] text-slate-100 border-white/10' },
        ].map(({ label, Icon, tone }) => (
          <div key={label} className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border px-3 text-sm font-semibold ${tone}`}>
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
          </div>
        ))}
      </div>

      <p className="mt-5 border-t border-white/10 pt-4 text-center text-xs font-medium text-slate-500">
        State is attached. Context stays private.
      </p>
    </div>
  );
}

export function LandingPage({ isAuthenticated: _isAuthenticated = false }: LandingPageProps = {}) {
  return (
    <main className="min-h-[100dvh] overflow-x-hidden bg-[#05070a] text-white">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#05070a]/90 backdrop-blur-xl" data-testid="landing-header">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <a href="/" aria-label="Foldera" className="inline-flex min-h-[44px] items-center gap-3 rounded-lg px-1 focus-visible:ring-2 focus-visible:ring-cyan-300">
            <FolderaMark size="sm" decorative />
            <span className="text-base font-semibold tracking-[-0.025em]">Foldera</span>
          </a>

          <nav aria-label="Landing navigation" className="hidden items-center gap-6 text-sm text-slate-300 md:flex">
            <a href="#how-foldera-works" className="transition-colors hover:text-white">How it works</a>
            <a href="#trust" className="transition-colors hover:text-white">Trust</a>
            <a href="#pilot" className="transition-colors hover:text-white">Pilot</a>
          </nav>

          <div className="flex items-center gap-3">
            <a href={loginHref} data-testid="landing-login-cta" className="hidden text-sm font-medium text-slate-300 transition-colors hover:text-white sm:inline-flex">
              Login
            </a>
            <AccessLink testId="landing-header-cta" className="min-h-[40px] px-3 text-xs sm:px-4">
              Request access
            </AccessLink>
          </div>
        </div>
      </header>

      <section className="border-b border-white/10" data-testid="landing-hero">
        <div className="mx-auto grid min-h-[calc(100dvh-64px)] w-full max-w-7xl items-center gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(360px,480px)] lg:px-8 lg:py-14">
          <div>
            <p className="mb-5 inline-flex rounded-lg border border-white/10 bg-white/[0.035] px-3 py-1 text-xs font-semibold uppercase text-cyan-200">
              The Workday Presence Layer
            </p>
            <h1 className="max-w-3xl text-4xl font-semibold leading-[1.05] tracking-[-0.035em] text-white sm:text-5xl lg:text-6xl">
              Stop rebuilding the work.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
              Foldera restores continuity across fractured apps, messages, meetings, approvals, and decisions so you can stop rebuilding context just to do the work.
            </p>

            <div className="mt-7 flex flex-wrap gap-3 text-sm text-slate-400">
              <span className="rounded-lg border border-cyan-300/20 bg-cyan-300/8 px-3 py-2 text-cyan-100">Consent-first</span>
              <span className="rounded-lg border border-emerald-300/20 bg-emerald-300/8 px-3 py-2 text-emerald-100">No surveillance</span>
              <span className="rounded-lg border border-amber-300/20 bg-amber-300/8 px-3 py-2 text-amber-100">Quiet by design</span>
            </div>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <AccessLink testId="landing-primary-access-cta">Request access</AccessLink>
              <SecondaryLink href="#how-foldera-works">See how it works</SecondaryLink>
            </div>
          </div>

          <RightNowCard />
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20" data-testid="landing-pain">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase text-cyan-200">Context collapse</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">You are a high-paid filing clerk.</h2>
          <p className="mt-4 text-base leading-7 text-slate-300">
            You spend too much of your day rebuilding context across fractured apps just to do a few minutes of actual work.
          </p>
        </div>
        <div className="mt-9 grid gap-4 md:grid-cols-3">
          {painPoints.map((item) => (
            <article key={item.title} className="rounded-lg border border-white/10 bg-white/[0.035] p-5">
              <h3 className="text-xl font-semibold tracking-[-0.02em]">{item.title}</h3>
              <p className="mt-3 text-sm leading-6 text-slate-300">{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="how-foldera-works" className="border-y border-white/10 bg-white/[0.02]" data-testid="landing-doctrine">
        <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase text-cyan-200">How it works</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">
              The problem isn&apos;t lack of AI. The problem is broken continuity.
            </h2>
            <p className="mt-4 text-base leading-7 text-slate-300">
              Every app remembers its own slice. Microsoft remembers Microsoft. Google remembers Google. Foldera is the cross-system presence layer that remembers the state of your workday.
            </p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {doctrine.map((item) => (
              <article key={item.label} className="rounded-lg border border-white/10 bg-[#0b1118] p-5">
                <p className="text-xs font-bold uppercase text-cyan-200">{item.label}</p>
                <p className="mt-4 text-sm leading-6 text-slate-300">{item.body}</p>
              </article>
            ))}
          </div>

          <ol className="mt-10 grid gap-3" data-testid="landing-workflow">
            {howItWorks.map((step, index) => (
              <li key={step} className="flex gap-4 rounded-lg border border-white/10 bg-white/[0.03] p-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyan-300 text-sm font-bold text-slate-950">
                  {index + 1}
                </span>
                <span className="pt-1 text-sm leading-6 text-slate-300">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="trust" className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20" data-testid="landing-trust">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase text-cyan-200">Habitat</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">It lives where you work. And stays quiet otherwise.</h2>
          <p className="mt-4 text-base leading-7 text-slate-300">
            Foldera interrupts only when there is a clean moment to act, hands you the next move where you already are, and then disappears.
          </p>
        </div>
        <div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {trustItems.map(({ icon: Icon, title, body }) => (
            <article key={title} className="rounded-lg border border-white/10 bg-white/[0.035] p-5">
              <Icon className="h-5 w-5 text-cyan-200" aria-hidden="true" />
              <h3 className="mt-4 text-lg font-semibold">{title}</h3>
              <p className="mt-3 text-sm leading-6 text-slate-300">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="pilot" className="border-y border-white/10 bg-[#080c12]" data-testid="landing-pilot">
        <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8 lg:py-20">
          <div>
            <p className="text-sm font-semibold uppercase text-cyan-200">Pilot access</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">
              Stop checking nine apps. Foldera keeps track.
            </h2>
            <p className="mt-4 text-base leading-7 text-slate-300">
              Foldera is not a dashboard. It watches consented signals, remembers your focus, and calculates the next state of your work.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <AccessLink testId="landing-pilot-access-cta">Join pilot</AccessLink>
              <SecondaryLink href="/demo" testId="landing-demo-link">View existing demo</SecondaryLink>
            </div>
          </div>

          <div className="grid gap-3">
            {pilotScope.map((item) => (
              <div key={item} className="flex gap-3 rounded-lg border border-white/10 bg-white/[0.035] p-4">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" aria-hidden="true" />
                <p className="text-sm leading-6 text-slate-300">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20" data-testid="landing-final-cta">
        <div className="rounded-lg border border-cyan-300/20 bg-[#0b1118] p-7 text-center sm:p-10">
          <h2 className="text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">Restore your continuity.</h2>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-slate-300">
            Stop acting as the human integration layer. Let Foldera hold the context, so you can do the work.
          </p>
          <p className="mx-auto mt-3 max-w-2xl text-sm font-semibold text-cyan-100">
            One trusted answer. All the context. Next move ready.
          </p>
          <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <AccessLink testId="landing-final-access-cta">Get started</AccessLink>
            <SecondaryLink href={loginHref} testId="landing-final-login-cta">Login</SecondaryLink>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 px-4 py-8 text-sm text-slate-500" data-testid="landing-footer">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p>Foldera - Workday Presence Layer.</p>
          <div className="flex gap-4">
            <a href="/privacy" className="hover:text-slate-300">Privacy</a>
            <a href="/terms" className="hover:text-slate-300">Terms</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
