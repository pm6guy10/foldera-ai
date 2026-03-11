'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';

interface EvidenceItem {
  type: string;
  description: string;
  date: string | null;
}

interface Directive {
  directive: string;
  action_type: string;
  confidence: number;
  reason: string;
  evidence: EvidenceItem[];
  fullContext?: string;
}

const ACTION_LABELS: Record<string, string> = {
  write_document: 'Write',
  send_message:   'Reach Out',
  make_decision:  'Decide',
  do_nothing:     'Wait',
  schedule:       'Schedule',
  research:       'Research',
};

const ACTION_COLORS: Record<string, string> = {
  write_document: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
  send_message:   'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  make_decision:  'bg-amber-500/20 text-amber-300 border-amber-500/30',
  do_nothing:     'bg-slate-500/20 text-slate-300 border-slate-500/30',
  schedule:       'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  research:       'bg-blue-500/20 text-blue-300 border-blue-500/30',
};

export default function ResultPage() {
  const { data: session, status } = useSession();
  const [directive, setDirective] = useState<Directive | null>(null);
  const [usedDate, setUsedDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkingOut, setCheckingOut] = useState<'pro' | 'starter' | null>(null);

  useEffect(() => {
    // Try sessionStorage first (fastest — set by processing page)
    try {
      const stored = sessionStorage.getItem('foldera_directive');
      if (stored) {
        setDirective(JSON.parse(stored));
        setLoading(false);
        return;
      }
    } catch {}

    // Fallback: fetch from API (e.g., direct bookmark visit)
    if (status === 'authenticated') {
      fetch('/api/onboard/my-directive')
        .then(r => r.json())
        .then(data => {
          setDirective(data.directive ?? null);
          setUsedDate(data.usedDate ?? null);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    } else if (status === 'unauthenticated') {
      setLoading(false);
    }
  }, [status]);

  async function handleCheckout(plan: 'pro' | 'starter') {
    setCheckingOut(plan);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      });
      const { url, error } = await res.json();
      if (url) {
        window.location.href = url;
      } else {
        console.error('[checkout]', error);
        setCheckingOut(null);
      }
    } catch {
      setCheckingOut(null);
    }
  }

  // ─── Loading ──────────────────────────────────────────────────────────────

  if (loading || status === 'loading') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-cyan-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ─── Already used, data expired or not authenticated ─────────────────────

  if (!directive) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-6">
        <div className="max-w-md text-center">
          {usedDate ? (
            <>
              <p className="text-slate-400 mb-2 text-sm">
                Your first directive was generated on{' '}
                <span className="text-white">{new Date(usedDate).toLocaleDateString()}</span>.
              </p>
              <p className="text-slate-400 mb-8">Subscribe to get daily directives.</p>
            </>
          ) : (
            <p className="text-slate-400 mb-8">No directive found.</p>
          )}
          <div className="space-y-3">
            <button
              onClick={() => handleCheckout('pro')}
              disabled={checkingOut !== null}
              className="w-full py-4 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-60 rounded-xl font-bold text-lg transition-all"
            >
              {checkingOut === 'pro' ? <Spinner /> : 'Pro — $99/month'}
            </button>
            <button
              onClick={() => handleCheckout('starter')}
              disabled={checkingOut !== null}
              className="w-full py-4 bg-slate-800 hover:bg-slate-700 disabled:opacity-60 border border-slate-700 rounded-xl font-semibold text-slate-300 transition-all"
            >
              {checkingOut === 'starter' ? <Spinner /> : 'Starter — $29/month'}
            </button>
          </div>
          <p className="text-slate-600 text-xs mt-4">
            No directive was available. <a href="/start" className="text-cyan-500 hover:text-cyan-400">Start over →</a>
          </p>
        </div>
      </div>
    );
  }

  // ─── Full directive display ───────────────────────────────────────────────

  const actionLabel = ACTION_LABELS[directive.action_type] ?? directive.action_type;
  const actionColor = ACTION_COLORS[directive.action_type] ?? ACTION_COLORS.research;

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      {/* Top bar */}
      <div className="border-b border-slate-800/60 px-6 py-4 flex items-center justify-between">
        <span className="text-slate-400 text-sm font-medium tracking-widest uppercase">Foldera</span>
        <span className="text-slate-600 text-xs">Your first directive</span>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-12">

        {/* Directive card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 mb-8">

          {/* Action badge + confidence bar */}
          <div className="flex items-center justify-between mb-7">
            <span className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${actionColor}`}>
              {actionLabel}
            </span>
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-24 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-cyan-500 rounded-full"
                  style={{ width: `${directive.confidence}%` }}
                />
              </div>
              <span className="text-slate-500 text-xs">{directive.confidence}%</span>
            </div>
          </div>

          {/* The directive text */}
          <p className="text-2xl font-semibold leading-snug mb-6 text-white">
            {directive.directive}
          </p>

          {/* Reason */}
          <p className="text-slate-400 text-sm leading-relaxed mb-6 border-l-2 border-slate-700 pl-4 italic">
            {directive.reason}
          </p>

          {/* Evidence */}
          {directive.evidence.length > 0 && (
            <div className="border-t border-slate-800 pt-5">
              <p className="text-slate-500 text-xs font-semibold tracking-widest uppercase mb-3">
                Evidence
              </p>
              <ul className="space-y-2.5">
                {directive.evidence.map((item, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-slate-400">
                    <span className="text-slate-600 mt-0.5 flex-shrink-0">•</span>
                    <span>
                      {item.date && (
                        <span className="text-slate-600 text-xs mr-2 font-mono">{item.date}</span>
                      )}
                      {item.description}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Full context */}
          {directive.fullContext && (
            <div className="border-t border-slate-800 pt-5 mt-5">
              <p className="text-slate-500 text-xs font-semibold tracking-widest uppercase mb-2">
                More context
              </p>
              <p className="text-slate-400 text-sm leading-relaxed">{directive.fullContext}</p>
            </div>
          )}
        </div>

        {/* Pricing section */}
        <div className="text-center mb-7">
          <h2 className="text-xl font-bold mb-1">Get this every morning.</h2>
          <p className="text-slate-400 text-sm">
            Foldera reads your signals overnight and surfaces one directive at 7 AM.
          </p>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => handleCheckout('pro')}
            disabled={checkingOut !== null}
            className="w-full py-4 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-60 rounded-xl font-bold text-lg transition-all shadow-[0_0_30px_-8px_rgba(6,182,212,0.5)]"
          >
            {checkingOut === 'pro' ? <Spinner /> : 'Pro — $99 / month'}
          </button>

          <button
            onClick={() => handleCheckout('starter')}
            disabled={checkingOut !== null}
            className="w-full py-4 bg-slate-800 hover:bg-slate-700 disabled:opacity-60 border border-slate-700 rounded-xl font-semibold text-slate-300 transition-all"
          >
            {checkingOut === 'starter' ? <Spinner /> : 'Starter — $29 / month'}
          </button>

          <p className="text-center text-slate-600 text-xs pt-1">
            Cancel anytime. No commitment required.
          </p>
        </div>
      </div>
    </main>
  );
}

function Spinner() {
  return (
    <span className="inline-flex items-center justify-center gap-2">
      <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      Redirecting...
    </span>
  );
}
