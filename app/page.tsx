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
    label: 'The job you keep almost taking',
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
    label: 'The feature you\u2019re hiding behind',
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
    label: 'The 47 open tabs',
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
const Reveal = memo<RevealProps>(({ children, delay = 0, className = '' }) => {
  const [ref, inView] = useInView();
  const prefersReducedMotion = usePrefersReducedMotion();
  const motionClasses = prefersReducedMotion
    ? 'opacity-100 translate-y-0 scale-100'
    : inView
      ? 'opacity-100 translate-y-0 scale-100 duration-[1000ms]'
      : 'opacity-0 translate-y-12 scale-[0.95] duration-[1000ms]';
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


// ============================================================================
// SIGNAL ENGINE HERO — mechanism visualization
// ============================================================================
function SignalEngineHero() {
  return (
    <div className="w-full max-w-7xl mx-auto px-6 pt-28 pb-12 text-center relative z-10 flex flex-col items-center">
      {/* Headlines & CTA */}
      <Reveal>
        <div className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-zinc-400 text-[10px] font-black uppercase tracking-[0.2em] mb-6">
          Finished work, every morning.
        </div>
        <h1 className="text-4xl md:text-6xl lg:text-7xl font-black tracking-tighter text-white mb-5 leading-[1.08]">
          Your next move,<br className="hidden md:block" /> already prepared.
        </h1>
        <p className="text-base md:text-xl text-zinc-400 max-w-2xl mx-auto font-medium leading-relaxed mb-8">
          Foldera reads your email and calendar, finds what matters most, and prepares the work before you wake up.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <a
            href="/start"
            className="w-full sm:w-auto px-8 py-4 rounded-xl bg-white text-black font-black uppercase tracking-[0.15em] text-xs hover:bg-zinc-200 transition-all shadow-[0_0_40px_rgba(255,255,255,0.2)] hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2"
          >
            Get started <ChevronRight className="w-4 h-4" />
          </a>
        </div>
      </Reveal>

      {/* The Mechanism: inputs → convergence → directive */}
      <div className="w-full mt-8 md:mt-12 relative flex flex-col items-center">
        {/* Background Glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-cyan-500/[0.04] blur-[150px] rounded-full pointer-events-none z-0" />

        {/* Signal input chips — what Foldera reads */}
        <div className="flex items-center justify-center gap-3 sm:gap-4 mb-0 relative z-10">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-900/80 border border-zinc-700/50 text-zinc-500 text-[10px] sm:text-[11px] font-semibold">
            <Mail className="w-3 h-3 text-zinc-500" />
            <span>23 emails</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-900/80 border border-zinc-700/50 text-zinc-500 text-[10px] sm:text-[11px] font-semibold">
            <Calendar className="w-3 h-3 text-zinc-500" />
            <span>8 events</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-900/80 border border-zinc-700/50 text-zinc-500 text-[10px] sm:text-[11px] font-semibold">
            <MessageSquare className="w-3 h-3 text-zinc-500" />
            <span>3 threads</span>
          </div>
        </div>

        {/* Convergence line + processing dot */}
        <div className="flex flex-col items-center my-0 relative z-10">
          <div className="w-[1px] h-5 bg-gradient-to-b from-zinc-700/0 to-zinc-600/60" />
          <div className="w-7 h-7 rounded-full bg-[#0a0a0f] border border-zinc-600/50 flex items-center justify-center hero-process-dot">
            <Brain className="w-3.5 h-3.5 text-cyan-400/70" />
          </div>
          <div className="w-[1px] h-5 bg-gradient-to-b from-cyan-500/40 to-cyan-500/0" />
        </div>

        {/* Directive Output Card — the payoff, always visible */}
        <div className="relative z-30 w-full max-w-[400px] hero-output">
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
              <a href="/start" className="flex-1 bg-cyan-500 text-black py-3.5 rounded-xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:scale-[1.02] transition-transform shadow-[0_0_20px_rgba(6,182,212,0.3)]">
                <Check className="w-4 h-4" /> Approve
              </a>
              <a href="/start" className="px-6 bg-zinc-900 border border-white/20 text-zinc-300 py-3.5 rounded-xl font-black text-xs uppercase tracking-widest hover:text-white hover:border-white/40 transition-colors flex items-center justify-center">
                Skip
              </a>
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
    <div className="w-full max-w-5xl mx-auto relative z-10 px-4">
      <div className={`relative w-full aspect-[4/3] md:aspect-[21/10] rounded-[2rem] bg-black/40 backdrop-blur-3xl border transition-all duration-1000 overflow-hidden shadow-2xl ${
        isProcessing ? 'border-cyan-500/50 shadow-[0_0_100px_-20px_rgba(6,182,212,0.4)]' : 'border-white/10 shadow-[0_40px_100px_-20px_rgba(0,0,0,1)]'
      }`}>
        {/* Window chrome */}
        <div className="absolute top-0 left-0 w-full h-12 bg-white/[0.02] border-b border-white/5 z-40 flex items-center px-4 backdrop-blur-xl">
          <div className="flex gap-2">
            <div className="w-3 h-3 rounded-full bg-zinc-700/50" />
            <div className="w-3 h-3 rounded-full bg-zinc-700/50" />
            <div className="w-3 h-3 rounded-full bg-zinc-700/50" />
          </div>
          <div className="mx-auto flex items-center gap-2 px-4 py-1.5 rounded-full bg-black/50 border border-white/5 text-[10px] font-mono text-zinc-500 font-bold uppercase tracking-widest shadow-inner">
            <Lock className="w-3 h-3" /> foldera.engine
          </div>
        </div>

        {/* Subtle background glow */}
        <div className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[150%] h-[150%] bg-[radial-gradient(circle_at_50%_50%,rgba(6,182,212,0.08)_0%,transparent_50%)] transition-opacity duration-1000 ${
          isProcessing ? 'opacity-100' : 'opacity-30'
        }`} />

        {/* Chaos layer */}
        <div className={`absolute inset-0 pt-20 p-6 md:p-12 flex flex-col items-center justify-center transition-all duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          phase === 'chaos' ? 'opacity-100 z-10' : 'opacity-0 blur-xl scale-110 pointer-events-none'
        }`}>
          <div className="w-full max-w-xl relative perspective-1000">
            {current.chaos.map((item, idx) => {
              const rotate = idx % 2 === 0 ? '-2deg' : '2deg';
              const translateX = idx % 2 === 0 ? '-15px' : '15px';
              return (
                <div
                  key={`${activeTab}-${idx}`}
                  className="absolute w-full flex items-center gap-4 p-4 md:p-5 rounded-2xl bg-zinc-900/80 backdrop-blur-md border border-white/10 text-sm md:text-base text-zinc-200 shadow-2xl transition-all duration-[800ms] ease-out"
                  style={{
                    top: `${idx * 65}px`,
                    zIndex: 10 - idx,
                    transitionDelay: `${idx * 60}ms`,
                    transform: progress > 30
                      ? 'translateZ(-100px) translateY(100px) scale(0.8) rotateX(20deg)'
                      : `translateZ(0) translateY(0) translateX(${translateX}) rotateZ(${rotate})`,
                  }}
                >
                  <div className="p-2.5 rounded-xl bg-black border border-white/10 shadow-inner">
                    <ChaosIcon type={item.type} />
                  </div>
                  <span className="flex-1 font-semibold tracking-tight">{item.text}</span>
                  <div className="w-2 h-2 rounded-full bg-zinc-600" />
                </div>
              );
            })}
          </div>
        </div>


        {/* Clarity layer */}
        <div className={`absolute inset-0 pt-12 p-6 md:p-12 flex items-center justify-center transition-all duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)] z-30 ${
          phase === 'clarity' ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-12 scale-90 pointer-events-none'
        }`}>
          <div className="w-full max-w-lg rounded-[2rem] bg-zinc-950/90 backdrop-blur-2xl border border-white/10 overflow-hidden shadow-[0_40px_100px_-20px_rgba(0,0,0,1)] ring-1 ring-white/5">
            <div className="h-1 w-full bg-gradient-to-r from-cyan-500 to-cyan-300" />
            <div className="p-6 md:p-8 border-b border-white/5 bg-white/[0.01] flex items-start gap-5 text-left">
              <div className="p-4 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 shadow-[inset_0_0_20px_rgba(6,182,212,0.1)]">
                <Check className="w-6 h-6 text-cyan-400" />
              </div>
              <div className="flex-1 pt-1">
                <p className="text-white font-black tracking-tight text-xl">{current.clarity.action}</p>
                <p className="text-zinc-400 font-medium text-sm mt-1">{current.clarity.subject}</p>
              </div>
            </div>
            <div className="p-6 md:p-8 space-y-8 bg-black/50 text-left">
              <p className="text-zinc-300 leading-relaxed text-sm md:text-base font-medium">{current.clarity.desc}</p>
              <button className="w-full group flex items-center justify-center gap-3 py-4 rounded-xl bg-white text-black text-[11px] font-black uppercase tracking-[0.2em] hover:bg-zinc-200 transition-all duration-300 shadow-[0_0_30px_rgba(255,255,255,0.1)] active:scale-95">
                <Zap className="w-4 h-4 fill-black" />
                {current.clarity.button}
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Scenario dots */}
      <div className="flex justify-center gap-4 mt-10 relative z-10">
        {SCENARIOS.map((s, i) => {
          const isActive = activeTab === i;
          return (
            <button
              key={s.id}
              onClick={() => { setActiveTab(i); }}
              className={`h-1.5 rounded-full transition-all duration-500 ${isActive ? 'bg-cyan-400 w-12 shadow-[0_0_15px_rgba(34,211,238,0.6)]' : 'bg-white/20 w-4 hover:bg-white/40'}`}
              aria-label={`Scenario ${i + 1}: ${s.label}`}
            />
          );
        })}
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
    <section ref={ref as React.RefObject<HTMLElement> as any} className="py-40 px-6 bg-[#07070c] relative overflow-hidden border-t border-white/5">
      <AmbientGrid />
      <div className="max-w-6xl mx-auto relative z-10">
        <Reveal>
          <div className="text-center mb-24">
            <h2 className="text-5xl md:text-6xl font-black text-white mb-6 tracking-tighter">The Flip</h2>
            <p className="text-zinc-400 text-xl font-medium">Same data. Different intelligence.</p>
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
    <section ref={ref as React.RefObject<HTMLElement> as any} className="py-40 px-6 bg-[#07070c] border-y border-white/5 relative overflow-hidden">
      <AmbientGrid />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,rgba(6,182,212,0.08),transparent_60%)] pointer-events-none" aria-hidden="true" />

      <div className="max-w-4xl mx-auto relative z-10">
        <Reveal>
          <div className="text-center mb-20">
            <h2 className="text-5xl md:text-6xl font-black tracking-tighter text-white mb-8">
              The engine keeps the math backstage.<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#38bdf8] to-[#22d3ee]">You just get the work.</span>
            </h2>
            <p className="text-xl text-zinc-400 max-w-2xl mx-auto font-medium leading-relaxed">
              Foldera reads the history, narrows the day to one live thread, and drafts the finished artifact before you even open the dashboard.
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
    <section id="product" className="py-40 relative bg-[#07070c] border-t border-white/5">
      <AmbientGrid />
      <div className="max-w-6xl mx-auto px-6 relative z-10">
        <Reveal className="mb-24 text-center">
          <h2 className="text-5xl md:text-6xl lg:text-7xl font-black tracking-tighter text-white mb-8">Not another app<br />to check.</h2>
          <p className="text-zinc-400 text-xl md:text-2xl font-medium">Foldera replaces the system, not adds to it.</p>
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
  return (
    <nav className={`fixed top-0 w-full z-50 transition-all duration-500 ${
      scrolled
        ? 'bg-black/80 backdrop-blur-2xl border-b border-white/5 py-4 shadow-2xl'
        : 'bg-transparent py-8'
    }`}>
      <div className="max-w-6xl mx-auto px-6 flex items-center justify-between">
        <a href="/" className="flex items-center gap-3 group cursor-pointer focus:outline-none">
          <div className="w-10 h-10 rounded-2xl bg-white text-black flex items-center justify-center group-hover:scale-105 transition-transform shadow-[0_0_30px_rgba(255,255,255,0.3)]">
            <Layers className="w-5 h-5 fill-black" aria-hidden="true" />
          </div>
          <span className="text-xl font-black tracking-tighter text-white uppercase">Foldera</span>
        </a>

        <div className="hidden md:flex items-center gap-12 text-[11px] font-black uppercase tracking-[0.2em] text-zinc-500">
          <a href="#product" className="hover:text-white transition-colors">Platform</a>
          <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
          <a href="/blog" className="hover:text-white transition-colors">Blog</a>
        </div>

        <div className="flex items-center gap-6">
          {isLoggedIn ? (
            <a href="/dashboard" className="px-7 py-3 rounded-full bg-white text-black text-[11px] font-black uppercase tracking-[0.2em] hover:bg-zinc-200 transition-all flex items-center gap-2 hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(255,255,255,0.2)]">
              Dashboard <ChevronRight className="w-4 h-4" />
            </a>
          ) : (
            <>
              <a href="/login" className="hidden sm:block text-[11px] font-black uppercase tracking-[0.2em] text-zinc-500 hover:text-white transition-colors">
                Sign in
              </a>
              <a href="/start" className="px-7 py-3 rounded-full bg-white text-black text-[11px] font-black uppercase tracking-[0.2em] hover:bg-zinc-200 transition-all flex items-center gap-2 hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(255,255,255,0.2)]">
                Get started <ChevronRight className="w-4 h-4" />
              </a>
            </>
          )}
        </div>
      </div>
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
        /* Hero — processing dot glows once */
        .hero-process-dot {
          animation: hero-dot-glow 1.2s ease-out 0.6s both;
        }
        @keyframes hero-dot-glow {
          0% { box-shadow: none; border-color: rgba(82,82,91,0.5); }
          40% { box-shadow: 0 0 16px rgba(6,182,212,0.4); border-color: rgba(6,182,212,0.5); }
          100% { box-shadow: 0 0 6px rgba(6,182,212,0.15); border-color: rgba(82,82,91,0.5); }
        }
        /* Hero — output card appears once after dot glows, stays */
        .hero-output {
          animation: hero-output-in 0.8s ease-out 1s both;
        }
        @keyframes hero-output-in {
          from { opacity: 0; transform: translateY(12px); }
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
      <section className="py-32 relative bg-[#07070c] border-t border-white/5 overflow-hidden">
        <AmbientGrid />
        <div className="relative z-10">
          <Reveal className="text-center mb-16 px-6">
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-black tracking-tighter text-white mb-6">
              Now imagine a month of<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 to-cyan-400">
                your real data.
              </span>
            </h2>
            <p className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto font-medium leading-relaxed">
              Here&apos;s what Foldera does with your email, calendar, and conversations.
            </p>
          </Reveal>
          <Reveal delay={150}>
            <ScenarioDemos />
          </Reveal>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="py-40 relative bg-[#07070c] border-t border-white/5">
        <AmbientGrid />
        <div className="max-w-6xl mx-auto px-6 relative z-10">
          <Reveal className="mb-24 text-center">
            <h2 className="text-5xl md:text-6xl lg:text-7xl font-black tracking-tighter text-white mb-8">You decide yes or no.<br />Foldera does the rest.</h2>
            <p className="text-xl md:text-2xl text-zinc-400 max-w-2xl mx-auto font-medium leading-relaxed">Three steps. No prompting. No managing. Just finished work, every morning.</p>
          </Reveal>

          <div className="grid md:grid-cols-3 gap-8">
            {(['Connect', 'Synthesize', 'Execute'] as const).map((title, i) => (
              <Reveal key={i} delay={i * 100}>
                <div className="relative p-10 md:p-12 rounded-[2rem] bg-zinc-950/80 backdrop-blur-xl border border-white/[0.08] group hover:border-cyan-500/40 transition-all duration-700 h-full overflow-hidden shadow-2xl shadow-black/40 hover:shadow-[0_0_60px_rgba(6,182,212,0.15)] hover:-translate-y-2 text-left">
                  <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-cyan-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                  <div className="absolute -right-6 -bottom-10 text-[180px] font-black text-white/[0.02] leading-none pointer-events-none transition-all duration-700 group-hover:text-cyan-500/[0.05] group-hover:scale-110">{`0${i + 1}`}</div>
                  <h3 className="text-2xl font-black text-white mb-6 flex flex-col items-start gap-4 tracking-tight">
                    <span className="text-cyan-400 text-[10px] tracking-[0.2em] uppercase font-mono bg-cyan-500/10 border border-cyan-500/20 px-3 py-1.5 rounded-md shadow-inner">{`Step 0${i + 1}`}</span>
                    {title}
                  </h3>
                  <p className="text-zinc-400 text-base md:text-lg leading-relaxed relative z-10 font-medium group-hover:text-zinc-300 transition-colors">
                    {i === 0 && 'Connect your email. Foldera reads your sent folder, your calendar, your conversations \u2014 and starts finding the patterns you can\u2019t see from inside them.'}
                    {i === 1 && 'Overnight, the engine maps what it found to what matters. By morning, the work is done: emails drafted, decisions framed, follow-ups queued.'}
                    {i === 2 && 'One tap to approve. One tap to skip. Either way, the engine learns. Day 7 is smarter than day 1. Day 30 is a different product.'}
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
      <section id="pricing" className="py-48 border-t border-white/5 relative bg-[#07070c] overflow-hidden">
        <AmbientGrid />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[1000px] bg-[radial-gradient(circle_at_50%_50%,rgba(6,182,212,0.1)_0%,transparent_50%)] pointer-events-none" aria-hidden="true" />
        <Reveal className="max-w-5xl mx-auto px-6 relative z-10">
          <div className="text-center mb-24">
            <h2 className="text-6xl md:text-[8rem] font-black tracking-tighter text-white mb-8 leading-none">One plan.<br />Full power.</h2>
            <p className="text-zinc-400 text-xl md:text-3xl font-medium tracking-tight">Finished work, every morning.</p>
          </div>
          <div className="max-w-lg mx-auto perspective-1000">
            <div className="rounded-[3rem] p-[1px] bg-gradient-to-b from-cyan-400/50 via-blue-500/10 to-transparent shadow-[0_0_150px_rgba(6,182,212,0.2)] hover:shadow-[0_0_200px_rgba(6,182,212,0.3)] transition-shadow duration-1000 group">
              <div className="rounded-[calc(3rem-1px)] bg-zinc-950/90 backdrop-blur-3xl p-12 md:p-16 relative overflow-hidden text-center group-hover:-translate-y-2 transition-transform duration-700">
                <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                <div className="mb-14 relative z-10">
                  <p className="text-[11px] font-black uppercase tracking-[0.2em] text-cyan-400 mb-6 bg-cyan-500/10 border border-cyan-500/20 px-4 py-2 rounded-lg inline-block shadow-inner">Professional</p>
                  <div className="flex items-baseline justify-center gap-2">
                    <span className="text-8xl font-black text-white tracking-tighter">$29</span>
                    <span className="text-zinc-500 font-bold tracking-widest uppercase text-xs">/mo</span>
                  </div>
                </div>
                <ul className="space-y-6 mb-16 relative z-10 text-left">
                  {['Email + calendar sync', 'One directive every morning', 'Drafted emails + documents', 'Approve or skip in one tap', 'Encrypted at rest', 'Gets smarter every day'].map((f) => (
                    <li key={f} className="flex items-center gap-5 text-white">
                      <div className="p-1 rounded-full bg-cyan-500/10 border border-cyan-500/30">
                        <Check className="w-4 h-4 text-cyan-400 shrink-0" aria-hidden="true" />
                      </div>
                      <span className="text-lg font-bold tracking-tight text-zinc-200">{f}</span>
                    </li>
                  ))}
                </ul>
                <a
                  href="/start"
                  className="w-full py-5 rounded-2xl bg-white text-black font-black uppercase tracking-[0.2em] text-xs hover:bg-zinc-200 transition-all flex items-center justify-center gap-3 relative z-10 shadow-[0_0_40px_rgba(255,255,255,0.2)] hover:scale-[1.02] active:scale-95"
                >
                  Get started free <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </a>
                <p className="text-center text-zinc-500 text-[10px] uppercase tracking-[0.2em] font-black mt-8 leading-relaxed relative z-10">
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
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-600 text-center md:text-right" suppressHydrationWarning>
              &copy; {new Date().getFullYear()} Foldera AI &bull; Built for execution
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
