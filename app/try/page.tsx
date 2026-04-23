'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { NavPublic } from '@/components/nav/NavPublic';
import { BlogFooter } from '@/components/nav/BlogFooter';

type AnalyzeResponse = {
  directive?: string;
  action_type?: string;
  reason?: string;
  artifact_type?: string;
  artifact?: unknown;
  error?: string;
};

function ArtifactPreview({ artifact }: { artifact: Record<string, unknown> }) {
  const raw =
    typeof artifact.body === 'string'
      ? artifact.body
      : typeof artifact.content === 'string'
        ? artifact.content
        : null;

  return (
    <div className="rounded-card border border-border-subtle bg-panel-raised p-6">
      {typeof artifact.type === 'string' && (
        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-accent">
          {artifact.type.replace(/_/g, ' ')}
        </p>
      )}
      {typeof artifact.subject === 'string' && (
        <p className="mt-3 text-sm font-semibold text-text-primary">{artifact.subject}</p>
      )}
      {raw ? (
        <pre className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-text-secondary">{raw}</pre>
      ) : (
        <pre className="mt-4 overflow-x-auto text-xs text-text-secondary">
          {JSON.stringify(artifact, null, 2)}
        </pre>
      )}
    </div>
  );
}

export default function TryPage() {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleAnalyze(event: React.FormEvent) {
    event.preventDefault();
    if (!text.trim() || loading) return;
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const response = await fetch('/api/try/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim() }),
      });
      const payload = (await response.json().catch(() => ({}))) as AnalyzeResponse;
      if (!response.ok) {
        setError(payload.error ?? 'Could not analyze this thread.');
      } else {
        setResult(payload);
      }
    } catch {
      setError('Network error — check your connection and retry.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-bg text-text-primary">
      <NavPublic scrolled platformHref="/#product" />
      <main id="main" className="pt-24 sm:pt-32">
        <section className="border-b border-border-subtle pb-16">
          <div className="mx-auto max-w-4xl px-4 sm:px-6">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-accent">Live demo</p>
            <h1 className="mt-6 text-5xl font-black tracking-tight sm:text-6xl">Try Foldera</h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-text-secondary">
              Paste an email thread. See the directive and artifact style Foldera generates.
            </p>
          </div>
        </section>

        <section className="border-b border-border-subtle py-16">
          <div className="mx-auto grid max-w-6xl gap-6 px-4 sm:px-6 lg:grid-cols-[1fr_1fr]">
            <form onSubmit={handleAnalyze} className="rounded-card border border-border bg-panel p-6 sm:p-8">
              <label htmlFor="try-input" className="text-[10px] font-black uppercase tracking-[0.14em] text-text-secondary">
                Paste context
              </label>
              <textarea
                id="try-input"
                value={text}
                onChange={(event) => setText(event.target.value)}
                rows={10}
                placeholder="Paste an email thread or situation."
                className="mt-4 min-h-[160px] w-full rounded-card border border-border bg-panel-raised px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
              />
              <button
                type="submit"
                disabled={loading || text.trim().length < 20}
                className="mt-4 inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-button bg-accent px-4 text-xs font-black uppercase tracking-[0.14em] text-bg transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? 'Analyzing…' : 'Analyze'}
              </button>
              <p className="mt-3 text-xs text-text-muted">At least 20 characters required.</p>
              {error && <p className="mt-4 text-sm text-text-secondary">{error}</p>}
            </form>

            <div className="rounded-card border border-border bg-panel p-6 sm:p-8">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-text-secondary">Result</p>
              {result?.directive ? (
                <div className="mt-4 space-y-4">
                  <p className="text-lg font-semibold text-text-primary">{result.directive}</p>
                  {result.reason && <p className="text-sm leading-relaxed text-text-secondary">{result.reason}</p>}
                  {result.artifact !== null && typeof result.artifact === 'object' && (
                    <ArtifactPreview artifact={result.artifact as Record<string, unknown>} />
                  )}
                </div>
              ) : (
                <p className="mt-4 text-sm leading-relaxed text-text-secondary">
                  Results appear here after analysis. For full daily use, connect your accounts and run Foldera each morning.
                </p>
              )}
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/pricing"
                  className="inline-flex min-h-[44px] items-center justify-center rounded-button border border-border px-4 text-xs font-black uppercase tracking-[0.14em] text-text-primary"
                >
                  See pricing
                </Link>
                <Link
                  href="/start"
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-button bg-accent px-4 text-xs font-black uppercase tracking-[0.14em] text-bg"
                >
                  Get started free
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
            </div>
          </div>
        </section>

        <BlogFooter />
      </main>
    </div>
  );
}

