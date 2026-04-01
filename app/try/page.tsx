'use client';

import { useState } from 'react';
import Link from 'next/link';
import { FolderaMark } from '@/components/nav/FolderaMark';

type AnalyzeResponse = {
  directive?: string;
  action_type?: string;
  reason?: string;
  artifact_type?: string;
  artifact?: unknown;
  error?: string;
};

export default function TryPage() {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleAnalyze(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || loading) return;
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const res = await fetch('/api/try/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as AnalyzeResponse;
      if (!res.ok) {
        setError(data.error ?? (res.status === 429 ? 'Too many tries — wait a bit and retry.' : 'Could not analyze that thread.'));
        return;
      }
      setResult(data);
    } catch {
      setError('Network error — check your connection and retry.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[100dvh] bg-[#07070c] text-white antialiased selection:bg-cyan-500/30 selection:text-white">
      <nav className="px-6 py-6 flex items-center justify-between max-w-3xl mx-auto border-b border-white/5">
        <Link href="/" className="flex items-center gap-3 group">
          <FolderaMark className="transition-transform group-hover:scale-105 shadow-[0_0_24px_rgba(255,255,255,0.15)]" />
          <span className="text-xl font-black tracking-tighter text-white uppercase">Foldera</span>
        </Link>
        <Link
          href="/start"
          className="px-6 py-2.5 rounded-full bg-white text-black text-[10px] font-black uppercase tracking-[0.2em] hover:bg-zinc-200 transition-all"
        >
          Get started
        </Link>
      </nav>

      <main id="main" className="max-w-2xl mx-auto px-6 py-16">
        <h1 className="text-4xl sm:text-5xl font-black tracking-tighter text-white mb-4">Try Foldera</h1>
        <p className="text-zinc-400 text-lg mb-10 leading-relaxed">
          Paste any email thread. Foldera will show you what it finds.
        </p>

        <form onSubmit={handleAnalyze} className="space-y-6">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={12}
            placeholder="Paste an email thread or describe a situation…"
            className="w-full rounded-2xl bg-zinc-950/80 border border-white/10 p-4 text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 resize-y min-h-[200px]"
            aria-label="Email thread or situation"
          />
          <button
            type="submit"
            disabled={loading || text.trim().length < 20}
            className="w-full sm:w-auto px-10 py-4 rounded-xl bg-cyan-500 text-black text-xs font-black uppercase tracking-[0.2em] hover:bg-cyan-400 disabled:opacity-40 disabled:pointer-events-none transition-colors"
          >
            {loading ? 'Analyzing…' : 'Analyze'}
          </button>
          <p className="text-xs text-zinc-600">At least 20 characters required.</p>
        </form>

        {error && (
          <div className="mt-8 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        {result?.directive && (
          <div className="mt-10 rounded-2xl border border-white/10 bg-zinc-950/80 p-6 space-y-4">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-400/80">What we see</p>
            <p className="text-white text-lg font-semibold leading-snug">{result.directive}</p>
            {result.reason ? <p className="text-zinc-400 text-sm leading-relaxed">{result.reason}</p> : null}
            {result.action_type ? (
              <p className="text-[10px] font-black uppercase tracking-widest text-zinc-600">
                Suggested move: {result.action_type.replace(/_/g, ' ')}
              </p>
            ) : null}
          </div>
        )}

        <p className="mt-16 text-center text-zinc-500 text-sm">
          Want this every morning?{' '}
          <Link href="/start" className="text-cyan-400 hover:text-cyan-300 font-semibold">
            Get started free
          </Link>
          .
        </p>
      </main>
    </div>
  );
}
