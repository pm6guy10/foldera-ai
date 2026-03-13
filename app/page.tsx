'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ArrowRight, Check, X, Mail, Calendar, MessageSquare,
  Zap, Brain, Briefcase, Code, Coffee, Database, Shield,
  Globe, Layers, Terminal, FileText, AlertCircle,
  Sparkles, Lock, Clock, Play, Pause
} from 'lucide-react';

// ─── Premium Scroll Reveal ─────────────────────────────────────────────────
const useInView = (threshold = 0.15): [React.MutableRefObject<HTMLDivElement | null>, boolean] => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (!ref.current || inView) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setInView(true);
          obs.disconnect();
        }
      },
      { threshold, rootMargin: '0px 0px -50px 0px' }
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [threshold, inView]);

  return [ref, inView];
};

interface RevealProps {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}

const Reveal = ({ children, delay = 0, className = '' }: RevealProps) => {
  const [ref, inView] = useInView();
  return (
    <div
      ref={ref}
      className={`transition-all duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)] ${className} ${
        inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
      }`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
};

// ─── Chaos to Clarity Data ───────────────────────────────────────────────────
const SCENARIOS = [
  {
    id: 'job',
    icon: Briefcase,
    label: 'The Job Hunt',
    chaos: [
      { type: 'email', text: 'Rejection: ACME Corp Senior PM' },
      { type: 'tab', text: 'State Government Careers Portal' },
      { type: 'doc', text: 'Resume_v4_Final_FINAL.pdf' },
      { type: 'calendar', text: 'Overlapping coffee chats' }
    ],
    clarity: {
      action: 'Drafted Outreach',
      subject: 'Business Analyst Role',
      desc: 'Stop spinning wheels on generic apps. I found a BA role matching your profile. I drafted a direct email to the hiring manager and blocked 30m tomorrow to review it.',
      button: 'Approve & Schedule'
    }
  },
  {
    id: 'builder',
    icon: Code,
    label: 'Founder Overload',
    chaos: [
      { type: 'error', text: 'Vercel Deployment Failed (x3)' },
      { type: 'tab', text: 'ClickUp: 42 overdue tasks' },
      { type: 'doc', text: 'Landing_Page_Copy_Draft.txt' },
      { type: 'email', text: 'Stripe: Action Required' }
    ],
    clarity: {
      action: 'QA Prompt Ready',
      subject: 'Fix Broken UI First',
      desc: 'Stop building new features. I wrote the CC prompt to run a complete UI sweep and fix broken buttons first.',
      button: 'Execute CC Prompt'
    }
  },
  {
    id: 'life',
    icon: Coffee,
    label: 'Life Admin',
    chaos: [
      { type: 'email', text: 'URGENT: Youth Soccer Registration' },
      { type: 'message', text: 'Landlord: Lease renewal attached' },
      { type: 'tab', text: 'Instacart Checkout (idle)' },
      { type: 'calendar', text: 'Dentist 2:00 PM (Unconfirmed)' }
    ],
    clarity: {
      action: 'Forms & Emails Drafted',
      subject: 'Soccer & Lease Renewal',
      desc: 'Soccer registration closes in 48 hours. I filled out the form and drafted the email to the landlord requesting a 12-month extension.',
      button: 'Submit Both'
    }
  }
];

interface ChaosIconProps {
  type: string;
}

const ChaosIcon = ({ type }: ChaosIconProps) => {
  const icons: Record<string, React.ElementType> = {
    email: Mail,
    doc: FileText,
    calendar: Calendar,
    error: AlertCircle,
    message: MessageSquare,
    tab: Globe
  };
  const Icon = icons[type] || Globe;
  const colorClass = type === 'error' ? 'text-rose-400' : 'text-zinc-500';
  return <Icon className={`w-4 h-4 ${colorClass}`} />;
};

// ─── Chaos to Clarity Component ─────────────────────────────────────────────
function ChaosToClarity() {
  const [activeTab, setActiveTab] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showClarity, setShowClarity] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isAutoPlay, setIsAutoPlay] = useState(true);

  const runDemo = useCallback(() => {
    setIsProcessing(true);
    setShowClarity(false);
    setProgress(0);

    const stages = [0, 25, 55, 80, 100];
    let stage = 0;

    const interval = setInterval(() => {
      if (stage < stages.length - 1) {
        stage++;
        setProgress(stages[stage]);
      }
    }, 350);

    const timer = setTimeout(() => {
      clearInterval(interval);
      setIsProcessing(false);
      setShowClarity(true);
    }, 2000);

    return () => { clearTimeout(timer); clearInterval(interval); };
  }, []);

  useEffect(() => {
    const cleanup = runDemo();
    return cleanup;
  }, [activeTab, runDemo]);

  useEffect(() => {
    if (!isAutoPlay) return;
    const interval = setInterval(() => {
      setActiveTab((prev) => (prev + 1) % SCENARIOS.length);
    }, 8000);
    return () => clearInterval(interval);
  }, [isAutoPlay]);

  const current = SCENARIOS[activeTab];

  return (
    <div className="w-full max-w-6xl mx-auto relative z-10">
      {/* Badge */}
      <div className="flex justify-center mb-8">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-cyan-500/5 border border-cyan-500/20 text-cyan-400 text-xs font-semibold tracking-wide uppercase backdrop-blur-sm">
          <Sparkles className="w-3.5 h-3.5" />
          Autonomous Intelligence Layer
        </div>
      </div>

      {/* Headline */}
      <div className="text-center mb-16 space-y-6">
        <h1 className="text-6xl md:text-8xl font-semibold tracking-tight text-white leading-[0.95]">
          The work is done<br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-400 to-emerald-400">
            before you ask.
          </span>
        </h1>
        <p className="text-xl text-zinc-400 max-w-2xl mx-auto font-light leading-relaxed">
          Foldera ingests your chaos, builds conviction, and delivers executable actions.
          You just approve or skip.
        </p>
      </div>

      {/* Scenario Controls */}
      <div className="flex flex-wrap justify-center gap-2 mb-12">
        {SCENARIOS.map((s, i) => {
          const Icon = s.icon;
          const isActive = activeTab === i;
          return (
            <button
              key={s.id}
              onClick={() => { setActiveTab(i); setIsAutoPlay(false); }}
              className={`group flex items-center gap-2.5 px-5 py-3 rounded-full text-sm font-medium transition-all duration-300 ${
                isActive
                  ? 'bg-white text-black shadow-lg shadow-white/10'
                  : 'bg-zinc-900/50 text-zinc-400 hover:text-white hover:bg-zinc-800/50 border border-zinc-800'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-black' : 'text-zinc-500 group-hover:text-white'}`} />
              {s.label}
              {isActive && (
                <span className="ml-1 w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              )}
            </button>
          );
        })}

        <button
          onClick={() => setIsAutoPlay(!isAutoPlay)}
          className="ml-2 p-3 rounded-full bg-zinc-900/50 text-zinc-500 hover:text-white border border-zinc-800 transition-all"
        >
          {isAutoPlay ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </button>
      </div>

      {/* Main Demo Stage */}
      <div className="relative aspect-[16/10] md:aspect-[2/1] max-h-[600px] rounded-3xl bg-zinc-950 border border-zinc-800 overflow-hidden shadow-2xl shadow-cyan-500/5">
        {/* Ambient Glow */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(6,182,212,0.15),transparent_50%)]" />

        {/* Grid */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:60px_60px] [mask-image:radial-gradient(ellipse_at_center,black_50%,transparent_100%)]" />

        {/* Chaos Layer */}
        <div className={`absolute inset-0 p-8 md:p-16 flex items-center justify-center transition-all duration-700 ease-in-out ${
          !showClarity ? 'opacity-100 scale-100 z-10' : 'opacity-0 scale-105 z-0 pointer-events-none blur-sm'
        }`}>
          <div className="w-full max-w-2xl space-y-3">
            {current.chaos.map((item, idx) => (
              <div
                key={idx}
                className={`group flex items-center gap-4 p-4 rounded-xl bg-zinc-900/80 border border-zinc-800 text-sm text-zinc-300 backdrop-blur-sm transition-all duration-500 ${
                  isProcessing ? 'translate-y-4 opacity-0' : 'translate-y-0 opacity-100'
                }`}
                style={{
                  transitionDelay: `${idx * 100}ms`,
                  transform: `translateX(${idx % 2 === 0 ? '-8px' : '8px'}) rotate(${idx % 2 === 0 ? '-1deg' : '1deg'})`
                }}
              >
                <div className="p-2 rounded-lg bg-zinc-800 border border-zinc-700 group-hover:border-zinc-600 transition-colors">
                  <ChaosIcon type={item.type} />
                </div>
                <span className="flex-1 font-medium">{item.text}</span>
                <div className="w-2 h-2 rounded-full bg-cyan-500/50 animate-pulse" />
              </div>
            ))}
          </div>
        </div>

        {/* Processing Layer */}
        {isProcessing && (
          <div className="absolute inset-0 flex items-center justify-center z-20 bg-zinc-950/60 backdrop-blur-md">
            <div className="flex flex-col items-center gap-6 p-8 rounded-2xl bg-zinc-900/80 border border-zinc-800">
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-1.5 h-8 bg-gradient-to-t from-cyan-500 to-blue-500 rounded-full animate-[wave_1.2s_ease-in-out_infinite]"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
              <div className="flex flex-col items-center gap-2">
                <span className="text-xs font-mono text-zinc-400 uppercase tracking-widest">Building conviction</span>
                <div className="w-48 h-1 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 transition-all duration-300 ease-out rounded-full"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Clarity Layer */}
        <div className={`absolute inset-0 p-8 md:p-16 flex items-center justify-center transition-all duration-700 ease-out z-30 ${
          showClarity ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-8 scale-95 pointer-events-none'
        }`}>
          <div className="w-full max-w-lg rounded-2xl bg-zinc-900 border border-zinc-800 overflow-hidden shadow-2xl">
            <div className="h-1 w-full bg-gradient-to-r from-cyan-500 via-blue-500 to-emerald-400" />

            <div className="p-6 border-b border-zinc-800 flex items-center gap-4">
              <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
                <Brain className="w-5 h-5 text-cyan-400" />
              </div>
              <div className="flex-1">
                <p className="text-white font-semibold">{current.clarity.action}</p>
                <p className="text-zinc-500 text-sm">{current.clarity.subject}</p>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Ready
              </div>
            </div>

            <div className="p-6 space-y-6">
              <p className="text-zinc-300 leading-relaxed text-sm">
                {current.clarity.desc}
              </p>

              <button className="w-full group flex items-center justify-center gap-2 py-3.5 rounded-xl bg-white text-black font-semibold hover:bg-zinc-200 transition-all duration-300">
                <Zap className="w-4 h-4" />
                {current.clarity.button}
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Live Indicator */}
      <div className="flex justify-center mt-6">
        <div className="inline-flex items-center gap-2 text-xs text-zinc-500">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Live demo • {SCENARIOS[activeTab].label}
        </div>
      </div>
    </div>
  );
}

// ─── Artifact Demo Component ─────────────────────────────────────────────────
function ArtifactDemo(): React.ReactElement {
  const [state, setState] = useState('preview'); // preview | approved | skipped

  if (state === 'approved') {
    return (
      <div className="w-full max-w-2xl mx-auto rounded-2xl bg-zinc-900 border border-emerald-500/30 p-8 text-center">
        <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-4">
          <Check className="w-6 h-6 text-emerald-400" />
        </div>
        <p className="text-white font-medium mb-2">Action executed</p>
        <p className="text-zinc-500 text-sm mb-6">Email sent. Calendar updated. You never touched a keyboard.</p>
        <button
          onClick={() => setState('preview')}
          className="text-xs text-zinc-500 hover:text-white transition-colors uppercase tracking-wider"
        >
          Reset demo
        </button>
      </div>
    );
  }

  if (state === 'skipped') {
    return (
      <div className="w-full max-w-2xl mx-auto rounded-2xl bg-zinc-900 border border-zinc-700 p-8 text-center">
        <div className="w-12 h-12 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center mx-auto mb-4">
          <X className="w-6 h-6 text-zinc-500" />
        </div>
        <p className="text-white font-medium mb-2">Pattern skipped</p>
        <p className="text-zinc-500 text-sm mb-6">Foldera learns. This type of action will rank lower in your queue.</p>
        <button
          onClick={() => setState('preview')}
          className="text-xs text-zinc-500 hover:text-white transition-colors uppercase tracking-wider"
        >
          Reset demo
        </button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto rounded-2xl bg-zinc-950 border border-zinc-800 overflow-hidden shadow-2xl">
      <div className="h-1 w-full bg-gradient-to-r from-cyan-500 to-emerald-400" />

      <div className="p-6 border-b border-zinc-800 flex items-center gap-4">
        <div className="p-2.5 rounded-lg bg-zinc-900 border border-zinc-800">
          <Mail className="w-5 h-5 text-zinc-400" />
        </div>
        <div className="flex-1">
          <p className="text-white font-medium">Draft ready for review</p>
          <p className="text-zinc-500 text-sm">Re: Partnership proposal — Marcus Chen</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
          <Clock className="w-3 h-3" />
          Drafted 2h ago
        </div>
      </div>

      <div className="p-6 space-y-4">
        <div className="rounded-xl bg-zinc-900/50 border border-zinc-800 p-4 font-mono text-sm text-zinc-400 space-y-2">
          <div>To: marcus@techcorp.io</div>
          <div>Subject: Re: Partnership proposal</div>
          <div className="pt-2 text-zinc-300 font-sans text-base leading-relaxed whitespace-pre-wrap">
            {`Marcus,\n\nThanks for the thorough proposal. After reviewing, I'm aligned on the revenue share model — let's schedule 30 minutes this week to finalize terms.\n\nFriday 3pm works if that fits you.`}
          </div>
        </div>
        <div className="flex items-start gap-3 p-4 rounded-xl bg-cyan-500/5 border border-cyan-500/10">
          <Brain className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
          <p className="text-cyan-100/80 text-sm leading-relaxed">
            Based on 12 previous exchanges with Marcus, this tone matches your typical response pattern.
            Thread was idle for 4 days.
          </p>
        </div>
      </div>

      <div className="p-6 pt-0 flex gap-3">
        <button
          onClick={() => setState('approved')}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-white text-black font-semibold hover:bg-zinc-200 transition-all"
        >
          <Check className="w-4 h-4" />
          Approve & Send
        </button>
        <button
          onClick={() => setState('skipped')}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-zinc-900 text-zinc-400 font-semibold hover:bg-zinc-800 hover:text-white border border-zinc-800 transition-all"
        >
          <X className="w-4 h-4" />
          Skip
        </button>
      </div>
    </div>
  );
}

// ─── Navigation ──────────────────────────────────────────────────────────────
interface NavigationProps {
  scrolled: boolean;
}

function Navigation({ scrolled }: NavigationProps) {
  return (
    <nav className={`fixed top-0 w-full z-50 transition-all duration-500 ${
      scrolled
        ? 'bg-zinc-950/80 backdrop-blur-xl border-b border-zinc-800 py-4'
        : 'bg-transparent py-6'
    }`}>
      <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
        <div className="flex items-center gap-3 group cursor-pointer">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center group-hover:scale-105 transition-transform">
            <Brain className="w-4 h-4 text-white" />
          </div>
          <span className="text-lg font-semibold tracking-tight text-white">Foldera</span>
        </div>

        <div className="hidden md:flex items-center gap-8">
          <a href="#product" className="text-sm text-zinc-400 hover:text-white transition-colors">Product</a>
          <a href="#security" className="text-sm text-zinc-400 hover:text-white transition-colors">Security</a>
          <a href="#pricing" className="text-sm text-zinc-400 hover:text-white transition-colors">Pricing</a>
        </div>

        <div className="flex items-center gap-4">
          <a href="/start" className="hidden sm:block text-sm text-zinc-400 hover:text-white transition-colors">
            Sign in
          </a>
          <a href="/start" className="px-5 py-2.5 rounded-full bg-white text-black text-sm font-semibold hover:bg-zinc-200 transition-all">
            Get started
          </a>
        </div>
      </div>
    </nav>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function App() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-white selection:bg-cyan-500/30 selection:text-white">
      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');

        @keyframes wave {
          0%, 100% { transform: scaleY(0.5); }
          50% { transform: scaleY(1); }
        }

        @media (prefers-reduced-motion: reduce) {
          *, ::before, ::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
        }
      `}} />

      <Navigation scrolled={scrolled} />

      {/* ─── HERO ─── */}
      <section className="relative pt-32 pb-24 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(6,182,212,0.15),transparent)]" />

        <div className="relative max-w-7xl mx-auto px-6">
          <Reveal>
            <ChaosToClarity />
          </Reveal>
        </div>
      </section>

      {/* ─── FEATURES ─── */}
      <section id="product" className="py-32 relative">
        <div className="max-w-7xl mx-auto px-6">
          <Reveal>
            <div className="max-w-3xl mb-20">
              <h2 className="text-4xl md:text-5xl font-semibold tracking-tight text-white mb-6">
                Built for the way you actually work.
              </h2>
              <p className="text-xl text-zinc-400 leading-relaxed">
                No prompts. No templates. No management. Just finished work, delivered before you know you need it.
              </p>
            </div>
          </Reveal>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              {
                icon: Database,
                title: 'Continuous ingestion',
                desc: 'Email, calendar, docs, and conversations. All ingested, indexed, and understood. 24/7.',
                color: 'cyan'
              },
              {
                icon: Brain,
                title: 'Conviction engine',
                desc: 'Bayesian reasoning on your own historical outcomes. Every recommendation has a confidence score.',
                color: 'blue'
              },
              {
                icon: Zap,
                title: 'Zero-prompt execution',
                desc: 'No chatting. No context-setting. Finished work appears in your queue, ready to ship.',
                color: 'emerald'
              },
              {
                icon: Layers,
                title: 'Action templates',
                desc: 'From complex outreach cadences to routine follow-ups. Templated, personalized, and ready.',
                color: 'purple'
              },
              {
                icon: Terminal,
                title: 'Command center',
                desc: 'Run multi-step sweeps across your entire history. One command, infinite execution.',
                color: 'orange'
              },
              {
                icon: Lock,
                title: 'Private by design',
                desc: 'Your data never trains global models. End-to-end encryption. Zero-retention available.',
                color: 'rose'
              }
            ].map((feature, i) => {
              const Icon = feature.icon;
              const colorMap: Record<string, string> = {
                cyan: 'group-hover:text-cyan-400 group-hover:bg-cyan-400/10 group-hover:border-cyan-400/20',
                blue: 'group-hover:text-blue-400 group-hover:bg-blue-400/10 group-hover:border-blue-400/20',
                emerald: 'group-hover:text-emerald-400 group-hover:bg-emerald-400/10 group-hover:border-emerald-400/20',
                purple: 'group-hover:text-purple-400 group-hover:bg-purple-400/10 group-hover:border-purple-400/20',
                orange: 'group-hover:text-orange-400 group-hover:bg-orange-400/10 group-hover:border-orange-400/20',
                rose: 'group-hover:text-rose-400 group-hover:bg-rose-400/10 group-hover:border-rose-400/20'
              };

              return (
                <Reveal key={i} delay={i * 100}>
                  <div className="group p-8 rounded-2xl bg-zinc-900/30 border border-zinc-800 hover:bg-zinc-900/60 hover:border-zinc-700 transition-all duration-300 cursor-default h-full">
                    <div className={`w-10 h-10 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center mb-6 transition-all duration-300 ${colorMap[feature.color]}`}>
                      <Icon className="w-5 h-5 text-zinc-400 group-hover:text-current transition-colors" />
                    </div>
                    <h3 className="text-lg font-semibold text-white mb-3">{feature.title}</h3>
                    <p className="text-zinc-400 text-sm leading-relaxed">{feature.desc}</p>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ─── HOW IT WORKS ─── */}
      <section className="py-32 border-y border-zinc-800/50 bg-zinc-900/10">
        <div className="max-w-7xl mx-auto px-6">
          <Reveal>
            <div className="text-center mb-20">
              <span className="text-cyan-400 text-sm font-medium uppercase tracking-wider">The Loop</span>
              <h2 className="text-4xl md:text-5xl font-semibold tracking-tight text-white mt-4">
                Work faster than humanly possible.
              </h2>
            </div>
          </Reveal>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: '01',
                title: 'Connect',
                desc: 'Link your core stack. Foldera builds a real-time identity graph from your behavior.'
              },
              {
                step: '02',
                title: 'Synthesize',
                desc: 'Agents read new data overnight, map it to your goals, and draft the exact work product needed.'
              },
              {
                step: '03',
                title: 'Execute',
                desc: 'Wake up to a queue of finished work. One tap to approve. The system learns from every decision.'
              }
            ].map((item, i) => (
              <Reveal key={i} delay={i * 150}>
                <div className="relative p-8 rounded-2xl bg-zinc-900/30 border border-zinc-800 group hover:border-zinc-700 transition-all duration-300 h-full">
                  <span className="absolute top-6 right-6 text-6xl font-bold text-zinc-800 group-hover:text-zinc-700 transition-colors">
                    {item.step}
                  </span>
                  <div className="w-12 h-12 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center mb-6 group-hover:bg-zinc-700 transition-colors">
                    <span className="text-lg font-semibold text-zinc-400 group-hover:text-white">{item.step}</span>
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-3">{item.title}</h3>
                  <p className="text-zinc-400 leading-relaxed">{item.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ─── ARTIFACT DEMO ─── */}
      <section className="py-32 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(59,130,246,0.08),transparent_50%)]" />

        <div className="relative max-w-7xl mx-auto px-6">
          <Reveal>
            <div className="text-center mb-16">
              <span className="text-blue-400 text-sm font-medium uppercase tracking-wider">Tangible Output</span>
              <h2 className="text-4xl md:text-5xl font-semibold tracking-tight text-white mt-4 mb-6">
                Finished work, not recommendations.
              </h2>
              <p className="text-xl text-zinc-400 max-w-2xl mx-auto">
                Foldera doesn&apos;t give you advice. It gives you the draft. You just decide: ship it or skip it.
              </p>
            </div>
          </Reveal>

          <Reveal delay={200}>
            <ArtifactDemo />
          </Reveal>
        </div>
      </section>

      {/* ─── SECURITY ─── */}
      <section id="security" className="py-24 border-y border-zinc-800/50">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <Reveal>
            <div className="w-12 h-12 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center mx-auto mb-6">
              <Shield className="w-6 h-6 text-zinc-400" />
            </div>
            <h2 className="text-3xl font-semibold tracking-tight text-white mb-4">
              Enterprise-grade by default.
            </h2>
            <p className="text-zinc-400 mb-12 max-w-xl mx-auto">
              Your data is never used to train global models. End-to-end encryption. Your data stays yours. Always.
            </p>

            <div className="flex flex-wrap justify-center gap-3">
              {['AES-256 encryption', 'Private by default', 'Zero-retention available'].map((badge) => (
                <div key={badge} className="px-4 py-2 rounded-full bg-zinc-900 border border-zinc-800 text-sm text-zinc-400 font-medium">
                  {badge}
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ─── PRICING ─── */}
      <section id="pricing" className="py-32">
        <div className="max-w-5xl mx-auto px-6">
          <Reveal>
            <div className="text-center mb-16">
              <h2 className="text-4xl md:text-5xl font-semibold tracking-tight text-white mb-4">
                One plan. Full power.
              </h2>
              <p className="text-zinc-400 text-lg">
                $99/month. 14 days free. Cancel anytime.
              </p>
            </div>
          </Reveal>

          <Reveal delay={100}>
            <div className="max-w-lg mx-auto">
              <div className="rounded-3xl bg-gradient-to-b from-zinc-800 to-zinc-900 p-[1px]">
                <div className="rounded-[calc(1.5rem-1px)] bg-zinc-950 p-8 md:p-12">
                  <div className="flex items-center justify-between mb-8">
                    <div>
                      <p className="text-cyan-400 text-sm font-medium uppercase tracking-wider mb-1">Pro</p>
                      <div className="flex items-baseline gap-1">
                        <span className="text-5xl font-semibold text-white">$99</span>
                        <span className="text-zinc-500">/month</span>
                      </div>
                    </div>
                    <div className="px-4 py-2 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-medium">
                      14 days free
                    </div>
                  </div>

                  <div className="space-y-4 mb-8">
                    {[
                      'Unlimited integrations',
                      'Unlimited daily actions',
                      'Full autonomous queue',
                      'All specialist agents',
                      'Priority processing',
                      'Email + calendar sync'
                    ].map((feature) => (
                      <div key={feature} className="flex items-center gap-3 text-zinc-300">
                        <div className="w-5 h-5 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0">
                          <Check className="w-3 h-3 text-cyan-400" />
                        </div>
                        <span className="text-sm">{feature}</span>
                      </div>
                    ))}
                  </div>

                  <a
                    href="/start"
                    className="w-full py-4 rounded-xl bg-white text-black font-semibold hover:bg-zinc-200 transition-all flex items-center justify-center gap-2 group"
                  >
                    Start free trial
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                  </a>

                  <p className="text-center text-zinc-500 text-xs mt-4">
                    No credit card required. Cancel in one click.
                  </p>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ─── FINAL CTA ─── */}
      <section className="py-32 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_100%,rgba(6,182,212,0.15),transparent)]" />

        <div className="relative max-w-4xl mx-auto px-6 text-center">
          <Reveal>
            <h2 className="text-5xl md:text-7xl font-semibold tracking-tight text-white mb-6 leading-tight">
              Stop managing.<br />
              Start executing.
            </h2>
            <p className="text-xl text-zinc-400 mb-12 max-w-xl mx-auto">
              Join the founders, operators, and executives who&apos;ve replaced their chaos with conviction.
            </p>
            <div className="flex items-center justify-center">
              <a
                href="/start"
                className="px-8 py-4 rounded-full bg-white text-black font-semibold hover:bg-zinc-200 transition-all flex items-center gap-2 group"
              >
                Get started free
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </a>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer className="border-t border-zinc-800 py-12">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
              <Brain className="w-3 h-3 text-white" />
            </div>
            <span className="text-sm font-semibold text-white">Foldera</span>
          </div>

          <div className="flex items-center gap-8 text-sm text-zinc-500">
            <a href="#security" className="hover:text-white transition-colors">Security</a>
            <a href="#" className="hover:text-white transition-colors">Privacy</a>
            <a href="#" className="hover:text-white transition-colors">Terms</a>
            <a href="#" className="hover:text-white transition-colors">Support</a>
          </div>

          <p className="text-xs text-zinc-600" suppressHydrationWarning>
            © {new Date().getFullYear()} Foldera AI
          </p>
        </div>
      </footer>
    </div>
  );
}
