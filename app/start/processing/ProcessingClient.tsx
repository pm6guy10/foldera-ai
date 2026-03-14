'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

type Stage =
  | 'connecting'
  | 'thin'
  | 'ingesting'
  | 'generating'
  | 'very_thin'
  | 'thankyou'
  | 'error';

const GRAPH_STAGES = [
  { label: 'Scanning your sent mail...', sub: 'Looking at the last 30 days' },
  { label: 'Found active threads', sub: 'Identifying who you talk to most' },
  { label: 'Detecting communication patterns...', sub: 'Decisions, commitments, follow-ups' },
  { label: 'Building your identity graph...', sub: 'Connecting the dots' },
  { label: 'Getting your first read ready...', sub: 'Almost there' },
];

export default function ProcessingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [stage, setStage] = useState<Stage>('connecting');
  const [graphStep, setGraphStep] = useState(0);
  const [counts, setCounts] = useState({ patterns: 0, commitments: 0 });
  const [paste, setPaste] = useState('');
  const [email, setEmail] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const hasRun = useRef(false);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/start');
    }
  }, [status, router]);

  useEffect(() => {
    if (status !== 'authenticated' || hasRun.current) return;
    hasRun.current = true;
    runEmailSync();
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  async function runEmailSync() {
    setStage('connecting');
    setGraphStep(0);

    // Progress through stages at a natural pace
    const ticker = setInterval(() => {
      setGraphStep(prev => {
        // Don't go past stage 3 during sync — save 4 for generating
        if (prev < 3) return prev + 1;
        return prev;
      });
    }, 3000);

    try {
      const res = await fetch('/api/onboard/email-sync', { method: 'POST' });
      clearInterval(ticker);

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Sync failed (${res.status})`);
      }

      const data = await res.json();
      setCounts({ patterns: data.patterns, commitments: data.commitments });

      if (data.status === 'ready') {
        await generateAndRedirect();
      } else {
        setStage('thin');
      }
    } catch (err: any) {
      clearInterval(ticker);
      setErrorMsg(err.message ?? 'Something went wrong');
      setStage('error');
    }
  }

  async function handlePasteSubmit() {
    if (!paste.trim()) return;
    setStage('ingesting');
    setGraphStep(2); // Jump to pattern detection stage

    try {
      const res = await fetch('/api/onboard/thin-ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: paste }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Ingest failed');
      }

      const data = await res.json();
      setCounts({ patterns: data.patterns, commitments: data.commitments });

      if (data.status === 'ready') {
        await generateAndRedirect();
      } else {
        setStage('very_thin');
      }
    } catch (err: any) {
      setErrorMsg(err.message ?? 'Something went wrong');
      setStage('error');
    }
  }

  async function generateAndRedirect() {
    setStage('generating');
    setGraphStep(4); // Final stage

    const res = await fetch('/api/onboard/free-directive', { method: 'POST' });

    if (res.status === 409) {
      router.replace('/start/result');
      return;
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? 'Failed to generate directive');
    }

    const data = await res.json();
    try {
      sessionStorage.setItem('foldera_directive', JSON.stringify(data.directive));
    } catch {}

    router.replace('/start/result');
  }

  async function handleEmailCapture() {
    if (!email.trim() || !session?.user?.id) return;
    await fetch('/api/onboard/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, tempUserId: session.user.id }),
    });
    setStage('thankyou');
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  if (status === 'loading' || stage === 'connecting' || stage === 'ingesting' || stage === 'generating') {
    return <GraphBuildingScreen step={graphStep} />;
  }

  if (stage === 'error') {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <p className="text-red-400 mb-6">{errorMsg}</p>
          <button
            onClick={() => { hasRun.current = false; runEmailSync(); }}
            className="px-6 py-3 bg-cyan-600 hover:bg-cyan-500 rounded-xl text-sm font-semibold transition-colors"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (stage === 'thin') {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center px-6">
        <div className="max-w-xl w-full">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8">
            <p className="text-cyan-400 text-xs font-semibold tracking-widest uppercase mb-4">
              Almost there
            </p>
            <h2 className="text-2xl font-bold mb-3">
              Foldera found {counts.commitments} commitment{counts.commitments !== 1 ? 's' : ''} and{' '}
              {counts.patterns} pattern{counts.patterns !== 1 ? 's' : ''} in your recent email.
            </h2>
            <p className="text-zinc-400 mb-6">
              For a stronger read, connect your Claude conversation history too.
            </p>
            <textarea
              value={paste}
              onChange={e => setPaste(e.target.value)}
              placeholder="Paste a Claude conversation export here..."
              className="w-full h-40 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-zinc-200 placeholder:text-zinc-500 resize-none focus:outline-none focus:border-cyan-600 mb-4"
            />
            <button
              onClick={handlePasteSubmit}
              disabled={!paste.trim()}
              className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 rounded-xl font-semibold transition-colors"
            >
              Analyze conversation
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (stage === 'very_thin') {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center px-6">
        <div className="max-w-lg w-full">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center">
            <h2 className="text-2xl font-bold mb-3">Foldera needs more history</h2>
            <p className="text-zinc-400 mb-6 leading-relaxed">
              We found {counts.patterns} pattern{counts.patterns !== 1 ? 's' : ''} so far — not enough
              for an accurate read. We&apos;ll email you when we can generate your first read.
            </p>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-cyan-600 mb-4"
            />
            <button
              onClick={handleEmailCapture}
              disabled={!email.trim()}
              className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 rounded-xl font-semibold transition-colors"
            >
              Notify me when ready
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (stage === 'thankyou') {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center px-6">
        <div className="max-w-lg w-full text-center">
          <h2 className="text-2xl font-bold mb-3">You&apos;re on the list.</h2>
          <p className="text-zinc-400 leading-relaxed">
            We&apos;ll reach out as soon as we have enough to generate your first read.
          </p>
        </div>
      </div>
    );
  }

  return <GraphBuildingScreen step={4} />;
}

function GraphBuildingScreen({ step }: { step: number }) {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-6">
      <div className="max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-2xl font-bold text-white mb-2">Building your graph</h1>
          <p className="text-zinc-500 text-sm">This takes about 30 seconds</p>
        </div>

        {/* Progress stages */}
        <div className="space-y-4">
          {GRAPH_STAGES.map((s, i) => {
            const isActive = i === step;
            const isDone = i < step;
            const isPending = i > step;

            return (
              <div
                key={i}
                className={[
                  'flex items-start gap-4 transition-all duration-500',
                  isPending ? 'opacity-30' : 'opacity-100',
                ].join(' ')}
              >
                {/* Step indicator */}
                <div className="shrink-0 mt-0.5">
                  {isDone ? (
                    <div className="w-6 h-6 rounded-full bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center">
                      <svg className="w-3 h-3 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  ) : isActive ? (
                    <div className="w-6 h-6 rounded-full border-2 border-cyan-500 border-t-transparent animate-spin" />
                  ) : (
                    <div className="w-6 h-6 rounded-full border border-zinc-700" />
                  )}
                </div>

                {/* Label */}
                <div className="min-w-0">
                  <p className={[
                    'text-sm font-medium transition-colors duration-300',
                    isActive ? 'text-white' : isDone ? 'text-zinc-400' : 'text-zinc-600',
                  ].join(' ')}>
                    {s.label}
                  </p>
                  {(isActive || isDone) && (
                    <p className="text-xs text-zinc-600 mt-0.5">{s.sub}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Progress bar */}
        <div className="mt-10 h-1 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500 rounded-full transition-all duration-1000 ease-out"
            style={{ width: `${((step + 1) / GRAPH_STAGES.length) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
