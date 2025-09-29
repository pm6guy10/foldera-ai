"use client";

import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import Image from "next/image";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Bell,
  CheckCircle,
  Clock,
  Shield,
  Sparkles,
  Target,
  TrendingUp,
  X,
  Zap,
} from "lucide-react";

// ========= State & Reducer =========
const initialState = {
  conflicts: [],
  opportunities: [],
  stats: {
    activeItems: 0,
    valueAtRisk: 0,
    savedThisMonth: 0,
    hoursReclaimed: 0,
    liveCounter: 1287,
    targetActiveItems: 12,
    targetValueAtRisk: 505000,
    targetSavedThisMonth: 847000,
    targetHoursReclaimed: 127,
  },
  loading: false,
  demoHasRun: false,
  showAuthModal: false,
  selectedConflict: null,
  email: "",
  isScrolledIntoView: false,
  notifications: [],
  briefing: null,
  showingBriefing: false,
};

function appReducer(currentState, action) {
  switch (action.type) {
    case "START_DEMO":
      return { ...currentState, loading: true, demoHasRun: false, conflicts: [], opportunities: [] };
    case "LOAD_DATA":
      return {
        ...currentState,
        conflicts: action.payload.conflicts,
        opportunities: action.payload.opportunities,
        loading: false,
        demoHasRun: true,
      };
    case "UPDATE_COUNTERS": {
      if (currentState.demoHasRun) {
        return {
          ...currentState,
          stats: {
            ...currentState.stats,
            hoursReclaimed: Math.min(
              currentState.stats.hoursReclaimed + 1,
              currentState.stats.targetHoursReclaimed
            ),
            activeItems: Math.min(currentState.stats.activeItems + 1, currentState.stats.targetActiveItems),
            valueAtRisk: Math.min(
              currentState.stats.valueAtRisk + Math.floor(Math.random() * 25000) + 10000,
              currentState.stats.targetValueAtRisk
            ),
            savedThisMonth: Math.min(
              currentState.stats.savedThisMonth + Math.floor(Math.random() * 35000) + 15000,
              currentState.stats.targetSavedThisMonth
            ),
          },
        };
      }
      return {
        ...currentState,
        stats: {
          ...currentState.stats,
          liveCounter: currentState.stats.liveCounter + Math.floor(Math.random() * 3) + 1,
        },
      };
    }
    case "TOGGLE_AUTH_MODAL":
      return { ...currentState, showAuthModal: !currentState.showAuthModal };
    case "SELECT_CONFLICT":
      return { ...currentState, selectedConflict: action.payload };
    case "CLOSE_MODALS":
      return { ...currentState, showAuthModal: false, selectedConflict: null };
    case "SET_EMAIL":
      return { ...currentState, email: action.payload };
    case "SET_SCROLL_VISIBILITY":
      return { ...currentState, isScrolledIntoView: action.payload };
    case "ADD_NOTIFICATION":
      return { ...currentState, notifications: [action.payload, ...currentState.notifications] };
    case "REMOVE_NOTIFICATION":
      return { ...currentState, notifications: currentState.notifications.filter((n) => n.id !== action.payload) };
    case "SHOW_BRIEFING":
      return { ...currentState, showingBriefing: true, briefing: action.payload };
    case "HIDE_BRIEFING":
      return { ...currentState, showingBriefing: false, briefing: null };
    default:
      return currentState;
  }
}

// ========= Utilities =========
const useIntersection = (threshold = 0.1) => {
  const ref = useRef(null);
  const [isVisible, setIsVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setIsVisible(entry.isIntersecting), { threshold });
    observer.observe(el);
    return () => observer.unobserve(el);
  }, [threshold]);
  return { ref, isVisible };
};

// ========= Small Components =========
function AnimatedText({ children, delay = 0 }) {
  const { ref, isVisible } = useIntersection(0.1);
  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition-all duration-1000 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
    >
      {children}
    </div>
  );
}

function ParticleField() {
  const [isClient, setIsClient] = useState(false);
  const canvasRef = useRef(null);
  
  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!isClient) return;
    
    const start = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      const setSize = () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
      };
      setSize();
      const particles = Array.from({ length: 50 }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * 2 + 0.5,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        o: Math.random() * 0.5 + 0.3,
      }));
      let rafId;
      const step = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        particles.forEach((p) => {
          p.x += p.vx;
          p.y += p.vy;
          if (p.x < 0) p.x = canvas.width;
          if (p.x > canvas.width) p.x = 0;
          if (p.y < 0) p.y = canvas.height;
          if (p.y > canvas.height) p.y = 0;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(34,211,238,${p.o})`;
          ctx.fill();
        });
        rafId = requestAnimationFrame(step);
      };
      step();
      const onResize = () => setSize();
      window.addEventListener("resize", onResize);
      return () => {
        window.removeEventListener("resize", onResize);
        if (rafId) cancelAnimationFrame(rafId);
      };
    };
    if ("requestIdleCallback" in window) {
      // @ts-ignore - not typed in some environments
      requestIdleCallback(start);
    } else {
      setTimeout(start, 200);
    }
  }, [isClient]);
  
  // Only render canvas on client side to prevent hydration mismatch
  if (!isClient) {
    return null;
  }
  
  return <canvas ref={canvasRef} className="fixed inset-0 -z-20 opacity-40" aria-hidden />;
}

function LiveNotification({ notification, onRemove }) {
  useEffect(() => {
    const t = setTimeout(() => onRemove(notification.id), 5000);
    return () => clearTimeout(t);
  }, [notification.id, onRemove]);
  return (
    <div className="animate-slide-in-right bg-slate-900/90 backdrop-blur-lg border border-cyan-500/30 rounded-lg p-4 flex items-start gap-3 shadow-2xl" role="status" aria-live="polite">
      <div className="flex-shrink-0">
        {notification.type === "alert" ? <AlertCircle className="w-5 h-5 text-amber-400" aria-hidden /> : <CheckCircle className="w-5 h-5 text-green-400" aria-hidden />}
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium text-white">{notification.title}</p>
        <p className="text-xs text-slate-400 mt-1">{notification.message}</p>
      </div>
      <button onClick={() => onRemove(notification.id)} className="text-slate-500 hover:text-white" aria-label="Dismiss notification">
        <X className="w-4 h-4" aria-hidden />
      </button>
    </div>
  );
}

function PricingCard({ title, price, features, highlighted, onCtaClick }) {
  return (
    <div
      className={`relative rounded-3xl p-8 transition-all h-full flex flex-col transform hover:scale-105 ${
        highlighted
          ? "bg-gradient-to-b from-cyan-900/30 to-purple-900/30 border-2 border-cyan-400/70 shadow-2xl shadow-cyan-500/20"
          : "bg-slate-900/50 backdrop-blur border border-slate-800 hover:border-slate-700"
      }`}
    >
      {highlighted && (
        <div className="absolute -top-8 left-1/2 -translate-x-1/2 px-6 py-2 bg-gradient-to-r from-cyan-400 to-purple-500 rounded-full">
          <span className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-1">
            <Sparkles className="w-4 h-4" aria-hidden />
            Most Popular
          </span>
        </div>
      )}
      <div className={highlighted ? "pt-4" : ""}>
        <h3 className="text-2xl font-light mb-4 text-white mt-4">{title}</h3>
        <div className="mb-8">
          <span className="text-5xl font-thin text-white">{price}</span>
          {!price.includes("Custom") && <span className="text-slate-400 ml-2">/month</span>}
        </div>
      </div>
      <ul className="space-y-4 mb-10 flex-grow">
        {features.map((f, i) => (
          <li key={i} className="flex items-start gap-3 text-slate-300">
            <CheckCircle className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" aria-hidden />
            <span className="text-sm">{f}</span>
          </li>
        ))}
      </ul>
      <button
        onClick={onCtaClick}
        className={`w-full py-4 rounded-2xl font-medium transition-all transform hover:scale-105 ${
          highlighted
            ? "bg-gradient-to-r from-cyan-500 to-purple-600 text-white hover:shadow-lg hover:shadow-cyan-500/30"
            : "bg-slate-800 text-white hover:bg-slate-700 border border-slate-700"
        }`}
        aria-label={highlighted ? "Start Free Trial" : "Get Started"}
      >
        {highlighted ? "Start Free Trial →" : "Get Started"}
      </button>
    </div>
  );
}

// ========= Main Page =========
export default function HomePage() {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const mainRef = useRef(null);
  const statsRef = useRef(null);
  const isDesktop = typeof window !== "undefined" && window.matchMedia?.("(min-width: 768px)").matches;

  // Memoize derived values
  const totals = useMemo(
    () => ({ conflicts: state.conflicts.length, opportunities: state.opportunities.length }),
    [state.conflicts.length, state.opportunities.length]
  );

  // Timers & intersection
  useEffect(() => {
    const counterInterval = setInterval(() => dispatch({ type: "UPDATE_COUNTERS" }), 220);
    const notificationInterval = setInterval(() => {
      if (!state.demoHasRun) return;
      const items = [
        { type: "alert", title: "New conflict detected", message: "Invoice terms don't match PO requirements" },
        { type: "success", title: "Opportunity found", message: "Client eligible for volume discount" },
      ];
      const note = { ...items[Math.floor(Math.random() * items.length)], id: Date.now() };
      dispatch({ type: "ADD_NOTIFICATION", payload: note });
    }, 8000);
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) dispatch({ type: "SET_SCROLL_VISIBILITY", payload: true });
    }, { threshold: 0.1 });
    if (statsRef.current) observer.observe(statsRef.current);
    return () => {
      clearInterval(counterInterval);
      clearInterval(notificationInterval);
      if (statsRef.current) observer.unobserve(statsRef.current);
    };
  }, [state.demoHasRun]);

  // Stable handlers
  const handleAuthAction = useCallback(() => dispatch({ type: "TOGGLE_AUTH_MODAL" }), []);
  const handleRunScan = useCallback(() => {
    dispatch({ type: "START_DEMO" });
    mainRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => {
      dispatch({
        type: "LOAD_DATA",
        payload: {
          conflicts: [
            { id: 1, title: "Payment Terms Mismatch", description: "Contract assumes $180K upfront, but client cash-strapped until Q2.", value: 180000 },
            { id: 2, title: "Regulatory Filing Due", description: "Compliance deadline is in 3 days, required documentation is incomplete.", value: 50000 },
            { id: 3, title: "Forecast Discrepancy", description: "Board deck shows different revenue numbers than the P&L statement.", value: 275000 },
          ],
          opportunities: [
            { id: 1, title: "Cross-sell Opportunity", description: "Client mentioned need for additional services in recent meeting notes.", value: 45000 },
            { id: 2, title: "Grant Eligibility Match", description: "A new federal grant matches your project criteria.", value: 150000 },
          ],
        },
      });
      dispatch({ type: "ADD_NOTIFICATION", payload: { id: Date.now(), type: "success", title: "Briefing Ready", message: "Your live demo report has been generated." } });
    }, 2500);
  }, []);
  const handleRemoveNotification = useCallback((id) => dispatch({ type: "REMOVE_NOTIFICATION", payload: id }), []);
  const handleCloseModals = useCallback(() => dispatch({ type: "CLOSE_MODALS" }), []);
  
  const handleDemoBriefing = useCallback(async () => {
    dispatch({ type: "SHOW_BRIEFING", payload: { 
      whatChanged: "New contract amendments and compliance updates detected. Key changes include updated payment terms and revised delivery schedules.",
      whatMatters: "Critical deadline approaching: The new compliance requirements must be implemented by month-end or risk regulatory penalties.",
      whatToDoNext: "Schedule immediate review meeting with legal team to prioritize compliance actions and assign responsibility for each requirement."
    }});
    
    // Scroll to briefing if it's not visible
    setTimeout(() => {
      const briefingElement = document.querySelector('[data-briefing-card]');
      if (briefingElement) {
        briefingElement.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 100);
  }, []);

  // Logo sources with graceful fallback (user-provided assets optional)
  const logoCandidates = useMemo(() => [
    { src: "/foldera-hero.svg", alt: "Foldera logo" },
    { src: "/foldera-outline.svg", alt: "Foldera glyph" },
  ], []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-300 font-sans overflow-x-hidden">
      <style>{`
        @keyframes slide-in-right { from { opacity: 0; transform: translateX(100px); } to { opacity: 1; transform: translateX(0); } }
        .animate-slide-in-right { animation: slide-in-right 0.5s ease-out; }
      `}</style>

      {isDesktop && <ParticleField />}

      <div className="fixed top-24 right-6 z-40 space-y-3 max-w-sm w-full" aria-live="polite">
        {state.notifications.map((n) => (
          <LiveNotification key={n.id} notification={n} onRemove={handleRemoveNotification} />
        ))}
      </div>

      <nav className="sticky top-0 z-40 backdrop-blur-xl bg-slate-950/30 border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3" aria-label="Foldera Home">
              {/* Attempt to show provided icons; fallback to styled box */}
              <div className="relative w-10 h-10">
                <Image src={logoCandidates[0].src} alt={logoCandidates[0].alt} fill sizes="40px" className="rounded-xl object-contain" onError={(e)=>{const img=e.currentTarget; img.style.display='none';}} />
              </div>
              <span className="text-2xl font-light text-white">Foldera</span>
              <span className="text-xs text-cyan-400 bg-cyan-400/10 px-2 py-1 rounded-full">AI 2.0</span>
            </div>
            <a
              href="/dashboard"
              className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-cyan-500 text-white rounded-xl font-medium hover:shadow-lg hover:shadow-cyan-500/30 transform hover:scale-105 transition-all"
            >
              View Dashboard
            </a>
          </div>
        </div>
      </nav>

      <header className="relative z-10 text-center py-20 md:py-28 px-6">
        {/* High-impact hero branding */}
        <div className="mx-auto mb-8" aria-hidden>
          <Image src="/foldera-hero.svg" alt="Foldera hero" width={160} height={160} className="mx-auto select-none pointer-events-none" />
        </div>
        <AnimatedText>
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500/10 border border-amber-500/30 rounded-full text-amber-400 text-sm mb-6" role="note">
            <Bell className="w-4 h-4" aria-hidden />
            <span>Warning: Your AI has context amnesia</span>
          </div>
        </AnimatedText>
        <AnimatedText delay={150}>
          <h1 className="text-5xl md:text-7xl font-thin text-white mb-4 leading-tight">
            Your AI is a <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-orange-500">Goldfish.</span>
          </h1>
        </AnimatedText>
        <AnimatedText delay={300}>
          <p className="text-xl md:text-2xl text-slate-400 max-w-3xl mx-auto mb-8">
            Foldera remembers, detects, and fixes costly mistakes while you sleep.
          </p>
        </AnimatedText>
        <AnimatedText delay={450}>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <a
              href="/dashboard"
              className="px-8 py-4 bg-gradient-to-r from-blue-600 to-cyan-500 text-white rounded-2xl font-medium hover:shadow-xl hover:shadow-cyan-500/30 transform hover:scale-105 transition-all inline-flex items-center gap-2 group"
              aria-label="View Dashboard"
            >
              View Dashboard
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" aria-hidden />
            </a>
      <a
        href="/holy-crap"
        className="px-6 py-3 bg-gradient-to-r from-red-600 to-orange-500 text-white rounded-xl font-medium hover:shadow-lg hover:shadow-red-500/30 transform hover:scale-105 transition-all inline-flex items-center gap-2 group"
        aria-label="See HOLY CRAP Demo"
      >
        🚨 HOLY CRAP DEMO
        <Sparkles className="w-4 h-4 group-hover:rotate-12 transition-transform" aria-hidden />
      </a>
      <a
        href="/real-processor"
        className="px-6 py-3 bg-gradient-to-r from-green-600 to-teal-500 text-white rounded-xl font-medium hover:shadow-lg hover:shadow-green-500/30 transform hover:scale-105 transition-all inline-flex items-center gap-2 group"
        aria-label="Real Document Processor"
      >
        🔧 REAL PROCESSOR
        <Sparkles className="w-4 h-4 group-hover:rotate-12 transition-transform" aria-hidden />
      </a>
      <button
        onClick={handleDemoBriefing}
        className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-500 text-white rounded-xl font-medium hover:shadow-lg hover:shadow-purple-500/30 transform hover:scale-105 transition-all inline-flex items-center gap-2 group"
        aria-label="See AI Briefing Demo"
      >
        🧠 See AI Briefing
        <Sparkles className="w-4 h-4 group-hover:rotate-12 transition-transform" aria-hidden />
      </button>
          </div>
        </AnimatedText>
        <AnimatedText delay={600}>
          <div className="mt-6 flex items-center justify-center gap-8 text-sm">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" aria-hidden />
              <span className="text-slate-500">
                Join <span className="text-white font-semibold">1,000+</span> professionals who have run a free scan
              </span>
            </div>
          </div>
        </AnimatedText>
      </header>

      <main ref={mainRef} className="relative z-10 max-w-7xl mx-auto px-6 pb-20">
        <section className="text-center mb-12">
          <AnimatedText>
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-500/10 border border-green-500/30 rounded-full text-green-400 text-sm mb-4">
              <Activity className="w-4 h-4 animate-pulse" aria-hidden />
              <span>Live Dashboard Demo</span>
            </div>
          </AnimatedText>
          <AnimatedText delay={150}>
            <h2 className="text-4xl md:text-5xl font-light text-white mb-2">Three Landmines. Two Opportunities.</h2>
            <p className="text-xl text-slate-400 max-w-2xl mx-auto">This isn't a mockup. This is a live Foldera briefing updating in real-time.</p>
          </AnimatedText>
        </section>

        {/* Stats grid (simplified for performance) */}
        <div ref={statsRef} className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-12">
          {[
            { title: "Active Items", value: state.stats.activeItems, color: "text-blue-400" },
            { title: "Value at Risk", value: state.stats.valueAtRisk, color: "text-amber-400" },
            { title: "Saved This Month", value: state.stats.savedThisMonth, color: "text-green-400" },
            { title: "Hours Reclaimed", value: `${state.stats.hoursReclaimed}h`, color: "text-purple-400" },
          ].map((s, i) => (
            <div key={s.title} className="card-enhanced" style={{ animationDelay: `${i * 80}ms` }}>
              <div className="flex items-center justify-between mb-2">
                <Image 
                  src="/foldera-glyph.svg" 
                  alt="" 
                  width={24} 
                  height={24}
                />
                <span className="text-xs text-slate-500 flex items-center gap-1">
                  <span className="w-2 h-2 bg-green-500 rounded-full" aria-hidden />
                  LIVE
                </span>
              </div>
              <p className={`text-3xl font-light ${s.color}`}>{s.value}</p>
              <p className="text-sm text-slate-400 mt-1">{s.title}</p>
            </div>
          ))}
        </div>

        {/* Demo Briefing Card */}
        {state.showingBriefing && state.briefing && (
          <div data-briefing-card className="animate-fade-in bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 border border-cyan-500/30 rounded-xl p-6 shadow-2xl mb-12">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-white">🧠 Executive Briefing</h3>
              <button
                onClick={() => dispatch({ type: "HIDE_BRIEFING" })}
                className="px-3 py-1 text-sm bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="bg-gray-800/50 rounded-lg p-4 border-l-4 border-blue-500">
                <div className="flex items-center gap-2 mb-2">
                  <Image 
                    src="/foldera-glyph.svg" 
                    alt="" 
                    width={20} 
                    height={20}
                  />
                  <span className="font-semibold text-blue-400">WHAT CHANGED</span>
                </div>
                <p className="text-gray-200 text-sm leading-relaxed">{state.briefing.whatChanged}</p>
              </div>
              
              <div className="bg-gray-800/50 rounded-lg p-4 border-l-4 border-yellow-500">
                <div className="flex items-center gap-2 mb-2">
                  <Image 
                    src="/foldera-glyph.svg" 
                    alt="" 
                    width={20} 
                    height={20}
                  />
                  <span className="font-semibold text-yellow-400">WHAT MATTERS</span>
                </div>
                <p className="text-gray-200 text-sm leading-relaxed">{state.briefing.whatMatters}</p>
              </div>
              
              <div className="bg-gray-800/50 rounded-lg p-4 border-l-4 border-green-500">
                <div className="flex items-center gap-2 mb-2">
                  <Image 
                    src="/foldera-glyph.svg" 
                    alt="" 
                    width={20} 
                    height={20}
                  />
                  <span className="font-semibold text-green-400">NEXT MOVE</span>
                </div>
                <p className="text-gray-200 text-sm leading-relaxed">{state.briefing.whatToDoNext}</p>
              </div>
            </div>
          </div>
        )}

        {/* Lists */}
        {state.demoHasRun ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div>
              <h3 className="text-xl font-light text-white mb-4 flex items-center">
                <span className="w-2 h-2 bg-red-500 rounded-full mr-3 animate-pulse" aria-hidden />
                Critical Conflicts Detected
                <span className="ml-auto text-sm text-red-400" aria-label="conflict count">{totals.conflicts} items</span>
              </h3>
              <div className="space-y-4">
                {state.conflicts.map((c) => (
                  <div key={c.id} className="card-enhanced">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <AlertTriangle className="w-4 h-4 text-red-400" aria-hidden />
                          <h4 className="font-medium text-white">{c.title}</h4>
                        </div>
                        <p className="text-sm text-slate-400">{c.description}</p>
                      </div>
                      <div className="text-right">
                        <span className="text-xl font-light text-amber-400">
                          {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(c.value)}
                        </span>
                        <p className="text-xs text-red-400 mt-1">AT RISK</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-xl font-light text-white mb-4 flex items-center">
                <span className="w-2 h-2 bg-green-500 rounded-full mr-3 animate-pulse" aria-hidden />
                Opportunities Identified
                <span className="ml-auto text-sm text-green-400" aria-label="opportunity count">{totals.opportunities} items</span>
              </h3>
              <div className="space-y-4">
                {state.opportunities.map((o) => (
                  <div key={o.id} className="card-enhanced">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <TrendingUp className="w-4 h-4 text-green-400" aria-hidden />
                          <h4 className="font-medium text-white">{o.title}</h4>
                        </div>
                        <p className="text-sm text-slate-400">{o.description}</p>
                      </div>
                      <div className="text-right">
                        <span className="text-xl font-light text-green-400">+
                          {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(o.value)}
                        </span>
                        <p className="text-xs text-green-400 mt-1">POTENTIAL</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center min-h-[40vh] flex flex-col items-center justify-center">
            <div className="w-24 h-24 bg-slate-800/50 rounded-3xl flex items-center justify-center mb-6 border border-slate-700">
              <Target className="w-12 h-12 text-cyan-400" aria-hidden />
            </div>
            <p className="text-2xl text-white font-light mb-2">Your dashboard is ready.</p>
            <p className="text-slate-400">Click "Run Free Scan" above to start the live demo.</p>
          </div>
        )}

        {/* Pricing */}
        <section className="py-16">
          <div className="text-center mb-10">
            <h2 className="text-4xl md:text-5xl font-light text-white mb-3">Simple, High-Value Pricing</h2>
            <p className="text-xl text-slate-400">Start for free. Upgrade when you see the value.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8 items-stretch">
            <PricingCard title="Pro Plan" price="$79" features={["Unlimited document analysis", "Daily Executive Briefings", "Real-time conflict alerts", "Standard email support"]} onCtaClick={handleAuthAction} />
            <PricingCard title="Team Plan" price="$149" features={["Everything in Pro", "Up to 5 team seats", "Shared playbooks & workflows", "Priority support & onboarding", "Custom integrations"]} highlighted onCtaClick={handleAuthAction} />
            <PricingCard title="Enterprise" price="Custom" features={["Unlimited seats", "Dedicated account management", "Custom compliance playbooks", "On-premise deployment option", "API & white-label options"]} onCtaClick={handleAuthAction} />
          </div>
        </section>
      </main>

      <section className="py-16 px-6 text-center">
        <h2 className="text-4xl md:text-5xl font-light text-white mb-4">Stop Babysitting Your AI.</h2>
        <p className="text-xl text-slate-400 max-w-2xl mx-auto mb-8">Join {state.stats.liveCounter.toLocaleString()} professionals who've upgraded to AI that actually works.</p>
        <button onClick={handleAuthAction} className="px-10 py-5 bg-gradient-to-r from-blue-600 to-cyan-500 text-white text-lg rounded-2xl font-medium hover:shadow-2xl hover:shadow-cyan-500/30 transform hover:scale-105 transition-all inline-flex items-center gap-3 group" aria-label="Start Your Free Trial">
          Start Your Free Trial
          <ArrowRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" aria-hidden />
        </button>
        <p className="mt-6 text-sm text-slate-500">No credit card required • 14-day free trial • Cancel anytime</p>
      </section>

      <footer className="border-t border-slate-800/50 py-10 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-3">
            {/* Outline watermark icon for subtle brand */}
            <Image src="/foldera-outline.svg" alt="Foldera outline glyph" width={32} height={32} className="opacity-80" />
            <span className="text-lg font-light text-white">Foldera</span>
          </div>
          <p className="text-sm text-slate-500">© 2025 Foldera AI. Making AI actually useful.</p>
        </div>
      </footer>
    </div>
  );
}
