'use client';

import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import {
  ArrowRight, Check, Mail, Calendar, MessageSquare,
  Zap, Brain, Briefcase, Code, Coffee, Database, Shield,
  Globe, Layers, Terminal, FileText, AlertCircle,
  Lock, ChevronRight, ChevronDown, Eye,
} from 'lucide-react';
import { RefTracker } from '@/components/growth/ref-tracker';
import {
  getVisitorContext, generateColdRead, FALLBACK_COLD_READ,
  type VisitorContext, type ColdRead,
} from '@/lib/cold-read';

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
}

interface Directive {
  directive: string;
  action_type: string;
  confidence: number;
  reason: string;
  evidence: Array<{ type: string; description: string; date: string | null }>;
  artifact_type?: string;
  artifact?: any;
}

const ACTION_LABELS: Record<string, string> = {
  write_document: 'Write',
  send_message: 'Reach Out',
  make_decision: 'Decide',
  do_nothing: 'Wait',
  schedule: 'Schedule',
  research: 'Research',
};

const ACTION_COLORS: Record<string, string> = {
  write_document: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  send_message: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  make_decision: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  do_nothing: 'bg-zinc-500/20 text-zinc-300 border-zinc-500/30',
  schedule: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  research: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
};

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
  { icon: Brain, title: 'It does the math', desc: 'Not AI opinions. Bayesian confidence scores computed from your own outcomes. Every recommendation is backed by your actual track record.' },
  { icon: Zap, title: 'It does the work', desc: 'No prompting. No chatting. You wake up to finished drafts, ready to approve with one tap.' },
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
    if (!ref.current || inView) return;
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

function useTypingEffect(text: string, speed: number = 25, startDelay: number = 500) {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!text) { setDisplayed(''); setDone(false); return; }
    setDisplayed('');
    setDone(false);
    let i = 0;
    let timeout: ReturnType<typeof setTimeout>;
    let interval: ReturnType<typeof setInterval>;

    timeout = setTimeout(() => {
      interval = setInterval(() => {
        if (i < text.length) {
          setDisplayed(text.slice(0, i + 1));
          i++;
        } else {
          clearInterval(interval);
          setDone(true);
        }
      }, speed);
    }, startDelay);

    return () => {
      clearTimeout(timeout);
      if (interval) clearInterval(interval);
    };
  }, [text, speed, startDelay]);

  return { displayed, done };
}

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

const NeuralStream = () => (
  <div className="absolute inset-0 overflow-hidden pointer-events-none z-0 opacity-40">
    <div className="absolute top-[-10%] left-[-10%] w-[120%] h-[120%] bg-[radial-gradient(circle_at_50%_50%,rgba(6,182,212,0.05)_0%,transparent_50%)] animate-pulse-slow" />
    <div
      className="absolute top-[20%] left-[20%] w-[60%] h-[60%] bg-[radial-gradient(circle_at_50%_50%,rgba(59,130,246,0.05)_0%,transparent_60%)] animate-pulse-slow"
      style={{ animationDelay: '2s' }}
    />
  </div>
);

// ============================================================================
// ARTIFACT PREVIEW (shared with /try)
// ============================================================================
function ArtifactPreview({ artifactType, artifact }: { artifactType: string; artifact: any }) {
  const baseCard = 'mt-6 border-t border-zinc-800 pt-5';
  const label = (
    <p className="text-zinc-600 text-[10px] font-semibold tracking-widest uppercase mb-3">
      Draft ready
    </p>
  );

  if (artifactType === 'drafted_email' && artifact) {
    return (
      <div className={baseCard}>
        {label}
        <div className="bg-zinc-800/60 border border-zinc-700/60 rounded-xl p-4 space-y-3 text-sm">
          <div className="flex gap-2">
            <span className="text-zinc-500 w-14 shrink-0">To</span>
            <span className="text-zinc-300 truncate">{artifact.to ?? '\u2014'}</span>
          </div>
          <div className="flex gap-2 border-t border-zinc-700/40 pt-3">
            <span className="text-zinc-500 w-14 shrink-0">Subject</span>
            <span className="text-zinc-300">{artifact.subject ?? '\u2014'}</span>
          </div>
          <div className="border-t border-zinc-700/40 pt-3 text-zinc-400 leading-relaxed whitespace-pre-wrap break-words">
            {artifact.body ?? ''}
          </div>
        </div>
      </div>
    );
  }

  if (artifactType === 'decision' && artifact?.options) {
    return (
      <div className={baseCard}>
        {label}
        <div className="space-y-3">
          {artifact.options.map((opt: any, i: number) => (
            <div key={i} className="bg-zinc-800/60 border border-zinc-700/60 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-zinc-300 text-sm font-medium">{opt.option}</span>
                <span className="text-zinc-500 text-xs">{Math.round((opt.weight ?? 0) * 100)}%</span>
              </div>
              <div className="h-1 bg-zinc-700 rounded-full overflow-hidden mb-2">
                <div className="h-full bg-cyan-500 rounded-full" style={{ width: `${Math.round((opt.weight ?? 0) * 100)}%` }} />
              </div>
              {opt.rationale && <p className="text-zinc-500 text-xs">{opt.rationale}</p>}
            </div>
          ))}
          {artifact.recommendation && (
            <p className="text-zinc-500 text-sm border-l-2 border-cyan-500/40 pl-3 italic">{artifact.recommendation}</p>
          )}
        </div>
      </div>
    );
  }

  if (artifactType === 'document' && artifact) {
    return (
      <div className={baseCard}>
        {label}
        <div className="bg-zinc-800/60 border border-zinc-700/60 rounded-xl p-4">
          <p className="text-zinc-300 text-sm font-semibold mb-2">{artifact.title ?? 'Document'}</p>
          <p className="text-zinc-500 text-sm leading-relaxed line-clamp-4">{artifact.content ?? ''}</p>
        </div>
      </div>
    );
  }

  if (artifactType === 'wait_rationale' && artifact) {
    return (
      <div className={baseCard}>
        {label}
        <div className="bg-zinc-800/60 border border-zinc-700/60 rounded-xl p-4 space-y-2">
          <p className="text-zinc-400 text-sm leading-relaxed">{artifact.context ?? ''}</p>
          {artifact.evidence && (
            <p className="text-zinc-600 text-sm border-l-2 border-zinc-700 pl-3 italic">{artifact.evidence}</p>
          )}
        </div>
      </div>
    );
  }

  if (artifactType === 'research_brief' && artifact) {
    return (
      <div className={baseCard}>
        {label}
        <div className="bg-zinc-800/60 border border-zinc-700/60 rounded-xl p-4">
          <p className="text-zinc-400 text-sm leading-relaxed mb-2">{artifact.findings ?? ''}</p>
          {artifact.recommended_action && (
            <p className="text-zinc-600 text-xs border-l-2 border-zinc-700 pl-3 italic">{artifact.recommended_action}</p>
          )}
        </div>
      </div>
    );
  }

  if (artifactType === 'calendar_event' && artifact) {
    return (
      <div className={baseCard}>
        {label}
        <div className="bg-zinc-800/60 border border-zinc-700/60 rounded-xl p-4 space-y-2">
          <p className="text-zinc-300 text-sm font-semibold">{artifact.title ?? 'Event'}</p>
          {artifact.start && (
            <p className="text-zinc-500 text-xs">{new Date(artifact.start).toLocaleString()} \u2014 {artifact.end ? new Date(artifact.end).toLocaleString() : ''}</p>
          )}
          {artifact.description && (
            <p className="text-zinc-500 text-sm">{artifact.description}</p>
          )}
        </div>
      </div>
    );
  }

  return null;
}

// ============================================================================
// LIVING HERO — cold read on page load
// ============================================================================
function LivingHero() {
  const [coldRead, setColdRead] = useState<ColdRead | null>(null);
  const [ctx, setCtx] = useState<VisitorContext | null>(null);
  const [showInput, setShowInput] = useState(false);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Directive | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [emailSubmitted, setEmailSubmitted] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try {
      const visitorCtx = getVisitorContext();
      setCtx(visitorCtx);
      setColdRead(generateColdRead(visitorCtx));
    } catch {
      setColdRead(FALLBACK_COLD_READ);
    }
    // Brief shimmer before text appears
    const t = setTimeout(() => setReady(true), 200);
    return () => clearTimeout(t);
  }, []);

  const observationTyping = useTypingEffect(
    ready && coldRead ? coldRead.observation : '',
    30,
    300,
  );

  const subtextTyping = useTypingEffect(
    ready && coldRead ? coldRead.subtext : '',
    18,
    (coldRead?.observation.length ?? 0) * 30 + 800,
  );

  useEffect(() => {
    if (showInput && inputRef.current) {
      inputRef.current.focus();
    }
  }, [showInput]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || loading) return;
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const res = await fetch('/api/try/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          context: ctx ? {
            timeOfDay: ctx.timeOfDay,
            dayOfWeek: ctx.dayOfWeek,
            isWeekend: ctx.isWeekend,
            scenario: ctx.scenario,
            device: ctx.device,
          } : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Analysis failed');
      setResult(data as Directive);
    } catch {
      setError('Foldera is thinking... try again in a moment.');
    } finally {
      setLoading(false);
    }
  }

  async function handleEmailCapture(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || emailLoading) return;
    setEmailLoading(true);
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (res.ok || res.status === 409) {
        setEmailSubmitted(true);
      }
    } catch {
      setEmailSubmitted(true);
    } finally {
      setEmailLoading(false);
    }
  }

  const actionLabel = result ? (ACTION_LABELS[result.action_type] ?? result.action_type) : '';
  const actionColor = result ? (ACTION_COLORS[result.action_type] ?? ACTION_COLORS.research) : '';

  return (
    <div className="w-full max-w-3xl mx-auto relative z-10 pt-8 px-5">
      <NeuralStream />

      {/* ── COLD READ PHASE ── */}
      {!result && !showInput && (
        <div className="space-y-10 relative z-10">
          {/* Loading shimmer */}
          {!ready && (
            <div className="space-y-4 animate-pulse">
              <div className="h-8 bg-zinc-900/60 rounded-xl w-3/4" />
              <div className="h-4 bg-zinc-900/40 rounded-lg w-full" />
              <div className="h-4 bg-zinc-900/40 rounded-lg w-5/6" />
            </div>
          )}

          {ready && coldRead && (
            <>
              {/* System observation label */}
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-cyan-400/60">
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                System observation
              </div>

              {/* The cold read text IS the headline */}
              <p className="text-2xl sm:text-3xl md:text-4xl font-semibold leading-snug text-white tracking-tight min-h-[3.5rem]">
                {observationTyping.displayed}
                {!observationTyping.done && <span className="inline-block w-[2px] h-[1.2em] bg-cyan-400 ml-0.5 animate-pulse align-text-bottom" />}
              </p>

              <div className={`transition-opacity duration-1000 ${observationTyping.done ? 'opacity-100' : 'opacity-0'}`}>
                <p className="text-zinc-400 text-base md:text-lg leading-relaxed">
                  {subtextTyping.displayed}
                  {observationTyping.done && !subtextTyping.done && <span className="inline-block w-[2px] h-[1em] bg-zinc-500 ml-0.5 animate-pulse align-text-bottom" />}
                </p>
              </div>

              {/* Confidence badge */}
              <div className={`transition-all duration-700 ${subtextTyping.done ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
                <div className="inline-flex items-center gap-3 px-4 py-2 rounded-full bg-zinc-900/60 border border-white/5">
                  <div className="flex items-center gap-2">
                    <div className="h-1 w-12 bg-zinc-800 rounded-full overflow-hidden">
                      <div className="h-full bg-cyan-500/50 rounded-full" style={{ width: `${coldRead.confidence}%` }} />
                    </div>
                    <span className="text-zinc-600 text-[10px] font-mono">{coldRead.confidence}% confidence</span>
                  </div>
                  <span className="text-zinc-700 text-[10px]">|</span>
                  <span className="text-zinc-600 text-[10px]">Based on: time, day{ctx?.scenario ? ', scenario' : ''}{ctx?.referrer ? ', referrer' : ''}</span>
                </div>
              </div>

              {/* Go deeper CTA */}
              <div className={`space-y-4 transition-all duration-700 delay-300 ${subtextTyping.done ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                <div className="h-px bg-gradient-to-r from-transparent via-zinc-800 to-transparent" />

                <button
                  onClick={() => setShowInput(true)}
                  className="w-full group flex items-center justify-between p-5 rounded-2xl bg-zinc-950/80 border border-white/5 hover:border-cyan-500/20 transition-all"
                >
                  <div className="text-left">
                    <p className="text-white font-semibold text-sm">Want to go deeper?</p>
                    <p className="text-zinc-500 text-xs mt-1">Tell me what you&apos;re actually dealing with. I&apos;ll show you what Foldera does with real context.</p>
                  </div>
                  <ChevronDown className="w-5 h-5 text-zinc-600 group-hover:text-cyan-400 transition-colors shrink-0 ml-4" />
                </button>

                <div className="text-center pt-2">
                  <a
                    href="/start"
                    className="inline-flex items-center gap-2 text-zinc-500 hover:text-white text-sm transition-colors group"
                  >
                    Or skip ahead and connect your real data
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                  </a>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── TEXT INPUT PHASE ── */}
      {!result && showInput && (
        <div className="space-y-6 relative z-10">
          {/* Collapsed cold read */}
          <div className="p-4 rounded-xl bg-zinc-950/60 border border-white/5">
            <p className="text-zinc-500 text-sm leading-relaxed">{coldRead?.observation}</p>
          </div>

          <div className="text-center">
            <h2 className="text-2xl sm:text-3xl font-black tracking-tighter text-white mb-2">
              Go deeper
            </h2>
            <p className="text-zinc-500 text-sm">
              Paste a paragraph about what you&apos;re working on or struggling with right now.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <textarea
              ref={inputRef}
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="E.g. I've been going back and forth on whether to leave my job. I have a competing offer that pays 30% more but means relocating..."
              rows={6}
              className="w-full bg-zinc-950/80 border border-white/10 rounded-2xl px-5 py-4 text-sm text-zinc-200 placeholder:text-zinc-600 resize-none focus:outline-none focus:border-cyan-500/50 transition-colors leading-relaxed backdrop-blur-sm"
            />
            {error && (
              <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-900/60 border border-white/5">
                <p className="text-zinc-400 text-sm">{error}</p>
                <button
                  type="button"
                  onClick={() => setError(null)}
                  className="text-cyan-400 text-xs font-semibold hover:text-cyan-300 transition-colors shrink-0 ml-3"
                >
                  Retry
                </button>
              </div>
            )}
            <button
              type="submit"
              disabled={!text.trim() || loading}
              className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-white text-black font-black uppercase tracking-[0.15em] text-xs hover:bg-zinc-200 transition-all disabled:opacity-40 shadow-[0_0_30px_rgba(255,255,255,0.15)] hover:scale-[1.01] active:scale-95"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-black/40 border-t-black rounded-full animate-spin" />
                  Reading...
                </>
              ) : (
                <>Get your read</>
              )}
            </button>
          </form>
        </div>
      )}

      {/* ── RESULT CARD ── */}
      {result && (
        <div className="space-y-8 relative z-10">
          <div className="bg-zinc-950/80 border border-white/10 rounded-[2rem] p-7 backdrop-blur-sm">
            {/* Action badge + confidence */}
            <div className="flex items-center justify-between mb-6">
              <span className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${actionColor}`}>
                {actionLabel}
              </span>
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-24 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-cyan-500 rounded-full"
                    style={{ width: `${result.confidence}%` }}
                  />
                </div>
                <span className="text-zinc-600 text-xs font-mono">{result.confidence}%</span>
              </div>
            </div>

            {/* Directive */}
            <p className="text-xl sm:text-2xl font-semibold leading-snug text-white mb-5">
              {result.directive}
            </p>

            {/* Reason */}
            <p className="text-zinc-500 text-sm leading-relaxed border-l-2 border-zinc-800 pl-4 italic mb-5">
              {result.reason}
            </p>

            {/* Evidence */}
            {result.evidence.length > 0 && (
              <div className="border-t border-zinc-800 pt-5">
                <p className="text-zinc-600 text-[10px] font-semibold tracking-widest uppercase mb-3">
                  Evidence from your text
                </p>
                <ul className="space-y-2">
                  {result.evidence.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-zinc-500">
                      <span className="text-zinc-700 mt-0.5 shrink-0">&#8226;</span>
                      {item.description}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {result.artifact && result.artifact_type && (
              <ArtifactPreview artifactType={result.artifact_type} artifact={result.artifact} />
            )}
          </div>

          {/* Email capture */}
          <div className="bg-zinc-950/60 border border-white/5 rounded-[2rem] p-8 text-center space-y-6 backdrop-blur-sm">
            <p className="text-zinc-400 text-base leading-relaxed font-medium">
              That was one paragraph.<br />
              Imagine what Foldera does with 30 days of your actual history.
            </p>

            {!emailSubmitted ? (
              <div className="space-y-4">
                <p className="text-white font-semibold text-lg">Get this every morning.</p>
                <form onSubmit={handleEmailCapture} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@email.com"
                    required
                    className="flex-1 bg-zinc-950/80 border border-white/10 rounded-xl px-4 py-3.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500/50 transition-colors"
                  />
                  <button
                    type="submit"
                    disabled={emailLoading}
                    className="px-6 py-3.5 rounded-xl bg-white text-black font-black uppercase tracking-[0.15em] text-xs hover:bg-zinc-200 transition-all shadow-[0_0_30px_rgba(255,255,255,0.15)] hover:scale-[1.02] active:scale-95 disabled:opacity-60 whitespace-nowrap"
                  >
                    {emailLoading ? 'Saving...' : 'Start free'}
                  </button>
                </form>
                <p className="text-zinc-600 text-[10px] font-black uppercase tracking-[0.2em]">14 days free &middot; No credit card required</p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-cyan-400 font-semibold">You&apos;re in.</p>
                <p className="text-zinc-500 text-sm">Your first read arrives tomorrow morning.</p>
                <a
                  href="/start"
                  className="inline-flex items-center gap-2 text-zinc-400 hover:text-white text-sm transition-colors group mt-2"
                >
                  Or connect your email now for a deeper read
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </a>
              </div>
            )}
          </div>

          {/* Try again */}
          <button
            onClick={() => { setResult(null); setError(null); setShowInput(true); }}
            className="w-full text-zinc-600 hover:text-zinc-400 text-sm transition-colors"
          >
            Try a different paragraph
          </button>
        </div>
      )}
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
  const [isAutoPlay, setIsAutoPlay] = useState(true);
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

  useEffect(() => {
    if (!isAutoPlay || prefersReducedMotion) return;
    const interval = setInterval(() => setActiveTab((prev) => (prev + 1) % SCENARIOS.length), 9000);
    return () => clearInterval(interval);
  }, [isAutoPlay, prefersReducedMotion]);

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

        {/* Processing glow */}
        <div className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[150%] h-[150%] bg-[radial-gradient(circle_at_50%_50%,rgba(6,182,212,0.15)_0%,transparent_50%)] transition-opacity duration-1000 ${
          isProcessing ? 'opacity-100 animate-pulse-fast' : 'opacity-30'
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
                  <div className="w-2 h-2 rounded-full bg-rose-500/50 animate-pulse" />
                </div>
              );
            })}
          </div>
        </div>

        {/* Processing overlay */}
        {phase === 'chaos' && progress > 50 && (
          <div className="absolute inset-0 pt-12 flex items-center justify-center z-20">
            <div className="flex flex-col items-center gap-8 p-10 rounded-[2rem] bg-black/60 backdrop-blur-2xl border border-cyan-500/30 shadow-[0_0_100px_rgba(6,182,212,0.2)]">
              <div className="relative">
                <Brain className="w-12 h-12 text-cyan-400 animate-pulse-fast relative z-10" />
                <div className="absolute inset-0 bg-cyan-400 blur-xl opacity-50 animate-pulse-fast" />
              </div>
              <div className="flex flex-col items-center gap-4">
                <span className="text-xs font-mono font-bold text-cyan-400 tracking-[0.3em] uppercase">Synthesizing Intent</span>
                <div className="w-64 h-1 bg-zinc-900 rounded-full overflow-hidden border border-white/5 relative">
                  <div className="absolute inset-0 bg-cyan-500/20 blur-sm" />
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 via-cyan-400 to-emerald-400 transition-all duration-300 ease-out rounded-full relative z-10"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-zinc-500 text-[10px] font-mono mt-2 uppercase tracking-widest font-bold">MAP_REDUCE // EXTRACTING PATTERNS</p>
              </div>
            </div>
          </div>
        )}

        {/* Clarity layer */}
        <div className={`absolute inset-0 pt-12 p-6 md:p-12 flex items-center justify-center transition-all duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)] z-30 ${
          phase === 'clarity' ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-12 scale-90 pointer-events-none'
        }`}>
          <div className="w-full max-w-lg rounded-[2rem] bg-zinc-950/90 backdrop-blur-2xl border border-white/10 overflow-hidden shadow-[0_40px_100px_-20px_rgba(0,0,0,1)] ring-1 ring-white/5">
            <div className="h-1 w-full bg-gradient-to-r from-blue-500 via-cyan-400 to-emerald-400" />
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
              onClick={() => { setActiveTab(i); setIsAutoPlay(false); }}
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
    <section ref={ref as React.RefObject<HTMLElement> as any} className="py-40 px-6 bg-[#000] relative overflow-hidden border-t border-white/5">
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
          <div className={`bg-zinc-950/50 backdrop-blur-xl rounded-[2rem] p-8 md:p-12 border border-white/5 transition-all duration-1000 text-left ${inView ? 'opacity-40 grayscale hover:opacity-100 hover:grayscale-0' : 'opacity-0 -translate-x-12'}`}>
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
          <div className={`bg-zinc-950/80 backdrop-blur-2xl rounded-[2rem] p-8 md:p-12 border border-cyan-500/20 relative overflow-hidden shadow-[0_0_100px_rgba(6,182,212,0.1)] transition-all duration-1000 delay-150 text-left ${inView ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-12'}`}>
            <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/10 blur-[120px] pointer-events-none" aria-hidden="true" />
            <div className="flex items-center gap-3 mb-10 text-cyan-400 text-[11px] font-black uppercase tracking-widest relative z-10">
              <Brain className="w-5 h-5" /> What Foldera sees
            </div>
            <div className="space-y-6 relative z-10">
              <div className="p-8 rounded-2xl bg-black/80 border border-white/10 shadow-2xl backdrop-blur-md">
                <div className="flex justify-between items-center mb-6 text-[11px] font-black uppercase tracking-widest">
                  <span className="text-white">Signal Confidence</span>
                  <span className="text-cyan-400 bg-cyan-500/10 px-2 py-1 rounded-md border border-cyan-500/20 shadow-[0_0_15px_rgba(6,182,212,0.2)]">ACTIVE</span>
                </div>
                <div className="w-full bg-zinc-900 h-2 rounded-full overflow-hidden mb-4 border border-white/5 relative">
                  <div className="absolute inset-0 bg-cyan-500/20 blur-sm" />
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 via-cyan-400 to-emerald-400 transition-all duration-[2000ms] ease-[cubic-bezier(0.16,1,0.3,1)] relative z-10"
                    style={{ width: inView ? '92%' : '0%' }}
                  />
                </div>
                <div className="text-[10px] font-mono font-bold text-zinc-500 tracking-[0.2em] uppercase">Matching historic nodes... 92% Accuracy</div>
              </div>
              <div className="p-8 rounded-2xl bg-black/50 border border-white/5 relative overflow-hidden group">
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-cyan-400 to-blue-500 shadow-[0_0_20px_rgba(6,182,212,0.5)]" aria-hidden="true" />
                <div className="text-zinc-600 text-[10px] font-black uppercase tracking-widest mb-3">Pattern Extracted</div>
                <div className="text-zinc-200 text-sm md:text-base font-medium leading-relaxed">&ldquo;Marcus prioritizes Friday terms. Always CC legal. Historic response latency: 22m.&rdquo;</div>
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
    <section ref={ref as React.RefObject<HTMLElement> as any} className="py-40 px-6 bg-[#000] border-y border-white/5 relative overflow-hidden">
      <AmbientGrid />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,rgba(59,130,246,0.1),transparent_60%)] pointer-events-none" aria-hidden="true" />

      <div className="max-w-4xl mx-auto relative z-10">
        <Reveal>
          <div className="text-center mb-20">
            <h2 className="text-5xl md:text-6xl font-black tracking-tighter text-white mb-8">
              Not AI opinions.<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400">Your exact math.</span>
            </h2>
            <p className="text-xl text-zinc-400 max-w-2xl mx-auto font-medium leading-relaxed">
              Bayesian confidence scores computed deterministically from your actual history.
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
              <div className="ml-2 text-zinc-500 font-bold tracking-[0.2em] uppercase">engine_core_v2.1.sh</div>
            </div>

            <div className="p-8 md:p-12 space-y-8 text-zinc-400 leading-relaxed bg-black/60 break-words text-left">
              <div>
                <span className="text-cyan-400 font-bold">$</span> compute_bayesian_prior --node=relationship_marcus
                <br />
                <span className="text-zinc-600 font-bold mt-2 inline-block">{'\u2192'} Loading 127 historical signal nodes...</span>
              </div>

              <div className={`transition-opacity duration-1000 ${inView ? 'opacity-100' : 'opacity-0'}`} style={{ transitionDelay: '500ms' }}>
                <div className="grid grid-cols-2 gap-y-4 gap-x-8 max-w-md border-l-2 border-zinc-800 pl-6 my-6">
                  <div>Similar nodes analyzed:</div><div className="text-white font-bold text-right">8</div>
                  <div>Verified success outcomes:</div><div className="text-emerald-400 font-bold text-right">6</div>
                  <div>Base Prior Probability:</div><div className="text-cyan-400 font-bold text-right">75.0%</div>
                </div>
              </div>

              <div className={`transition-opacity duration-1000 ${inView ? 'opacity-100' : 'opacity-0'}`} style={{ transitionDelay: '1000ms' }}>
                <span className="text-cyan-400 font-bold">$</span> apply_context_weights --current_state
                <br />
                <div className="mt-6 space-y-4 max-w-lg">
                  {[
                    { label: 'Temporal Match', val: 92, color: 'from-blue-500 to-cyan-400' },
                    { label: 'Tone Match', val: 88, color: 'from-blue-600 to-blue-400' },
                    { label: 'Stakes Assessment', val: 95, color: 'from-cyan-400 to-emerald-400' },
                  ].map((bar, i) => (
                    <div key={i}>
                      <div className="flex justify-between text-[10px] uppercase font-black tracking-widest mb-2">
                        <span className="text-zinc-500">{bar.label}</span>
                        <span className="text-white">{bar.val}%</span>
                      </div>
                      <div className="h-1.5 bg-zinc-900 rounded-full overflow-hidden relative">
                        <div className="absolute inset-0 bg-cyan-500/20 blur-sm" />
                        <div
                          className={`absolute inset-y-0 left-0 bg-gradient-to-r ${bar.color} rounded-full transition-all duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)] shadow-[0_0_10px_rgba(6,182,212,0.5)]`}
                          style={{ width: inView ? `${bar.val}%` : '0%', transitionDelay: `${1500 + i * 200}ms` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className={`transition-opacity duration-1000 ${inView ? 'opacity-100' : 'opacity-0'}`} style={{ transitionDelay: '2200ms' }}>
                <br />
                <span className="text-cyan-400 font-bold">$</span> result
                <br />
                <div className="mt-4 bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-xl inline-block shadow-[inset_0_0_20px_rgba(52,211,153,0.1)]">
                  <span className="text-emerald-400 font-bold text-xs sm:text-sm tracking-widest">
                    FINAL CERTAINTY: 89.4% {'->'} DIRECTIVE READY
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
// NAVIGATION
// ============================================================================
function Navigation({ scrolled }: NavigationProps) {
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
        </div>

        <div className="flex items-center gap-6">
          <a href="/login" className="hidden sm:block text-[11px] font-black uppercase tracking-[0.2em] text-zinc-500 hover:text-white transition-colors">
            Sign in
          </a>
          <a href="/start" className="px-7 py-3 rounded-full bg-white text-black text-[11px] font-black uppercase tracking-[0.2em] hover:bg-zinc-200 transition-all flex items-center gap-2 hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(255,255,255,0.2)]">
            Get started <ChevronRight className="w-4 h-4" />
          </a>
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

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="min-h-[100dvh] bg-[#000] text-zinc-50 selection:bg-cyan-500/30 selection:text-white font-sans antialiased overflow-x-hidden">
      <RefTracker />
      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;700;800&display=swap');
        html { scroll-behavior: smooth; background: #000; }
        ::-webkit-scrollbar { width: 10px; }
        ::-webkit-scrollbar-track { background: #000; }
        ::-webkit-scrollbar-thumb { background: #222; border-radius: 10px; border: 2px solid #000; }
        .perspective-1000 { perspective: 1000px; }
        .rotate-y-12 { transform: rotateY(12deg); }
        .rotate-y-0 { transform: rotateY(0deg); }
        @keyframes pulse-slow-lp {
          0%, 100% { transform: scale(1); opacity: 0.5; }
          50% { transform: scale(1.05); opacity: 0.8; }
        }
        .animate-pulse-slow { animation: pulse-slow-lp 6s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
        @keyframes pulse-fast-lp {
          0%, 100% { opacity: 0.8; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.02); }
        }
        .animate-pulse-fast { animation: pulse-fast-lp 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
        @keyframes gradient-x {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .animate-gradient-x { background-size: 200% 200%; animation: gradient-x 10s ease infinite; }
        @media (prefers-reduced-motion: reduce) {
          *, ::before, ::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
        }
      `}} />

      <Navigation scrolled={scrolled} />

      {/* ── LIVING HERO — cold read on page load ── */}
      <section className="relative pt-40 pb-24 overflow-hidden">
        <LivingHero />
      </section>

      {/* ── SCENARIO DEMOS — "with a month of your data" ── */}
      <section className="py-32 relative bg-[#000] border-t border-white/5 overflow-hidden">
        <AmbientGrid />
        <div className="relative z-10">
          <Reveal className="text-center mb-16 px-6">
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-black tracking-tighter text-white mb-6">
              Now imagine a month of<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-cyan-400 to-emerald-400 animate-gradient-x">
                your real data.
              </span>
            </h2>
            <p className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto font-medium leading-relaxed">
              That cold read used time and day. Here&apos;s what Foldera does with your email, calendar, and conversations.
            </p>
          </Reveal>
          <Reveal delay={150}>
            <ScenarioDemos />
          </Reveal>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="py-40 relative bg-[#000] border-t border-white/5">
        <AmbientGrid />
        <div className="max-w-6xl mx-auto px-6 relative z-10">
          <Reveal className="mb-24 text-center">
            <h2 className="text-5xl md:text-6xl lg:text-7xl font-black tracking-tighter text-white mb-8">You decide yes or no.<br />Foldera does the rest.</h2>
            <p className="text-xl md:text-2xl text-zinc-400 max-w-2xl mx-auto font-medium leading-relaxed">Three steps. No prompting. No managing. Just finished work, every morning.</p>
          </Reveal>

          <div className="grid md:grid-cols-3 gap-8">
            {(['Connect', 'Synthesize', 'Execute'] as const).map((title, i) => (
              <Reveal key={i} delay={i * 100}>
                <div className="relative p-10 md:p-12 rounded-[2rem] bg-zinc-950/50 backdrop-blur-xl border border-white/5 group hover:border-cyan-500/40 transition-all duration-700 h-full overflow-hidden shadow-2xl hover:shadow-[0_0_60px_rgba(6,182,212,0.15)] hover:-translate-y-2 text-left">
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
      <section id="product" className="py-40 relative bg-[#000] border-t border-white/5">
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
                  <div className="group p-10 rounded-[2rem] bg-zinc-950/50 backdrop-blur-xl border border-white/5 hover:border-blue-500/30 transition-all duration-700 h-full relative overflow-hidden shadow-2xl hover:shadow-[0_0_50px_rgba(59,130,246,0.15)] hover:-translate-y-2 text-left">
                    <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                    <div className="w-14 h-14 rounded-2xl bg-black border border-white/10 flex items-center justify-center mb-8 group-hover:scale-110 group-hover:bg-blue-500/10 group-hover:border-blue-500/30 transition-all duration-500 shadow-inner">
                      <Icon className="w-7 h-7 text-zinc-500 group-hover:text-blue-400 transition-colors" />
                    </div>
                    <h3 className="text-xl font-black text-white mb-4 tracking-tight relative z-10">{feature.title}</h3>
                    <p className="text-zinc-400 text-base leading-relaxed font-medium relative z-10 group-hover:text-zinc-300 transition-colors">{feature.desc}</p>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="pricing" className="py-48 border-t border-white/5 relative bg-[#000] overflow-hidden">
        <AmbientGrid />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[1000px] bg-[radial-gradient(circle_at_50%_50%,rgba(6,182,212,0.1)_0%,transparent_50%)] pointer-events-none" aria-hidden="true" />
        <Reveal className="max-w-5xl mx-auto px-6 relative z-10">
          <div className="text-center mb-24">
            <h2 className="text-6xl md:text-[8rem] font-black tracking-tighter text-white mb-8 leading-none">One plan.<br />Full power.</h2>
            <p className="text-zinc-400 text-xl md:text-3xl font-medium tracking-tight">Stop managing. Start executing.</p>
          </div>
          <div className="max-w-lg mx-auto perspective-1000">
            <div className="rounded-[3rem] p-[1px] bg-gradient-to-b from-cyan-400/50 via-blue-500/10 to-transparent shadow-[0_0_150px_rgba(6,182,212,0.2)] hover:shadow-[0_0_200px_rgba(6,182,212,0.3)] transition-shadow duration-1000 group">
              <div className="rounded-[calc(3rem-1px)] bg-zinc-950/90 backdrop-blur-3xl p-12 md:p-16 relative overflow-hidden text-center group-hover:-translate-y-2 transition-transform duration-700">
                <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                <div className="mb-14 relative z-10">
                  <p className="text-[11px] font-black uppercase tracking-[0.2em] text-cyan-400 mb-6 bg-cyan-500/10 border border-cyan-500/20 px-4 py-2 rounded-lg inline-block shadow-inner">Professional</p>
                  <div className="flex items-baseline justify-center gap-2">
                    <span className="text-8xl font-black text-white tracking-tighter">$99</span>
                    <span className="text-zinc-500 font-bold tracking-widest uppercase text-xs">/mo</span>
                  </div>
                </div>
                <ul className="space-y-6 mb-16 relative z-10 text-left">
                  {['Unlimited integrations', 'Unlimited daily actions', 'Full autonomous queue', 'All specialist agents', 'Priority processing', 'Email + calendar sync'].map((f) => (
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
                  Start 14-day free trial <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </a>
                <p className="text-center text-zinc-500 text-[10px] uppercase tracking-[0.2em] font-black mt-8 leading-relaxed relative z-10">
                  14 days free. Cancel anytime.<br />No credit card required.
                </p>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-white/5 py-20 bg-[#000] relative overflow-hidden">
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
              <p className="text-zinc-500 text-[11px] uppercase tracking-[0.2em] font-black max-w-sm leading-relaxed text-left">Built by one person solving his own problem.</p>
            </div>
            <nav className="flex flex-wrap justify-center items-center gap-x-12 gap-y-6 text-[10px] text-zinc-500 font-black uppercase tracking-[0.2em]">
              <a href="#product" className="hover:text-white transition-colors">Platform</a>
              <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
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
