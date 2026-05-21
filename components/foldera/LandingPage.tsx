'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ArrowRight,
  Bell,
  CalendarDays,
  Check,
  CheckCircle2,
  FileText,
  LockKeyhole,
  Mail,
  MessageSquare,
  Minus,
  Orbit,
  ShieldCheck,
  Sparkles,
  UserRound,
} from 'lucide-react';
import { FolderaLogo } from '@/components/foldera/FolderaLogo';

const heroPromise = 'Stop rebuilding the work. Foldera hands it back ready.';
const primaryCta = 'See Foldera in action';
const secondaryCta = 'Join the pilot';
const contextProof = 'Context attached: message + meeting + file + blocker';

const headerLinks = [
  { label: 'Platform', href: '#platform' },
  { label: 'How it works', href: '#how-it-works' },
  { label: 'Integrations', href: '#integrations' },
  { label: 'Security', href: '/security' },
  { label: 'Resources', href: '/blog' },
];

const footerLinks = [
  { label: 'Platform', href: '#platform' },
  { label: 'How it works', href: '#how-it-works' },
  { label: 'Security', href: '/security' },
  { label: 'About', href: '/about' },
  { label: 'Status', href: '/status' },
  { label: 'Resources', href: '/blog' },
];

const sourceTiles = ['Slack', 'Gmail', 'Calendar', 'Figma', 'Notion', '+2'];
const signalList = ['Email', 'Slack / Teams', 'Calendar', 'Docs & files', 'Actions', 'Notes'];
const manualWay = ['Check every app', 'Rebuild context', 'Guess timing', 'Carry it in your head', 'Miss what matters'];
const folderaWay = ['Reconnects the context', 'Assembles the next move', 'Surfaces the clean moment', 'Waits for approval', 'Keeps you in control'];

const trustItems = [
  { title: 'Approval-first', body: 'Nothing is sent without your approval.', icon: ShieldCheck },
  { title: 'You’re in control', body: 'Approve, edit, snooze, or send.', icon: UserRound },
  { title: 'Quiet by design', body: 'We show up only when the moment matters.', icon: Bell },
  { title: 'Built on consent', body: 'Connected from signals you choose.', icon: LockKeyhole },
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
    <div className="relative min-h-screen overflow-x-hidden bg-[#02050d] text-white">
      <GalaxyField />
      <LandingHeader isAuthenticated={isAuthenticated} scrolled={scrolled} />

      <main id="main" className="relative z-10">
        <section id="platform" className="relative px-4 pb-16 pt-24 sm:px-6 sm:pt-32 lg:px-8 xl:pb-24">
          <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[minmax(0,0.92fr)_minmax(520px,0.98fr)] lg:items-center">
            <div className="relative z-20 max-w-2xl">
              <p className="inline-flex items-center gap-2 rounded-full border border-cyan-200/15 bg-white/[0.045] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur">
                <Sparkles className="h-3.5 w-3.5 text-cyan-300" aria-hidden />
                <span className="bg-gradient-to-r from-fuchsia-300 via-violet-300 to-cyan-300 bg-clip-text text-transparent">
                  Connected context
                </span>
                <span aria-hidden>→</span>
                ready next move
              </p>

              <h1
                data-testid="landing-hero-heading"
                aria-label={heroPromise}
                className="mt-6 max-w-[12ch] text-[4rem] font-semibold leading-[0.88] tracking-[-0.09em] text-white drop-shadow-[0_0_34px_rgba(14,165,233,0.18)] sm:text-[5.7rem] lg:text-[6rem] xl:text-[6.8rem]"
              >
                Stop rebuilding
                <span className="block">the work.</span>
                <span className="mt-2 block text-[0.72em] leading-[0.93] tracking-[-0.075em] text-slate-100">
                  Foldera hands it back{' '}
                  <span className="bg-gradient-to-r from-fuchsia-300 via-violet-300 to-cyan-200 bg-clip-text text-transparent">
                    ready.
                  </span>
                </span>
              </h1>

              <p className="mt-7 max-w-xl text-[18px] leading-8 text-slate-300 sm:text-[20px] sm:leading-9">
                Foldera connects the message, meeting, draft, file, and blocker—then gives you
                the next move already assembled, so you can approve, edit, snooze, or send.
              </p>

              <div className="mt-9 flex flex-col gap-4 sm:flex-row sm:gap-3">
                <CtaButton href="/demo" variant="primary">{primaryCta}</CtaButton>
                <CtaButton href="/start" variant="secondary">{secondaryCta}</CtaButton>
              </div>

              <div className="mt-8 hidden max-w-2xl gap-3 text-sm text-slate-300 sm:grid sm:grid-cols-3">
                {['One finished next move', 'Nothing sends without you', 'Signals you choose'].map((item) => (
                  <div key={item} className="flex items-start gap-2.5">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" aria-hidden />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <HeroScene />
          </div>
        </section>

        <section id="how-it-works" className="px-4 py-10 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl rounded-[28px] border border-cyan-200/15 bg-[#07101d]/72 p-5 shadow-[0_0_60px_rgba(14,165,233,0.10)] backdrop-blur sm:p-8 lg:p-10">
            <div className="grid gap-8 lg:grid-cols-[0.74fr_1fr] lg:items-center">
              <div>
                <h2 className="text-[34px] font-semibold leading-tight tracking-[-0.055em] text-white sm:text-[44px]">Work breaks your thread.</h2>
                <p className="mt-4 max-w-xl text-[17px] leading-8 text-slate-300">
                  Work lives in messages, meetings, docs, and notes. Every time you switch, you rebuild context. The next move gets lost—or stays buried.
                </p>
              </div>
              <ThreadMap />
            </div>
          </div>
        </section>

        <section id="integrations" className="px-4 py-10 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl rounded-[28px] border border-white/10 bg-[#050b16]/80 p-5 backdrop-blur sm:p-8 lg:p-10">
            <div className="grid gap-8 lg:grid-cols-[0.62fr_1fr] lg:items-center">
              <div>
                <h2 className="text-[34px] font-semibold leading-tight tracking-[-0.055em] text-white sm:text-[44px]">Foldera rebuilds the thread.</h2>
                <p className="mt-4 max-w-xl text-[17px] leading-8 text-slate-300">
                  Foldera reconnects scattered context and hands you the next move—already assembled, with context attached.
                </p>
              </div>
              <div className="grid gap-4 lg:grid-cols-[0.92fr_auto_1fr_auto_1fr] lg:items-center">
                <FlowCard title="Signals">
                  <div className="mt-4 grid gap-2 text-sm text-slate-300">
                    {signalList.map((item) => (
                      <div key={item} className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-cyan-300" />{item}</div>
                    ))}
                  </div>
                </FlowCard>
                <ArrowNode />
                <FlowCard title="Foldera" featured>
                  <FolderaLogo href="/" />
                  <p className="mt-5 text-[17px] leading-7 text-white">Rebuilds context + assembles the ready next move</p>
                </FlowCard>
                <ArrowNode />
                <FlowCard title="One ready next move">
                  <p className="mt-4 text-sm leading-7 text-slate-300">Review the assembled next move with full context attached.</p>
                  <p className="mt-4 text-sm font-semibold text-emerald-200">Approve, edit, snooze, or send.</p>
                </FlowCard>
              </div>
            </div>
          </div>
        </section>

        <section className="px-4 py-10 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <h2 className="text-center text-[34px] font-semibold tracking-[-0.055em] text-white sm:text-[44px]">It is not more work to manage.</h2>
            <div className="mt-8 grid gap-5 lg:grid-cols-[1fr_auto_1fr] lg:items-stretch">
              <ComparisonCard title="Manual way" items={manualWay} tone="manual" />
              <div className="flex items-center justify-center"><span className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-cyan-200/20 bg-[#081326] text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100 shadow-[0_0_36px_rgba(59,130,246,0.35)]">vs</span></div>
              <ComparisonCard title="Foldera way" items={folderaWay} tone="foldera" />
            </div>
          </div>
        </section>

        <section id="security" className="px-4 py-10 sm:px-6 lg:px-8">
          <div data-testid="landing-trust-line" className="mx-auto grid max-w-7xl gap-4 rounded-[28px] border border-white/10 bg-[#050b16]/80 p-5 backdrop-blur sm:grid-cols-2 sm:p-7 lg:grid-cols-4">
            {trustItems.map((item) => (
              <article key={item.title} className="flex gap-4 border-white/10 py-2 lg:border-r lg:last:border-r-0 lg:pr-5">
                <item.icon className="mt-1 h-8 w-8 shrink-0 text-fuchsia-300" aria-hidden />
                <div><h3 className="text-[17px] font-semibold text-white">{item.title}</h3><p className="mt-1 text-sm leading-6 text-slate-300">{item.body}</p></div>
              </article>
            ))}
          </div>
        </section>

        <section className="px-4 pb-14 pt-6 sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-7xl gap-6 overflow-hidden rounded-[28px] border border-fuchsia-300/25 bg-[radial-gradient(circle_at_8%_50%,rgba(217,70,239,0.22),transparent_18%),radial-gradient(circle_at_82%_50%,rgba(14,165,233,0.18),transparent_28%),linear-gradient(135deg,rgba(8,13,28,0.94),rgba(3,7,17,0.94))] px-6 py-8 sm:px-10 lg:grid-cols-[1fr_auto] lg:items-center lg:py-9">
            <div><h2 className="text-[34px] font-semibold leading-tight tracking-[-0.055em] text-white sm:text-[44px]">One next move. When it matters.</h2><p className="mt-3 max-w-2xl text-[17px] leading-7 text-slate-300">Foldera reconnects your context and hands back the ready move—so you can keep moving forward.</p></div>
            <div className="flex flex-col gap-3 sm:flex-row"><CtaButton href="/demo" variant="primary">{primaryCta}</CtaButton><CtaButton href="/start" variant="secondary">{secondaryCta}</CtaButton></div>
          </div>
        </section>

        <footer className="border-t border-white/10 px-4 pb-10 pt-8 sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-7xl flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <FolderaLogo href="/" />
            <div className="flex flex-wrap gap-x-5 gap-y-3 text-sm text-slate-300/80">
              {footerLinks.map((item) => <a key={item.label} href={item.href} className="transition-colors hover:text-white">{item.label}</a>)}
            </div>
            <p className="text-sm text-slate-400">One thread. Across apps. Across time. Always yours.</p>
          </div>
        </footer>
      </main>
    </div>
  );
}

function LandingHeader({ isAuthenticated, scrolled }: { isAuthenticated: boolean; scrolled: boolean }) {
  return (
    <nav aria-label="Public navigation" className={`fixed inset-x-0 top-0 z-[60] border-b pt-[env(safe-area-inset-top,0px)] transition-colors ${scrolled ? 'border-cyan-200/10 bg-[#02050de8] shadow-[0_1px_0_rgba(34,211,238,0.12)] backdrop-blur-xl' : 'border-white/[0.04] bg-[#02050dc4] backdrop-blur-md'}`}>
      <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between gap-5 px-4 py-3 sm:px-6 lg:px-8">
        <FolderaLogo href="/" />
        <div className="hidden items-center gap-8 lg:flex">{headerLinks.map((link) => <a key={link.label} href={link.href} className="text-[13px] font-medium text-slate-300 transition-colors hover:text-white">{link.label}</a>)}</div>
        <div className="flex items-center gap-3">
          {isAuthenticated ? <a href="/dashboard" className="hidden text-[13px] font-medium text-slate-300 transition-colors hover:text-white sm:inline-flex">Dashboard</a> : <a href="/login" className="hidden text-[13px] font-medium text-slate-300 transition-colors hover:text-white sm:inline-flex">Sign in</a>}
          <a className="inline-flex min-h-[42px] items-center justify-center rounded-[10px] bg-gradient-to-r from-violet-600 to-cyan-500 px-4 text-[13px] font-semibold text-white shadow-[0_0_26px_rgba(14,165,233,0.28)] transition hover:brightness-110" href="/start">{secondaryCta}</a>
        </div>
      </div>
    </nav>
  );
}

function CtaButton({ href, variant, children }: { href: string; variant: 'primary' | 'secondary'; children: ReactNode }) {
  const className = variant === 'primary'
    ? 'bg-gradient-to-r from-violet-600 via-fuchsia-600 to-cyan-500 text-white shadow-[0_0_42px_rgba(14,165,233,0.38)]'
    : 'border border-white/20 bg-white/[0.045] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]';
  return <a href={href} className={`inline-flex min-h-[56px] items-center justify-center rounded-[14px] px-6 text-[15px] font-semibold transition hover:brightness-110 ${className}`}>{children}</a>;
}

function HeroScene() {
  return (
    <div className="relative -mt-5 min-h-[690px] sm:mt-0 lg:min-h-[645px]">
      <div className="absolute -right-16 top-[-72px] h-[560px] w-[430px] rounded-full bg-[radial-gradient(circle_at_56%_72%,rgba(245,158,11,0.36),transparent_17%),radial-gradient(circle_at_50%_36%,rgba(14,165,233,0.27),transparent_24%),linear-gradient(180deg,rgba(8,15,31,0.02),rgba(8,15,31,0.76))] opacity-95 blur-[1px]" />
      <div className="absolute right-[-42px] top-[70px] h-[420px] w-[420px] rounded-full border border-cyan-200/10 bg-[radial-gradient(circle_at_50%_46%,rgba(217,70,239,0.18),transparent_34%)]" />
      <div className="absolute bottom-0 right-[-70px] h-40 w-[640px] rounded-[50%] bg-[radial-gradient(ellipse_at_center,rgba(249,115,22,0.25),transparent_68%)] blur-2xl" />
      <div className="relative z-10 grid gap-5 sm:grid-cols-[minmax(0,1fr)_210px] sm:items-end">
        <MascotLantern mobile />
        <RightNowCard />
        <MascotLantern />
      </div>
    </div>
  );
}

function RightNowCard() {
  return (
    <article data-testid="landing-proof-card" className="relative overflow-hidden rounded-[32px] border border-cyan-200/40 bg-[#050b16]/92 p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.05),0_0_90px_rgba(14,165,233,0.28),0_0_130px_rgba(168,85,247,0.22)] backdrop-blur-xl sm:p-6 lg:mt-24">
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_4%_0%,rgba(14,165,233,0.22),transparent_34%),radial-gradient(circle_at_100%_98%,rgba(245,158,11,0.18),transparent_38%),linear-gradient(135deg,rgba(255,255,255,0.08),transparent_28%)]" />
      <div className="relative">
        <div className="flex items-start justify-between gap-5">
          <h2 className="text-[18px] font-semibold tracking-[-0.03em] text-white">RIGHT NOW</h2>
          <div className="flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-300">WINDOW OPEN<span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_18px_rgba(52,211,153,0.8)]" /></div>
        </div>
        <div className="mt-7 grid gap-4 sm:grid-cols-[58px_1fr] sm:gap-5">
          <div className="flex h-14 w-14 items-center justify-center rounded-[18px] border border-cyan-300/25 bg-cyan-300/10 text-cyan-200 shadow-[0_0_34px_rgba(14,165,233,0.25)]"><ArrowRight className="-rotate-45 h-8 w-8" aria-hidden /></div>
          <p className="text-[25px] leading-snug tracking-[-0.04em] text-white">Reply to Alex Morgan before the design review.</p>
        </div>
        <div className="mt-5 inline-flex max-w-full items-center gap-2 rounded-[12px] border border-cyan-200/25 bg-cyan-300/9 px-3 py-2 text-[13px] text-slate-100"><CheckCircle2 className="h-4 w-4 shrink-0 text-cyan-300" aria-hidden /><span>{contextProof}</span></div>
        <div className="mt-5 rounded-[18px] border border-white/10 bg-white/[0.045] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-fuchsia-300">Why this now</p>
          <div className="mt-3 grid gap-3 text-sm text-slate-200">
            <ReasonRow icon={MessageSquare}>Open thread</ReasonRow><ReasonRow icon={CalendarDays}>Meeting starts in 25 min</ReasonRow><ReasonRow icon={UserRound}>You are the blocker</ReasonRow>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">{sourceTiles.map((item) => <span key={item} className="inline-flex min-h-[42px] items-center rounded-[12px] border border-white/10 bg-white/[0.055] px-3 text-[12px] font-semibold text-slate-200 shadow-[0_12px_24px_rgba(0,0,0,0.18)]">{item}</span>)}</div>
        <div className="mt-6 grid grid-cols-3 gap-3"><ActionButton tone="done">Done</ActionButton><ActionButton tone="quiet">Snooze</ActionButton><ActionButton tone="quiet">Dismiss</ActionButton></div>
      </div>
    </article>
  );
}

function ReasonRow({ icon: Icon, children }: { icon: typeof MessageSquare; children: ReactNode }) {
  return <div className="flex items-center gap-3"><Icon className="h-4 w-4 text-cyan-300" aria-hidden /><span>{children}</span></div>;
}

function ActionButton({ tone, children }: { tone: 'done' | 'quiet'; children: ReactNode }) {
  const toneClass = tone === 'done' ? 'border-emerald-300/25 bg-emerald-400/18 text-emerald-100' : 'border-cyan-300/18 bg-cyan-300/8 text-cyan-100';
  return <button type="button" className={`min-h-[44px] rounded-[12px] border px-3 text-[12px] font-semibold ${toneClass}`}>{children}</button>;
}

function MascotLantern({ mobile = false }: { mobile?: boolean }) {
  return (
    <div className={`relative mx-auto ${mobile ? 'mr-0 block h-[310px] w-[196px] sm:hidden' : 'hidden h-[370px] w-[220px] sm:block'}`}>
      <div className="absolute bottom-6 left-1/2 h-64 w-44 -translate-x-1/2 rounded-[70px] border border-cyan-200/18 bg-[linear-gradient(180deg,#101a2e,#030812)] shadow-[inset_0_1px_18px_rgba(255,255,255,0.08),0_28px_70px_rgba(0,0,0,0.45)]" />
      <div className="absolute left-1/2 top-8 h-32 w-32 -translate-x-1/2 rounded-full border border-cyan-200/25 bg-[#07101d] shadow-[inset_0_0_28px_rgba(14,165,233,0.14),0_0_48px_rgba(14,165,233,0.22)]"><div className="absolute left-7 top-12 h-5 w-4 rounded-full bg-white shadow-[0_0_16px_rgba(255,255,255,0.9)]" /><div className="absolute right-7 top-12 h-5 w-4 rounded-full bg-white shadow-[0_0_16px_rgba(255,255,255,0.9)]" /></div>
      <div className="absolute bottom-40 right-2 h-20 w-10 rotate-[-18deg] rounded-full border border-cyan-200/18 bg-[#101a2e]" />
      <div className="absolute bottom-28 right-0 h-20 w-14 rounded-[18px] border border-amber-200/30 bg-amber-300/10 shadow-[0_0_80px_rgba(245,158,11,0.78)]"><div className="absolute inset-x-4 bottom-3 top-4 rounded-full bg-amber-300 shadow-[0_0_42px_rgba(245,158,11,0.95)]" /></div>
      <div className="absolute bottom-24 left-1/2 h-16 w-16 -translate-x-1/2 rounded-[18px] border border-fuchsia-300/40 bg-[#07101d] p-3"><div className="h-full w-full rounded-[10px] border border-cyan-300/35 bg-gradient-to-br from-fuchsia-400/30 to-cyan-300/20" /></div>
      <div className="absolute bottom-0 left-9 h-20 w-12 rounded-[20px] bg-[#070d18]" /><div className="absolute bottom-0 right-9 h-20 w-12 rounded-[20px] bg-[#070d18]" />
    </div>
  );
}

function ThreadMap() {
  const chips = [
    { label: 'Gmail', detail: 'Alex Morgan thread', icon: Mail, className: 'left-4 top-7 text-red-300' },
    { label: 'Slack', detail: '#design update', icon: MessageSquare, className: 'right-8 top-9 text-violet-300' },
    { label: 'Calendar', detail: 'Review in 25 min', icon: CalendarDays, className: 'left-8 top-[42%] text-cyan-300' },
    { label: 'Draft', detail: 'Mockups v2', icon: FileText, className: 'right-4 top-[43%] text-amber-200' },
    { label: 'Notes', detail: 'Decision buried', icon: Bell, className: 'left-16 bottom-8 text-emerald-300' },
  ];
  return (
    <div className="relative min-h-[360px] overflow-hidden rounded-[24px] border border-white/10 bg-[radial-gradient(circle_at_50%_50%,rgba(168,85,247,0.22),transparent_24%),linear-gradient(135deg,rgba(6,12,25,0.98),rgba(2,5,13,0.92))] p-5">
      <div className="absolute left-1/2 top-1/2 flex h-28 w-28 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-fuchsia-300/55 bg-fuchsia-400/10 shadow-[0_0_44px_rgba(217,70,239,0.34)]"><UserRound className="h-12 w-12 text-fuchsia-100" aria-hidden /></div>
      {chips.map((item) => <SignalChip key={item.label} item={item} />)}
      <div className="absolute inset-x-12 top-1/2 h-px bg-gradient-to-r from-transparent via-fuchsia-300/60 to-transparent opacity-70" /><div className="absolute inset-y-12 left-1/2 w-px bg-gradient-to-b from-transparent via-cyan-300/50 to-transparent opacity-60" />
    </div>
  );
}

function SignalChip({ item }: { item: { label: string; detail: string; icon: typeof Mail; className: string } }) {
  return <div className={`absolute ${item.className} z-10 w-[142px] rounded-[14px] border border-white/10 bg-[#07101d]/88 p-3 shadow-[0_16px_34px_rgba(0,0,0,0.24)] backdrop-blur`}><div className="flex items-center gap-2"><item.icon className="h-4 w-4" aria-hidden /><span className="text-[12px] font-semibold text-white">{item.label}</span></div><p className="mt-1 text-[11px] leading-4 text-slate-400">{item.detail}</p></div>;
}

function FlowCard({ title, children, featured = false }: { title: string; children: ReactNode; featured?: boolean }) {
  return <article className={`min-h-[210px] rounded-[20px] border bg-[#07101d]/86 p-5 shadow-[0_18px_55px_rgba(0,0,0,0.24)] ${featured ? 'border-fuchsia-300/55 shadow-[0_0_50px_rgba(217,70,239,0.18)]' : 'border-white/10'}`}><h3 className="text-[15px] font-semibold text-white">{title}</h3>{children}</article>;
}

function ArrowNode() {
  return <div className="hidden text-fuchsia-300 lg:block"><ArrowRight className="h-7 w-7" aria-hidden /></div>;
}

function ComparisonCard({ title, items, tone }: { title: string; items: string[]; tone: 'manual' | 'foldera' }) {
  const positive = tone === 'foldera';
  return <article className={`rounded-[24px] border p-6 ${positive ? 'border-emerald-300/28 bg-emerald-400/[0.045]' : 'border-red-400/25 bg-red-400/[0.035]'}`}><div className="flex items-center gap-4"><span className={`flex h-12 w-12 items-center justify-center rounded-full border ${positive ? 'border-emerald-300 text-emerald-300' : 'border-red-400 text-red-300'}`}>{positive ? <Check className="h-6 w-6" aria-hidden /> : <Minus className="h-6 w-6" aria-hidden />}</span><h3 className="text-[22px] font-semibold text-white">{title}</h3></div><div className="mt-5 grid gap-3 sm:grid-cols-2">{items.map((item) => <div key={item} className="flex items-start gap-3 text-sm leading-6 text-slate-300"><span className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${positive ? 'border-emerald-300/70 text-emerald-300' : 'border-red-400/70 text-red-300'}`}>{positive ? <Check className="h-3 w-3" aria-hidden /> : <Minus className="h-3 w-3" aria-hidden />}</span>{item}</div>)}</div></article>;
}

function GalaxyField() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_9%,rgba(59,130,246,0.34),transparent_28%),radial-gradient(circle_at_86%_31%,rgba(217,70,239,0.26),transparent_24%),radial-gradient(circle_at_70%_58%,rgba(245,158,11,0.18),transparent_23%),linear-gradient(180deg,#01030a_0%,#04101f_46%,#01030a_100%)]" />
      <div className="absolute right-[-12%] top-[-2%] h-[820px] w-[820px] rounded-full bg-[conic-gradient(from_210deg,rgba(14,165,233,0.00),rgba(14,165,233,0.30),rgba(217,70,239,0.38),rgba(245,158,11,0.28),rgba(14,165,233,0.00))] opacity-80 blur-2xl" />
      <div className="absolute left-[8%] top-[18%] h-[380px] w-[380px] rounded-full bg-cyan-400/10 blur-3xl" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.018)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.014)_1px,transparent_1px)] bg-[size:72px_72px] opacity-30" />
      <Orbit className="absolute right-[7%] top-[9%] h-40 w-40 rotate-12 text-cyan-200/10" />
    </div>
  );
}
