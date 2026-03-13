'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Briefcase,
  Rocket,
  Home,
  FileText,
  Calendar as CalendarIcon,
  Shield,
  ArrowRight,
  RotateCcw,
  Check,
} from 'lucide-react';

// ─── Scenario data ──────────────────────────────────────────────────────────

type ActionTypeBadge = 'write_document' | 'schedule';

interface ChaosElement {
  id: string;
  type: 'email' | 'tab' | 'notification' | 'document' | 'message' | 'calendar' | 'alert';
  content: string;
  subContent?: string;
}

interface ClarityCard {
  directive: string;
  confidence: number;
  artifactPreview: string[];
  actionType: ActionTypeBadge;
  buttonLabel: string;
}

interface Scenario {
  id: string;
  label: string;
  icon: React.ElementType;
  chaos: ChaosElement[];
  clarity: ClarityCard;
}

const SCENARIOS: Scenario[] = [
  {
    id: 'job-search',
    label: 'The Job Search Grind',
    icon: Briefcase,
    chaos: [
      {
        id: 'js-1',
        type: 'email',
        content: 'Thank you for your interest, but we\'ve decided to move forward with other candidates...',
        subContent: 'from: hr@company.com',
      },
      {
        id: 'js-2',
        type: 'tab',
        content: 'careers.wa.gov',
        subContent: 'Program Analyst — DSHS',
      },
      {
        id: 'js-3',
        type: 'tab',
        content: 'indeed.com/jobs',
        subContent: '47 new results',
      },
      {
        id: 'js-4',
        type: 'document',
        content: 'Cover Letter — Draft v3',
        subContent: 'Dear Hiring Manager, I am writing to express my...',
      },
      {
        id: 'js-5',
        type: 'calendar',
        content: 'CONFLICTS DETECTED',
        subContent: 'Panel Interview 2pm · Phone Screen 2:30pm · Info Session 3pm',
      },
      {
        id: 'js-6',
        type: 'email',
        content: 'RE: Following up on our conversation...',
        subContent: 'Draft — unsent (3 days)',
      },
    ],
    clarity: {
      directive:
        'Stop applying to roles below your experience level. I found a Program Analyst position at DSHS that matches your compliance and coordination background. I drafted the cover letter and pre-filled the supplemental questions.',
      confidence: 84,
      artifactPreview: [
        'Dear Hiring Committee,',
        'With seven years in regulatory compliance and cross-agency coordination,',
        'I bring a track record of reducing audit findings by 40%...',
      ],
      actionType: 'write_document',
      buttonLabel: 'Approve & Submit',
    },
  },
  {
    id: 'founder',
    label: 'Founder Context-Switching',
    icon: Rocket,
    chaos: [
      {
        id: 'fo-1',
        type: 'notification',
        content: 'Build failed: Cannot find module \'@/lib/utils\'',
        subContent: 'Vercel · 6 hours ago',
      },
      {
        id: 'fo-2',
        type: 'message',
        content: '#general: "Hey, the landing page is down — are you seeing this?"',
        subContent: 'Slack · 3 unread threads',
      },
      {
        id: 'fo-3',
        type: 'notification',
        content: 'ERROR: relation "users" does not exist',
        subContent: 'Supabase · 14 errors in last hour',
      },
      {
        id: 'fo-4',
        type: 'tab',
        content: 'github.com/issues',
        subContent: '#42 · #38 · #35 — all open',
      },
      {
        id: 'fo-5',
        type: 'alert',
        content: 'Hero image 404',
        subContent: 'landing page — broken since Tuesday',
      },
    ],
    clarity: {
      directive:
        'Your deploy has been broken for 6 hours and you\'ve been ignoring it while designing new features. I wrote the fix, tested it locally, and it\'s ready to push.',
      confidence: 91,
      artifactPreview: [
        '- import { cn } from \'@/lib/utils\'',
        '+ import { cn } from \'@/lib/design-system\'',
        '  // 3-line fix resolves build failure',
      ],
      actionType: 'write_document',
      buttonLabel: 'Push to Main',
    },
  },
  {
    id: 'life-admin',
    label: 'Life Admin Avalanche',
    icon: Home,
    chaos: [
      {
        id: 'la-1',
        type: 'email',
        content: 'Reminder: Soccer registration closes Friday',
        subContent: 'Parks & Rec — 2 days left',
      },
      {
        id: 'la-2',
        type: 'message',
        content: '"Hey can you call the insurance company today?"',
        subContent: 'Text from Sarah · 10:14 AM',
      },
      {
        id: 'la-3',
        type: 'alert',
        content: 'Your balance is below $500',
        subContent: 'Bank Alert — checking account',
      },
      {
        id: 'la-4',
        type: 'document',
        content: 'Grocery list',
        subContent: 'Milk, eggs, bread, chicken, ... (incomplete)',
      },
      {
        id: 'la-5',
        type: 'notification',
        content: 'Missed call: Pediatrician\'s Office',
        subContent: 'Today · 9:32 AM — no voicemail',
      },
    ],
    clarity: {
      directive:
        'Soccer registration closes in 48 hours and you haven\'t started it. I filled out the form with your saved details. The insurance call can wait until Monday \u2014 their hold times are 45+ minutes on Thursdays.',
      confidence: 77,
      artifactPreview: [
        'Player: Emma K. \u2014 U10 Division',
        'Session: Spring 2026 \u2014 Saturday mornings',
        'Emergency contact: pre-filled from last year',
      ],
      actionType: 'schedule',
      buttonLabel: 'Submit Registration',
    },
  },
];

// ─── Animation positions for chaos elements ──────────────────────────────────

const CHAOS_POSITIONS = [
  { x: -40, y: -20, rotate: -3 },
  { x: 60, y: 30, rotate: 4 },
  { x: -80, y: 60, rotate: -2 },
  { x: 30, y: -50, rotate: 5 },
  { x: -20, y: 80, rotate: -4 },
  { x: 70, y: -10, rotate: 3 },
];

const ENTRY_ORIGINS = [
  { x: -300, y: -200, rotate: -15 },
  { x: 400, y: -150, rotate: 20 },
  { x: -250, y: 200, rotate: -10 },
  { x: 350, y: 250, rotate: 12 },
  { x: -400, y: 50, rotate: -18 },
  { x: 300, y: -250, rotate: 15 },
];

// ─── Type icon mapping ───────────────────────────────────────────────────────

function getTypeIndicator(type: ChaosElement['type']) {
  switch (type) {
    case 'email':
      return { color: 'bg-blue-500/80', label: 'Email' };
    case 'tab':
      return { color: 'bg-zinc-500/80', label: 'Tab' };
    case 'notification':
      return { color: 'bg-red-500/80', label: 'Error' };
    case 'document':
      return { color: 'bg-cyan-500/80', label: 'Doc' };
    case 'message':
      return { color: 'bg-green-500/80', label: 'Message' };
    case 'calendar':
      return { color: 'bg-amber-500/80', label: 'Calendar' };
    case 'alert':
      return { color: 'bg-red-500/80', label: 'Alert' };
    default:
      return { color: 'bg-zinc-500/80', label: '' };
  }
}

// ─── Action type metadata ────────────────────────────────────────────────────

const ACTION_META: Record<ActionTypeBadge, { label: string; icon: React.ElementType; color: string }> = {
  write_document: { label: 'Write', icon: FileText, color: 'text-cyan-400' },
  schedule: { label: 'Schedule', icon: CalendarIcon, color: 'text-emerald-400' },
};

// ─── Main component ──────────────────────────────────────────────────────────

type Phase = 'idle' | 'chaos' | 'clarity' | 'reset';

export default function ChaosToClarity() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [activeScenario, setActiveScenario] = useState<Scenario | null>(null);
  const [animatedConfidence, setAnimatedConfidence] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const confidenceRef = useRef<number>(0);

  const startScenario = useCallback((scenario: Scenario) => {
    setActiveScenario(scenario);
    setAnimatedConfidence(0);
    confidenceRef.current = 0;
    setPhase('chaos');

    // After chaos accumulation, transition to clarity
    setTimeout(() => {
      setPhase('clarity');

      // Animate confidence counter after card appears
      setTimeout(() => {
        const target = scenario.clarity.confidence;
        const duration = 800;
        const startTime = Date.now();

        const tick = () => {
          const elapsed = Date.now() - startTime;
          const progress = Math.min(elapsed / duration, 1);
          // Ease out cubic
          const eased = 1 - Math.pow(1 - progress, 3);
          const current = Math.round(eased * target);
          confidenceRef.current = current;
          setAnimatedConfidence(current);
          if (progress < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }, 400);
    }, 2800);
  }, []);

  const resetDemo = useCallback(() => {
    setPhase('idle');
    setActiveScenario(null);
    setAnimatedConfidence(0);
  }, []);

  // Preload: nothing to do since all data is inline

  const confidenceColor =
    (activeScenario?.clarity.confidence ?? 0) >= 70
      ? 'text-emerald-400 bg-emerald-900/30 border-emerald-700/40'
      : (activeScenario?.clarity.confidence ?? 0) >= 45
        ? 'text-amber-400 bg-amber-900/30 border-amber-700/40'
        : 'text-zinc-400 bg-zinc-800 border-zinc-700';

  const meta = activeScenario ? ACTION_META[activeScenario.clarity.actionType] : null;
  const MetaIcon = meta?.icon ?? FileText;

  return (
    <div ref={containerRef} className="relative w-full max-w-4xl mx-auto px-5">

      {/* ── Headline ── */}
      <motion.h1
        className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-white leading-[1.1] mb-14 text-center"
        style={{ letterSpacing: '-0.03em' }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        Foldera doesn&apos;t give advice.
        <br className="hidden sm:block" />
        {' '}
        <span className="bg-gradient-to-r from-cyan-400 to-cyan-300 bg-clip-text text-transparent">
          It does the work.
        </span>
      </motion.h1>

      {/* ── Demo container (fixed height to prevent layout shift) ── */}
      <div className="relative min-h-[420px] sm:min-h-[460px]">

        {/* ── Phase 1: Scenario selector ── */}
        <AnimatePresence mode="wait">
          {phase === 'idle' && (
            <motion.div
              key="idle"
              className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-4"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {SCENARIOS.map((scenario) => {
                const Icon = scenario.icon;
                return (
                  <button
                    key={scenario.id}
                    onClick={() => startScenario(scenario)}
                    className="group relative flex items-center gap-3 px-6 py-5 rounded-2xl
                      border border-white/10 bg-white/[0.03] backdrop-blur-xl
                      hover:border-cyan-500/40 hover:bg-cyan-600/[0.06]
                      transition-all duration-300 cursor-pointer
                      min-h-[64px] sm:flex-1"
                  >
                    {/* Hover glow */}
                    <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-cyan-600/0 to-cyan-400/0 group-hover:from-cyan-600/5 group-hover:to-cyan-400/5 transition-all duration-300" />

                    <div className="relative flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-cyan-600/15 flex items-center justify-center shrink-0">
                        <Icon className="w-5 h-5 text-cyan-400" />
                      </div>
                      <span className="text-sm font-medium text-zinc-200 group-hover:text-white transition-colors text-left">
                        {scenario.label}
                      </span>
                    </div>
                  </button>
                );
              })}
            </motion.div>
          )}

          {/* ── Phase 2: Chaos ── */}
          {phase === 'chaos' && activeScenario && (
            <motion.div
              key="chaos"
              className="relative w-full min-h-[380px] sm:min-h-[400px] flex items-center justify-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, y: -40 }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
            >
              {activeScenario.chaos.map((el, i) => {
                const pos = CHAOS_POSITIONS[i % CHAOS_POSITIONS.length];
                const origin = ENTRY_ORIGINS[i % ENTRY_ORIGINS.length];
                const indicator = getTypeIndicator(el.type);
                return (
                  <motion.div
                    key={el.id}
                    className="absolute w-[260px] sm:w-[300px]"
                    initial={{
                      x: origin.x,
                      y: origin.y,
                      rotate: origin.rotate,
                      opacity: 0,
                      scale: 0.7,
                    }}
                    animate={{
                      x: pos.x,
                      y: pos.y,
                      rotate: pos.rotate,
                      opacity: 1,
                      scale: 1,
                    }}
                    transition={{
                      duration: 0.5,
                      delay: i * 0.35,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                  >
                    <div className="rounded-xl border border-white/10 bg-[#16161a]/90 backdrop-blur-md p-4 shadow-2xl shadow-black/40">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`w-2 h-2 rounded-full ${indicator.color}`} />
                        <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                          {indicator.label}
                        </span>
                      </div>
                      <p className="text-zinc-200 text-sm leading-snug mb-1">
                        {el.content}
                      </p>
                      {el.subContent && (
                        <p className="text-zinc-500 text-xs">{el.subContent}</p>
                      )}
                    </div>
                  </motion.div>
                );
              })}

              {/* Processing indicator */}
              <motion.div
                className="absolute bottom-4 left-1/2 flex items-center gap-2"
                initial={{ opacity: 0, x: '-50%' }}
                animate={{ opacity: 1, x: '-50%' }}
                transition={{ delay: 1.5, duration: 0.3 }}
              >
                <div className="w-5 h-5 rounded-md bg-gradient-to-tr from-cyan-600 to-cyan-400 flex items-center justify-center">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                  >
                    <Shield className="w-3 h-3 text-white" />
                  </motion.div>
                </div>
                <span className="text-xs text-zinc-500 font-mono">processing...</span>
              </motion.div>
            </motion.div>
          )}

          {/* ── Phase 3: Clarity (conviction card) ── */}
          {(phase === 'clarity' || phase === 'reset') && activeScenario && (
            <motion.div
              key="clarity"
              className="w-full"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            >
              {/* Conviction card — mirrors real dashboard card */}
              <div className="max-w-xl mx-auto rounded-xl border border-zinc-700 bg-zinc-900 overflow-hidden shadow-2xl shadow-black/50">

                {/* Card header */}
                <div className="px-5 py-3 border-b border-zinc-800 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-cyan-400" />
                  <span className="text-zinc-200 font-semibold text-sm uppercase tracking-wider">
                    Today&apos;s Read
                  </span>
                </div>

                {/* Card body */}
                <div className="p-5">
                  {/* Action type badge */}
                  {meta && (
                    <div className={`inline-flex items-center gap-1.5 mb-4 text-xs font-mono font-semibold uppercase tracking-widest ${meta.color}`}>
                      <MetaIcon className="w-3.5 h-3.5" />
                      {meta.label}
                    </div>
                  )}

                  {/* Directive */}
                  <p className="text-zinc-50 text-lg font-semibold leading-snug mb-3">
                    {activeScenario.clarity.directive}
                  </p>

                  {/* Confidence + reason */}
                  <div className="flex items-start gap-3 mb-5">
                    <span className={`shrink-0 text-xs font-mono font-bold px-2 py-0.5 rounded border ${confidenceColor}`}>
                      {animatedConfidence}%
                    </span>
                    <p className="text-zinc-400 text-sm leading-relaxed">
                      Based on your history, behavioral patterns, and current context.
                    </p>
                  </div>

                  {/* Artifact preview */}
                  <motion.div
                    className="mb-5 rounded-lg border border-zinc-700/60 bg-zinc-800/50 overflow-hidden"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3, duration: 0.3 }}
                  >
                    <div className="px-4 py-2 border-b border-zinc-700/40 flex items-center gap-2">
                      <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-zinc-500">
                        {activeScenario.clarity.actionType === 'write_document' ? 'Draft Preview' : 'Form Preview'}
                      </span>
                    </div>
                    <div className="p-4 font-mono text-sm text-zinc-300 space-y-1 leading-relaxed">
                      {activeScenario.clarity.artifactPreview.map((line, i) => (
                        <p key={i} className={line.startsWith('-') ? 'text-red-400/70' : line.startsWith('+') ? 'text-emerald-400/70' : ''}>
                          {line}
                        </p>
                      ))}
                      <p className="text-zinc-600 mt-1">...</p>
                    </div>
                  </motion.div>

                  {/* Approve button */}
                  <motion.button
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors cursor-default"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5, duration: 0.3 }}
                    whileHover={{ scale: 1.01 }}
                    // Subtle pulse to draw attention
                    onAnimationComplete={() => {
                      // no-op, pulse handled by CSS below
                    }}
                  >
                    <Check className="w-4 h-4" />
                    {activeScenario.clarity.buttonLabel}
                  </motion.button>
                </div>
              </div>

              {/* ── Phase 4: Below-card CTA ── */}
              <motion.div
                className="mt-10 text-center space-y-6"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8, duration: 0.4 }}
              >
                <p className="text-zinc-400 text-base max-w-lg mx-auto">
                  That was with <span className="text-zinc-200 font-medium">zero data</span>.
                  {' '}Imagine six months of yours.
                </p>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  <button
                    onClick={resetDemo}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-full border border-white/10 bg-white/[0.03] text-zinc-300 text-sm font-medium hover:bg-white/[0.06] hover:border-white/20 transition-all"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Try another scenario
                  </button>
                  <a
                    href="/start"
                    className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-white text-black text-sm font-semibold hover:bg-zinc-100 transition-colors group"
                  >
                    Connect your history
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                  </a>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
