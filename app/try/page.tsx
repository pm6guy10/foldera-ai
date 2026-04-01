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

function TryArtifactPreview({ artifact }: { artifact: Record<string, unknown> }) {
  const t = artifact.type;
  if (t === 'email' || (artifact.to && artifact.body)) {
    return (
      <div className="space-y-2 text-sm text-zinc-300">
        {typeof artifact.to === 'string' && artifact.to ? (
          <p><span className="text-zinc-500 text-xs uppercase tracking-wider">To</span> {artifact.to}</p>
        ) : null}
        {typeof artifact.subject === 'string' && artifact.subject ? (
          <p><span className="text-zinc-500 text-xs uppercase tracking-wider">Subject</span> {artifact.subject}</p>
        ) : null}
        {typeof artifact.body === 'string' && artifact.body ? (
          <pre className="whitespace-pre-wrap text-zinc-200 text-[13px] leading-relaxed font-sans">{artifact.body}</pre>
        ) : null}
      </div>
    );
  }
  if (t === 'document' || (artifact.title && artifact.content)) {
    return (
      <div className="space-y-2 text-sm text-zinc-300">
        {typeof artifact.title === 'string' ? (
          <p className="text-white font-semibold">{artifact.title}</p>
        ) : null}
        {typeof artifact.content === 'string' ? (
          <pre className="whitespace-pre-wrap text-zinc-200 text-[13px] leading-relaxed font-sans">{artifact.content}</pre>
        ) : null}
      </div>
    );
  }
  if (t === 'decision_frame' || Array.isArray(artifact.options)) {
    const opts = artifact.options as Array<{ option?: string; weight?: number; rationale?: string }> | undefined;
    return (
      <div className="space-y-3 text-sm text-zinc-300">
        {opts?.map((o, i) => (
          <div key={i} className="border-l-2 border-cyan-500/50 pl-3">
            {o.option ? <p className="text-white font-medium">{o.option}</p> : null}
            {typeof o.weight === 'number' ? (
              <p className="text-xs text-zinc-500">{Math.round(o.weight * 100)}% weight</p>
            ) : null}
            {o.rationale ? <p className="text-zinc-400 text-[13px] mt-1">{o.rationale}</p> : null}
          </div>
        ))}
        {typeof artifact.recommendation === 'string' && (
          <p className="text-emerald-300/90 text-[13px] pt-2 border-t border-white/10">
            <span className="text-zinc-500 uppercase text-[10px] tracking-wider block mb-1">Recommendation</span>
            {artifact.recommendation}
          </p>
        )}
      </div>
    );
  }
  return (
    <pre className="whitespace-pre-wrap break-words text-xs text-zinc-400 font-mono leading-relaxed max-h-[420px] overflow-y-auto max-w-full">
      {JSON.stringify(artifact, null, 2)}
    </pre>
  );
}

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
    <div className="min-h-[100dvh] bg-[#07070c] text-white antialiased overflow-x-hidden selection:bg-cyan-500/30 selection:text-white">
      <nav className="px-4 sm:px-6 py-6 flex items-center justify-between max-w-3xl mx-auto border-b border-white/5 gap-3 min-w-0">
        <Link href="/" className="flex items-center gap-3 group">
          <FolderaMark className="transition-transform group-hover:scale-105 shadow-[0_0_24px_rgba(255,255,255,0.15)]" />
          <span className="text-xl font-black tracking-tighter text-white uppercase">Foldera</span>
        </Link>
        <Link
          href="/start"
          className="min-h-[44px] px-4 sm:px-6 py-2.5 rounded-full bg-white text-black text-[10px] font-black uppercase tracking-[0.2em] hover:bg-zinc-200 transition-all inline-flex items-center justify-center shrink-0"
        >
          Get started
        </Link>
      </nav>

      <main id="main" className="max-w-2xl mx-auto px-4 sm:px-6 py-16 w-full min-w-0">
        <h1 className="text-4xl sm:text-5xl font-black tracking-tighter text-white mb-4">Try Foldera</h1>
        <p className="text-zinc-400 text-lg mb-10 leading-relaxed max-w-xl">
          Paste any email thread. See the kind of move Foldera surfaces.
        </p>

        <form onSubmit={handleAnalyze} className="space-y-6">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            placeholder="Paste an email thread or describe a situation…"
            className="w-full min-h-[120px] rounded-2xl bg-zinc-950/80 border border-white/10 p-4 text-base text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2 focus:ring-offset-[#07070c] resize-y"
            aria-label="Email thread or situation"
          />
          <button
            type="submit"
            disabled={loading || text.trim().length < 20}
            className="w-full min-h-[48px] px-10 py-4 rounded-xl bg-cyan-500 text-black text-xs font-black uppercase tracking-[0.2em] hover:bg-cyan-400 disabled:opacity-40 disabled:pointer-events-none transition-all duration-150 hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#07070c]"
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
          <div className="mt-10 rounded-2xl border border-white/10 bg-zinc-950/80 p-4 sm:p-6 space-y-4 max-w-full min-w-0 overflow-hidden">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-400/80">What we see</p>
            <p className="text-white text-lg font-semibold leading-snug break-words">{result.directive}</p>
            {result.reason ? <p className="text-zinc-400 text-sm leading-relaxed break-words">{result.reason}</p> : null}
            {result.action_type ? (
              <p className="text-[10px] font-black uppercase tracking-widest text-zinc-600">
                Suggested move: {result.action_type.replace(/_/g, ' ')}
              </p>
            ) : null}
            {result.artifact_type ? (
              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-500/80">
                Finished artifact: {result.artifact_type.replace(/_/g, ' ')}
              </p>
            ) : null}
            {result.artifact != null && typeof result.artifact === 'object' && (
              <div className="mt-4 rounded-xl border border-white/10 bg-black/40 p-4 max-w-full min-w-0 overflow-x-auto break-words">
                <p className="text-[10px] font-black uppercase tracking-[0.15em] text-zinc-500 mb-2">The work product</p>
                <div className="min-w-0 max-w-full">
                  <TryArtifactPreview artifact={result.artifact as Record<string, unknown>} />
                </div>
              </div>
            )}
          </div>
        )}

        <p className="mt-16 text-center text-zinc-500 text-sm">
          Want this every morning?{' '}
          <Link
            href="/start"
            className="text-cyan-400 hover:text-cyan-300 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#07070c] rounded-sm"
          >
            Get started free
          </Link>
          .
        </p>
      </main>
    </div>
  );
}
