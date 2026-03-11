'use client';

import { signIn } from 'next-auth/react';
import { useState } from 'react';
import { ArrowRight, Brain } from 'lucide-react';

interface Directive {
  directive: string;
  action_type: string;
  confidence: number;
  reason: string;
  evidence: Array<{ type: string; description: string; date: string | null }>;
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
  write_document: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
  send_message: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  make_decision: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  do_nothing: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
  schedule: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  research: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
};

export default function StartPage() {
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);
  const [showPaste, setShowPaste] = useState(false);
  const [text, setText] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<Directive | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleOAuth(provider: 'google' | 'azure-ad') {
    setLoadingProvider(provider);
    await signIn(provider, { callbackUrl: '/start/processing' });
  }

  async function handlePasteSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || analyzing) return;
    setAnalyzing(true);
    setError(null);

    try {
      const res = await fetch('/api/try/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Analysis failed');
      setResult(data as Directive);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAnalyzing(false);
    }
  }

  // ── Result view: show the directive + CTA to sign up ──────────────────────
  if (result) {
    const actionLabel = ACTION_LABELS[result.action_type] ?? result.action_type;
    const actionColor = ACTION_COLORS[result.action_type] ?? ACTION_COLORS.research;

    return (
      <main className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center px-6 py-16">
        <div className="max-w-2xl w-full">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 mb-8">
            <div className="flex items-center justify-between mb-6">
              <span className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${actionColor}`}>
                {actionLabel}
              </span>
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-24 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-violet-500 rounded-full" style={{ width: `${result.confidence}%` }} />
                </div>
                <span className="text-slate-500 text-xs">{result.confidence}%</span>
              </div>
            </div>
            <p className="text-2xl font-semibold leading-snug text-white mb-5">{result.directive}</p>
            <p className="text-slate-400 text-sm leading-relaxed border-l-2 border-slate-700 pl-4 italic mb-5">
              {result.reason}
            </p>
            {result.evidence.length > 0 && (
              <div className="border-t border-slate-800 pt-5">
                <p className="text-slate-500 text-xs font-semibold tracking-widest uppercase mb-3">
                  Evidence from your text
                </p>
                <ul className="space-y-2">
                  {result.evidence.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-400">
                      <span className="text-slate-600 mt-0.5 shrink-0">&bull;</span>
                      {item.description}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-8 text-center space-y-5">
            <p className="text-slate-400 text-base leading-relaxed">
              That was based on one paragraph.<br />
              Imagine what Foldera does with 30 days of your actual history.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={() => handleOAuth('google')}
                disabled={!!loadingProvider}
                className="flex items-center justify-center gap-3 bg-white text-slate-900 hover:bg-slate-100 font-semibold py-3 px-6 rounded-xl transition-all disabled:opacity-60"
              >
                <GoogleIcon />
                Connect with Google
              </button>
              <button
                onClick={() => handleOAuth('azure-ad')}
                disabled={!!loadingProvider}
                className="flex items-center justify-center gap-3 bg-[#00a4ef] text-white hover:bg-[#0078d4] font-semibold py-3 px-6 rounded-xl transition-all disabled:opacity-60"
              >
                <MicrosoftIcon />
                Connect with Microsoft
              </button>
            </div>
            <p className="text-slate-600 text-xs">14 days free. No credit card required.</p>
          </div>

          <button
            onClick={() => { setResult(null); setError(null); setText(''); }}
            className="w-full text-slate-600 hover:text-slate-400 text-sm transition-colors mt-6 text-center"
          >
            Try a different paragraph
          </button>
        </div>
      </main>
    );
  }

  // ── Main view: OAuth buttons + paste option ───────────────────────────────
  return (
    <main className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center px-6">
      <div className="max-w-lg w-full text-center">
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-violet-600 to-violet-400 flex items-center justify-center">
            <Brain className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-lg font-semibold tracking-tight">Foldera</span>
        </div>

        <h1 className="text-4xl sm:text-5xl font-bold leading-tight mb-5">
          Connect your history.<br />
          Get your first read<br />
          in 60 seconds.
        </h1>

        <p className="text-slate-400 text-lg leading-relaxed mb-10">
          Your patterns are already in your email.<br />
          We just make them visible.
        </p>

        <div className="space-y-3 mb-6">
          <button
            onClick={() => handleOAuth('google')}
            disabled={!!loadingProvider}
            className="w-full max-w-sm mx-auto flex items-center justify-center gap-3 bg-white text-slate-900 hover:bg-slate-100 font-semibold py-4 px-8 rounded-xl text-lg transition-all shadow-lg disabled:opacity-60"
          >
            {loadingProvider === 'google' ? <LoadingSpinner /> : (
              <>
                <GoogleIcon />
                Connect with Google
              </>
            )}
          </button>

          <button
            onClick={() => handleOAuth('azure-ad')}
            disabled={!!loadingProvider}
            className="w-full max-w-sm mx-auto flex items-center justify-center gap-3 bg-[#00a4ef] text-white hover:bg-[#0078d4] font-semibold py-4 px-8 rounded-xl text-lg transition-all shadow-lg disabled:opacity-60"
          >
            {loadingProvider === 'azure-ad' ? <LoadingSpinner /> : (
              <>
                <MicrosoftIcon />
                Connect with Microsoft
              </>
            )}
          </button>
        </div>

        <p className="text-slate-500 text-sm leading-relaxed mb-8">
          We read your last 30 days of sent email.<br />
          Nothing is stored permanently until you subscribe.
        </p>

        {!showPaste ? (
          <button
            onClick={() => setShowPaste(true)}
            className="text-sm text-slate-600 hover:text-slate-400 transition-colors"
          >
            or paste a conversation to try it free &darr;
          </button>
        ) : (
          <form onSubmit={handlePasteSubmit} className="max-w-sm mx-auto space-y-3 mt-2">
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Paste a paragraph about what you're working on or struggling with..."
              rows={5}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-200 placeholder:text-slate-600 resize-none focus:outline-none focus:border-violet-500/50 transition-colors"
            />
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={!text.trim() || analyzing}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 font-semibold text-sm transition-colors"
            >
              {analyzing ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Reading...
                </>
              ) : (
                <>
                  Get your read
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}

function LoadingSpinner() {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="w-5 h-5 border-2 border-current/40 border-t-current rounded-full animate-spin" />
      Connecting...
    </span>
  );
}

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 21 21" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}
