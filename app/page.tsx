'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowRight,
  Brain,
  GitCommit,
  Activity,
  ShieldAlert,
  Target,
  Database,
  Cpu,
  Zap,
  Users,
  Briefcase
} from 'lucide-react';
// --- CUSTOM HOOKS ---
const useInView = (options = { threshold: 0.15, triggerOnce: true }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setInView(true);
        if (options.triggerOnce) observer.unobserve(ref.current!);
      }
    }, options);
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [options.triggerOnce, options.threshold]);
  return [ref, inView] as const;
};
const Typewriter = ({ text, delay = 0, speed = 35, onComplete }: { text: string; delay?: number; speed?: number; onComplete?: () => void }) => {
  const [displayedText, setDisplayedText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setIsTyping(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);
  useEffect(() => {
    if (!isTyping) return;
    let i = 0;
    const interval = setInterval(() => {
      setDisplayedText(text.substring(0, i + 1));
      i++;
      if (i === text.length) {
        clearInterval(interval);
        if (onComplete) onComplete();
      }
    }, speed);
    return () => clearInterval(interval);
  }, [text, isTyping, speed]);
  return <>{displayedText}</>;
};
// --- DATA MODELS ---
const eventsData = [
  {
    date: "OCT 12, 2025",
    type: "Conversation",
    message: "I keep second-guessing this decision. Maybe I should just wait.",
  },
  {
    date: "JAN 04, 2026",
    type: "Conversation",
    message: "Same situation again. I don't know why I keep ending up here.",
  },
  {
    date: "FEB 18, 2026",
    type: "Conversation",
    message: "Should I just do something or keep waiting for clarity?",
  },
];
const mechanismData = [
  {
    icon: Database,
    color: "text-[#777]",
    title: "1. Connect History",
    desc: "Your past decisions become a map. Foldera securely indexes your AI conversations, calendar, and emails to build a living behavioral graph."
  },
  {
    icon: Cpu,
    color: "text-[#3A6BFF]",
    title: "2. Extract Patterns",
    desc: "Calculated for your life. Our Bayesian engine maps your historical data against actual outcomes, identifying exactly which actions are most likely to succeed for you."
  },
  {
    icon: Target,
    color: "text-[#777]",
    title: "3. Daily Briefing",
    desc: "Actionable foresight. Wake up to a single, high-confidence verdict delivered before you even ask. No dashboards. Just clarity."
  }
];
const domainData = [
  {
    icon: Briefcase,
    title: "Career",
    desc: "The job you keep almost taking."
  },
  {
    icon: Users,
    title: "Relationships",
    desc: "The person you keep avoiding."
  },
  {
    icon: Zap,
    title: "Decisions",
    desc: "The choice you've made three times."
  }
];
const tickerItems = [
  "You've asked Claude about this job three times. You already know the answer.",
  "You said you'd follow up with Marcus. That was 31 days ago.",
  "You've made this decision before. It didn't work then either.",
  "You keep drafting that email and deleting it. What are you afraid of?",
  "You spend 40% of your planning time on scenarios that never happen."
];
// --- SUB-COMPONENTS ---
const ScrollReveal = ({ children, delay = 0, slow = false }: { children: React.ReactNode; delay?: number; slow?: boolean }) => {
  const [divRef, inView] = useInView({ triggerOnce: true, threshold: 0.15 });
  return (
    <div
      ref={divRef}
      className={`transition-all ${slow ? 'duration-[1500ms]' : 'duration-1000'} ease-[cubic-bezier(0.16,1,0.3,1)] ${inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}
      style={{ transitionDelay: `${delay}s`, willChange: 'opacity, transform' }}
    >
      {children}
    </div>
  );
};
const LiveTicker = () => {
  return (
    <div className="w-full bg-[#050508] py-4 overflow-hidden relative z-20 flex items-center border-t border-white/5">
      <div className="absolute left-0 top-0 bottom-0 w-32 bg-gradient-to-r from-[#050508] to-transparent z-10" />
      <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-[#050508] to-transparent z-10" />
      <div className="flex whitespace-nowrap animate-marquee">
        {[...tickerItems, ...tickerItems].map((item, i) => (
          <div key={i} className="flex items-center mx-12">
            <span className="text-[14px] md:text-[15px] font-serif italic text-[#8A8A8A] tracking-wide">{item}</span>
            <div className="w-1.5 h-1.5 rounded-full bg-white/10 ml-24" />
          </div>
        ))}
      </div>
    </div>
  );
};
const PatternTimeline = ({ confidence = 87, recommendedAction = "Decide now. Waiting is the pattern, not the solution." }: { confidence?: number; recommendedAction?: string }) => {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [showConfidence, setShowConfidence] = useState(false);
  const [showAction, setShowAction] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current || window.innerWidth < 768) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    setMousePos({ x: x * 4, y: y * -4 });
  };
  const handleMouseLeave = () => setMousePos({ x: 0, y: 0 });
  return (
    <div className="w-full max-w-5xl mt-8 mb-16 relative perspective-[1200px] z-20">
      <div className="animate-float w-full relative will-change-transform">
        <div className="absolute inset-0 bg-[#3A6BFF]/10 blur-[60px] md:blur-[80px] rounded-full transform translate-y-8 pointer-events-none transition-opacity duration-700" />

        <div
          ref={containerRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          className="w-full h-full"
        >
          <div
            className="relative w-full glass-panel rounded-2xl overflow-hidden flex flex-col text-left will-change-transform"
            style={{
              transform: `rotateY(${mousePos.x}deg) rotateX(${mousePos.y}deg)`,
              transition: mousePos.x === 0 ? "transform 0.5s ease-out" : "transform 0.1s ease-out",
            }}
          >
            <div className="h-14 border-b border-white/5 flex items-center px-6 justify-between bg-[#08080A]/80">
              <div className="flex items-center gap-3">
                <Target className="w-4 h-4 text-[#777]" />
                <span className="text-xs font-mono text-[#777] uppercase tracking-wider">
                  Live Cognition Engine
                </span>
              </div>
              <div className="flex gap-2 hidden sm:flex">
                <div className="w-2.5 h-2.5 rounded-full bg-white/10"></div>
                <div className="w-2.5 h-2.5 rounded-full bg-white/10"></div>
                <div className="w-2.5 h-2.5 rounded-full bg-white/10"></div>
              </div>
            </div>
            <div className="p-6 sm:p-8 md:p-12 flex flex-col md:flex-row items-center gap-12 md:gap-4">

              <div className="flex-1 w-full opacity-100 md:opacity-85 transform scale-100 md:scale-95 origin-left transition-all duration-700">
                <h3 className="text-[11px] font-mono text-[#777] uppercase tracking-widest mb-6 flex items-center gap-2">
                  Historical Evidence <span className="inline-block w-1.5 h-1.5 bg-[#3A6BFF] rounded-full animate-pulse shadow-[0_0_8px_rgba(58,107,255,0.8)]"></span>
                </h3>

                <div className="relative ml-2 space-y-8 pb-4">
                  <div className="absolute left-[3px] top-2 bottom-0 w-[1px] bg-white/10" />
                  <div className="absolute left-[3px] top-2 w-[1px] bg-gradient-to-b from-[#3A6BFF] via-[#1F3FD6] to-transparent animate-draw-line" />
                  {eventsData.map((event, i) => {
                    const isLast = i === eventsData.length - 1;
                    const nodeClass = isLast ? "node-final" : "node-pulse";
                    const delay = 0.6 + (i * 0.3);
                    return (
                      <ScrollReveal key={i} delay={delay}>
                        <div className="relative pl-6">
                          <div
                            className={`absolute left-0 top-1.5 w-2 h-2 rounded-full bg-[#333] border border-[#555] z-10 ${nodeClass}`}
                            style={{ animationDelay: `${delay}s` }}
                          />
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-xs font-mono ${isLast ? 'text-[#3A6BFF]' : 'text-[#777]'}`}>{event.date}</span>
                            <span className="px-1.5 py-0.5 rounded text-[9px] bg-white/5 text-[#A0A0A0] border border-white/5">
                              {event.type}
                            </span>
                          </div>
                          <p className="text-sm text-white font-medium">"{event.message}"</p>
                        </div>
                      </ScrollReveal>
                    );
                  })}
                </div>
                <ScrollReveal delay={1.6}>
                  <div className="mt-4 p-3 rounded-lg bg-white/5 border border-white/5 flex items-start gap-3 relative overflow-hidden">
                    <div className="absolute inset-0 bg-white/5 opacity-0 animate-[fade-in-up_0.4s_ease-out_1.4s_forwards]" />
                    <GitCommit className="w-4 h-4 text-[#777] mt-0.5 shrink-0 relative z-10" />
                    <div className="relative z-10">
                      <span className="text-xs font-mono text-[#777] uppercase block mb-1">Historical Outcome</span>
                      <span className="text-sm text-[#A0A0A0]">
                        All 3 prior instances resolved without action. Tension subsided naturally within 14 days.
                      </span>
                    </div>
                  </div>
                </ScrollReveal>
              </div>
              <ScrollReveal delay={1.8}>
                <div className="flex-1 w-full md:max-w-sm flex flex-col transform scale-100 md:scale-110 origin-center transition-all duration-700 z-10 md:shadow-[0_0_50px_rgba(0,0,0,0.6)]">
                  <div className="rounded-xl border border-white/10 bg-[#111115] p-6 h-full flex flex-col relative overflow-hidden min-h-[340px]">

                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-[11px] font-mono text-[#3A6BFF] uppercase tracking-widest font-bold">Pattern Detected</h3>
                      <ShieldAlert className="w-4 h-4 text-[#777]" />
                    </div>
                    <p className="text-2xl font-serif text-white mb-3 leading-tight tracking-tight min-h-[64px]">
                      <Typewriter
                        text="The choice you keep postponing is holding you back."
                        delay={2200}
                        speed={30}
                        onComplete={() => setShowConfidence(true)}
                      />
                    </p>

                    <p className={`text-sm text-[#8A8A8A] mb-8 leading-relaxed transition-opacity duration-1000 ${showConfidence ? 'opacity-100' : 'opacity-0'}`}>
                      Foldera mapped 127 past conversations to determine your outcome. You're in the exact sequence of decisions you made last time. Historically, waiting prevented progress.
                    </p>
                    <div className="mt-auto space-y-5">
                      <div className={`transition-opacity duration-700 ${showConfidence ? 'opacity-100' : 'opacity-0'}`} onTransitionEnd={() => setTimeout(() => setShowAction(true), 800)}>
                        <div className="flex justify-between text-xs font-mono mb-2">
                          <span className="text-[#A0A0A0]">Confidence</span>
                          <span className="text-[#3A6BFF] font-bold">{confidence}%</span>
                        </div>
                        <div className="h-1.5 w-full bg-[#222] rounded-full overflow-hidden">
                          <div
                            className={`h-full bg-[#3A6BFF] ${showConfidence ? 'animate-fill-bar' : 'w-0'}`}
                            style={{ '--target-width': `${confidence}%` } as React.CSSProperties}
                          />
                        </div>
                      </div>
                      <div className={`pt-5 border-t border-white/10 transition-opacity duration-700 ${showAction ? 'opacity-100' : 'opacity-0'}`}>
                        <span className="text-xs font-mono text-[#777] uppercase block mb-1">Recommended Action</span>
                        <span className="text-sm text-white font-medium flex items-center">
                          {recommendedAction}
                          <span className="inline-block w-2 h-4 bg-[#3A6BFF] ml-1.5 animate-[pulse_1s_infinite]" />
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </ScrollReveal>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
// --- MAIN APP COMPONENT ---
export default function App() {
  const [scrolled, setScrolled] = useState(false);
  const [offsetY, setOffsetY] = useState(0);
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
      setOffsetY(window.scrollY);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);
  return (
    <div className="min-h-screen bg-[#0B0B0C] text-[#F5F5F5] selection:bg-[#3A6BFF]/30 overflow-x-hidden relative" style={{ fontFamily: "'Inter', sans-serif" }}>

      <style dangerouslySetInnerHTML={{__html: `
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Playfair+Display:ital,wght@0,400;0,600;1,400&display=swap');
        @media (prefers-reduced-motion: reduce) {
          *, ::before, ::after {
            animation-delay: -1ms !important;
            animation-duration: 1ms !important;
            animation-iteration-count: 1 !important;
            background-attachment: initial !important;
            scroll-behavior: auto !important;
            transition-duration: 0s !important;
            transition-delay: 0s !important;
          }
        }
        .font-serif {
          font-family: 'Playfair Display', serif;
        }
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-8px); }
        }
        @keyframes fade-in-up {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes draw-line {
          0% { height: 0%; opacity: 0; }
          10% { opacity: 1; }
          100% { height: 100%; opacity: 1; }
        }
        @keyframes fill-bar {
          0% { width: 0%; }
          100% { width: var(--target-width, 87%); }
        }
        @keyframes node-pulse {
          0% { background-color: #333; border-color: #555; box-shadow: none; }
          40% { background-color: #3A6BFF; border-color: #3A6BFF; box-shadow: 0 0 15px rgba(58, 107, 255, 0.6); }
          100% { background-color: #333; border-color: #555; box-shadow: none; }
        }
        @keyframes node-final {
          0% { background-color: #333; border-color: #555; box-shadow: none; }
          100% { background-color: #3A6BFF; border-color: #3A6BFF; box-shadow: 0 0 12px rgba(58, 107, 255, 0.8); }
        }
        @keyframes marquee {
          0% { transform: translateX(0%); }
          100% { transform: translateX(-50%); }
        }

        .animate-float { animation: float 8s ease-in-out infinite; }
        .animate-fade { animation: fade-in-up 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards; opacity: 0; }
        .animate-draw-line { animation: draw-line 1.2s cubic-bezier(0.8, 0, 0.2, 1) 0.3s forwards; }
        .animate-fill-bar { animation: fill-bar 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards; width: 0; }
        .animate-marquee { animation: marquee 45s linear infinite; }

        .node-pulse { animation: node-pulse 0.4s ease-out forwards; }
        .node-final { animation: node-final 0.4s ease-out forwards; }

        /* Mobile-safe glass panel */
        .glass-panel {
          background: rgba(18, 18, 22, 0.4);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: 0 20px 40px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05);
        }

        @media (min-width: 768px) {
          .glass-panel {
            background: rgba(18, 18, 22, 0.35);
            backdrop-filter: blur(24px);
            -webkit-backdrop-filter: blur(24px);
            box-shadow: 0 30px 60px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.05);
          }
        }

        @media (max-width: 768px) {
          .glass-panel { transform: none !important; }
          .animate-fade { animation: fade-in-up 0.6s ease-out forwards; }
        }
      `}} />
      {/* --- BACKGROUND EFFECTS WITH PARALLAX --- */}
      <div
        className="absolute top-[-10%] md:top-[-20%] left-1/2 -translate-x-1/2 w-[100vw] md:w-[800px] h-[600px] md:h-[800px] rounded-full bg-gradient-to-b from-[#3A6BFF]/15 via-[#1F3FD6]/5 to-transparent blur-[80px] md:blur-[120px] pointer-events-none z-0"
        style={{ transform: `translateX(-50%) translateY(${offsetY * 0.2}px)` }}
      />
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-[0.02] pointer-events-none z-0" />
      {/* --- NAVIGATION --- */}
      <nav className={`fixed top-0 w-full z-50 transition-all duration-300 ${scrolled ? 'bg-[#0B0B0C]/90 backdrop-blur-md border-b border-white/5 py-3 md:py-4' : 'bg-transparent py-4 md:py-6'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-[#3A6BFF] to-[#1F3FD6] flex items-center justify-center shadow-[0_0_15px_rgba(58,107,255,0.3)]">
              <Brain className="w-4 h-4 text-white" />
            </div>
            <span className="text-xl font-semibold tracking-tight" style={{ letterSpacing: '-0.02em' }}>Foldera</span>
          </div>

          <div className="flex items-center gap-4 md:gap-6">
            <button className="text-sm font-medium text-[#A0A0A0] hover:text-white transition-colors hidden sm:block">Log in</button>
            <button className="px-4 py-2 md:px-5 md:py-2.5 rounded-full bg-white text-black text-xs md:text-sm font-semibold hover:bg-gray-200 transition-all">
              Get Early Access
            </button>
          </div>
        </div>
      </nav>
      {/* =========================================
          SECTION 1: HERO (SHOW, THEN TELL)
          ========================================= */}
      <main className="relative z-10 pt-32 md:pt-40 pb-16 max-w-7xl mx-auto px-4 sm:px-6 flex flex-col items-center text-center">

        {/* The Confident, Tiny Headline */}
        <ScrollReveal delay={0.1}>
          <h1 className="text-xl md:text-2xl font-medium text-white mb-6 tracking-tight flex items-center gap-3">
            Your patterns. Finally visible.
          </h1>
        </ScrollReveal>
        {/* --- THE PROOF (Runs Immediately) --- */}
        <PatternTimeline />
        {/* --- THE EXPLANATION --- */}
        <ScrollReveal delay={1.4}>
          <div className="max-w-3xl mx-auto flex flex-col items-center mt-12 md:mt-16">
            <h2 className="text-4xl md:text-6xl font-extrabold text-white mb-6 tracking-tighter" style={{ lineHeight: '0.92' }}>
              You've told Claude everything. <br className="hidden md:block" />
              Now <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#3A6BFF] to-[#7DA2FF]">it's finally listening.</span>
            </h2>
            <p className="text-base md:text-xl text-[#8A8A8A] max-w-2xl mb-10 font-light leading-relaxed px-2">
              Every decision you wrestled with, every pattern you repeated, every moment you almost sent a message but didn't. Foldera reads your history and tells you what it means.
            </p>
            <div className="flex flex-col items-center w-full sm:w-auto">
              <button className="w-full sm:w-auto px-8 py-4 rounded-full bg-[#3A6BFF] text-white font-semibold text-base md:text-lg hover:bg-[#1F3FD6] transition-all flex items-center justify-center gap-2 group shadow-[0_0_20px_rgba(58,107,255,0.2)] md:shadow-[0_0_30px_rgba(58,107,255,0.2)] hover:shadow-[0_0_40px_rgba(58,107,255,0.35)] active:scale-95">
                Connect your history
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </div>
        </ScrollReveal>
      </main>
      {/* --- LIVE TELEMETRY TICKER (The Whispers) --- */}
      <ScrollReveal delay={0.2}>
        <LiveTicker />
      </ScrollReveal>
      {/* =========================================
          SECTION 2: PROVOCATIVE SILENCE (THE VOID)
          ========================================= */}
      <section className="relative z-10 py-48 md:py-64 bg-black flex items-center justify-center">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <ScrollReveal delay={0.2} slow={true}>
            <h2 className="text-4xl sm:text-6xl md:text-[80px] font-bold tracking-tighter text-white leading-[1.1]">
              What has the last year of your life actually taught you?
            </h2>
          </ScrollReveal>
        </div>
      </section>
      {/* =========================================
          SECTION 3: MECHANISM
          ========================================= */}
      <section className="relative z-10 py-24 md:py-32 bg-[#0B0B0C]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
            {mechanismData.map((m, i) => {
              const Icon = m.icon;
              return (
                <ScrollReveal key={i} delay={0.2 + i * 0.15}>
                  <div className="p-8 border border-white/5 rounded-2xl bg-[#0F0F12] hover:bg-white/[0.04] transition-colors h-full flex flex-col items-center text-center md:items-start md:text-left">
                    <Icon className={`w-8 h-8 ${m.color} mb-6`} />
                    <h3 className="text-xl font-semibold mb-3 text-white">{m.title}</h3>
                    <p className="text-sm text-[#8A8A8A] leading-relaxed">{m.desc}</p>
                  </div>
                </ScrollReveal>
              );
            })}
          </div>
        </div>
      </section>
      {/* =========================================
          SECTION 4: DOMAINS OF INTELLIGENCE
          ========================================= */}
      <section className="relative z-10 py-24 md:py-32 border-t border-white/5 bg-[#080809]">
        <div className="max-w-7xl mx-auto px-6">

          <ScrollReveal delay={0.1}>
            <div className="text-center max-w-3xl mx-auto mb-16">
              <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-6 text-[#F5F5F5]" style={{ letterSpacing: '-0.03em' }}>
                Intelligence across every domain.
              </h2>
              <p className="text-[#8A8A8A] text-lg font-light leading-relaxed">
                Foldera doesn't just track tasks. It continuously maps commitments, conflicts, and outcomes across the most critical areas of your life.
              </p>
            </div>
          </ScrollReveal>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
            {domainData.map((d, i) => {
              const Icon = d.icon;
              return (
                <ScrollReveal key={i} delay={0.2 + i * 0.15}>
                  <div className="p-8 border border-[#3A6BFF]/10 rounded-2xl bg-[#111115] shadow-[0_0_30px_rgba(0,0,0,0.5)] h-full relative overflow-hidden group">
                    <div className="absolute top-0 left-0 w-full h-1 bg-[#3A6BFF] opacity-50 group-hover:opacity-100 transition-opacity" />
                    <div className="w-12 h-12 rounded-full bg-[#3A6BFF]/10 flex items-center justify-center mb-6">
                      <Icon className="w-6 h-6 text-[#3A6BFF]" />
                    </div>
                    <h3 className="text-xl font-semibold mb-3 text-white tracking-tight">{d.title}</h3>
                    <p className="text-sm text-[#8A8A8A] leading-relaxed">{d.desc}</p>
                  </div>
                </ScrollReveal>
              );
            })}
          </div>
        </div>
      </section>
      {/* =========================================
          SECTION 5: HIGH STAKES CTA
          ========================================= */}
      <ScrollReveal delay={0.2}>
        <section className="relative z-10 py-32 md:py-40 border-t border-white/5 bg-[#0B0B0C] text-center">
          <div className="absolute inset-0 bg-gradient-to-t from-[#3A6BFF]/5 to-transparent pointer-events-none" />
          <div className="max-w-4xl mx-auto px-6 flex flex-col items-center relative z-10">
            <h2 className="text-4xl md:text-5xl font-bold text-[#F5F5F5] mb-12 tracking-tight" style={{ letterSpacing: '-0.03em' }}>
              Your life already knows the answer.
            </h2>
            <button className="px-10 py-5 rounded-full bg-white text-black font-bold text-lg md:text-xl transition-all shadow-[0_0_30px_rgba(255,255,255,0.15)] hover:shadow-[0_0_50px_rgba(255,255,255,0.25)] hover:bg-gray-100 active:scale-95">
              Find out what your history already knows about you
            </button>
            <p className="mt-6 text-[#555] text-sm font-mono tracking-wide">
              Private by default. Takes 60 seconds to index.
            </p>
          </div>
        </section>
      </ScrollReveal>
      {/* =========================================
          FOOTER
          ========================================= */}
      <footer className="py-12 border-t border-white/10 bg-[#080809] text-center relative z-10">
        <p className="text-[10px] md:text-xs text-[#555] font-mono tracking-widest uppercase">
          © {new Date().getFullYear()} Foldera Intelligence. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
