'use client';

import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import {
  AlertCircle,
  ArrowRight,
  Brain,
  Briefcase,
  Calendar,
  Check,
  ChevronRight,
  Clock3,
  Eye,
  FileText,
  Globe,
  Layers,
  Lock,
  Mail,
  MessageSquare,
  Shield,
  Target,
  TriangleAlert,
  Zap,
} from 'lucide-react';

interface ScenarioItem {
  type: string;
  text: string;
}

interface Scenario {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  chaos: ScenarioItem[];
  clarity: {
    kicker: string;
    title: string;
    whyNow: string;
    artifactLabel: string;
    artifact: string;
    button: string;
  };
}

interface RevealProps {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  alwaysVisible?: boolean;
}

interface NavigationProps {
  scrolled: boolean;
  isLoggedIn?: boolean;
}

interface ProofCardProps {
  title: string;
  subtitle: string;
  bullets: string[];
}

const HERO_PROOF_LINES = [
  'You opened this thread 6 times and never replied. Foldera drafted the exact response.',
  'Reply speed collapsed from 2 hours to 3 days. Foldera surfaced the thread before it died.',
  'The deadline moved and nothing hit your calendar. Foldera prepared the decision memo first.',
];

const SCENARIOS: Scenario[] = [
  {
    id: 'hiring',
    icon: Briefcase,
    label: 'Hiring thread drift',
    chaos: [
      { type: 'email', text: 'Recruiter replied Tuesday. Opened twice. No response sent.' },
      { type: 'calendar', text: 'Interview prep never made it onto the calendar.' },
      { type: 'message', text: '“I should answer once I have time to think.”' },
      { type: 'doc', text: 'Resume tab reopened 4 times this week.' },
    ],
    clarity: {
      kicker: 'Decision pressure restored',
      title: 'Reply before 3 PM. Delay is now the risk.',
      whyNow: 'This thread went from same-day replies to a 72-hour gap after two opens. The window is shrinking.',
      artifactLabel: 'Drafted reply',
      artifact: 'Subject: Re: next steps\n\nHi Jenna — yes, I’m interested and can confirm availability this week. Thursday after 1 PM or Friday morning both work. If helpful, I can also send an updated writing sample today.',
      button: 'Approve & Send',
    },
  },
  {
    id: 'deal',
    icon: Target,
    label: 'Decision memo before stall',
    chaos: [
      { type: 'email', text: 'Prospect reopened pricing thread. No answer from your side.' },
      { type: 'tab', text: 'Proposal doc open. No send.' },
      { type: 'message', text: '“I don’t want to seem pushy.”' },
      { type: 'calendar', text: 'Board review tomorrow. No prep block scheduled.' },
    ],
    clarity: {
      kicker: 'Board-changing move prepared',
      title: 'Force the yes or no before the meeting.',
      whyNow: 'The buying signal is still live, but the thread is drifting. If it waits another cycle, the decision disappears into committee.',
      artifactLabel: 'Decision-forcing message',
      artifact: 'Subject: Confirming scope before tomorrow\n\nHi Marcus — to keep this moving, I need a yes/no on the revised scope before tomorrow at 2 PM. If legal needs one final pass, send the exact redlines and I’ll turn them same day.',
      button: 'Approve & Send',
    },
  },
  {
    id: 'life',
    icon: Clock3,
    label: 'Personal admin drift',
    chaos: [
      { type: 'email', text: 'Registration reminder opened. Deadline tomorrow.' },
      { type: 'calendar', text: 'No block for lease renewal or dentist confirmation.' },
      { type: 'message', text: '“I’ll knock this out this weekend.”' },
      { type: 'tab', text: 'Three boring tasks reopened all week.' },
    ],
    clarity: {
      kicker: 'Three low-trust drags removed',
      title: 'These were not hard. They were just never going to happen on their own.',
      whyNow: 'Nothing here required strategy. It required one system willing to finish the boring move before it became a fee, delay, or miss.',
      artifactLabel: 'Prepared actions',
      artifact: '• Lease reply drafted with 12-month counter\n• Dentist confirmation message ready\n• Registration form prefilled and staged',
      button: 'Approve All',
    },
  },
];

const PROOF_CARDS: ProofCardProps[] = [
  {
    title: 'Unanswered after open',
    subtitle: 'The thread is active. Your side is the stall.',
    bullets: ['Multiple opens, no reply', 'Response velocity collapsed', 'Outcome still recoverable'],
  },
  {
    title: 'Deadline without action',
    subtitle: 'The date moved. Nothing else did.',
    bullets: ['Deadline detected', 'No calendar block', 'Artifact prepared first'],
  },
  {
    title: 'Goal vs behavior mismatch',
    subtitle: 'You say it matters. Your behavior says drift.',
    bullets: ['Repeated revisits', 'No send / no submit', 'Decision pressure restored'],
  },
];

const OUTCOME_POINTS = [
  'Fewer weak follow-ups',
  'Fewer expired windows',
  'Less rereading the same thread',
  'One prepared move instead of another reminder',
];

const HOW_IT_WORKS = [
  {
    step: '01',
    title: 'Connect',
    desc: 'Foldera reads the email, calendar, and conversation trail you already created.',
  },
  {
    step: '02',
    title: 'Detect',
    desc: 'It finds the discrepancy: delay, drift, silence, deadline, or mismatch.',
  },
  {
    step: '03',
    title: 'Deliver',
    desc: 'It gives back one finished artifact — ready to send, use, or approve.',
  },
];

const FEATURE_POINTS = [
  {
    icon: Brain,
    title: 'It picks one move',
    desc: 'No dashboard sprawl. No “top 12 priorities.” One decisive winner.',
  },
  {
    icon: Mail,
    title: 'It returns finished work',
    desc: 'Email, memo, or prepared decision frame. Not advice dressed up as output.',
  },
  {
    icon: Shield,
    title: 'It stays private',
    desc: 'Encrypted at rest. The point is trust, not training on your life.',
  },
  {
    icon: Zap,
    title: 'It improves through use',
    desc: 'Approve or skip. The system learns what actually mattered.',
  },
];

const usePrefersReducedMotion = (): boolean => {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);
    const handler = (event: MediaQueryListEvent) => setPrefersReducedMotion(event.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  return prefersReducedMotion;
};

const useInView = (
  threshold = 0.15,
): [React.MutableRefObject<HTMLDivElement | null>, boolean] => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (!ref.current || inView) return;

    const rect = ref.current.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      setInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold, rootMargin: '0px 0px -50px 0px' },
    );

    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [inView, threshold]);

  return [ref, inView];
};

const Reveal = memo<RevealProps>(({ children, delay = 0, className = '', alwaysVisible = false }) => {
  const [ref, inView] = useInView();
  const prefersReducedMotion = usePrefersReducedMotion();

  const motionClasses = alwaysVisible
    ? 'opacity-100 translate-y-0 scale-100'
    : prefersReducedMotion
      ? 'opacity-100 translate-y-0 scale-100'
      : inView
        ? 'opacity-100 translate-y-0 scale-100 duration-700'
        : 'opacity-0 translate-y-8 scale-[0.98] duration-700';

  return (
    <div
      ref={ref}
      className={`transition-all ease-[cubic-bezier(0.16,1,0.3,1)] ${motionClasses} ${className}`}
      style={{ transitionDelay: prefersReducedMotion ? '0ms' : `${delay}ms` }}
    >
      {children}
    </div>
  );
});
Reveal.displayName = 'Reveal';

const ChaosIcon = memo<{ type: string }>(({ type }) => {
  const icons: Record<string, React.ElementType> = {
    email: Mail,
    doc: FileText,
    calendar: Calendar,
    error: AlertCircle,
    message: MessageSquare,
    tab: Globe,
  };

  const Icon = icons[type] || Globe;
  return <Icon className={`h-4 w-4 ${type === 'error' ? 'text-rose-400' : 'text-zinc-400'}`} aria-hidden="true" />;
});
ChaosIcon.displayName = 'ChaosIcon';

const AmbientGrid = () => (
  <div className="pointer-events-none absolute inset-0 z-0">
    <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,#000_20%,transparent_100%)]" />
  </div>
);

function LiveProofStrip() {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (prefersReducedMotion || paused) return;

    const interval = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIndex((prev) => (prev + 1) % HERO_PROOF_LINES.length);
        setVisible(true);
      }, 130);
    }, 2800);

    return () => clearInterval(interval);
  }, [paused, prefersReducedMotion]);

  return (
    <div
      className="mt-4 w-full max-w-3xl rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-left shadow-[inset_0_0_24px_rgba(6,182,212,0.06)] backdrop-blur-sm sm:px-5"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <p className="mb-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">What Foldera catches</p>
      <div className="h-11 overflow-hidden sm:h-10">
        <p
          key={index}
          className={`text-sm leading-5 text-zinc-200 transition-all duration-150 sm:text-[15px] ${
            visible ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0'
          }`}
        >
          {HERO_PROOF_LINES[index]}
        </p>
      </div>
    </div>
  );
}

function Navigation({ scrolled, isLoggedIn }: NavigationProps) {
  return (
    <nav
      className={`fixed top-0 z-50 w-full transition-all duration-500 ${
        scrolled ? 'border-b border-white/5 bg-black/80 py-4 shadow-2xl backdrop-blur-2xl' : 'bg-transparent py-4 md:py-8'
      }`}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6">
        <a href="/" className="group flex cursor-pointer items-center gap-3 focus:outline-none">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-black shadow-[0_0_30px_rgba(255,255,255,0.3)] transition-transform group-hover:scale-105">
            <Layers className="h-5 w-5 fill-black" aria-hidden="true" />
          </div>
          <span className="hidden text-xl font-black uppercase tracking-tighter text-white sm:inline">Foldera</span>
        </a>

        <div className="hidden items-center gap-12 text-[11px] font-black uppercase tracking-[0.2em] text-zinc-500 md:flex">
          <a href="#product" className="transition-colors hover:text-white">Platform</a>
          <a href="#pricing" className="transition-colors hover:text-white">Pricing</a>
          <a href="/blog" className="transition-colors hover:text-white">Blog</a>
        </div>

        <div className="flex items-center gap-6">
          {isLoggedIn ? (
            <a
              href="/dashboard"
              className="flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-[10px] font-black uppercase tracking-[0.2em] text-black shadow-[0_0_20px_rgba(255,255,255,0.2)] transition-all hover:scale-105 hover:bg-zinc-200 active:scale-95 md:px-7 md:py-3 md:text-[11px]"
            >
              Dashboard <ChevronRight className="h-4 w-4" />
            </a>
          ) : (
            <>
              <a href="/login" className="hidden text-[11px] font-black uppercase tracking-[0.2em] text-zinc-500 transition-colors hover:text-white sm:block">
                Sign in
              </a>
              <a
                href="/start"
                className="flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-[10px] font-black uppercase tracking-[0.2em] text-black shadow-[0_0_20px_rgba(255,255,255,0.2)] transition-all hover:scale-105 hover:bg-zinc-200 active:scale-95 md:px-7 md:py-3 md:text-[11px]"
              >
                Get started free <ChevronRight className="h-4 w-4" />
              </a>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}

function SignalEngineHero() {
  return (
    <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col items-center px-6 pb-14 pt-20 text-center md:pb-20 md:pt-28">
      <Reveal alwaysVisible>
        <div className="mb-4 inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 md:mb-6">
          Finished work, every morning.
        </div>
        <h1 className="mb-4 text-4xl font-black leading-[1.02] tracking-tighter text-white md:mb-5 md:text-6xl lg:text-7xl">
          You missed it.
          <br className="hidden md:block" />
          Foldera didn’t.
        </h1>
        <p className="mx-auto mb-5 max-w-3xl text-base font-medium leading-relaxed text-zinc-400 md:mb-8 md:text-xl">
          Foldera reads what changed, decides what matters, and hands you the finished move before the outcome slips.
        </p>
        <div className="mb-5 md:mb-8">
          <p className="inline-flex items-center gap-2 rounded-full border border-cyan-400/35 bg-cyan-500/10 px-3 py-1.5 text-xs font-black uppercase tracking-[0.14em] text-cyan-100 shadow-[0_0_24px_rgba(6,182,212,0.14)]">
            <Lock className="h-3.5 w-3.5 text-cyan-300" aria-hidden="true" />
            No credit card required
          </p>
        </div>
        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
          <a
            href="/start"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-white px-8 py-4 text-xs font-black uppercase tracking-[0.15em] text-black shadow-[0_0_40px_rgba(255,255,255,0.2)] transition-all hover:scale-[1.02] hover:bg-zinc-200 active:scale-95 sm:w-auto"
          >
            See a real example <ChevronRight className="h-4 w-4" />
          </a>
          <a
            href="#pricing"
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.03] px-8 py-4 text-xs font-black uppercase tracking-[0.15em] text-zinc-100 transition-all hover:border-cyan-400/35 hover:bg-cyan-500/[0.06] sm:w-auto"
          >
            Get your first read tomorrow
          </a>
        </div>
        <LiveProofStrip />
      </Reveal>

      <div className="relative mt-8 flex w-full max-w-5xl flex-col items-center md:mt-14">
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-500/[0.03] blur-[140px]" />

        <div className="relative z-10 mb-1 flex items-center justify-center gap-3 sm:gap-4">
          <div className="hero-input-chip flex items-center gap-1.5 rounded-full border border-zinc-700/50 bg-zinc-900/80 px-3 py-1.5 text-[10px] font-semibold text-zinc-500 sm:text-[11px]">
            <Mail className="h-3 w-3 text-zinc-500" />
            <span>23 emails</span>
          </div>
          <div className="hero-input-chip flex items-center gap-1.5 rounded-full border border-zinc-700/50 bg-zinc-900/80 px-3 py-1.5 text-[10px] font-semibold text-zinc-500 sm:text-[11px]">
            <Calendar className="h-3 w-3 text-zinc-500" />
            <span>8 events</span>
          </div>
          <div className="hero-input-chip flex items-center gap-1.5 rounded-full border border-zinc-700/50 bg-zinc-900/80 px-3 py-1.5 text-[10px] font-semibold text-zinc-500 sm:text-[11px]">
            <MessageSquare className="h-3 w-3 text-zinc-500" />
            <span>3 threads</span>
          </div>
        </div>

        <div className="relative z-10 my-0 flex flex-col items-center">
          <div className="h-5 w-px bg-gradient-to-b from-zinc-700/0 to-zinc-600/60" />
          <div className="hero-process-dot relative flex h-7 w-7 items-center justify-center rounded-full border border-zinc-600/50 bg-[#0a0a0f]">
            <span className="hero-ignition" aria-hidden="true" />
            <Brain className="h-3.5 w-3.5 text-cyan-400/70" />
          </div>
          <div className="h-5 w-px bg-gradient-to-b from-cyan-500/40 to-cyan-500/0" />
        </div>

        <div className="hero-output relative z-30 w-full max-w-[520px]">
          <div className="overflow-hidden rounded-[2rem] border border-cyan-500/40 bg-[#0a0a0f] text-left shadow-[0_40px_100px_-20px_rgba(0,0,0,1),_0_0_50px_rgba(6,182,212,0.15)]">
            <div className="h-1 w-full bg-gradient-to-r from-transparent via-cyan-400 to-transparent" />
            <div className="border-b border-white/10 p-5 sm:p-6">
              <div className="mb-3 inline-flex w-fit items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5">
                <div className="h-2 w-2 rounded-full bg-amber-400" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-amber-300">Deadline moved. No response sent.</span>
              </div>
              <h3 className="mb-2 text-xl font-bold text-white sm:text-2xl">Send this before 3 PM. Delay is now the risk.</h3>
              <p className="text-sm text-zinc-400 sm:text-[15px]">
                Reply velocity on this thread dropped from same-day to 72 hours after two opens. The window is still recoverable.
              </p>
            </div>
            <div className="space-y-3 bg-black/40 p-5 sm:p-6">
              <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-4">
                <p className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-cyan-400">
                  <Zap className="h-3 w-3" /> Drafted reply
                </p>
                <p className="mb-2 text-xs font-bold uppercase tracking-[0.15em] text-zinc-500">Subject</p>
                <p className="mb-3 text-sm font-semibold text-zinc-100">Re: next steps this week</p>
                <p className="mb-2 text-xs font-bold uppercase tracking-[0.15em] text-zinc-500">Body</p>
                <p className="text-sm leading-relaxed text-zinc-200">
                  Hi Jenna — yes, I’m interested and can confirm availability this week. Thursday after 1 PM or Friday morning both work. If helpful, I can also send an updated writing sample today.
                </p>
              </div>
            </div>
            <div className="flex gap-3 border-t border-white/10 bg-white/[0.02] p-4">
              <button type="button" className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-cyan-500 py-3.5 text-xs font-black uppercase tracking-widest text-black shadow-[0_0_20px_rgba(6,182,212,0.22)]">
                <Check className="h-4 w-4" /> Approve
              </button>
              <button type="button" className="flex items-center justify-center rounded-xl border border-white/20 bg-zinc-900 px-6 py-3.5 text-xs font-black uppercase tracking-widest text-zinc-500">
                Skip
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ScenarioDemos() {
  const [activeTab, setActiveTab] = useState(0);
  const [phase, setPhase] = useState<'chaos' | 'clarity'>('chaos');
  const [progress, setProgress] = useState(0);
  const prefersReducedMotion = usePrefersReducedMotion();
  const touchStartX = useRef<number | null>(null);

  const showPrev = useCallback(() => {
    setActiveTab((prev) => (prev - 1 + SCENARIOS.length) % SCENARIOS.length);
  }, []);

  const showNext = useCallback(() => {
    setActiveTab((prev) => (prev + 1) % SCENARIOS.length);
  }, []);

  const runDemo = useCallback(() => {
    if (prefersReducedMotion) {
      setPhase('clarity');
      return;
    }

    setPhase('chaos');
    setProgress(0);
    const stages = [0, 30, 65, 85, 100];
    let stage = 0;

    const interval = setInterval(() => {
      if (stage < stages.length - 1) {
        stage += 1;
        setProgress(stages[stage]);
      }
    }, 400);

    const timer = setTimeout(() => {
      clearInterval(interval);
      setPhase('clarity');
    }, 3800);

    return () => {
      clearInterval(interval);
      clearTimeout(timer);
    };
  }, [prefersReducedMotion]);

  useEffect(() => {
    const cleanup = runDemo();
    return cleanup;
  }, [activeTab, runDemo]);

  const current = SCENARIOS[activeTab];
  const isProcessing = phase === 'chaos' && progress > 40;

  return (
    <div className="relative z-10 mx-auto w-full max-w-6xl px-4 sm:px-6">
      <div
        className={`relative h-[390px] w-full overflow-hidden rounded-[2rem] border bg-black/40 shadow-2xl backdrop-blur-3xl transition-all duration-1000 sm:h-[470px] md:h-auto md:aspect-[21/10] ${
          isProcessing ? 'border-cyan-500/45 shadow-[0_0_80px_-25px_rgba(6,182,212,0.32)]' : 'border-white/10 shadow-[0_40px_100px_-20px_rgba(0,0,0,1)]'
        }`}
        onTouchStart={(event) => {
          touchStartX.current = event.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={(event) => {
          if (touchStartX.current === null) return;
          const deltaX = (event.changedTouches[0]?.clientX ?? touchStartX.current) - touchStartX.current;
          if (Math.abs(deltaX) < 36) return;
          if (deltaX < 0) showNext();
          if (deltaX > 0) showPrev();
        }}
      >
        <div className="absolute left-0 top-0 z-40 flex h-10 w-full items-center border-b border-white/5 bg-white/[0.02] px-3 backdrop-blur-xl md:h-12 md:px-4">
          <div className="flex gap-2">
            <div className="h-3 w-3 rounded-full bg-zinc-700/50" />
            <div className="h-3 w-3 rounded-full bg-zinc-700/50" />
            <div className="h-3 w-3 rounded-full bg-zinc-700/50" />
          </div>
          <div className="mx-auto flex items-center gap-2 rounded-full border border-white/5 bg-black/50 px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest text-zinc-500 shadow-inner md:px-4 md:text-[10px]">
            <Lock className="h-3 w-3" /> foldera.engine
          </div>
        </div>

        <div className={`absolute left-1/2 top-1/2 h-[150%] w-[150%] -translate-x-1/2 -translate-y-1/2 bg-[radial-gradient(circle_at_50%_50%,rgba(6,182,212,0.08)_0%,transparent_50%)] transition-opacity duration-1000 ${isProcessing ? 'opacity-100' : 'opacity-30'}`} />

        <div
          className={`absolute inset-0 flex flex-col items-center justify-start px-4 pb-4 pt-11 transition-all duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)] md:justify-center md:p-12 md:pt-20 ${
            phase === 'chaos' ? 'z-10 opacity-100' : 'pointer-events-none opacity-0 scale-110 blur-xl'
          }`}
        >
          <div className="relative w-full max-w-xl perspective-1000">
            {current.chaos.map((item, idx) => {
              const rotate = idx % 2 === 0 ? '-2deg' : '2deg';
              const translateX = idx % 2 === 0 ? '-15px' : '15px';

              return (
                <div
                  key={`${activeTab}-${idx}`}
                  className="absolute flex w-full items-center gap-3 rounded-xl border border-white/10 bg-zinc-900/80 p-3.5 text-[13px] text-zinc-200 shadow-2xl backdrop-blur-md transition-all duration-[800ms] ease-out md:gap-4 md:rounded-2xl md:p-5 md:text-base"
                  style={{
                    top: `${idx * 50}px`,
                    zIndex: 10 - idx,
                    transitionDelay: `${idx * 60}ms`,
                    transform:
                      progress > 30
                        ? 'translateZ(-60px) translateY(68px) scale(0.84) rotateX(16deg)'
                        : `translateZ(0) translateY(0) translateX(${translateX}) rotateZ(${rotate})`,
                  }}
                >
                  <div className="rounded-lg border border-white/10 bg-black p-2 shadow-inner md:rounded-xl">
                    <ChaosIcon type={item.type} />
                  </div>
                  <span className="flex-1 text-left font-semibold leading-snug tracking-tight">{item.text}</span>
                  <div className="h-2 w-2 rounded-full bg-zinc-600" />
                </div>
              );
            })}
          </div>
        </div>

        <div
          className={`absolute inset-0 z-30 flex items-start justify-center px-4 pb-4 pt-11 transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] md:items-center md:p-12 ${
            phase === 'clarity' ? 'translate-y-0 scale-100 opacity-100' : 'pointer-events-none translate-y-12 scale-90 opacity-0'
          }`}
        >
          <div className="w-full max-w-xl overflow-hidden rounded-[1.5rem] border border-cyan-400/30 bg-zinc-950/90 text-left shadow-[0_44px_100px_-20px_rgba(0,0,0,1),_0_0_40px_rgba(6,182,212,0.14)] ring-1 ring-cyan-300/15 md:rounded-[2rem]">
            <div className="h-1 w-full bg-gradient-to-r from-cyan-500 to-cyan-300" />
            <div className="flex items-start gap-3 border-b border-white/5 bg-white/[0.02] p-4 md:gap-4 md:p-8">
              <div className="rounded-xl border border-cyan-400/35 bg-cyan-500/12 p-3 shadow-[inset_0_0_22px_rgba(6,182,212,0.15)] md:rounded-2xl md:p-3.5">
                <Check className="h-5 w-5 text-cyan-400 md:h-6 md:w-6" />
              </div>
              <div className="flex-1 pt-1">
                <p className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-cyan-300">{current.clarity.kicker}</p>
                <p className="text-base font-black tracking-tight text-white sm:text-xl">{current.clarity.title}</p>
                <p className="mt-2 text-[13px] leading-snug text-zinc-300 sm:text-sm">{current.clarity.whyNow}</p>
              </div>
            </div>
            <div className="space-y-4 bg-black/45 p-4 md:space-y-5 md:p-8">
              <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-4">
                <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-cyan-400">{current.clarity.artifactLabel}</p>
                <p className="whitespace-pre-line text-[13px] font-medium leading-relaxed text-zinc-200 md:text-base">{current.clarity.artifact}</p>
              </div>
              <button className="group flex w-full items-center justify-center gap-3 rounded-xl bg-white py-3.5 text-[11px] font-black uppercase tracking-[0.2em] text-black shadow-[0_0_24px_rgba(255,255,255,0.16)] transition-colors duration-200 hover:bg-zinc-200 active:scale-95 md:py-4">
                <Zap className="h-4 w-4 fill-black" />
                {current.clarity.button}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="relative z-10 mt-4 flex flex-col items-center gap-3 md:mt-10 md:gap-4">
        <div className="flex items-center gap-2 md:hidden">
          <button
            type="button"
            onClick={showPrev}
            className="rounded-full border border-white/20 bg-zinc-950/80 px-3.5 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-zinc-200 active:scale-95"
            aria-label="Show previous scenario"
          >
            Prev
          </button>
          <button
            type="button"
            onClick={showNext}
            className="rounded-full border border-cyan-400/45 bg-cyan-500/12 px-3.5 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-cyan-100 active:scale-95"
            aria-label="Show next scenario"
          >
            Next
          </button>
        </div>
        <div className="flex items-center justify-center gap-3 md:gap-4">
          {SCENARIOS.map((scenario, i) => {
            const isActive = activeTab === i;
            return (
              <button
                key={scenario.id}
                onClick={() => setActiveTab(i)}
                className={`h-2.5 rounded-full border transition-all duration-300 ${
                  isActive
                    ? 'w-11 border-cyan-200 bg-cyan-300 shadow-[0_0_20px_rgba(34,211,238,0.9)]'
                    : 'w-5 border-zinc-600/80 bg-zinc-800 hover:bg-zinc-700'
                }`}
                aria-label={`Scenario ${i + 1}: ${scenario.label}`}
                aria-current={isActive ? 'true' : 'false'}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

const ProofSection = memo(() => (
  <section className="relative overflow-hidden border-t border-white/5 bg-[#07070c] py-24 md:py-32">
    <AmbientGrid />
    <div className="relative z-10 mx-auto max-w-6xl px-6">
      <Reveal className="mb-14 text-center md:mb-16">
        <h2 className="mb-6 text-4xl font-black tracking-tighter text-white md:text-5xl lg:text-6xl">
          One missed change costs the outcome.
          <br />
          <span className="bg-gradient-to-r from-cyan-300 to-cyan-400 bg-clip-text text-transparent">Foldera catches the shift first.</span>
        </h2>
        <p className="mx-auto max-w-2xl text-lg font-medium leading-relaxed text-zinc-400 md:text-xl">
          The reply never came. The deadline moved. The decision window shrank.
        </p>
      </Reveal>

      <Reveal delay={120}>
        <ScenarioDemos />
      </Reveal>
    </div>
  </section>
));
ProofSection.displayName = 'ProofSection';

const HowItWorksSection = memo(() => (
  <section className="relative border-t border-white/5 bg-[#07070c] py-28 md:py-36">
    <AmbientGrid />
    <div className="relative z-10 mx-auto max-w-6xl px-6">
      <Reveal className="mb-16 max-w-4xl text-left md:mb-20">
        <h2 className="mb-8 text-5xl font-black tracking-tighter text-white md:text-6xl lg:text-7xl">
          It finds the discrepancy.
          <br />
          Then it finishes the move.
        </h2>
        <p className="max-w-2xl text-xl font-medium leading-relaxed text-zinc-400 md:text-2xl">
          No prompt box. No planning ritual. No list of fake priorities. One prepared move, ready to approve or skip.
        </p>
      </Reveal>

      <div className="grid gap-8 md:grid-cols-3">
        {HOW_IT_WORKS.map((item, i) => (
          <Reveal key={item.title} delay={i * 100}>
            <div className="group relative h-full overflow-hidden rounded-[2rem] border border-white/[0.08] bg-zinc-950/80 p-10 text-left shadow-2xl shadow-black/40 transition-all duration-700 hover:-translate-y-2 hover:border-cyan-500/40 hover:shadow-[0_0_60px_rgba(6,182,212,0.15)] md:p-12">
              <div className="absolute -bottom-10 -right-6 pointer-events-none text-[180px] leading-none text-white/[0.02] transition-all duration-700 group-hover:scale-110 group-hover:text-cyan-500/[0.05]">
                {item.step}
              </div>
              <span className="mb-6 inline-block rounded-md border border-cyan-500/20 bg-cyan-500/10 px-3 py-1.5 font-mono text-[10px] font-black uppercase tracking-[0.2em] text-cyan-400 shadow-inner">
                Step {item.step}
              </span>
              <h3 className="mb-5 text-2xl font-black tracking-tight text-white">{item.title}</h3>
              <p className="relative z-10 text-base font-medium leading-relaxed text-zinc-400 md:text-lg">{item.desc}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </div>
  </section>
));
HowItWorksSection.displayName = 'HowItWorksSection';

const FlipSection = memo(() => {
  const [ref, inView] = useInView(0.2);

  return (
    <section ref={ref as unknown as React.RefObject<HTMLElement>} className="relative overflow-hidden border-y border-white/5 bg-[#07070c] py-28 md:py-36">
      <AmbientGrid />
      <div className="relative z-10 mx-auto max-w-6xl px-6">
        <Reveal>
          <div className="mb-16 text-center md:mb-24">
            <h2 className="mb-6 text-5xl font-black tracking-tighter text-white md:text-6xl">Same inbox. Different result.</h2>
            <p className="text-xl font-medium text-zinc-400">
              The value is not more information. It is catching the shift that changes what must happen next.
            </p>
          </div>
        </Reveal>

        <div className="relative grid gap-8 md:grid-cols-2">
          <div className="absolute bottom-0 top-0 left-1/2 hidden w-px bg-gradient-to-b from-transparent via-white/10 to-transparent md:block" aria-hidden="true" />

          <div className={`rounded-[2rem] border border-white/5 bg-zinc-950/50 p-8 text-left backdrop-blur-xl transition-all duration-1000 md:p-12 ${inView ? 'opacity-40 grayscale' : 'opacity-0 -translate-x-12'}`}>
            <div className="mb-10 flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-zinc-500">
              <Eye className="h-4 w-4" /> What you see
            </div>
            <div className="space-y-4">
              {[
                { label: 'Threads', val: '47', color: 'text-rose-400' },
                { label: 'Open loops', val: '12', color: 'text-amber-400' },
                { label: 'Clear move', val: '0', color: 'text-zinc-400' },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between rounded-2xl border border-white/5 bg-[#0a0a0a] p-6 shadow-inner">
                  <span className="font-bold text-zinc-400">{item.label}</span>
                  <span className={`text-2xl font-black ${item.color}`}>{item.val}</span>
                </div>
              ))}
            </div>
          </div>

          <div className={`relative overflow-hidden rounded-[2rem] border border-cyan-500/30 bg-zinc-950/80 p-8 text-left shadow-[0_0_120px_rgba(6,182,212,0.15)] backdrop-blur-2xl transition-all delay-150 duration-1000 md:p-12 ${inView ? '-translate-y-2 translate-x-0 opacity-100' : 'translate-x-12 opacity-0'}`}>
            <div className="pointer-events-none absolute right-0 top-0 h-96 w-96 bg-cyan-500/10 blur-[120px]" />
            <div className="relative z-10 mb-10 flex items-center gap-3 text-[11px] font-black uppercase tracking-widest text-cyan-400">
              <Brain className="h-5 w-5" /> What Foldera sees
            </div>
            <div className="relative z-10 space-y-6">
              <div className="rounded-2xl border border-white/10 bg-black/80 p-8 shadow-2xl backdrop-blur-md">
                <div className="mb-6 text-[11px] font-black uppercase tracking-widest text-white">One decision identified</div>
                <div className="mb-4 text-sm leading-relaxed text-zinc-300">
                  The thread is still warm, but your side has become the delay. That changed the move from “keep monitoring” to “send now before the window collapses.”
                </div>
                <div className="text-[10px] font-black uppercase tracking-widest text-cyan-400">Shift extracted</div>
              </div>
              <div className="relative overflow-hidden rounded-2xl border border-white/5 bg-black/50 p-8">
                <div className="absolute bottom-0 left-0 top-0 w-1 bg-cyan-400" aria-hidden="true" />
                <div className="mb-3 text-[10px] font-black uppercase tracking-widest text-zinc-600">Artifact ready</div>
                <div className="text-sm font-medium leading-relaxed text-zinc-200 md:text-base">
                  One prepared reply. One preserved deadline. One decision instead of another reread.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
});
FlipSection.displayName = 'FlipSection';

const DiscrepancySection = memo(() => (
  <section className="relative overflow-hidden border-t border-white/5 bg-[#07070c] py-28 md:py-36">
    <AmbientGrid />
    <div className="relative z-10 mx-auto max-w-6xl px-6">
      <Reveal className="mb-14 text-center md:mb-18">
        <h2 className="mb-6 text-5xl font-black tracking-tighter text-white md:text-6xl">You stop monitoring. It starts noticing.</h2>
        <p className="mx-auto max-w-3xl text-xl font-medium leading-relaxed text-zinc-400">
          Foldera wins by catching the discrepancy before it becomes regret.
        </p>
      </Reveal>

      <div className="grid gap-6 md:grid-cols-3">
        {PROOF_CARDS.map((card, idx) => (
          <Reveal key={card.title} delay={idx * 100}>
            <div className="h-full rounded-[2rem] border border-white/[0.08] bg-zinc-950/80 p-8 text-left shadow-2xl shadow-black/40 transition-all duration-700 hover:-translate-y-2 hover:border-cyan-500/30 hover:shadow-[0_0_40px_rgba(6,182,212,0.12)]">
              <div className="mb-5 inline-flex rounded-full border border-cyan-500/20 bg-cyan-500/10 p-3 text-cyan-400">
                {idx === 0 && <Mail className="h-5 w-5" />}
                {idx === 1 && <Calendar className="h-5 w-5" />}
                {idx === 2 && <TriangleAlert className="h-5 w-5" />}
              </div>
              <h3 className="mb-3 text-2xl font-black tracking-tight text-white">{card.title}</h3>
              <p className="mb-6 text-base font-medium leading-relaxed text-zinc-400">{card.subtitle}</p>
              <div className="space-y-3">
                {card.bullets.map((bullet) => (
                  <div key={bullet} className="flex items-start gap-3 text-sm text-zinc-300">
                    <div className="mt-1 h-1.5 w-1.5 rounded-full bg-cyan-400" />
                    <span>{bullet}</span>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        ))}
      </div>
    </div>
  </section>
));
DiscrepancySection.displayName = 'DiscrepancySection';

const OutcomeSection = memo(() => (
  <section className="relative overflow-hidden border-t border-white/5 bg-[#07070c] py-28 md:py-36">
    <AmbientGrid />
    <div className="relative z-10 mx-auto max-w-6xl px-6">
      <Reveal className="mb-14 text-left md:mb-16 md:text-center">
        <h2 className="mb-6 text-5xl font-black tracking-tighter text-white md:text-6xl lg:text-7xl">
          Stop checking.
          <br />
          Start finishing.
        </h2>
        <p className="text-xl font-medium text-zinc-400 md:text-2xl">What changes when Foldera is working.</p>
      </Reveal>

      <div className="grid gap-5 md:grid-cols-2">
        {OUTCOME_POINTS.map((point, index) => (
          <Reveal key={point} delay={index * 70}>
            <div className="flex items-center gap-4 rounded-[1.5rem] border border-white/[0.08] bg-zinc-950/80 p-6 text-left shadow-xl shadow-black/30 transition-all duration-500 hover:border-cyan-500/30 hover:bg-zinc-950">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-cyan-500/20 bg-cyan-500/10 text-cyan-400">
                <Check className="h-5 w-5" />
              </div>
              <p className="text-lg font-semibold tracking-tight text-zinc-100">{point}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </div>
  </section>
));
OutcomeSection.displayName = 'OutcomeSection';

const FeatureCarousel = memo(() => (
  <section id="product" className="relative border-t border-white/5 bg-[#07070c] py-28 md:py-36">
    <AmbientGrid />
    <div className="relative z-10 mx-auto max-w-6xl px-6">
      <Reveal className="mb-14 text-left md:mb-20 md:text-center">
        <h2 className="mb-8 text-5xl font-black tracking-tighter text-white md:text-6xl lg:text-7xl">The system, not the clutter.</h2>
        <p className="text-xl font-medium text-zinc-400 md:text-2xl">Foldera exists to remove one more layer of personal workflow theater.</p>
      </Reveal>
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        {FEATURE_POINTS.map((feature, i) => {
          const Icon = feature.icon;
          return (
            <Reveal key={feature.title} delay={i * 90}>
              <div className="relative h-full overflow-hidden rounded-[2rem] border border-white/[0.08] bg-zinc-950/80 p-8 text-left shadow-2xl shadow-black/40 transition-all duration-700 hover:-translate-y-2 hover:border-cyan-500/30 hover:shadow-[0_0_50px_rgba(6,182,212,0.15)]">
                <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-black shadow-inner">
                  <Icon className="h-7 w-7 text-zinc-500" />
                </div>
                <h3 className="mb-4 text-xl font-black tracking-tight text-white">{feature.title}</h3>
                <p className="text-base font-medium leading-relaxed text-zinc-400">{feature.desc}</p>
              </div>
            </Reveal>
          );
        })}
      </div>
    </div>
  </section>
));
FeatureCarousel.displayName = 'FeatureCarousel';

export default function App() {
  const [scrolled, setScrolled] = useState(false);
  const { status } = useSession();
  const isLoggedIn = status === 'authenticated';

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="min-h-[100dvh] overflow
