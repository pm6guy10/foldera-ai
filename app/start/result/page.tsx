'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Check } from 'lucide-react';

interface EvidenceItem {
  type: string;
  description: string;
  date: string | null;
}

interface Directive {
  directive:    string;
  action_type:  string;
  confidence:   number;
  reason:       string;
  evidence:     EvidenceItem[];
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
  const router = useRouter();
  const [directive, setDirective] = useState<Directive | null>(null);
  const [usedDate, setUsedDate]   = useState<string | null>(null);
  const [loading, setLoading]     = useState(true);
  const [starting, setStarting]   = useState(false);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('foldera_directive');
      if (stored) {
        setDirective(JSON.parse(stored));
        setLoading(false);
        return;
      }
    } catch {}

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

  async function handleStartTrial() {
    setStarting(true);
    try {
      await fetch('/api/onboard/provision-trial', { method: 'POST' });
      router.push('/dashboard');
    } catch {
      router.push('/dashboard');
    }
  }

  // ── Loading ──────────────────────────────────────────────────────────────────

  if (loading || status === 'loading') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ── No directive ─────────────────────────────────────────────────────────────

  if (!directive) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-6">
        <div className="max-w-md text-center space-y-4">
          {usedDate && (
            <p className="text-slate-400 text-sm">
              Your first directive was generated on{' '}
              <span className="text-white">{new Date(usedDate).toLocaleDateString()}</span>.
            </p>
          )}
          <p className="text-slate-500 text-sm">Start your 14-day free trial to get daily directives.</p>
          <button
            onClick={handleStartTrial}
            disabled={starting}
            className="w-full py-4 bg-violet-600 hover:bg-violet-500 disabled:opacity-60 rounded-xl font-bold text-lg transition-all"
          >
            {starting ? <Spinner /> : 'Start 14-day free trial'}
          </button>
          <p className="text-slate-700 text-xs">No credit card required. $99/month after trial.</p>
        </div>
      </div>
    );
  }

  // ── Full directive display ────────────────────────────────────────────────────

  const actionLabel = ACTION_LABELS[directive.action_type] ?? directive.action_type;
  const actionColor = ACTION_COLORS[directive.action_type] ?? ACTION_COLORS.research;

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="border-b border-slate-800/60 px-6 py-4 flex items-center justify-between">
        <span className="text-slate-400 text-sm font-medium tracking-widest uppercase">Foldera</span>
        <span className="text-slate-600 text-xs">Your first directive</span>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-12">

        {/* Directive card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 mb-8">

          <div className="flex items-center justify-between mb-7">
            <span className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${actionColor}`}>
              {actionLabel}
            </span>
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-24 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-violet-500 rounded-full" style={{ width: `${directive.confidence}%` }} />
              </div>
              <span className="text-slate-500 text-xs">{directive.confidence}%</span>
            </div>
          </div>

          <p className="text-2xl font-semibold leading-snug mb-6 text-white">{directive.directive}</p>

          <p className="text-slate-400 text-sm leading-relaxed mb-6 border-l-2 border-slate-700 pl-4 italic">
            {directive.reason}
          </p>

          {directive.evidence.length > 0 && (
            <div className="border-t border-slate-800 pt-5">
              <p className="text-slate-500 text-xs font-semibold tracking-widest uppercase mb-3">Evidence</p>
              <ul className="space-y-2.5">
                {directive.evidence.map((item, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-slate-400">
                    <span className="text-slate-600 mt-0.5 shrink-0">•</span>
                    <span>
                      {item.date && <span className="text-slate-600 text-xs mr-2 font-mono">{item.date}</span>}
                      {item.description}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {directive.fullContext && (
            <div className="border-t border-slate-800 pt-5 mt-5">
              <p className="text-slate-500 text-xs font-semibold tracking-widest uppercase mb-2">More context</p>
              <p className="text-slate-400 text-sm leading-relaxed">{directive.fullContext}</p>
            </div>
          )}
        </div>

        {/* Trial CTA */}
        <div className="text-center mb-6">
          <h2 className="text-xl font-bold mb-1">Get this every morning.</h2>
          <p className="text-slate-400 text-sm">Foldera reads your signals overnight and surfaces one directive at 7 AM.</p>
        </div>

        <button
          onClick={handleStartTrial}
          disabled={starting}
          className="w-full flex items-center justify-center gap-2 py-4 bg-violet-600 hover:bg-violet-500 disabled:opacity-60 rounded-xl font-bold text-lg transition-all group"
        >
          {starting ? <Spinner /> : (
            <>
              Start 14-day free trial
              <ArrowRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
            </>
          )}
        </button>

        <div className="mt-4 text-center space-y-1.5">
          {['No credit card required', '$99/month after your trial', 'Cancel anytime'].map(line => (
            <p key={line} className="flex items-center justify-center gap-1.5 text-slate-600 text-xs">
              <Check className="w-3 h-3 text-slate-700" />
              {line}
            </p>
          ))}
        </div>
      </div>
    </main>
  );
}

function Spinner() {
  return (
    <span className="inline-flex items-center justify-center gap-2">
      <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      Starting your trial...
    </span>
  );
}
