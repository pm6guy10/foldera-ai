'use client';

import React, { useState, useEffect, useRef } from 'react';
import { ArrowRight, Layers, ChevronDown } from 'lucide-react';

const ACTION_LABELS: Record<string, string> = {
  write_document: 'Write',
  send_message:   'Reach Out',
  make_decision:  'Decide',
  do_nothing:     'Wait',
  schedule:       'Schedule',
  research:       'Research',
};

const ACTION_COLORS: Record<string, string> = {
  write_document: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  send_message:   'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  make_decision:  'bg-amber-500/20 text-amber-300 border-amber-500/30',
  do_nothing:     'bg-zinc-500/20 text-zinc-300 border-zinc-500/30',
  schedule:       'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  research:       'bg-blue-500/20 text-blue-300 border-blue-500/30',
};

interface Directive {
  directive:     string;
  action_type:   string;
  confidence:    number;
  reason:        string;
  evidence:      Array<{ type: string; description: string; date: string | null }>;
  artifact_type?: string;
  artifact?:     any;
}

// ---------------------------------------------------------------------------
// Context inference — what can we observe about this stranger?
// ---------------------------------------------------------------------------

interface VisitorContext {
  timeOfDay: 'late_night' | 'early_morning' | 'morning' | 'afternoon' | 'evening';
  dayOfWeek: string;
  isWeekend: boolean;
  hour: number;
  scenario: string | null;  // from LP click: job, builder, life
  referrer: string | null;
  device: 'mobile' | 'desktop';
}

function getVisitorContext(): VisitorContext {
  const now = new Date();
  const hour = now.getHours();
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const day = now.getDay();

  let timeOfDay: VisitorContext['timeOfDay'] = 'morning';
  if (hour >= 22 || hour < 5) timeOfDay = 'late_night';
  else if (hour >= 5 && hour < 7) timeOfDay = 'early_morning';
  else if (hour >= 7 && hour < 12) timeOfDay = 'morning';
  else if (hour >= 12 && hour < 17) timeOfDay = 'afternoon';
  else timeOfDay = 'evening';

  // Check URL params for scenario and ref
  const params = new URLSearchParams(window.location.search);
  const scenario = params.get('s') || params.get('scenario');
  const ref = params.get('ref') || null;

  // Check referrer
  let referrer: string | null = null;
  try {
    const docRef = document.referrer;
    if (docRef) {
      if (docRef.includes('reddit.com')) referrer = 'reddit';
      else if (docRef.includes('twitter.com') || docRef.includes('x.com')) referrer = 'twitter';
      else if (docRef.includes('linkedin.com')) referrer = 'linkedin';
      else if (docRef.includes('news.ycombinator.com')) referrer = 'hackernews';
      else if (!docRef.includes('foldera.ai') && !docRef.includes('localhost')) referrer = 'external';
    }
  } catch { /* cross-origin */ }

  const device = window.innerWidth < 768 ? 'mobile' : 'desktop';

  return {
    timeOfDay,
    dayOfWeek: dayNames[day],
    isWeekend: day === 0 || day === 6,
    hour,
    scenario: scenario || ref,
    referrer: referrer || (ref ? ref : null),
    device,
  };
}

// ---------------------------------------------------------------------------
// Cold read — the system's opening observation
// ---------------------------------------------------------------------------

interface ColdRead {
  observation: string;
  subtext: string;
  confidence: number;  // 30-45 range
}

function generateColdRead(ctx: VisitorContext): ColdRead {
  // Late night browsing
  if (ctx.timeOfDay === 'late_night') {
    if (ctx.scenario === 'job') {
      return {
        observation: `It's ${ctx.hour > 12 ? ctx.hour - 12 : ctx.hour}${ctx.hour >= 12 ? 'pm' : 'am'} on a ${ctx.dayOfWeek} and you're looking at a productivity tool after clicking on a job search scenario.`,
        subtext: "That's not casual browsing. Something about how you're running your search isn't working, and you know it. The system you have — or don't have — is costing you energy you can't afford to lose right now.",
        confidence: 38,
      };
    }
    if (ctx.scenario === 'builder') {
      return {
        observation: `Late-night ${ctx.dayOfWeek}. You clicked the founder scenario.`,
        subtext: "Founders don't browse productivity tools at this hour unless the current system is failing. Too many plates spinning, not enough of them landing. The chaos isn't the problem — the lack of a triage system is.",
        confidence: 35,
      };
    }
    return {
      observation: `It's ${ctx.hour > 12 ? ctx.hour - 12 : ctx.hour}${ctx.hour >= 12 ? 'pm' : 'am'} on a ${ctx.dayOfWeek} and you're looking at a productivity tool.`,
      subtext: "That's not casual browsing. Something specific is keeping you up. A decision you haven't made, a thing you said you'd do, or a growing pile that's getting harder to ignore.",
      confidence: 33,
    };
  }

  // Early morning
  if (ctx.timeOfDay === 'early_morning') {
    return {
      observation: `Early ${ctx.dayOfWeek} morning. You're here before most people are awake.`,
      subtext: "Early risers who look at tools like this are usually the ones carrying the most. Not because they're disorganized — because they're managing more than one system can hold. The gap between what you're tracking and what you're actually doing is probably wider than you'd like.",
      confidence: 36,
    };
  }

  // Weekend
  if (ctx.isWeekend) {
    if (ctx.scenario === 'life') {
      return {
        observation: `${ctx.dayOfWeek} — the day you were supposed to catch up on life admin.`,
        subtext: "Registrations, renewals, appointments, that email you keep putting off. The list isn't long, but it feels heavy because none of it is hard — it's just boring and easy to postpone. That's exactly the pattern an AI chief of staff handles best.",
        confidence: 40,
      };
    }
    return {
      observation: `It's ${ctx.dayOfWeek}. You're spending part of your weekend looking at this.`,
      subtext: "Weekdays didn't leave enough room to deal with whatever this is. That means either your weeks are overloaded, or something specific is nagging you that doesn't fit into work hours. Both are solvable — but not by adding another app to check.",
      confidence: 34,
    };
  }

  // Scenario-specific weekday reads
  if (ctx.scenario === 'job') {
    return {
      observation: "You clicked the job hunt scenario.",
      subtext: "The system is designed for exactly this pattern: high application volume, low signal on what's working, decision fatigue about what to do next. Most people in an active search are spending 60% of their energy on logistics and 40% on the actual work. Foldera inverts that ratio.",
      confidence: 42,
    };
  }

  if (ctx.scenario === 'builder') {
    return {
      observation: "You clicked the founder scenario.",
      subtext: "Founders don't need more task management. They need something that looks at the 42 things screaming for attention and says: 'This one. Do this one now. I already drafted the email.' The bottleneck isn't effort — it's the cost of deciding what effort to spend.",
      confidence: 40,
    };
  }

  if (ctx.scenario === 'life') {
    return {
      observation: "You clicked the life admin scenario.",
      subtext: "Life admin is the tax on being a functioning adult. It's never urgent enough to prioritize and never unimportant enough to ignore. So it piles up until Saturday morning feels like Monday. Foldera treats these exactly like a chief of staff would — handle them before you have to think about them.",
      confidence: 39,
    };
  }

  // Referrer-based reads
  if (ctx.referrer === 'reddit') {
    return {
      observation: "You came here from Reddit.",
      subtext: "Someone's post about overwhelm, dropping balls, or needing a system resonated enough to click a link. That's not idle curiosity — that's recognition. The fact that you're still here means the pain is real, not theoretical.",
      confidence: 37,
    };
  }

  if (ctx.referrer === 'twitter') {
    return {
      observation: "You came here from X.",
      subtext: "Twitter to productivity tool is a specific pipeline: someone said something that hit close, and you want to see if there's a real solution behind it. Most of the time there isn't. This time might be different.",
      confidence: 35,
    };
  }

  if (ctx.referrer === 'hackernews') {
    return {
      observation: "You came here from Hacker News.",
      subtext: "HN visitors evaluate tools differently. You're not looking for features — you're looking for whether the architecture is real. Short answer: Bayesian confidence scoring on your own behavioral history, deterministic math, not LLM opinions. The rest is artifact generation.",
      confidence: 41,
    };
  }

  // Default — afternoon/evening weekday, no scenario
  if (ctx.timeOfDay === 'afternoon') {
    return {
      observation: `${ctx.dayOfWeek} afternoon. Middle of the workday.`,
      subtext: "Most people who look at new tools during work hours are doing it because the current approach just failed them — a ball dropped, a follow-up was missed, or the to-do list got so long it became useless. Sound familiar?",
      confidence: 34,
    };
  }

  return {
    observation: `${ctx.dayOfWeek} ${ctx.timeOfDay === 'evening' ? 'evening' : 'morning'}. You found your way here.`,
    subtext: "People who search for tools like Foldera aren't disorganized. They're carrying too much. The gap isn't capability — it's that there are more decisions to make than hours to make them. That's exactly the problem this solves.",
    confidence: 35,
  };
}

// ---------------------------------------------------------------------------
// Typing animation hook
// ---------------------------------------------------------------------------

function useTypingEffect(text: string, speed: number = 25, startDelay: number = 500) {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    setDisplayed('');
    setDone(false);
    let i = 0;
    let timeout: ReturnType<typeof setTimeout>;

    timeout = setTimeout(() => {
      const interval = setInterval(() => {
        if (i < text.length) {
          setDisplayed(text.slice(0, i + 1));
          i++;
        } else {
          clearInterval(interval);
          setDone(true);
        }
      }, speed);

      timeout = interval as any;
    }, startDelay);

    return () => {
      clearTimeout(timeout);
      clearInterval(timeout as any);
    };
  }, [text, speed, startDelay]);

  return { displayed, done };
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function TryPage() {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Directive | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showInput, setShowInput] = useState(false);
  const [coldRead, setColdRead] = useState<ColdRead | null>(null);
  const [ctx, setCtx] = useState<VisitorContext | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Generate cold read on mount
  useEffect(() => {
    const visitorCtx = getVisitorContext();
    setCtx(visitorCtx);
    setColdRead(generateColdRead(visitorCtx));
  }, []);

  const observationTyping = useTypingEffect(
    coldRead?.observation ?? '',
    30,
    800,
  );

  const subtextTyping = useTypingEffect(
    coldRead?.subtext ?? '',
    18,
    (coldRead?.observation.length ?? 0) * 30 + 1200,
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
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
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
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const actionLabel = result ? (ACTION_LABELS[result.action_type] ?? result.action_type) : '';
  const actionColor = result ? (ACTION_COLORS[result.action_type] ?? ACTION_COLORS.research) : '';

  return (
    <div
      className="min-h-[100dvh] bg-[#000] text-white antialiased"
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      {/* Nav */}
      <nav className="px-6 py-6 flex items-center justify-between max-w-3xl mx-auto">
        <a href="/" className="flex items-center gap-3 group">
          <div className="w-10 h-10 rounded-2xl bg-white text-black flex items-center justify-center group-hover:scale-105 transition-transform shadow-[0_0_30px_rgba(255,255,255,0.2)]">
            <Layers className="w-5 h-5 fill-black" aria-hidden="true" />
          </div>
          <span className="text-xl font-black tracking-tighter text-white uppercase">Foldera</span>
        </a>
        <a
          href="/start"
          className="px-7 py-3 rounded-full bg-white text-black text-[11px] font-black uppercase tracking-[0.2em] hover:bg-zinc-200 transition-all flex items-center gap-2 hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(255,255,255,0.2)]"
        >
          Get started
        </a>
      </nav>

      <main className="max-w-2xl mx-auto px-5 pt-10 pb-24">

        {/* ── COLD READ PHASE ── */}
        {!result && !showInput && coldRead && (
          <div className="space-y-10">
            {/* System observation */}
            <div className="space-y-6">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-cyan-400/60">
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                System observation
              </div>

              <p className="text-2xl sm:text-3xl font-semibold leading-snug text-white tracking-tight min-h-[3.5rem]">
                {observationTyping.displayed}
                {!observationTyping.done && <span className="inline-block w-[2px] h-[1.2em] bg-cyan-400 ml-0.5 animate-pulse align-text-bottom" />}
              </p>

              <div className={`transition-opacity duration-1000 ${observationTyping.done ? 'opacity-100' : 'opacity-0'}`}>
                <p className="text-zinc-400 text-base leading-relaxed">
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
            </div>

            {/* CTA — go deeper */}
            <div className={`space-y-4 transition-all duration-700 delay-300 ${subtextTyping.done ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
              <div className="h-px bg-gradient-to-r from-transparent via-zinc-800 to-transparent" />

              <button
                onClick={() => setShowInput(true)}
                className="w-full group flex items-center justify-between p-5 rounded-2xl bg-zinc-950/80 border border-white/5 hover:border-cyan-500/20 transition-all"
              >
                <div className="text-left">
                  <p className="text-white font-semibold text-sm">Want to go deeper?</p>
                  <p className="text-zinc-500 text-xs mt-1">Tell me what you're actually dealing with. I'll show you what Foldera does with real context.</p>
                </div>
                <ChevronDown className="w-5 h-5 text-zinc-600 group-hover:text-cyan-400 transition-colors shrink-0 ml-4" />
              </button>

              <div className="text-center pt-4">
                <a
                  href="/start"
                  className="inline-flex items-center gap-2 text-zinc-500 hover:text-white text-sm transition-colors group"
                >
                  Or skip ahead and connect your real data
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </a>
              </div>
            </div>
          </div>
        )}

        {/* ── TEXT INPUT PHASE ── */}
        {!result && showInput && (
          <div className="space-y-6">
            {/* Collapsed cold read */}
            <div className="p-4 rounded-xl bg-zinc-950/60 border border-white/5">
              <p className="text-zinc-500 text-sm leading-relaxed">{coldRead?.observation}</p>
            </div>

            <div className="text-center">
              <h2 className="text-2xl sm:text-3xl font-black tracking-tighter text-white mb-2">
                Go deeper
              </h2>
              <p className="text-zinc-500 text-sm">
                Paste a paragraph about what you're working on or struggling with right now.
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
                <p className="text-red-400 text-sm font-mono">{error}</p>
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
          <div className="space-y-8">
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

            {/* CTA */}
            <div className="bg-zinc-950/60 border border-white/5 rounded-[2rem] p-8 text-center space-y-6 backdrop-blur-sm">
              <p className="text-zinc-400 text-base leading-relaxed font-medium">
                That was one paragraph.<br />
                Imagine what Foldera does with 30 days of your actual history.
              </p>
              <a
                href="/start"
                className="inline-flex items-center gap-2 px-8 py-4 rounded-full bg-white text-black font-black uppercase tracking-[0.15em] text-xs hover:bg-zinc-200 transition-all group shadow-[0_0_30px_rgba(255,255,255,0.2)] hover:scale-105 active:scale-95"
              >
                Connect your history
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </a>
              <p className="text-zinc-600 text-[10px] font-black uppercase tracking-[0.2em]">14 days free &middot; No credit card required</p>
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
      </main>
    </div>
  );
}

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
            <span className="text-zinc-300 truncate">{artifact.to ?? '—'}</span>
          </div>
          <div className="flex gap-2 border-t border-zinc-700/40 pt-3">
            <span className="text-zinc-500 w-14 shrink-0">Subject</span>
            <span className="text-zinc-300">{artifact.subject ?? '—'}</span>
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
          <p className="text-zinc-600 text-xs mt-3">Full document ready on approval</p>
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
          {Array.isArray(artifact.sources) && artifact.sources.length > 0 && (
            <p className="text-zinc-600 text-xs mt-2">{artifact.sources.length} source{artifact.sources.length !== 1 ? 's' : ''} identified</p>
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
            <p className="text-zinc-500 text-xs">{new Date(artifact.start).toLocaleString()} — {artifact.end ? new Date(artifact.end).toLocaleString() : ''}</p>
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
