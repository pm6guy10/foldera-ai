'use client';

import React, { useState, useEffect, useRef } from 'react';
import { ArrowRight, Check, X, Mail, Calendar, MessageSquare, Zap, Brain } from 'lucide-react';

// ─── Scroll reveal ────────────────────────────────────────────────────────────
const useInView = (threshold = 0.08) => {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setInView(true); obs.disconnect(); } },
      { threshold }
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, inView] as const;
};

const Reveal = ({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) => {
  const [ref, inView] = useInView();
  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
};

// ─── Example DraftCard ────────────────────────────────────────────────────────
function ExampleCard() {
  const [decided, setDecided] = useState<null | 'approved' | 'skipped'>(null);
  const [animating, setAnimating] = useState(false);

  const decide = (d: 'approved' | 'skipped') => {
    setAnimating(true);
    setTimeout(() => { setDecided(d); setAnimating(false); }, 300);
  };

  if (decided) {
    return (
      <div className="w-full max-w-lg mx-auto rounded-2xl border border-white/10 bg-[#111115] p-8 text-center">
        <div className={`w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center ${decided === 'approved' ? 'bg-emerald-600/20' : 'bg-zinc-700/40'}`}>
          {decided === 'approved' ? <Check className="w-6 h-6 text-emerald-400" /> : <X className="w-6 h-6 text-zinc-400" />}
        </div>
        <p className="text-zinc-300 text-sm">
          {decided === 'approved'
            ? 'Foldera sends the email. Done. You never had to think about it.'
            : 'Foldera skips this. It learns what you care about and won\'t repeat the pattern.'}
        </p>
        <button
          onClick={() => setDecided(null)}
          className="mt-6 text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
        >
          Reset example
        </button>
      </div>
    );
  }

  return (
    <div
      className={`w-full max-w-lg mx-auto rounded-2xl border border-white/10 bg-[#111115] overflow-hidden transition-all duration-300 ${animating ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}`}
    >
      {/* Card header */}
      <div className="px-6 py-4 border-b border-white/5 flex items-center gap-3">
        <div className="p-2 rounded-lg bg-violet-600/20">
          <Mail className="w-4 h-4 text-violet-400" />
        </div>
        <div>
          <p className="text-zinc-100 text-sm font-medium">Foldera drafted a reply</p>
          <p className="text-zinc-500 text-xs">Re: Partnership proposal — Marcus Chen</p>
        </div>
        <span className="ml-auto text-xs font-mono text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full">ready</span>
      </div>

      {/* Draft preview */}
      <div className="p-6 space-y-3">
        <div className="bg-zinc-900/60 rounded-xl p-4 text-sm font-mono space-y-1.5 text-zinc-400 border border-white/5">
          <div><span className="text-zinc-600">To: </span>marcus@techcorp.io</div>
          <div><span className="text-zinc-600">Subject: </span>Re: Partnership proposal</div>
          <div className="pt-2 text-zinc-300 leading-relaxed whitespace-pre-wrap">
            {`Marcus,\n\nThanks for the thorough proposal. After reviewing, I'm aligned on the revenue share model — let's schedule 30 minutes this week to finalize terms.\n\nFriday 3pm works if that fits you.`}
          </div>
        </div>

        <p className="text-zinc-600 text-xs">
          Foldera read this thread overnight and saw you hadn't replied in 4 days. It drafted this based on your past replies to Marcus.
        </p>
      </div>

      {/* Actions */}
      <div className="px-6 pb-5 flex gap-3">
        <button
          onClick={() => decide('approved')}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors"
        >
          <Check className="w-4 h-4" /> Approve & Send
        </button>
        <button
          onClick={() => decide('skipped')}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-semibold transition-colors"
        >
          <X className="w-4 h-4" /> Skip
        </button>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', h, { passive: true });
    return () => window.removeEventListener('scroll', h);
  }, []);

  return (
    <div
      className="min-h-screen bg-[#0B0B0C] text-[#F5F5F5] overflow-x-hidden"
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
        @media (prefers-reduced-motion: reduce) {
          *, ::before, ::after {
            animation-duration: 1ms !important;
            transition-duration: 0s !important;
          }
        }
        @keyframes pulse-slow { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        .pulse-slow { animation: pulse-slow 3s ease-in-out infinite; }
      `}} />

      {/* Nav */}
      <nav className={`fixed top-0 w-full z-50 transition-all duration-300 ${scrolled ? 'bg-[#0B0B0C]/90 backdrop-blur-md border-b border-white/5 py-3' : 'bg-transparent py-5'}`}>
        <div className="max-w-6xl mx-auto px-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-violet-600 to-violet-400 flex items-center justify-center">
              <Brain className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-lg font-semibold tracking-tight">Foldera</span>
          </div>
          <div className="flex items-center gap-4">
            <a href="/api/auth/signin" className="text-sm text-zinc-400 hover:text-white transition-colors hidden sm:block">Log in</a>
            <a href="/onboard" className="px-4 py-2 rounded-full bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-colors">
              Get started free
            </a>
          </div>
        </div>
      </nav>

      {/* ── SECTION 1: HERO ── */}
      <main className="pt-36 pb-20 max-w-4xl mx-auto px-5 text-center">
        <Reveal>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-violet-500/30 bg-violet-600/10 text-violet-300 text-xs font-medium mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 pulse-slow" />
            First directive free
          </div>
        </Reveal>

        <Reveal delay={60}>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-white leading-[1.1] mb-6" style={{ letterSpacing: '-0.03em' }}>
            Foldera handles things<br className="hidden sm:block" /> for you.
          </h1>
        </Reveal>

        <Reveal delay={120}>
          <p className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto mb-10 leading-relaxed font-light">
            Every night, Foldera reads your inbox, calendar, and conversations — figures out what needs to happen — then drafts the actions and hands them to you. One tap approves. One tap skips. Nothing happens without you.
          </p>
        </Reveal>

        <Reveal delay={180}>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <a
              href="/onboard"
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-3.5 rounded-full bg-white text-black font-semibold text-base hover:bg-zinc-100 transition-colors group"
            >
              Connect your history
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </a>
            <a href="/try" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
              Try it now — no signup required →
            </a>
          </div>
        </Reveal>
      </main>

      {/* ── SECTION 2: HOW IT WORKS ── */}
      <section className="py-24 border-t border-white/5 bg-[#0D0D10]">
        <div className="max-w-5xl mx-auto px-5">
          <Reveal>
            <p className="text-xs font-mono text-zinc-600 uppercase tracking-widest text-center mb-12">How it works</p>
          </Reveal>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                num: '01',
                icon: Zap,
                title: 'Connect',
                desc: 'Link Gmail, Outlook, or your calendar. 60 seconds. Foldera reads — you own the data.',
              },
              {
                num: '02',
                icon: Brain,
                title: 'Foldera acts',
                desc: 'Every night it reads what came in, decides what needs doing, and drafts the actions. No input from you.',
              },
              {
                num: '03',
                icon: Check,
                title: 'You confirm',
                desc: 'Wake up to a queue of finished work. Approve and it\'s sent. Skip and Foldera learns not to repeat it.',
              },
            ].map((step, i) => {
              const Icon = step.icon;
              return (
                <Reveal key={i} delay={i * 80}>
                  <div className="relative p-7 rounded-2xl border border-white/5 bg-[#111115] h-full">
                    <span className="text-[10px] font-mono text-zinc-700 mb-4 block">{step.num}</span>
                    <div className="w-9 h-9 rounded-xl bg-violet-600/15 flex items-center justify-center mb-5">
                      <Icon className="w-4.5 h-4.5 text-violet-400" style={{ width: '18px', height: '18px' }} />
                    </div>
                    <h3 className="text-white font-semibold text-lg mb-2">{step.title}</h3>
                    <p className="text-zinc-500 text-sm leading-relaxed">{step.desc}</p>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── SECTION 3: EXAMPLE ARTIFACT ── */}
      <section className="py-24 border-t border-white/5 bg-[#0B0B0C]">
        <div className="max-w-5xl mx-auto px-5">
          <Reveal>
            <div className="text-center mb-12">
              <p className="text-xs font-mono text-zinc-600 uppercase tracking-widest mb-4">What Foldera actually produces</p>
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white tracking-tight" style={{ letterSpacing: '-0.02em' }}>
                Finished work, ready to send.
              </h2>
              <p className="text-zinc-500 mt-4 text-base max-w-xl mx-auto">
                Foldera found an unanswered email, read the full thread history, and drafted the reply. You decide in one tap.
              </p>
            </div>
          </Reveal>

          <Reveal delay={80}>
            <ExampleCard />
          </Reveal>

          <Reveal delay={160}>
            <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl mx-auto text-center">
              {[
                { icon: Mail, label: 'Email replies' },
                { icon: Calendar, label: 'Meeting agendas' },
                { icon: MessageSquare, label: 'Follow-up messages' },
              ].map(({ icon: Icon, label }, i) => (
                <div key={i} className="flex items-center justify-center gap-2 text-zinc-600 text-sm">
                  <Icon className="w-4 h-4" />
                  {label}
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── SECTION 4: PRICING ── */}
      <section className="py-24 border-t border-white/5 bg-[#0D0D10]">
        <div className="max-w-4xl mx-auto px-5">
          <Reveal>
            <div className="text-center mb-12">
              <p className="text-xs font-mono text-zinc-600 uppercase tracking-widest mb-4">Pricing</p>
              <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight" style={{ letterSpacing: '-0.02em' }}>
                Simple. No surprises.
              </h2>
            </div>
          </Reveal>

          <Reveal delay={0}>
            <div className="max-w-md mx-auto p-8 rounded-2xl border border-violet-500/30 bg-violet-600/5 flex flex-col relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-violet-500/50 to-transparent" />

              <div className="text-center mb-7">
                <p className="text-zinc-400 text-sm mb-1">14 days free. Then</p>
                <div className="flex items-baseline gap-1 justify-center">
                  <span className="text-5xl font-bold text-white">$99</span>
                  <span className="text-zinc-500 text-base">/month</span>
                </div>
                <p className="text-zinc-600 text-sm mt-2">Cancel anytime.</p>
              </div>

              <ul className="space-y-3 text-sm text-zinc-300 mb-8">
                {[
                  'Gmail + Outlook + Calendar',
                  'Daily action drafts — delivered at 7 AM',
                  'Approve / skip queue',
                  'Six specialist AI agents',
                  'Unlimited history',
                ].map(f => (
                  <li key={f} className="flex items-center gap-2.5">
                    <Check className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>

              <a href="/onboard" className="block text-center py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-colors">
                Start free trial
              </a>
            </div>
          </Reveal>

          <Reveal delay={80}>
            <p className="text-center text-zinc-600 text-sm mt-6">
              No credit card required to start.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── SECTION 5: FINAL CTA ── */}
      <section className="py-32 border-t border-white/5 bg-[#0B0B0C] text-center">
        <div className="max-w-3xl mx-auto px-5">
          <Reveal>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white tracking-tight mb-6" style={{ letterSpacing: '-0.03em' }}>
              Stop deciding what to do.<br />Just confirm or skip.
            </h2>
          </Reveal>
          <Reveal delay={80}>
            <p className="text-zinc-500 text-lg mb-10">
              Connect your inbox. Foldera handles the first directive free.
            </p>
          </Reveal>
          <Reveal delay={160}>
            <a
              href="/onboard"
              className="inline-flex items-center gap-2 px-10 py-4 rounded-full bg-white text-black font-bold text-lg hover:bg-zinc-100 transition-colors group"
            >
              Connect your history. First directive free.
              <ArrowRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
            </a>
          </Reveal>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 border-t border-white/5 bg-[#080809] text-center">
        <p className="text-[11px] text-zinc-700 font-mono tracking-widest uppercase">
          © {new Date().getFullYear()} Foldera · Private by default
        </p>
      </footer>
    </div>
  );
}
