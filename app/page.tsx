'use client';

import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import { NavPublic } from '@/components/nav/NavPublic';
import { FolderaMark } from '@/components/nav/FolderaMark';
import {
  ArrowRight, Check, Mail, Calendar, MessageSquare,
  Zap, Brain, Briefcase, Code, Coffee, Database, Shield,
  Globe, LayoutGrid, Terminal, FileText, AlertCircle,
  Lock, ChevronRight, Eye,
} from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================
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
    action: string;
    subject: string;
    desc: string;
    button: string;
  };
}

interface FeatureItem {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
}

interface RevealProps {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  alwaysVisible?: boolean;
}

// ============================================================================
// DATA
// ============================================================================
const SCENARIOS: Scenario[] = [
  {
    id: 'job',
    icon: Briefcase,
    label: 'The decision it found in your signals',
    chaos: [
      { type: 'doc', text: '\u201cI keep second-guessing this decision\u201d' },
      { type: 'email', text: 'Recruiter follow-up (3 days old, unread)' },
      { type: 'tab', text: 'Glassdoor: same company, 4th time this month' },
      { type: 'message', text: '\u201cMaybe I should just wait and see\u201d' },
    ],
    clarity: {
      action: 'Decision Frame Ready',
      subject: 'The hesitation isn\u2019t about the role',
      desc: 'You\u2019ve researched this company 4 times without applying. The pattern says you want it but you\u2019re afraid of rejection. I drafted the email to the recruiter and blocked 20 minutes tomorrow to hit send.',
      button: 'Approve & Send',
    },
  },
  {
    id: 'builder',
    icon: Code,
    label: 'The relationship you were drifting from',
    chaos: [
      { type: 'doc', text: '\u201cOne more feature before I launch\u201d' },
      { type: 'tab', text: '12 open tabs: competitors, not customers' },
      { type: 'error', text: '0 users. 47 commits this week.' },
      { type: 'message', text: '\u201cNobody\u2019s going to use this\u201d' },
    ],
    clarity: {
      action: 'Distribution Email Drafted',
      subject: 'Ship what you have. Today.',
      desc: 'You\u2019ve built for 6 weeks without showing anyone. That\u2019s not perfectionism \u2014 it\u2019s avoidance. I found 3 people in your network who fit your ICP and drafted a personal email to each.',
      button: 'Send All Three',
    },
  },
  {
    id: 'life',
    icon: Coffee,
    label: 'The 47 threads it resolved while you slept',
    chaos: [
      { type: 'email', text: 'Registration deadline: tomorrow (opened, not acted on)' },
      { type: 'message', text: 'Lease renewal \u2014 \u201cI\u2019ll do it this weekend\u201d' },
      { type: 'tab', text: 'Cart with 6 items, idle since Tuesday' },
      { type: 'calendar', text: 'Dentist (unconfirmed, 3rd reschedule)' },
    ],
    clarity: {
      action: 'Three Things Handled',
      subject: 'None of this is hard. It\u2019s just boring.',
      desc: 'Registration submitted. Lease reply drafted with a 12-month counter. Dentist confirmed for Thursday. You were never going to do these voluntarily. Now they\u2019re done.',
      button: 'Approve All',
    },
  },
];

const FEATURES: FeatureItem[] = [
  { icon: Database, title: 'It connects the dots', desc: 'Loose ends, patterns, and commitments — woven into one picture so what matters doesn\u2019t hide in the noise.' },
  { icon: Brain, title: 'It picks the one thing', desc: 'Dozens of threads, one winner. The engine scores what matters most and ignores the rest.' },
  { icon: Zap, title: 'It drafts the move', desc: 'No prompting. No chatting. You wake up to finished work — ready to send with one tap.' },
  { icon: Shield, title: 'It stays private', desc: 'Your data never trains anyone else\u2019s model. AES-256 encryption. Delete everything anytime.' },
  { icon: Terminal, title: 'It gets smarter', desc: 'Every approval and every skip teaches the engine what matters to you. Day 30 is unrecognizable from day 1.' },
  { icon: LayoutGrid, title: 'It replaces the system', desc: 'Not another app to check. The whole point is that you stop managing and start deciding yes or no.' },
];

const HERO_DEMO_SLIDES: Array<{
  badge: string;
  badgeTone: 'rose' | 'cyan';
  title: string;
  subtitle: string;
  artifact: string;
}> = [
  {
    badge: 'Blocks 3 Team Members',
    badgeTone: 'rose',
    title: 'Finalize Q3 Projections',
    subtitle: 'Reopened 4 times. Waiting on your approval to unblock the team.',
    artifact:
      '"Hi team, attached are the finalized numbers before the board meeting. We\'ve adjusted the forecast based on recent churn..."',
  },
  {
    badge: 'Thread going cold',
    badgeTone: 'cyan',
    title: 'Reply before you lose the deal',
    subtitle: 'Last activity 6 days ago. They are waiting on your answer.',
    artifact:
      '"Thanks for your patience — here\'s the updated scope and numbers we discussed. Can we lock a 30-min call Thursday?"',
  },
  {
    badge: 'Pattern detected',
    badgeTone: 'cyan',
    title: 'The application you keep opening',
    subtitle: 'Four views this week, no submit. Draft is ready.',
    artifact:
      '"I\'m excited about the role and would love to move forward. I\'ve attached my availability for the next step."',
  },
];

const HERO_PROOF_LINES = [
  'You’ve opened this thread 6 times and never replied. I drafted the exact response.',
  'Response time jumped from 2h → 3 days. Send now before it dies.',
  'You keep revisiting this role but haven’t applied. Email is ready.',
];

// ============================================================================
// HOOKS
// ============================================================================
const usePrefersReducedMotion = (): boolean => {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);
  return prefersReducedMotion;
};

const useInView = (threshold = 0.15): [React.MutableRefObject<HTMLDivElement | null>, boolean] => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    // Check immediately if already visible (handles revisit / logged-in redirect cases)
    const rect = ref.current.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      setInView(true);
      return;
    }
    if (inView) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold, rootMargin: '0px 0px -50px 0px' }
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [inView, threshold]);
  return [ref, inView];
};


// ============================================================================
// ATOMIC COMPONENTS
// ============================================================================
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
    email: Mail, doc: FileText, calendar: Calendar, error: AlertCircle, message: MessageSquare, tab: Globe,
  };
  const Icon = icons[type] || Globe;
  return <Icon className={`w-4 h-4 ${type === 'error' ? 'text-rose-400' : 'text-zinc-400'}`} aria-hidden="true" />;
});
ChaosIcon.displayName = 'ChaosIcon';

const AmbientGrid = () => (
  <div className="absolute inset-0 pointer-events-none z-0">
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
      className="w-full max-w-2xl xl:max-w-none mt-6 md:mt-8 xl:mt-10 rounded-xl xl:rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-sm px-4 sm:px-6 py-4 sm:py-5 xl:px-8 xl:py-6 text-left shadow-[inset_0_0_24px_rgba(6,182,212,0.06)]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <p className="text-[10px] xl:text-[11px] font-black uppercase tracking-[0.2em] text-zinc-500 mb-1.5 xl:mb-2">What Foldera catches</p>
      <div className="h-11 sm:h-10 xl:h-14 overflow-hidden">
        <p
          key={index}
          className={`text-sm sm:text-[15px] xl:text-lg xl:leading-snug text-zinc-200 transition-all duration-150 ${
            visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1'
          }`}
        >
          {HERO_PROOF_LINES[index]}
        </p>
      </div>
    </div>
  );
}


// ============================================================================
// HERO — interactive approve/skip demo (no navigation)
// ============================================================================
function HeroDirectiveDemo() {
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<'idle' | 'out' | 'cta'>('idle');
  const prefersReducedMotion = usePrefersReducedMotion();
  const slide = HERO_DEMO_SLIDES[idx];
  const isLast = idx >= HERO_DEMO_SLIDES.length - 1;

  const advance = useCallback(() => {
    if (prefersReducedMotion) {
      if (isLast) setPhase('cta');
      else setIdx((i) => Math.min(i + 1, HERO_DEMO_SLIDES.length - 1));
      return;
    }
    setPhase('out');
    window.setTimeout(() => {
      if (isLast) setPhase('cta');
      else {
        setIdx((i) => i + 1);
        setPhase('idle');
      }
    }, 280);
  }, [isLast, prefersReducedMotion]);

  if (phase === 'cta') {
    return (
      <div className="relative z-30 w-full max-w-[min(100%,420px)] md:max-w-[640px] lg:max-w-[min(52rem,100%)] xl:max-w-none mx-auto xl:mx-0 text-center xl:text-left px-2 sm:px-4 xl:px-0">
        <p className="text-white font-black text-xl xl:text-2xl mb-6 xl:mb-8 tracking-tight">Like what you see?</p>
        <a
          href="/start"
          className="inline-flex items-center justify-center gap-2 px-8 py-4 xl:px-10 xl:py-[1.125rem] rounded-xl bg-white text-black font-black uppercase tracking-[0.15em] text-xs xl:text-sm hover:bg-zinc-200 transition-all shadow-[0_0_40px_rgba(255,255,255,0.2)] hover:scale-[1.02] active:scale-95"
        >
          Get started free <ChevronRight className="w-4 h-4" aria-hidden="true" />
        </a>
      </div>
    );
  }

  const badgeRose = slide.badgeTone === 'rose';

  return (
    <div
      className={`relative z-30 w-full max-w-[min(100%,420px)] md:max-w-[640px] lg:max-w-[min(52rem,100%)] xl:max-w-none hero-output pointer-events-auto transition-all duration-300 ease-out ${
        phase === 'out' ? 'opacity-0 translate-x-10 scale-[0.96]' : 'opacity-100 translate-x-0 scale-100'
      }`}
    >
      <div className="rounded-[2rem] lg:rounded-[2.25rem] xl:rounded-[2.75rem] 2xl:rounded-[3rem] bg-[#0a0a0f] border border-cyan-500/45 xl:border-cyan-400/50 shadow-[0_56px_140px_-28px_rgba(0,0,0,1),_0_0_80px_rgba(6,182,212,0.22),_0_0_1px_rgba(6,182,212,0.4)_inset] flex flex-col text-left overflow-hidden xl:shadow-[0_72px_180px_-32px_rgba(0,0,0,1),_0_0_100px_rgba(6,182,212,0.28)]">
        <div className="w-full h-1.5 xl:h-2 bg-gradient-to-r from-transparent via-cyan-400 to-transparent" />
        <div className="p-5 sm:p-7 lg:p-9 xl:p-11 2xl:p-12 border-b border-white/10">
          <div className="mb-3 xl:mb-4">
            <div
              className={`px-3 py-1.5 xl:px-4 xl:py-2 rounded-lg flex items-center gap-2 w-fit border ${
                badgeRose
                  ? 'bg-rose-500/10 border-rose-500/30'
                  : 'bg-cyan-500/10 border-cyan-500/30'
              }`}
            >
              <div className={`w-2 h-2 xl:w-2.5 xl:h-2.5 rounded-full ${badgeRose ? 'bg-rose-500' : 'bg-cyan-400'}`} />
              <span
                className={`text-[10px] xl:text-xs font-bold uppercase tracking-widest ${
                  badgeRose ? 'text-rose-400' : 'text-cyan-400'
                }`}
              >
                {slide.badge}
              </span>
            </div>
          </div>
          <h3 className="text-lg sm:text-xl lg:text-2xl xl:text-3xl 2xl:text-[2rem] font-bold text-white mb-2 lg:mb-3 xl:mb-4 tracking-tight">{slide.title}</h3>
          <p className="text-sm sm:text-[15px] lg:text-base xl:text-lg text-zinc-400 xl:text-zinc-300 max-w-3xl">{slide.subtitle}</p>
        </div>
        <div className="p-5 sm:p-7 lg:p-9 xl:p-11 2xl:p-12 bg-black/40 xl:bg-black/50">
          <div className="p-4 sm:p-5 lg:p-6 xl:p-8 2xl:p-9 rounded-2xl lg:rounded-[1.25rem] xl:rounded-3xl bg-cyan-500/10 border border-cyan-500/30 border-l-4 xl:border-l-[5px] border-l-cyan-500 space-y-2 xl:space-y-3">
            <p className="text-cyan-400 text-[10px] xl:text-xs font-black uppercase tracking-widest flex items-center gap-2">
              <Zap className="w-3 h-3 xl:w-4 xl:h-4 shrink-0" aria-hidden="true" /> Drafted Reply
            </p>
            <p className="text-zinc-200 text-sm sm:text-[15px] lg:text-base xl:text-lg 2xl:text-xl leading-relaxed">{slide.artifact}</p>
          </div>
        </div>
        <div className="p-4 sm:p-5 lg:p-7 xl:p-8 2xl:px-10 2xl:py-9 flex flex-col max-[400px]:flex-col sm:flex-row gap-3 sm:gap-4 xl:gap-5 bg-white/[0.02] border-t border-white/10 max-[400px]:[&>button]:w-full">
          <button
            type="button"
            onClick={advance}
            className="flex-1 min-h-[48px] bg-cyan-500 text-black py-3.5 rounded-xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(6,182,212,0.22)] hover:bg-cyan-400 transition-colors"
          >
            <Check className="w-4 h-4" aria-hidden="true" /> Approve
          </button>
          <button
            type="button"
            onClick={advance}
            className="w-full sm:w-auto sm:px-6 min-h-[48px] bg-zinc-900 border border-white/20 text-zinc-500 py-3.5 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-zinc-800 hover:text-zinc-300 transition-colors"
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// SIGNAL ENGINE HERO — mechanism visualization
// ============================================================================
function SignalEngineHero() {
  return (
    <div className="w-full max-w-[min(100%,112rem)] mx-auto px-4 sm:px-6 lg:px-12 xl:px-16 2xl:px-20 pt-[calc(5rem+env(safe-area-inset-top,0px))] md:pt-[calc(7.5rem+env(safe-area-inset-top,0px))] xl:pt-[calc(8.5rem+env(safe-area-inset-top,0px))] pb-24 md:pb-32 lg:pb-40 xl:pb-44 text-center xl:text-left relative z-10 flex flex-col xl:grid xl:grid-cols-12 xl:items-start xl:gap-x-14 2xl:gap-x-20 min-w-0">
      {/* Headlines & CTA */}
      <Reveal alwaysVisible className="xl:col-span-5 flex flex-col items-center xl:items-start min-w-0 w-full">
        <div className="inline-flex items-center justify-center gap-2 px-4 py-2 xl:px-5 xl:py-2.5 rounded-full bg-white/5 border border-white/10 text-zinc-400 text-[10px] xl:text-[11px] font-black uppercase tracking-[0.2em] mb-4 md:mb-6 xl:mb-8">
          A model of you. One move a day.
        </div>
        <h1 className="text-3xl sm:text-5xl md:text-7xl xl:text-8xl 2xl:[font-size:clamp(4rem,4.2vw+2.25rem,5.75rem)] font-black tracking-tighter text-white mb-5 md:mb-8 xl:mb-10 leading-[1.06] px-1 xl:px-0 max-w-[min(100%,58rem)] xl:max-w-none mx-auto xl:mx-0">
          You missed it.<br className="hidden md:block" /> Foldera didn’t.
        </h1>
        <p className="text-base md:text-xl xl:text-[1.35rem] 2xl:text-2xl text-zinc-400 xl:text-zinc-300 max-w-xl md:max-w-2xl xl:max-w-none mx-auto xl:mx-0 font-medium leading-relaxed mb-7 md:mb-12 xl:mb-10 px-4 xl:px-0">
          One morning email with finished work: approve to send from your mailbox when connected, or skip. Foldera finds what slipped and drafts the move—no extra tabs.
        </p>
        <div className="mb-7 md:mb-12 xl:mb-10 -mt-1 md:-mt-2 xl:mt-0 w-full flex justify-center xl:justify-start">
          <p className="inline-flex items-center gap-2 rounded-full border border-cyan-400/35 bg-cyan-500/10 px-3 py-1.5 xl:px-4 xl:py-2 text-xs xl:text-sm font-black uppercase tracking-[0.14em] text-cyan-100 shadow-[0_0_24px_rgba(6,182,212,0.14)]">
            <Lock className="h-3.5 w-3.5 xl:h-4 xl:w-4 text-cyan-300 shrink-0" aria-hidden="true" />
            No credit card required
          </p>
        </div>
        <div className="w-full max-w-xl md:max-w-2xl xl:max-w-md mx-auto xl:mx-0 px-4 xl:px-0 flex flex-col sm:flex-row items-stretch sm:items-center justify-center xl:justify-start gap-3 sm:gap-4">
          <a
            href="/start"
            className="w-full sm:w-auto xl:w-full xl:max-w-sm min-h-[48px] xl:min-h-[52px] px-8 py-4 xl:py-[1.125rem] rounded-xl bg-white text-black font-black uppercase tracking-[0.15em] text-xs xl:text-sm hover:bg-zinc-200 transition-all duration-150 shadow-[0_0_40px_rgba(255,255,255,0.2)] hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#07070c]"
          >
            Get started free <ChevronRight className="w-4 h-4" />
          </a>
        </div>
        <div className="w-full max-w-xl md:max-w-2xl xl:max-w-none mx-auto xl:mx-0 px-4 xl:px-0">
          <LiveProofStrip />
        </div>
      </Reveal>

      {/* The Mechanism: inputs → convergence → directive */}
      <div className="w-full xl:col-span-7 mt-10 md:mt-20 lg:mt-28 xl:mt-4 relative flex flex-col items-center xl:items-stretch min-w-0">
        {/* Background Glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(96vw,780px)] xl:w-[min(110vw,980px)] h-[min(96vw,780px)] xl:h-[min(110vw,980px)] bg-cyan-500/[0.045] xl:bg-cyan-500/[0.055] blur-[160px] xl:blur-[200px] rounded-full pointer-events-none z-0" />

        {/* Signal chips — abstract inputs (details live on /start) */}
        <div className="flex flex-wrap items-center justify-center xl:justify-end gap-3 sm:gap-5 xl:gap-4 mb-3 xl:mb-4 relative z-10 max-w-3xl xl:max-w-none mx-auto xl:ml-auto xl:mr-0 px-1 xl:pr-2 xl:pl-0">
          <div className="hero-input-chip flex items-center gap-1.5 px-3 py-1.5 xl:px-4 xl:py-2 rounded-full bg-zinc-900/80 border border-zinc-700/50 text-zinc-500 text-[10px] sm:text-[11px] xl:text-xs font-semibold">
            <Zap className="w-3 h-3 xl:w-3.5 xl:h-3.5 text-zinc-500 shrink-0" />
            <span>High-signal items</span>
          </div>
          <div className="hero-input-chip flex items-center gap-1.5 px-3 py-1.5 xl:px-4 xl:py-2 rounded-full bg-zinc-900/80 border border-zinc-700/50 text-zinc-500 text-[10px] sm:text-[11px] xl:text-xs font-semibold">
            <LayoutGrid className="w-3 h-3 xl:w-3.5 xl:h-3.5 text-zinc-500 shrink-0" />
            <span>Cross-thread patterns</span>
          </div>
          <div className="hero-input-chip flex items-center gap-1.5 px-3 py-1.5 xl:px-4 xl:py-2 rounded-full bg-zinc-900/80 border border-zinc-700/50 text-zinc-500 text-[10px] sm:text-[11px] xl:text-xs font-semibold">
            <Brain className="w-3 h-3 xl:w-3.5 xl:h-3.5 text-zinc-500 shrink-0" />
            <span>One ranked move</span>
          </div>
        </div>

        {/* Convergence line + processing dot */}
        <div className="flex flex-col items-center xl:items-end xl:pr-[min(42%,18rem)] my-0 xl:-my-1 relative z-10 w-full">
          <div className="w-[1px] h-5 xl:h-6 bg-gradient-to-b from-zinc-700/0 to-zinc-600/60" />
          <div className="w-7 h-7 xl:w-9 xl:h-9 rounded-full bg-[#0a0a0f] border border-zinc-600/50 flex items-center justify-center hero-process-dot relative">
            <span className="hero-ignition" aria-hidden="true" />
            <Brain className="w-3.5 h-3.5 xl:w-4.5 xl:h-4.5 text-cyan-400/70" />
          </div>
          <div className="w-[1px] h-5 xl:h-6 bg-gradient-to-b from-cyan-500/40 to-cyan-500/0" />
        </div>

        <div className="relative z-20 w-full flex justify-center xl:justify-end xl:pl-4 2xl:pl-8">
          <HeroDirectiveDemo />
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// SCENARIO DEMOS (moved below hero)
// ============================================================================
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
        stage++;
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

  // Auto-play removed — user controls scenario via dots

  const current = SCENARIOS[activeTab];
  const isProcessing = phase === 'chaos' && progress > 40;

  return (
    <div className="w-full max-w-[min(100%,112rem)] mx-auto relative z-10 px-0 sm:px-0 min-w-0">
      <div className={`relative w-full max-w-full h-[440px] sm:h-[520px] md:h-[clamp(560px,50vw,780px)] lg:h-[clamp(600px,48vw,860px)] xl:h-[clamp(640px,44vw,920px)] rounded-[2rem] lg:rounded-[2.5rem] xl:rounded-[2.75rem] bg-black/40 backdrop-blur-3xl border transition-all duration-1000 overflow-hidden shadow-2xl ${
        isProcessing ? 'border-cyan-500/45 shadow-[0_0_80px_-25px_rgba(6,182,212,0.32)]' : 'border-white/10 shadow-[0_40px_100px_-20px_rgba(0,0,0,1)]'
      }`}
      onTouchStart={(e) => { touchStartX.current = e.touches[0]?.clientX ?? null; }}
      onTouchEnd={(e) => {
        if (touchStartX.current === null) return;
        const deltaX = (e.changedTouches[0]?.clientX ?? touchStartX.current) - touchStartX.current;
        if (Math.abs(deltaX) < 36) return;
        if (deltaX < 0) showNext();
        if (deltaX > 0) showPrev();
      }}>
        {/* Window chrome */}
        <div className="absolute top-0 left-0 w-full h-10 md:h-12 bg-white/[0.02] border-b border-white/5 z-40 flex items-center px-3 md:px-4 backdrop-blur-xl">
          <div className="flex gap-2">
            <div className="w-3 h-3 rounded-full bg-zinc-700/50" />
            <div className="w-3 h-3 rounded-full bg-zinc-700/50" />
            <div className="w-3 h-3 rounded-full bg-zinc-700/50" />
          </div>
          <div className="mx-auto flex items-center gap-2 px-3 md:px-4 py-1.5 rounded-full bg-black/50 border border-white/5 text-[9px] md:text-[10px] font-mono text-zinc-500 font-bold uppercase tracking-widest shadow-inner">
            <Lock className="w-3 h-3" /> foldera.engine
          </div>
        </div>
        <div className="absolute top-11 right-3 z-40 md:hidden flex items-center gap-2 px-2.5 py-1 rounded-full border border-cyan-400/25 bg-black/55 text-[9px] text-cyan-300/90 font-black uppercase tracking-[0.16em]">
          <span>Swipe</span>
          <span className="text-cyan-400/80">↔</span>
        </div>

        {/* Subtle background glow */}
        <div className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[150%] h-[150%] bg-[radial-gradient(circle_at_50%_50%,rgba(6,182,212,0.08)_0%,transparent_50%)] transition-opacity duration-1000 pointer-events-none ${
          isProcessing ? 'opacity-100' : 'opacity-30'
        }`} />

        {/* Chaos layer — pointer-events-none always; swipe handled by parent container */}
        <div className={`absolute inset-0 pt-11 md:pt-20 px-4 pb-4 md:p-12 flex flex-col items-center justify-start md:justify-center transition-all duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)] pointer-events-none ${
          phase === 'chaos' ? 'opacity-100 z-10' : 'opacity-0 blur-xl scale-110'
        }`}>
          <div className="w-full max-w-xl md:max-w-2xl relative perspective-1000">
            {current.chaos.map((item, idx) => {
              const rotate = idx % 2 === 0 ? '-2deg' : '2deg';
              const translateX = idx % 2 === 0 ? '-8px' : '8px';
              return (
                <div
                  key={`${activeTab}-${idx}`}
                  className="absolute w-full flex items-center gap-3 md:gap-4 p-3.5 md:p-5 rounded-xl md:rounded-2xl bg-zinc-900/80 backdrop-blur-md border border-white/10 text-[13px] md:text-base text-zinc-200 shadow-2xl transition-all duration-[800ms] ease-out"
                  style={{
                    top: `${idx * 50}px`,
                    zIndex: 10 - idx,
                    transitionDelay: `${idx * 60}ms`,
                    transform: progress > 30
                      ? 'translateZ(-60px) translateY(68px) scale(0.84) rotateX(16deg)'
                      : `translateZ(0) translateY(0) translateX(${translateX}) rotateZ(${rotate})`,
                  }}
                >
                  <div className="p-2 rounded-lg md:rounded-xl bg-black border border-white/10 shadow-inner">
                    <ChaosIcon type={item.type} />
                  </div>
                  <span className="flex-1 font-semibold tracking-tight leading-snug">{item.text}</span>
                  <div className="w-2 h-2 rounded-full bg-zinc-600" />
                </div>
              );
            })}
          </div>
        </div>


        {/* Clarity layer — pointer-events-none always (visual demo only) */}
          <div className={`absolute inset-0 pt-11 md:pt-12 px-4 pb-4 md:p-12 flex items-start md:items-center justify-center transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] z-30 pointer-events-none ${
            phase === 'clarity' ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-12 scale-90'
          }`}>
          <div className="w-full max-w-lg md:max-w-xl lg:max-w-2xl xl:max-w-[min(48rem,92%)] 2xl:max-w-[52rem] rounded-[1.5rem] md:rounded-[2rem] lg:rounded-[2.25rem] xl:rounded-[2.5rem] bg-zinc-950/90 backdrop-blur-2xl border border-cyan-400/30 overflow-hidden shadow-[0_60px_140px_-28px_rgba(0,0,0,1),_0_0_56px_rgba(6,182,212,0.2)] ring-1 ring-cyan-300/15">
            <div className="h-1 xl:h-1.5 w-full bg-gradient-to-r from-cyan-500 to-cyan-300" />
            <div className="p-4 md:p-8 xl:p-10 border-b border-white/5 bg-white/[0.02] flex items-start gap-3 md:gap-4 xl:gap-5 text-left">
              <div className="p-3 md:p-3.5 xl:p-4 rounded-xl md:rounded-2xl bg-cyan-500/12 border border-cyan-400/35 shadow-[inset_0_0_22px_rgba(6,182,212,0.15)] shrink-0">
                <Check className="w-5 h-5 md:w-6 md:h-6 xl:w-7 xl:h-7 text-cyan-400" />
              </div>
              <div className="flex-1 pt-1 min-w-0">
                <p className="text-[10px] xl:text-xs text-cyan-300 font-black uppercase tracking-[0.18em] mb-2 xl:mb-3">Finished work</p>
                <p className="text-white font-black tracking-tight text-base sm:text-xl xl:text-2xl 2xl:text-[1.65rem]">{current.clarity.action}</p>
                <p className="text-zinc-300 font-medium text-[13px] sm:text-sm xl:text-base mt-1.5 xl:mt-2 leading-snug">{current.clarity.subject}</p>
              </div>
            </div>
            <div className="p-4 md:p-8 xl:p-10 space-y-4 md:space-y-5 xl:space-y-6 bg-black/45 text-left">
              <p className="text-zinc-200 leading-relaxed text-[13px] md:text-base xl:text-lg font-medium">{current.clarity.desc}</p>
              <button className="w-full group flex items-center justify-center gap-3 py-3.5 md:py-4 rounded-xl bg-white text-black text-[11px] font-black uppercase tracking-[0.2em] hover:bg-zinc-200 transition-colors duration-200 shadow-[0_0_24px_rgba(255,255,255,0.16)] active:scale-95">
                <Zap className="w-4 h-4 fill-black" />
                {current.clarity.button}
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile controls + pagination */}
      <div className="mt-8 md:mt-14 relative z-10 flex flex-col items-center gap-5 md:gap-8">
        <div className="md:hidden flex items-center gap-2">
          <button
            type="button"
            onClick={showPrev}
            className="min-h-[44px] px-4 rounded-full border border-white/20 bg-zinc-950/80 text-zinc-200 text-[10px] font-black uppercase tracking-[0.16em] active:scale-95 inline-flex items-center justify-center"
            aria-label="Show previous scenario"
          >
            Prev
          </button>
          <button
            type="button"
            onClick={showNext}
            className="min-h-[44px] px-4 rounded-full border border-cyan-400/45 bg-cyan-500/12 text-cyan-100 text-[10px] font-black uppercase tracking-[0.16em] active:scale-95 inline-flex items-center justify-center"
            aria-label="Show next scenario"
          >
            Next
          </button>
        </div>
        <div
          className="flex items-center justify-center gap-3 md:gap-4"
          role="tablist"
          aria-label="Scenario demos"
        >
          {SCENARIOS.map((s, i) => {
            const isActive = activeTab === i;
            return (
              <button
                key={s.id}
                type="button"
                role="tab"
                id={`scenario-tab-${s.id}`}
                aria-selected={isActive}
                aria-label={s.label}
                onClick={() => { setActiveTab(i); }}
                className={`flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-full border-0 bg-transparent p-0 transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400`}
              >
                <span
                  className={`block h-2.5 rounded-full border transition-all duration-300 ${isActive ? 'bg-cyan-300 border-cyan-200 w-11 shadow-[0_0_20px_rgba(34,211,238,0.9)]' : 'bg-zinc-800 border-zinc-600/80 w-5 hover:bg-zinc-700'}`}
                />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// FLIP SECTION
// ============================================================================
const FlipSection = memo(() => {
  const [ref, inView] = useInView(0.2);

  return (
    <section ref={ref as React.RefObject<HTMLElement> as any} className="py-32 md:py-44 lg:py-52 xl:py-56 px-4 sm:px-6 lg:px-12 xl:px-16 2xl:px-20 bg-[#07070c] relative overflow-x-hidden border-t border-white/5">
      <AmbientGrid />
      <div className="max-w-[min(100%,112rem)] mx-auto relative z-10 min-w-0">
        <Reveal>
          <div className="text-center mb-24 md:mb-32 xl:mb-40 max-w-5xl xl:max-w-6xl mx-auto px-2">
            <h2 className="text-3xl sm:text-5xl md:text-6xl xl:text-7xl font-black text-white mb-6 xl:mb-8 tracking-tighter">Same data. Better outcomes.</h2>
            <p className="text-zinc-400 text-xl xl:text-2xl font-medium leading-relaxed">The value isn&apos;t more information. It&apos;s seeing what matters before it becomes a problem.</p>
          </div>
        </Reveal>

        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,0.92fr)_minmax(0,1.12fr)] gap-10 md:gap-12 lg:gap-14 xl:gap-20 relative perspective-1000 items-stretch">
          <div className="hidden md:block absolute left-[47%] top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-white/10 to-transparent" aria-hidden="true" />

          {/* Left — what you see */}
          <div className={`bg-zinc-950/50 backdrop-blur-xl rounded-[2rem] lg:rounded-[2.25rem] xl:rounded-[2.75rem] p-8 md:p-12 lg:p-16 xl:p-14 2xl:p-16 border border-white/5 transition-all duration-1000 text-left md:translate-y-4 xl:translate-y-6 ${inView ? 'opacity-40 grayscale' : 'opacity-0 -translate-x-12'}`}>
            <div className="flex items-center gap-2 mb-10 xl:mb-12 text-zinc-500 text-[11px] xl:text-xs font-black uppercase tracking-widest">
              <Eye className="w-4 h-4 xl:w-5 xl:h-5 shrink-0" /> What you see
            </div>
            <div className="space-y-4 xl:space-y-5">
                {[
                { label: 'Open loops', val: '47', color: 'text-rose-400' },
                { label: 'Slipping deadlines', val: '12', color: 'text-amber-400' },
                { label: 'Stalled decisions', val: '8', color: 'text-zinc-400' },
              ].map((item, i) => (
                <div key={i} className="flex items-center justify-between p-6 xl:p-7 rounded-2xl xl:rounded-[1.35rem] bg-[#0a0a0a] border border-white/5 shadow-inner">
                  <span className="text-zinc-400 font-bold text-base xl:text-lg">{item.label}</span>
                  <span className={`text-2xl xl:text-3xl font-black tabular-nums ${item.color}`}>{item.val}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right — what Foldera sees */}
          <div className={`bg-zinc-950/80 backdrop-blur-2xl rounded-[2rem] lg:rounded-[2.25rem] xl:rounded-[2.75rem] p-8 md:p-12 lg:p-16 xl:p-14 2xl:p-16 border border-cyan-500/30 relative overflow-hidden shadow-[0_0_160px_rgba(6,182,212,0.22)] transition-all duration-1000 delay-150 text-left ${inView ? 'opacity-100 translate-x-0 md:-translate-y-1 xl:-translate-y-2' : 'opacity-0 translate-x-12'}`}>
            <div className="absolute top-0 right-0 w-96 h-96 xl:w-[28rem] xl:h-[28rem] bg-cyan-500/10 blur-[120px] pointer-events-none" aria-hidden="true" />
            <div className="flex items-center gap-3 mb-10 xl:mb-12 text-cyan-400 text-[11px] xl:text-xs font-black uppercase tracking-widest relative z-10">
              <Brain className="w-5 h-5 xl:w-6 xl:h-6 shrink-0" /> What Foldera sees
            </div>
            <div className="space-y-6 xl:space-y-8 relative z-10">
              <div className="p-8 xl:p-10 rounded-2xl xl:rounded-3xl bg-black/80 border border-white/10 shadow-2xl backdrop-blur-md">
                <div className="text-[11px] xl:text-xs font-black uppercase tracking-widest text-white mb-6 xl:mb-7">One thread identified</div>
                <div className="text-zinc-300 text-sm xl:text-base leading-relaxed mb-4 xl:mb-5">Marcus reopened the terms thread Friday. Legal was CC&rsquo;d on the last three rounds. He typically responds within 22 minutes.</div>
                <div className="text-[10px] xl:text-[11px] font-black uppercase tracking-widest text-cyan-400">Pattern Extracted</div>
              </div>
              <div className="p-8 xl:p-10 rounded-2xl xl:rounded-3xl bg-black/50 border border-white/5 relative overflow-hidden group">
                <div className="absolute left-0 top-0 bottom-0 w-1 xl:w-1.5 bg-cyan-400" aria-hidden="true" />
                <div className="text-zinc-600 text-[10px] xl:text-[11px] font-black uppercase tracking-widest mb-3 xl:mb-4">Artifact Ready</div>
                <div className="text-zinc-200 text-sm md:text-base xl:text-lg font-medium leading-relaxed">&ldquo;Hi Marcus — attached are the revised terms with the two changes from Friday. Let me know if legal needs anything else.&rdquo;</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
});
FlipSection.displayName = 'FlipSection';

// ============================================================================
// MATH CONSOLE
// ============================================================================
const MathConsole = memo(() => {
  const [ref, inView] = useInView(0.2);

  return (
    <section ref={ref as React.RefObject<HTMLElement> as any} className="py-36 md:py-44 lg:py-52 xl:py-56 px-4 sm:px-6 lg:px-12 xl:px-16 2xl:px-20 bg-[#07070c] border-y border-white/5 relative overflow-hidden">
      <AmbientGrid />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,rgba(6,182,212,0.08),transparent_60%)] pointer-events-none" aria-hidden="true" />

      <div className="max-w-[min(100%,112rem)] mx-auto relative z-10">
        <Reveal>
          <div className="text-center mb-16 md:mb-24 xl:mb-28 px-2 max-w-5xl xl:max-w-6xl mx-auto">
            <h2 className="text-3xl sm:text-5xl md:text-6xl xl:text-7xl font-black tracking-tighter text-white mb-8 xl:mb-10 break-words">
              You don&apos;t keep track. It does.
            </h2>
            <p className="text-lg sm:text-xl xl:text-2xl text-zinc-400 max-w-2xl xl:max-w-3xl mx-auto font-medium leading-relaxed px-1">
              Deadlines. Replies. Patterns. Risk. Foldera handles the math and gives you the move.
            </p>
          </div>
        </Reveal>

        <Reveal delay={150}>
          <div className="w-full rounded-[2rem] lg:rounded-[2.5rem] xl:rounded-[2.75rem] bg-zinc-950/80 backdrop-blur-2xl border border-white/10 shadow-[0_56px_140px_-28px_rgba(0,0,0,1)] overflow-hidden font-mono text-[11px] sm:text-xs xl:text-sm">
            <div className="h-12 md:h-14 xl:h-16 bg-white/[0.02] border-b border-white/5 flex items-center px-6 md:px-8 xl:px-10 gap-3 backdrop-blur-md">
              <div className="flex gap-2" aria-hidden="true">
                <div className="w-3 h-3 rounded-full bg-zinc-700/50" />
                <div className="w-3 h-3 rounded-full bg-zinc-700/50" />
                <div className="w-3 h-3 rounded-full bg-zinc-700/50" />
              </div>
              <div className="ml-2 text-zinc-500 font-bold tracking-[0.2em] uppercase">How it works</div>
            </div>

            <div className="p-8 md:p-12 lg:p-16 xl:p-[4.5rem] 2xl:p-[5rem] space-y-8 md:space-y-12 xl:space-y-14 text-zinc-400 leading-relaxed bg-black/60 break-words text-left font-sans">
              <div>
                <span className="text-cyan-400 font-bold text-sm xl:text-base">01</span>
                <span className="text-white font-bold text-sm xl:text-lg ml-3">Finds what you missed. Drafts the response.</span>
                <br />
                <span className="text-zinc-600 font-medium mt-2 xl:mt-3 inline-block text-sm xl:text-base">One tap to send — no digging, no rewrites.</span>
              </div>

              <div className={`transition-opacity duration-1000 ${inView ? 'opacity-100' : 'opacity-0'}`} style={{ transitionDelay: '500ms' }}>
                <span className="text-cyan-400 font-bold text-sm xl:text-base">02</span>
                <span className="text-white font-bold text-sm xl:text-lg ml-3">Pick the one thread with the highest stakes</span>
                <br />
                <span className="text-zinc-600 font-medium mt-2 xl:mt-3 inline-block text-sm xl:text-base">Scoring stays backstage. You only see the winner.</span>
              </div>

              <div className={`transition-opacity duration-1000 ${inView ? 'opacity-100' : 'opacity-0'}`} style={{ transitionDelay: '1000ms' }}>
                <span className="text-cyan-400 font-bold text-sm xl:text-base">03</span>
                <span className="text-white font-bold text-sm xl:text-lg ml-3">Draft the finished artifact</span>
                <br />
                <span className="text-zinc-600 font-medium mt-2 xl:mt-3 inline-block text-sm xl:text-base">The reply, document, or decision frame — details already filled in.</span>
              </div>

              <div className={`transition-opacity duration-1000 ${inView ? 'opacity-100' : 'opacity-0'}`} style={{ transitionDelay: '2200ms' }}>
                <span className="text-cyan-400 font-bold text-sm xl:text-base">04</span>
                <span className="text-white font-bold text-sm xl:text-lg ml-3">Deliver one move every morning</span>
                <br />
                <div className="mt-4 xl:mt-6 bg-cyan-500/10 border border-cyan-500/20 p-4 xl:p-5 rounded-xl xl:rounded-2xl inline-block max-w-full">
                  <span className="text-cyan-400 font-bold text-xs sm:text-sm xl:text-base tracking-widest">
                    ONE DIRECTIVE. ONE ARTIFACT. READY TO APPROVE.
                  </span>
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
});
MathConsole.displayName = 'MathConsole';

// ============================================================================
// FEATURE CAROUSEL
// ============================================================================
function FeatureCarousel() {

  return (
    <section id="product" className="py-32 md:py-44 lg:py-52 xl:py-56 relative bg-[#07070c] border-t border-white/5 overflow-x-hidden">
      <AmbientGrid />
      <div className="max-w-[min(100%,112rem)] mx-auto px-4 sm:px-6 lg:px-12 xl:px-16 2xl:px-20 relative z-10 min-w-0">
        <Reveal className="mb-16 md:mb-28 xl:mb-32 text-left md:text-center max-w-5xl xl:max-w-6xl mx-auto">
          <h2 className="text-3xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl font-black tracking-tighter text-white mb-8 xl:mb-10">Stop checking.<br />Start finishing.</h2>
          <p className="text-zinc-400 text-base md:text-2xl xl:text-[1.65rem] font-medium leading-relaxed">Foldera doesn&apos;t ask for more attention. It gives some back.</p>
        </Reveal>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-6 md:gap-10 xl:gap-x-10 xl:gap-y-12">
          {FEATURES.map((feature, i) => {
            const Icon = feature.icon;
            const span =
              i === 0
                ? 'xl:col-span-7 xl:row-span-1'
                : i === 1
                  ? 'xl:col-span-5 xl:row-span-1'
                  : i === 2
                    ? 'xl:col-span-5 xl:row-span-1 xl:row-start-2'
                    : i === 3
                      ? 'xl:col-span-7 xl:row-span-1 xl:row-start-2'
                      : i === 4
                        ? 'xl:col-span-6 xl:row-span-1 xl:row-start-3'
                        : 'xl:col-span-6 xl:row-span-1 xl:row-start-3';
            return (
              <Reveal key={feature.title} delay={i * 100} className={span}>
                <div className={`p-8 sm:p-10 lg:p-14 xl:p-12 2xl:p-14 rounded-[2rem] lg:rounded-[2.25rem] xl:rounded-[2.5rem] bg-zinc-950/80 backdrop-blur-xl border border-white/[0.08] shadow-2xl shadow-black/40 hover:border-cyan-500/30 hover:shadow-[0_0_56px_rgba(6,182,212,0.18)] hover:-translate-y-2 transition-all duration-700 h-full relative overflow-hidden text-left min-w-0 ${i === 0 ? 'xl:min-h-[280px] xl:border-cyan-500/20' : ''}`}>
                  <div className={`rounded-2xl border bg-black border-white/10 flex items-center justify-center mb-8 shadow-inner ${i === 0 ? 'w-16 h-16 xl:w-[4.5rem] xl:h-[4.5rem]' : 'w-14 h-14'}`}>
                    <Icon className={`text-zinc-500 ${i === 0 ? 'w-8 h-8 xl:w-9 xl:h-9' : 'w-7 h-7'}`} />
                  </div>
                  <h3 className={`font-black text-white mb-4 tracking-tight relative z-10 ${i === 0 ? 'text-xl xl:text-2xl' : 'text-xl'}`}>{feature.title}</h3>
                  <p className={`leading-relaxed font-medium relative z-10 text-zinc-400 ${i === 0 ? 'text-base xl:text-lg' : 'text-base xl:text-[1.05rem]'}`}>{feature.desc}</p>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// MAIN PAGE
// ============================================================================
export default function App() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="min-h-[100dvh] bg-[#07070c] text-zinc-50 selection:bg-cyan-500/30 selection:text-white font-sans antialiased overflow-x-hidden">
      <style dangerouslySetInnerHTML={{ __html: `
        html { scroll-behavior: smooth; background: #07070c; }
        ::-webkit-scrollbar { width: 10px; }
        ::-webkit-scrollbar-track { background: #07070c; }
        ::-webkit-scrollbar-thumb { background: #222; border-radius: 10px; border: 2px solid #07070c; }
        .perspective-1000 { perspective: 1000px; }
        .rotate-y-12 { transform: rotateY(12deg); }
        .rotate-y-0 { transform: rotateY(0deg); }
        /* Hero signature motion: inputs -> converge -> ignite -> output */
        .hero-input-chip {
          animation: hero-input-compress 700ms cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        .hero-input-chip:nth-child(1) { animation-delay: 60ms; }
        .hero-input-chip:nth-child(2) { animation-delay: 110ms; }
        .hero-input-chip:nth-child(3) { animation-delay: 160ms; }
        @keyframes hero-input-compress {
          from { opacity: 0.4; transform: translateX(var(--start-x, 0px)) translateY(-2px) scale(0.97); }
          to { opacity: 1; transform: translateX(0) translateY(0) scale(1); }
        }
        .hero-input-chip:nth-child(1) { --start-x: -26px; }
        .hero-input-chip:nth-child(2) { --start-x: 0px; }
        .hero-input-chip:nth-child(3) { --start-x: 26px; }
        .hero-process-dot {
          animation: hero-dot-glow 0.9s ease-out 0.8s both;
        }
        .hero-ignition {
          position: absolute;
          inset: -8px;
          border-radius: 999px;
          pointer-events: none;
          background:
            radial-gradient(circle at 50% 50%, rgba(251,191,36,0.32) 0%, rgba(251,191,36,0) 55%),
            radial-gradient(circle at 50% 50%, rgba(34,211,238,0.22) 0%, rgba(34,211,238,0) 70%);
          animation: hero-ignition-pulse 650ms ease-out 0.95s both;
        }
        @keyframes hero-dot-glow {
          0% { box-shadow: none; border-color: rgba(82,82,91,0.5); }
          45% { box-shadow: 0 0 14px rgba(6,182,212,0.35); border-color: rgba(6,182,212,0.45); }
          100% { box-shadow: 0 0 6px rgba(6,182,212,0.15); border-color: rgba(82,82,91,0.5); }
        }
        @keyframes hero-ignition-pulse {
          0% { opacity: 0; transform: scale(0.72); }
          40% { opacity: 1; transform: scale(1.06); }
          100% { opacity: 0; transform: scale(1.18); }
        }
        .hero-output {
          animation: hero-output-in 500ms ease-out 1.15s both;
        }
        @keyframes hero-output-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          *, ::before, ::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
        }
      `}} />

      <NavPublic scrolled={scrolled} platformHref="#product" />

      <main id="main">
      {/* ── SIGNAL ENGINE HERO — mechanism visualization ── */}
      <section className="relative overflow-hidden border-b border-white/5">
        <AmbientGrid />
        <SignalEngineHero />
      </section>

      {/* ── SCENARIO DEMOS — "with a month of your data" ── */}
      <section className="py-28 md:py-40 lg:py-48 xl:py-52 relative bg-[#07070c] border-t border-white/5 overflow-x-hidden">
        <AmbientGrid />
        <div className="max-w-[min(100%,112rem)] mx-auto px-4 sm:px-6 lg:px-12 xl:px-16 2xl:px-20 relative z-10">
          <Reveal className="text-center mb-12 md:mb-24 xl:mb-28 px-2 sm:px-4 max-w-5xl xl:max-w-6xl mx-auto">
            <h2 className="text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-black tracking-tighter text-white mb-6 xl:mb-8">
              One move changes the outcome.<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 to-cyan-400">
                What you’re already missing
              </span>
            </h2>
            <p className="text-lg md:text-xl xl:text-2xl text-zinc-400 max-w-2xl xl:max-w-3xl mx-auto font-medium leading-relaxed">
              Foldera finds it and gives it to you finished.<br />
              The follow-up you didn&apos;t send.<br />
              The reply that went cold.<br />
              The decision you stalled.
            </p>
          </Reveal>
          <Reveal delay={150}>
            <ScenarioDemos />
          </Reveal>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="py-36 md:py-44 lg:py-52 xl:py-56 relative bg-[#07070c] border-t border-white/5">
        <AmbientGrid />
        <div className="max-w-[min(100%,112rem)] mx-auto px-4 sm:px-6 lg:px-12 xl:px-16 2xl:px-20 relative z-10">
          <Reveal className="mb-20 md:mb-28 xl:mb-32 max-w-4xl xl:max-w-5xl text-left">
            <h2 className="text-3xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl font-black tracking-tighter text-white mb-8 xl:mb-10 break-words">It finds what changed.<br />One decision. Done.</h2>
            <p className="text-lg sm:text-xl md:text-2xl xl:text-[1.65rem] text-zinc-400 max-w-2xl xl:max-w-3xl font-medium leading-relaxed">Not another list. Not another reminder. Foldera sees what is drifting, what is exposed, and what needs action now. Approve it or skip it. No planning. No prompts.</p>
          </Reveal>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-10 lg:gap-12 xl:gap-x-12 xl:gap-y-10">
            {(['Gather', 'Decide', 'Finish'] as const).map((title, i) => (
              <Reveal
                key={i}
                delay={i * 100}
                className={
                  i === 0
                    ? 'md:col-span-7 xl:col-span-7'
                    : i === 1
                      ? 'md:col-span-5 xl:col-span-5 md:row-start-1 md:col-start-8 xl:col-start-8'
                      : 'md:col-span-12 xl:col-span-12 md:max-w-none'
                }
              >
                <div className={`relative p-8 sm:p-10 md:p-12 lg:p-16 xl:p-14 2xl:p-16 rounded-[2rem] lg:rounded-[2.25rem] xl:rounded-[2.75rem] bg-zinc-950/80 backdrop-blur-xl border border-white/[0.08] group hover:border-cyan-500/40 transition-all duration-700 h-full overflow-hidden shadow-2xl shadow-black/40 hover:shadow-[0_0_72px_rgba(6,182,212,0.18)] hover:-translate-y-2 text-left min-w-0 ${i === 2 ? 'md:max-w-3xl xl:max-w-4xl md:mx-auto xl:mx-0 xl:ml-12 2xl:ml-20' : ''}`}>
                  <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-cyan-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                  <div className="absolute -right-6 -bottom-10 text-[180px] font-black text-white/[0.02] leading-none pointer-events-none transition-all duration-700 group-hover:text-cyan-500/[0.05] group-hover:scale-110">{`0${i + 1}`}</div>
                  <h3 className="text-2xl xl:text-3xl font-black text-white mb-6 xl:mb-8 flex flex-col items-start gap-4 tracking-tight">
                    <span className="text-cyan-400 text-[10px] xl:text-[11px] tracking-[0.2em] uppercase font-mono bg-cyan-500/10 border border-cyan-500/20 px-3 py-1.5 xl:px-4 xl:py-2 rounded-md shadow-inner">{`Step 0${i + 1}`}</span>
                    {title}
                  </h3>
                  <p className="text-zinc-400 text-base md:text-lg xl:text-xl leading-relaxed relative z-10 font-medium group-hover:text-zinc-300 transition-colors duration-150">
                    {i === 0 && 'Your context becomes one canvas — before you open a single tool.'}
                    {i === 1 && 'The highest-stakes move surfaces first. Everything else waits.'}
                    {i === 2 && 'Approve and it sends. Skip and the model learns.'}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <FlipSection />
      <MathConsole />

      {/* ── FEATURES ── */}
      <FeatureCarousel />

      {/* ── PRICING ── */}
      <section id="pricing" className="py-36 md:py-44 lg:py-52 border-t border-white/5 relative bg-[#07070c] overflow-hidden">
        <AmbientGrid />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1100px] h-[1100px] bg-[radial-gradient(circle_at_50%_50%,rgba(6,182,212,0.08)_0%,transparent_50%)] pointer-events-none" aria-hidden="true" />
        <Reveal className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-12 xl:px-14 relative z-10 w-full min-w-0">
          <div className="text-center mb-20 md:mb-24">
            <h2 className="text-3xl sm:text-5xl md:text-6xl font-black tracking-tighter text-white mb-5 leading-none">
              Start free.<br />Upgrade when it clicks.
            </h2>
            <p className="text-lg md:text-xl text-zinc-400 max-w-xl mx-auto font-medium leading-relaxed">
              Your first 3 artifacts are on us at full quality. After that, previews stay visible until you go Pro.
            </p>
          </div>

          {/* Free + Pro — one vertical stack, premium weight on Pro */}
          <div className="max-w-2xl mx-auto mb-16 md:mb-24 space-y-6 md:space-y-10 w-full min-w-0">
            <div className="rounded-2xl lg:rounded-[1.35rem] border border-white/10 bg-zinc-950/70 backdrop-blur-sm p-6 sm:p-8 lg:p-10 text-center shadow-inner">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 mb-3">Free</p>
              <div className="flex items-baseline justify-center gap-2 mb-2">
                <span className="text-4xl font-black text-white tracking-tighter">$0</span>
              </div>
              <p className="text-zinc-500 text-sm leading-relaxed">Daily directive plus your first three finished artifacts. No card.</p>
            </div>
            <div className="rounded-[2rem] lg:rounded-[2.25rem] bg-[#0a0a0f] border border-cyan-500/30 p-6 sm:p-10 md:p-12 lg:p-14 xl:p-16 shadow-[0_48px_120px_-24px_rgba(0,0,0,1),0_0_96px_rgba(6,182,212,0.14)]">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-cyan-400 mb-6 bg-cyan-500/10 border border-cyan-500/20 px-4 py-2 rounded-lg inline-block">
                Professional
              </p>
              <div className="flex items-baseline gap-2 mb-3">
                <span className="text-5xl sm:text-6xl font-black text-white tracking-tighter">$29</span>
                <span className="text-zinc-500 font-bold tracking-widest uppercase text-xs">/mo</span>
              </div>
              <p className="text-zinc-400 font-medium mb-8">Finished work, every morning.</p>
              <ul className="space-y-4 mb-10 text-left">
                {[
                  'Drafted emails, ready to send',
                  'Documents and decision frames',
                  'Approve and send in one tap',
                  'Gets smarter every day',
                  'Cancel anytime',
                ].map((f) => (
                  <li key={f} className="flex items-start gap-4 text-white">
                    <div className="p-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 shrink-0 mt-0.5">
                      <Check className="w-3.5 h-3.5 text-cyan-400 shrink-0" aria-hidden="true" />
                    </div>
                    <span className="text-sm font-bold tracking-tight text-zinc-200 leading-relaxed">{f}</span>
                  </li>
                ))}
              </ul>
              <a
                href="/start"
                className="w-full max-w-full min-h-[56px] py-5 mx-0 rounded-2xl bg-white text-black font-black uppercase tracking-[0.15em] text-xs hover:bg-zinc-200 transition-all duration-150 flex items-center justify-center gap-3 shadow-[0_0_40px_rgba(255,255,255,0.2)] hover:scale-[1.02] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#07070c]"
              >
                Get started free <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </a>
              <p className="text-center text-zinc-600 text-xs mt-4">
                No credit card required. First 3 artifacts free.
              </p>
            </div>
          </div>

          {/* FAQ */}
          <div className="max-w-2xl xl:max-w-[44rem] mx-auto">
            {[
              { q: "What's free?", a: "Daily directives (the read) plus your first 3 full artifacts. No card required." },
              { q: "What's Pro?", a: "Unlimited artifacts. Drafted emails, documents, and decision frames delivered every morning." },
              { q: "Can I cancel?", a: "Anytime. No contracts." },
              { q: "Is my data safe?", a: "AES-256 encryption. Your data never trains anyone else's model. Delete everything anytime." },
            ].map(({ q, a }) => (
              <div key={q} className="mb-8">
                <p className="text-white font-bold text-sm mb-2">{q}</p>
                <p className="text-zinc-400 text-sm">{a}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-white/5 py-24 md:py-28 bg-[#07070c] relative overflow-hidden">
        <AmbientGrid />
        <div className="max-w-[min(100%,112rem)] mx-auto px-4 sm:px-6 lg:px-12 xl:px-16 2xl:px-20 relative z-10">
          <div className="flex flex-col md:flex-row items-center justify-between gap-12">
            <div className="flex flex-col gap-5 text-center md:text-left">
              <div className="flex items-center justify-center md:justify-start gap-3">
                <FolderaMark className="shadow-[0_0_20px_rgba(255,255,255,0.2)]" />
                <span className="text-xl font-black tracking-tighter text-white uppercase">Foldera</span>
              </div>
              <p className="text-zinc-500 text-[11px] uppercase tracking-[0.2em] font-black max-w-sm leading-relaxed text-left">Finished work, every morning.</p>
            </div>
            <nav className="flex flex-wrap justify-center items-center gap-x-6 gap-y-2 text-[10px] text-zinc-500 font-black uppercase tracking-[0.2em]">
              <a href="#product" className="hover:text-white transition-colors min-h-[44px] min-w-[44px] inline-flex items-center justify-center px-2">Platform</a>
              <a href="/pricing" className="hover:text-white transition-colors min-h-[44px] min-w-[44px] inline-flex items-center justify-center px-2">Pricing</a>
              <a href="/blog" className="hover:text-white transition-colors min-h-[44px] min-w-[44px] inline-flex items-center justify-center px-2">Blog</a>
              <a href="/login" className="hover:text-white transition-colors min-h-[44px] min-w-[44px] inline-flex items-center justify-center px-2">Sign in</a>
            </nav>
          </div>
          <div className="mt-20 pt-10 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="flex items-center justify-center gap-6">
              <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/[0.02] border border-white/10 text-[10px] text-zinc-400 font-black tracking-widest uppercase shadow-inner">
                <Lock className="w-3.5 h-3.5" aria-hidden="true" /> AES-256
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-4 md:gap-6 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-600 text-center md:text-right">
              <a href="/privacy" className="hover:text-zinc-400 transition-colors min-h-[44px] min-w-[44px] inline-flex items-center justify-center px-2">Privacy</a>
              <a href="/terms" className="hover:text-zinc-400 transition-colors min-h-[44px] min-w-[44px] inline-flex items-center justify-center px-2">Terms</a>
              <p suppressHydrationWarning>
                &copy; {new Date().getFullYear()} Foldera AI &bull; Built for execution
              </p>
            </div>
          </div>
        </div>
      </footer>
      </main>
    </div>
  );
}
