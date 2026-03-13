'use client';

import React, { useState } from 'react';
import { ArrowRight, Brain } from 'lucide-react';

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
  do_nothing:     'bg-slate-500/20 text-slate-300 border-slate-500/30',
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

export default function TryPage() {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Directive | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        body:    JSON.stringify({ text }),
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
      className="min-h-screen bg-[#0B0B0C] text-[#F5F5F5]"
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      <style dangerouslySetInnerHTML={{ __html: `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');` }} />

      {/* Nav */}
      <nav className="px-5 py-5 flex items-center justify-between max-w-3xl mx-auto">
        <a href="/" className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-cyan-500 to-emerald-400 flex items-center justify-center">
            <Brain className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-lg font-semibold tracking-tight">Foldera</span>
        </a>
        <a
          href="/start"
          className="px-4 py-2 rounded-full bg-cyan-500 hover:bg-cyan-400 text-black text-sm font-semibold transition-colors"
        >
          Get started
        </a>
      </nav>

      <main className="max-w-2xl mx-auto px-5 pt-10 pb-24">

        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white mb-3" style={{ letterSpacing: '-0.02em' }}>
            Get your read
          </h1>
          <p className="text-zinc-500 text-base">
            Paste a paragraph about what you're working on or struggling with right now.
          </p>
        </div>

        {/* Input form */}
        {!result && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="E.g. I've been going back and forth on whether to leave my job. I have a competing offer that pays 30% more but means relocating. I've been sitting on this for two weeks and haven't told my manager yet..."
              rows={7}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-5 py-4 text-sm text-zinc-200 placeholder:text-zinc-600 resize-none focus:outline-none focus:border-cyan-500/50 transition-colors leading-relaxed"
            />
            {error && (
              <p className="text-red-400 text-sm font-mono">{error}</p>
            )}
            <button
              type="submit"
              disabled={!text.trim() || loading}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-white text-black font-semibold text-base hover:bg-zinc-100 transition-colors disabled:opacity-40"
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
        )}

        {/* Result card */}
        {result && (
          <div className="space-y-8">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-7">

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
                        <span className="text-zinc-700 mt-0.5 shrink-0">•</span>
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

            {/* Conversion line */}
            <p className="text-zinc-500 text-sm text-center leading-relaxed">
              That&apos;s a finished draft from one paragraph. Imagine what Foldera does with 30 days of your actual history.
            </p>

            {/* CTA */}
            <div className="bg-zinc-900/60 border border-zinc-800/60 rounded-2xl p-7 text-center space-y-5">
              <p className="text-zinc-400 text-base leading-relaxed">
                That was based on one paragraph.<br />
                Imagine what Foldera does with 30 days of your actual history.
              </p>
              <a
                href="/start"
                className="inline-flex items-center gap-2 px-7 py-3 rounded-full bg-white text-black font-semibold text-sm hover:bg-zinc-100 transition-colors group"
              >
                Connect your history
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </a>
              <p className="text-zinc-700 text-xs">14 days free · No credit card required</p>
            </div>

            {/* Try again */}
            <button
              onClick={() => { setResult(null); setError(null); }}
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
