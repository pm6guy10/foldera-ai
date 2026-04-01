'use client';

import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import { useSession } from 'next-auth/react';
import {
  ArrowRight, Check, Mail, Calendar, MessageSquare,
  Zap, Brain, Briefcase, Code, Coffee, Database, Shield,
  Globe, Layers, Terminal, FileText, AlertCircle,
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

interface NavigationProps {
  scrolled: boolean;
  isLoggedIn?: boolean;
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
  { icon: Database, title: 'It reads your history', desc: 'Email, calendar, conversations. Foldera ingests what you\u2019ve already written and finds the patterns you can\u2019t see from inside them.' },
  { icon: Brain, title: 'It picks the one thing', desc: 'Dozens of threads, one winner. The engine scores what matters most and ignores the rest.' },
  { icon: Zap, title: 'It drafts the email', desc: 'No prompting. No chatting. You wake up to a finished draft \u2014 ready to send with one tap.' },
  { icon: Shield, title: 'It stays private', desc: 'Your data never trains anyone else\u2019s model. AES-256 encryption. Delete everything anytime.' },
  { icon: Terminal, title: 'It gets smarter', desc: 'Every approval and every skip teaches the engine what matters to you. Day 30 is unrecognizable from day 1.' },
  { icon: Layers, title: 'It replaces the system', desc: 'Not another app to check. The whole point is that you stop managing and start deciding yes or no.' },
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
      className="w-full max-w-2xl mt-4 md:mt-5 rounded-xl border border-white/10 bg-white/[0.02] backdrop-blur-sm px-4 sm:px-5 py-3 text-left shadow-[inset_0_0_24px_rgba(6,182,212,0.06)]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 mb-1.5">What Foldera catches</p>
      <div className="h-11 sm:h-10 overflow-hidden">
        <p
          key={index}
          className={`text-sm sm:text-[15px] leading-5 text-zinc-200 transition-all duration-150 ${
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
// SIGNAL ENGINE HERO — mechanism visualization
// ============================================================================
function SignalEngineHero() {
  return (
    <div className="w-full max-w-6xl mx-auto px-6 pt-20 md:pt-28 pb-12 md:pb-20 text-center relative z-10 flex flex-col items-center">
      {/* Headlines & CTA */}
      <Reveal alwaysVisible>
        <div className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-zinc-400 text-[10px] font-black uppercase tracking-[0.2em] mb-4 md:mb-6">
          A model of you. One move a day.
        </div>
        <h1 className="text-4xl md:text-6xl lg:text-7xl font-black tracking-tighter text-white mb-4 md:mb-5 leading-[1.08]">
          You missed it.<br className="hidden md:block" /> Foldera didn’t.
        </h1>
        <p className="text-base md:text-xl text-zinc-400 max-w-2xl mx-auto font-medium leading-relaxed mb-5 md:mb-8">
          Your inbox isn&apos;t random. There&apos;s a pattern in what slips, stalls, and gets ignored. Foldera finds it, picks what matters, and hands it back finished.
        </p>
        <div className="mb-5 md:mb-8 -mt-2 md:-mt-4">
          <p className="inline-flex items-center gap-2 rounded-full border border-cyan-400/35 bg-cyan-500/10 px-3 py-1.5 text-xs font-black uppercase tracking-[0.14em] text-cyan-100 shadow-[0_0_24px_rgba(6,182,212,0.14)]">
            <Lock className="h-3.5 w-3.5 text-cyan-300" aria-hidden="true" />
            No credit card required
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
          <a
            href="/start"
            className="w-full sm:w-auto px-8 py-4 rounded-xl bg-white text-black font-black uppercase tracking-[0.15em] text-xs hover:bg-zinc-200 transition-all shadow-[0_0_40px_rgba(255,255,255,0.2)] hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2"
          >
            Get started free <ChevronRight className="w-4 h-4" />
          </a>
        </div>
        <LiveProofStrip />
      </Reveal>

      {/* The Mechanism: inputs → convergence → directive */}
      <div className="w-full mt-6 md:mt-14 relative flex flex-col items-center">
        {/* Background Glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[440px] h-[440px] bg-cyan-500/[0.025] blur-[140px] rounded-full pointer-events-none z-0" />

        {/* Signal input chips — what Foldera reads */}
        <div className="flex items-center justify-center gap-3 sm:gap-4 mb-1 relative z-10">
          <div className="hero-input-chip flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-900/80 border border-zinc-700/50 text-zinc-500 text-[10px] sm:text-[11px] font-semibold">
            <Mail className="w-3 h-3 text-zinc-500" />
            <span>23 emails</span>
          </div>
          <div className="hero-input-chip flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-900/80 border border-zinc-700/50 text-zinc-500 text-[10px] sm:text-[11px] font-semibold">
            <Calendar className="w-3 h-3 text-zinc-500" />
            <span>8 events</span>
          </div>
          <div className="hero-input-chip flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-900/80 border border-zinc-700/50 text-zinc-500 text-[10px] sm:text-[11px] font-semibold">
            <MessageSquare className="w-3 h-3 text-zinc-500" />
            <span>3 threads</span>
          </div>
        </div>

        {/* Convergence line + processing dot */}
        <div className="flex flex-col items-center my-0 relative z-10">
          <div className="w-[1px] h-5 bg-gradient-to-b from-zinc-700/0 to-zinc-600/60" />
          <div className="w-7 h-7 rounded-full bg-[#0a0a0f] border border-zinc-600/50 flex items-center justify-center hero-process-dot relative">
            <span className="hero-ignition" aria-hidden="true" />
            <Brain className="w-3.5 h-3.5 text-cyan-400/70" />
          </div>
          <div className="w-[1px] h-5 bg-gradient-to-b from-cyan-500/40 to-cyan-500/0" />
        </div>

        {/* Directive Output Card — visual demo only, not interactive */}
        <div className="relative z-30 w-full max-w-[420px] hero-output pointer-events-none">
          <div className="rounded-[2rem] bg-[#0a0a0f] border border-cyan-500/40 shadow-[0_40px_100px_-20px_rgba(0,0,0,1),_0_0_50px_rgba(6,182,212,0.15)] flex flex-col text-left overflow-hidden">
            <div className="w-full h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent" />
            <div className="p-5 sm:p-6 border-b border-white/10">
              <div className="mb-3">
                <div className="px-3 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/30 flex items-center gap-2 w-fit">
                  <div className="w-2 h-2 rounded-full bg-rose-500" />
                  <span className="text-rose-400 text-[10px] font-bold uppercase tracking-widest">Blocks 3 Team Members</span>
                </div>
              </div>
              <h3 className="text-lg sm:text-xl font-bold text-white mb-2">Finalize Q3 Projections</h3>
              <p className="text-sm text-zinc-400">Reopened 4 times. Waiting on your approval to unblock the team.</p>
            </div>
            <div className="p-5 sm:p-6 bg-black/40">
              <div className="p-4 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 space-y-2">
                <p className="text-cyan-400 text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                  <Zap className="w-3 h-3" /> Drafted Reply
                </p>
                <p className="text-zinc-200 text-sm leading-relaxed">
                  &quot;Hi team, attached are the finalized numbers before the board meeting. We&apos;ve adjusted the forecast based on recent churn...&quot;
                </p>
              </div>
            </div>
            <div className="p-4 flex gap-3 bg-white/[0.02] border-t border-white/10">
              <button type="button" className="flex-1 bg-cyan-500 text-black py-3.5 rounded-xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(6,182,212,0.22)]">
                <Check className="w-4 h-4" /> Approve
              </button>
              <button type="button" className="px-6 bg-zinc-900 border border-white/20 text-zinc-500 py-3.5 rounded-xl font-black text-xs uppercase tracking-widest flex items-center justify-center">
                Skip
              </button>
            </div>
          </div>
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
    <div className="w-full max-w-6xl mx-auto relative z-10 px-4 sm:px-6">
      <div className={`relative w-full h-[380px] sm:h-[470px] md:h-auto md:aspect-[21/10] rounded-[2rem] bg-black/40 backdrop-blur-3xl border transition-all duration-1000 overflow-hidden shadow-2xl ${
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
          <div className="w-full max-w-xl relative perspective-1000">
            {current.chaos.map((item, idx) => {
              const rotate = idx % 2 === 0 ? '-2deg' : '2deg';
              const translateX = idx % 2 === 0 ? '-15px' : '15px';
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
          <div className="w-full max-w-lg rounded-[1.5rem] md:rounded-[2rem] bg-zinc-950/90 backdrop-blur-2xl border border-cyan-400/30 overflow-hidden shadow-[0_44px_100px_-20px_rgba(0,0,0,1),_0_0_40px_rgba(6,182,212,0.14)] ring-1 ring-cyan-300/15">
            <div className="h-1 w-full bg-gradient-to-r from-cyan-500 to-cyan-300" />
            <div className="p-4 md:p-8 border-b border-white/5 bg-white/[0.02] flex items-start gap-3 md:gap-4 text-left">
              <div className="p-3 md:p-3.5 rounded-xl md:rounded-2xl bg-cyan-500/12 border border-cyan-400/35 shadow-[inset_0_0_22px_rgba(6,182,212,0.15)]">
                <Check className="w-5 h-5 md:w-6 md:h-6 text-cyan-400" />
              </div>
              <div className="flex-1 pt-1">
                <p className="text-[10px] text-cyan-300 font-black uppercase tracking-[0.18em] mb-2">Finished work</p>
                <p className="text-white font-black tracking-tight text-base sm:text-xl">{current.clarity.action}</p>
                <p className="text-zinc-300 font-medium text-[13px] sm:text-sm mt-1.5 leading-snug">{current.clarity.subject}</p>
              </div>
            </div>
            <div className="p-4 md:p-8 space-y-4 md:space-y-5 bg-black/45 text-left">
              <p className="text-zinc-200 leading-relaxed text-[13px] md:text-base font-medium">{current.clarity.desc}</p>
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
      <div className="mt-4 md:mt-10 relative z-10 flex flex-col items-center gap-3 md:gap-4">
        <div className="md:hidden flex items-center gap-2">
          <button
            type="button"
            onClick={showPrev}
            className="px-3.5 py-2 rounded-full border border-white/20 bg-zinc-950/80 text-zinc-200 text-[10px] font-black uppercase tracking-[0.16em] active:scale-95"
            aria-label="Show previous scenario"
          >
            Prev
          </button>
          <button
            type="button"
            onClick={showNext}
            className="px-3.5 py-2 rounded-full border border-cyan-400/45 bg-cyan-500/12 text-cyan-100 text-[10px] font-black uppercase tracking-[0.16em] active:scale-95"
            aria-label="Show next scenario"
          >
            Next
          </button>
        </div>
        <div className="flex items-center justify-center gap-3 md:gap-4">
          {SCENARIOS.map((s, i) => {
            const isActive = activeTab === i;
            return (
              <button
                key={s.id}
                onClick={() => { setActiveTab(i); }}
                className={`h-2.5 rounded-full border transition-all duration-300 ${isActive ? 'bg-cyan-300 border-cyan-200 w-11 shadow-[0_0_20px_rgba(34,211,238,0.9)]' : 'bg-zinc-800 border-zinc-600/80 w-5 hover:bg-zinc-700'}`}
                aria-label={`Scenario ${i + 1}: ${s.label}`}
                aria-current={isActive ? 'true' : 'false'}
              />
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
    <section ref={ref as React.RefObject<HTMLElement> as any} className="py-36 px-6 bg-[#07070c] relative overflow-hidden border-t border-white/5">
      <AmbientGrid />
      <div className="max-w-6xl mx-auto relative z-10">
        <Reveal>
          <div className="text-center mb-24">
            <h2 className="text-5xl md:text-6xl font-black text-white mb-6 tracking-tighter">Same data. Better outcomes.</h2>
            <p className="text-zinc-400 text-xl font-medium">The value isn&apos;t more information. It&apos;s seeing what matters before it becomes a problem.</p>
          </div>
        </Reveal>

        <div className="grid md:grid-cols-2 gap-8 relative perspective-1000">
          <div className="hidden md:block absolute left-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-white/10 to-transparent" aria-hidden="true" />

          {/* Left — what you see */}
          <div className={`bg-zinc-950/50 backdrop-blur-xl rounded-[2rem] p-8 md:p-12 border border-white/5 transition-all duration-1000 text-left ${inView ? 'opacity-40 grayscale' : 'opacity-0 -translate-x-12'}`}>
            <div className="flex items-center gap-2 mb-10 text-zinc-500 text-[11px] font-black uppercase tracking-widest">
              <Eye className="w-4 h-4" /> What you see
            </div>
            <div className="space-y-4">
              {[
                { label: 'Unread emails', val: '47', color: 'text-rose-400' },
                { label: 'Overdue tasks', val: '12', color: 'text-amber-400' },
                { label: 'Pending decisions', val: '8', color: 'text-zinc-400' },
              ].map((item, i) => (
                <div key={i} className="flex items-center justify-between p-6 rounded-2xl bg-[#0a0a0a] border border-white/5 shadow-inner">
                  <span className="text-zinc-400 font-bold">{item.label}</span>
                  <span className={`text-2xl font-black ${item.color}`}>{item.val}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right — what Foldera sees */}
          <div className={`bg-zinc-950/80 backdrop-blur-2xl rounded-[2rem] p-8 md:p-12 border border-cyan-500/30 relative overflow-hidden shadow-[0_0_120px_rgba(6,182,212,0.15)] transition-all duration-1000 delay-150 text-left ${inView ? 'opacity-100 translate-x-0 -translate-y-2' : 'opacity-0 translate-x-12'}`}>
            <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/10 blur-[120px] pointer-events-none" aria-hidden="true" />
            <div className="flex items-center gap-3 mb-10 text-cyan-400 text-[11px] font-black uppercase tracking-widest relative z-10">
              <Brain className="w-5 h-5" /> What Foldera sees
            </div>
            <div className="space-y-6 relative z-10">
              <div className="p-8 rounded-2xl bg-black/80 border border-white/10 shadow-2xl backdrop-blur-md">
                <div className="text-[11px] font-black uppercase tracking-widest text-white mb-6">One thread identified</div>
                <div className="text-zinc-300 text-sm leading-relaxed mb-4">Marcus reopened the terms thread Friday. Legal was CC&rsquo;d on the last three rounds. He typically responds within 22 minutes.</div>
                <div className="text-[10px] font-black uppercase tracking-widest text-cyan-400">Pattern Extracted</div>
              </div>
              <div className="p-8 rounded-2xl bg-black/50 border border-white/5 relative overflow-hidden group">
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-cyan-400" aria-hidden="true" />
                <div className="text-zinc-600 text-[10px] font-black uppercase tracking-widest mb-3">Artifact Ready</div>
                <div className="text-zinc-200 text-sm md:text-base font-medium leading-relaxed">&ldquo;Hi Marcus — attached are the revised terms with the two changes from Friday. Let me know if legal needs anything else.&rdquo;</div>
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
    <section ref={ref as React.RefObject<HTMLElement> as any} className="py-36 px-6 bg-[#07070c] border-y border-white/5 relative overflow-hidden">
      <AmbientGrid />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,rgba(6,182,212,0.08),transparent_60%)] pointer-events-none" aria-hidden="true" />

      <div className="max-w-4xl mx-auto relative z-10">
        <Reveal>
          <div className="text-center mb-20">
            <h2 className="text-5xl md:text-6xl font-black tracking-tighter text-white mb-8">
              You don&apos;t keep track. It does.
            </h2>
            <p className="text-xl text-zinc-400 max-w-2xl mx-auto font-medium leading-relaxed">
              Deadlines. Replies. Patterns. Risk. Foldera handles the math and gives you the move.
            </p>
          </div>
        </Reveal>

        <Reveal delay={150}>
          <div className="w-full rounded-[2rem] bg-zinc-950/80 backdrop-blur-2xl border border-white/10 shadow-[0_40px_100px_-20px_rgba(0,0,0,1)] overflow-hidden font-mono text-[11px] sm:text-xs">
            <div className="h-12 bg-white/[0.02] border-b border-white/5 flex items-center px-6 gap-3 backdrop-blur-md">
              <div className="flex gap-2" aria-hidden="true">
                <div className="w-3 h-3 rounded-full bg-zinc-700/50" />
                <div className="w-3 h-3 rounded-full bg-zinc-700/50" />
                <div className="w-3 h-3 rounded-full bg-zinc-700/50" />
              </div>
              <div className="ml-2 text-zinc-500 font-bold tracking-[0.2em] uppercase">How it works</div>
            </div>

            <div className="p-8 md:p-12 space-y-8 text-zinc-400 leading-relaxed bg-black/60 break-words text-left font-sans">
              <div>
                <span className="text-cyan-400 font-bold text-sm">01</span>
                <span className="text-white font-bold text-sm ml-3">Read your email, calendar, and conversations</span>
                <br />
                <span className="text-zinc-600 font-medium mt-2 inline-block text-sm">Pull the unfinished threads that actually matter.</span>
              </div>

              <div className={`transition-opacity duration-1000 ${inView ? 'opacity-100' : 'opacity-0'}`} style={{ transitionDelay: '500ms' }}>
                <span className="text-cyan-400 font-bold text-sm">02</span>
                <span className="text-white font-bold text-sm ml-3">Pick the one thread with the highest stakes</span>
                <br />
                <span className="text-zinc-600 font-medium mt-2 inline-block text-sm">Scoring stays backstage. You only see the winner.</span>
              </div>

              <div className={`transition-opacity duration-1000 ${inView ? 'opacity-100' : 'opacity-0'}`} style={{ transitionDelay: '1000ms' }}>
                <span className="text-cyan-400 font-bold text-sm">03</span>
                <span className="text-white font-bold text-sm ml-3">Draft the finished artifact</span>
                <br />
                <span className="text-zinc-600 font-medium mt-2 inline-block text-sm">The email, document, or calendar hold — with the details already filled in.</span>
              </div>

              <div className={`transition-opacity duration-1000 ${inView ? 'opacity-100' : 'opacity-0'}`} style={{ transitionDelay: '2200ms' }}>
                <span className="text-cyan-400 font-bold text-sm">04</span>
                <span className="text-white font-bold text-sm ml-3">Deliver one read to your inbox</span>
                <br />
                <div className="mt-4 bg-cyan-500/10 border border-cyan-500/20 p-4 rounded-xl inline-block">
                  <span className="text-cyan-400 font-bold text-xs sm:text-sm tracking-widest">
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
    <section id="product" className="py-36 relative bg-[#07070c] border-t border-white/5">
      <AmbientGrid />
      <div className="max-w-6xl mx-auto px-6 relative z-10">
        <Reveal className="mb-20 text-left md:text-center">
          <h2 className="text-5xl md:text-6xl lg:text-7xl font-black tracking-tighter text-white mb-8">Stop checking.<br />Start finishing.</h2>
          <p className="text-zinc-400 text-xl md:text-2xl font-medium">Foldera doesn&apos;t ask for more attention. It gives some back.</p>
        </Reveal>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
          {FEATURES.map((feature, i) => {
            const Icon = feature.icon;
            return (
              <Reveal key={feature.title} delay={i * 100}>
                <div className="p-10 rounded-[2rem] bg-zinc-950/80 backdrop-blur-xl border border-white/[0.08] shadow-2xl shadow-black/40 hover:border-cyan-500/30 hover:shadow-[0_0_50px_rgba(6,182,212,0.15)] hover:-translate-y-2 transition-all duration-700 h-full relative overflow-hidden text-left">
                  <div className="w-14 h-14 rounded-2xl border bg-black border-white/10 flex items-center justify-center mb-8 shadow-inner">
                    <Icon className="w-7 h-7 text-zinc-500" />
                  </div>
                  <h3 className="text-xl font-black text-white mb-4 tracking-tight relative z-10">{feature.title}</h3>
                  <p className="text-base leading-relaxed font-medium relative z-10 text-zinc-400">{feature.desc}</p>
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
// NAVIGATION
// ============================================================================
function Navigation({ scrolled, isLoggedIn }: NavigationProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const navLinks = [
    { label: 'Platform', href: '#product' },
    { label: 'Pricing', href: '#pricing' },
    { label: 'Blog', href: '/blog' },
  ];

  return (
    <nav className={`fixed top-0 w-full z-50 transition-all duration-500 ${
      scrolled
        ? 'bg-black/90 backdrop-blur-2xl border-b border-white/5 py-4 shadow-2xl'
        : 'bg-transparent py-4 md:py-8'
    }`}>
      <div className="max-w-6xl mx-auto px-6 flex items-center justify-between">
        <a href="/" className="flex items-center gap-3 group cursor-pointer focus:outline-none">
          <div className="w-10 h-10 rounded-2xl bg-white text-black flex items-center justify-center group-hover:scale-105 transition-transform shadow-[0_0_30px_rgba(255,255,255,0.3)]">
            <Layers className="w-5 h-5 fill-black" aria-hidden="true" />
          </div>
          <span className="hidden sm:inline text-xl font-black tracking-tighter text-white uppercase">Foldera</span>
        </a>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-12 text-[11px] font-black uppercase tracking-[0.2em] text-zinc-500">
          {navLinks.map((l) => (
            <a key={l.label} href={l.href} className="hover:text-white transition-colors">{l.label}</a>
          ))}
        </div>

        <div className="flex items-center gap-4">
          {isLoggedIn ? (
            <a href="/dashboard" className="px-5 md:px-7 py-2.5 md:py-3 rounded-full bg-white text-black text-[10px] md:text-[11px] font-black uppercase tracking-[0.2em] hover:bg-zinc-200 transition-all flex items-center gap-2 hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(255,255,255,0.2)]">
              Dashboard <ChevronRight className="w-4 h-4" />
            </a>
          ) : (
            <>
              <a href="/login" className="hidden sm:block text-[11px] font-black uppercase tracking-[0.2em] text-zinc-500 hover:text-white transition-colors">
                Sign in
              </a>
              <a href="/start" className="hidden sm:flex px-5 md:px-7 py-2.5 md:py-3 rounded-full bg-white text-black text-[10px] md:text-[11px] font-black uppercase tracking-[0.2em] hover:bg-zinc-200 transition-all items-center gap-2 hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(255,255,255,0.2)]">
                Get started free <ChevronRight className="w-4 h-4" />
              </a>
              {/* Hamburger — mobile only */}
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className="sm:hidden flex flex-col items-center justify-center gap-[5px] w-10 h-10 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors focus:outline-none"
                aria-label={menuOpen ? 'Close menu' : 'Open menu'}
                aria-expanded={menuOpen}
              >
                <span className={`w-5 h-0.5 bg-white transition-all duration-200 ${menuOpen ? 'rotate-45 translate-y-[7px]' : ''}`} />
                <span className={`w-5 h-0.5 bg-white transition-all duration-200 ${menuOpen ? 'opacity-0' : ''}`} />
                <span className={`w-5 h-0.5 bg-white transition-all duration-200 ${menuOpen ? '-rotate-45 -translate-y-[7px]' : ''}`} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Mobile dropdown */}
      {menuOpen && (
        <div className="sm:hidden absolute top-full left-0 w-full bg-black/95 backdrop-blur-2xl border-b border-white/10 px-6 py-5 flex flex-col gap-4 shadow-2xl">
          {navLinks.map((l) => (
            <a
              key={l.label}
              href={l.href}
              onClick={() => setMenuOpen(false)}
              className="text-[13px] font-black uppercase tracking-[0.2em] text-zinc-400 hover:text-white transition-colors py-1"
            >
              {l.label}
            </a>
          ))}
          <div className="border-t border-white/10 pt-4 flex flex-col gap-3">
            <a href="/login" className="text-[13px] font-black uppercase tracking-[0.2em] text-zinc-500 hover:text-white transition-colors py-1">
              Sign in
            </a>
            <a
              href="/start"
              className="w-full py-3.5 rounded-xl bg-white text-black text-[11px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2 active:scale-95 shadow-[0_0_20px_rgba(255,255,255,0.15)]"
            >
              Get started free <ChevronRight className="w-4 h-4" />
            </a>
          </div>
        </div>
      )}
    </nav>
  );
}

// ============================================================================
// MAIN PAGE
// ============================================================================
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

      <Navigation scrolled={scrolled} isLoggedIn={isLoggedIn} />

      {/* ── SIGNAL ENGINE HERO — mechanism visualization ── */}
      <section className="relative overflow-hidden border-b border-white/5">
        <AmbientGrid />
        <SignalEngineHero />
      </section>

      {/* ── SCENARIO DEMOS — "with a month of your data" ── */}
      <section className="py-20 md:py-32 relative bg-[#07070c] border-t border-white/5 overflow-hidden">
        <AmbientGrid />
        <div className="max-w-6xl mx-auto relative z-10">
          <Reveal className="text-center mb-8 md:mb-16 px-6">
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-black tracking-tighter text-white mb-6">
              One move changes the outcome.<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 to-cyan-400">
                What you’re already missing
              </span>
            </h2>
            <p className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto font-medium leading-relaxed">
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
      <section className="py-32 md:py-36 relative bg-[#07070c] border-t border-white/5">
        <AmbientGrid />
        <div className="max-w-6xl mx-auto px-6 relative z-10">
          <Reveal className="mb-16 md:mb-20 max-w-4xl text-left">
            <h2 className="text-5xl md:text-6xl lg:text-7xl font-black tracking-tighter text-white mb-8">It finds what changed.<br />One decision. Done.</h2>
            <p className="text-xl md:text-2xl text-zinc-400 max-w-2xl font-medium leading-relaxed">Not another list. Not another reminder. Foldera sees what is drifting, what is exposed, and what needs action now. Approve it or skip it. No planning. No prompts.</p>
          </Reveal>

          <div className="grid md:grid-cols-3 gap-8">
            {(['Connect', 'Decide', 'Execute'] as const).map((title, i) => (
              <Reveal key={i} delay={i * 100}>
                <div className="relative p-10 md:p-12 rounded-[2rem] bg-zinc-950/80 backdrop-blur-xl border border-white/[0.08] group hover:border-cyan-500/40 transition-all duration-700 h-full overflow-hidden shadow-2xl shadow-black/40 hover:shadow-[0_0_60px_rgba(6,182,212,0.15)] hover:-translate-y-2 text-left">
                  <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-cyan-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                  <div className="absolute -right-6 -bottom-10 text-[180px] font-black text-white/[0.02] leading-none pointer-events-none transition-all duration-700 group-hover:text-cyan-500/[0.05] group-hover:scale-110">{`0${i + 1}`}</div>
                  <h3 className="text-2xl font-black text-white mb-6 flex flex-col items-start gap-4 tracking-tight">
                    <span className="text-cyan-400 text-[10px] tracking-[0.2em] uppercase font-mono bg-cyan-500/10 border border-cyan-500/20 px-3 py-1.5 rounded-md shadow-inner">{`Step 0${i + 1}`}</span>
                    {title}
                  </h3>
                  <p className="text-zinc-400 text-base md:text-lg leading-relaxed relative z-10 font-medium group-hover:text-zinc-300 transition-colors">
                    {i === 0 && 'It reads what already happened.'}
                    {i === 1 && 'It finds the one move that changes the outcome.'}
                    {i === 2 && 'It gives it back ready to send.'}
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
      <section id="pricing" className="py-32 md:py-40 border-t border-white/5 relative bg-[#07070c] overflow-hidden">
        <AmbientGrid />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[1000px] bg-[radial-gradient(circle_at_50%_50%,rgba(6,182,212,0.08)_0%,transparent_50%)] pointer-events-none" aria-hidden="true" />
        <Reveal className="max-w-6xl mx-auto px-6 relative z-10">
          <div className="text-center mb-16 md:mb-20">
            <h2 className="text-5xl md:text-7xl font-black tracking-tighter text-white mb-6 leading-none">One plan.<br />No decisions.</h2>
            <p className="text-zinc-400 text-xl font-medium tracking-tight">Start reading for free. Upgrade when you want the finished work.</p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">

            {/* FREE */}
            <div className="rounded-[2.5rem] bg-zinc-950/80 border border-white/10 p-10 md:p-12 flex flex-col">
              <div className="mb-8">
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-zinc-400 mb-4 bg-white/5 border border-white/10 px-4 py-2 rounded-lg inline-block">
                  Free forever
                </p>
                <div className="flex items-baseline gap-2">
                  <span className="text-6xl font-black text-white tracking-tighter">$0</span>
                  <span className="text-zinc-500 font-bold tracking-widest uppercase text-xs">/mo</span>
                </div>
                <p className="text-zinc-400 text-sm mt-3 leading-relaxed font-medium">
                  The read — one directive every morning that tells you what matters.
                </p>
              </div>
              <ul className="space-y-4 mb-10 flex-1">
                {['Email + calendar sync', 'One directive every morning', 'See what matters and why', 'Approve or skip in one tap', 'Encrypted at rest'].map((f) => (
                  <li key={f} className="flex items-center gap-4 text-zinc-300">
                    <div className="p-1 rounded-full bg-white/5 border border-white/15 shrink-0">
                      <Check className="w-3.5 h-3.5 text-zinc-400 shrink-0" aria-hidden="true" />
                    </div>
                    <span className="text-sm font-medium tracking-tight">{f}</span>
                  </li>
                ))}
              </ul>
              <a
                href="/start"
                className="w-full py-4 rounded-2xl border border-white/20 text-zinc-300 font-black uppercase tracking-[0.2em] text-xs hover:border-white/40 hover:text-white transition-all flex items-center justify-center gap-3 active:scale-95"
              >
                Start free — no card <ChevronRight className="w-4 h-4" aria-hidden="true" />
              </a>
            </div>

            {/* PRO */}
            <div className="rounded-[2.5rem] p-[1px] bg-gradient-to-b from-cyan-400/50 via-blue-500/10 to-transparent shadow-[0_0_120px_rgba(6,182,212,0.2)] hover:shadow-[0_0_180px_rgba(6,182,212,0.3)] transition-shadow duration-1000 group">
              <div className="rounded-[calc(2.5rem-1px)] bg-zinc-950/90 backdrop-blur-3xl p-10 md:p-12 relative overflow-hidden flex flex-col h-full group-hover:-translate-y-1 transition-transform duration-700">
                <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                <div className="mb-8 relative z-10">
                  <p className="text-[11px] font-black uppercase tracking-[0.2em] text-cyan-400 mb-4 bg-cyan-500/10 border border-cyan-500/20 px-4 py-2 rounded-lg inline-block shadow-inner">
                    Professional
                  </p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-6xl font-black text-white tracking-tighter">$29</span>
                    <span className="text-zinc-500 font-bold tracking-widest uppercase text-xs">/mo</span>
                  </div>
                  <p className="text-zinc-400 text-sm mt-3 leading-relaxed font-medium">
                    The finished work — drafted emails and documents, ready to approve.
                  </p>
                </div>
                <ul className="space-y-4 mb-10 relative z-10 flex-1">
                  <li className="flex items-center gap-4 text-zinc-500">
                    <div className="p-1 rounded-full bg-white/5 border border-white/10 shrink-0">
                      <Check className="w-3.5 h-3.5 text-zinc-600 shrink-0" aria-hidden="true" />
                    </div>
                    <span className="text-sm font-medium tracking-tight italic">Everything in Free, plus:</span>
                  </li>
                  {['Drafted emails, ready to send', 'Drafted documents and decision frames', 'Approve & send in one tap', 'Artifacts delivered every morning', 'Gets smarter every day'].map((f) => (
                    <li key={f} className="flex items-center gap-4 text-white">
                      <div className="p-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 shrink-0">
                        <Check className="w-3.5 h-3.5 text-cyan-400 shrink-0" aria-hidden="true" />
                      </div>
                      <span className="text-sm font-bold tracking-tight text-zinc-200">{f}</span>
                    </li>
                  ))}
                </ul>
                <a
                  href="/start"
                  className="w-full py-5 rounded-2xl bg-white text-black font-black uppercase tracking-[0.2em] text-xs hover:bg-zinc-200 transition-all flex items-center justify-center gap-3 relative z-10 shadow-[0_0_40px_rgba(255,255,255,0.2)] hover:scale-[1.02] active:scale-95"
                >
                  Get started free <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </a>
                <p className="text-center text-zinc-500 text-[10px] uppercase tracking-[0.2em] font-black mt-6 leading-relaxed relative z-10">
                  No credit card required.
                </p>
              </div>
            </div>

          </div>
        </Reveal>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-white/5 py-20 bg-[#07070c] relative overflow-hidden">
        <AmbientGrid />
        <div className="max-w-6xl mx-auto px-6 relative z-10">
          <div className="flex flex-col md:flex-row items-center justify-between gap-12">
            <div className="flex flex-col gap-5 text-center md:text-left">
              <div className="flex items-center justify-center md:justify-start gap-3">
                <div className="w-10 h-10 rounded-2xl bg-white text-black flex items-center justify-center shadow-[0_0_20px_rgba(255,255,255,0.2)]">
                  <Layers className="w-5 h-5 fill-black" aria-hidden="true" />
                </div>
                <span className="text-xl font-black tracking-tighter text-white uppercase">Foldera</span>
              </div>
              <p className="text-zinc-500 text-[11px] uppercase tracking-[0.2em] font-black max-w-sm leading-relaxed text-left">Finished work, every morning.</p>
            </div>
            <nav className="flex flex-wrap justify-center items-center gap-x-12 gap-y-6 text-[10px] text-zinc-500 font-black uppercase tracking-[0.2em]">
              <a href="#product" className="hover:text-white transition-colors">Platform</a>
              <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
              <a href="/blog" className="hover:text-white transition-colors">Blog</a>
              <a href="/login" className="hover:text-white transition-colors">Sign in</a>
            </nav>
          </div>
          <div className="mt-20 pt-10 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="flex items-center justify-center gap-6">
              <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/[0.02] border border-white/10 text-[10px] text-zinc-400 font-black tracking-widest uppercase shadow-inner">
                <Lock className="w-3.5 h-3.5" aria-hidden="true" /> AES-256
              </div>
            </div>
            <div className="flex items-center gap-6 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-600 text-center md:text-right">
              <a href="/privacy" className="hover:text-zinc-400 transition-colors">Privacy</a>
              <a href="/terms" className="hover:text-zinc-400 transition-colors">Terms</a>
              <p suppressHydrationWarning>
                &copy; {new Date().getFullYear()} Foldera AI &bull; Built for execution
              </p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
