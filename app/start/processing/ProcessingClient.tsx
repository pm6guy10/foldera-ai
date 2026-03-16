'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';

type Stage = 'syncing' | 'done' | 'error';

const GRAPH_STAGES = [
  { label: 'Scanning your sent mail...', sub: 'Looking at the last 30 days' },
  { label: 'Found active threads', sub: 'Identifying who you talk to most' },
  { label: 'Detecting communication patterns...', sub: 'Decisions, commitments, follow-ups' },
  { label: 'Building your identity graph...', sub: 'Connecting the dots' },
];

export default function ProcessingPage() {
  const { status } = useSession();
  const router = useRouter();

  const [stage, setStage] = useState<Stage>('syncing');
  const [graphStep, setGraphStep] = useState(0);
  const [signalCount, setSignalCount] = useState(0);
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
    runSync();
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  async function runSync() {
    setStage('syncing');
    setGraphStep(0);

    const ticker = setInterval(() => {
      setGraphStep(prev => (prev < 3 ? prev + 1 : prev));
    }, 3000);

    try {
      const res = await fetch('/api/onboard/email-sync', { method: 'POST' });
      clearInterval(ticker);

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Sync failed (${res.status})`);
      }

      const data = await res.json();
      setSignalCount(data.emailsProcessed ?? 0);
      setGraphStep(GRAPH_STAGES.length); // all done

      // Provision trial silently
      try {
        await fetch('/api/onboard/provision-trial', { method: 'POST' });
      } catch {}

      setStage('done');
    } catch (err: any) {
      clearInterval(ticker);
      setErrorMsg(err.message ?? 'Something went wrong');
      setStage('error');
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  if (status === 'loading' || stage === 'syncing') {
    return <GraphBuildingScreen step={graphStep} />;
  }

  if (stage === 'error') {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <p className="text-red-400 mb-6">{errorMsg}</p>
          <button
            onClick={() => { hasRun.current = false; runSync(); }}
            className="px-6 py-3 bg-cyan-600 hover:bg-cyan-500 rounded-xl text-sm font-semibold transition-colors"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  // ─── Done ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center">
        <div className="w-14 h-14 mx-auto mb-6 rounded-full bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center">
          <svg className="w-7 h-7 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <h1 className="text-2xl font-bold mb-3">
          {signalCount > 0
            ? `${signalCount} signal${signalCount !== 1 ? 's' : ''} ingested.`
            : 'Your graph is building.'}
        </h1>

        <p className="text-zinc-400 text-base leading-relaxed mb-8">
          Your first read arrives at 7am tomorrow.<br />
          Foldera is learning your patterns.
        </p>

        <button
          onClick={() => router.push('/dashboard')}
          className="w-full max-w-xs mx-auto flex items-center justify-center gap-2 py-4 bg-cyan-500 hover:bg-cyan-400 text-black rounded-xl font-bold text-lg transition-all group"
        >
          Go to dashboard
          <ArrowRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
        </button>
      </div>
    </div>
  );
}

function GraphBuildingScreen({ step }: { step: number }) {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-6">
      <div className="max-w-md w-full">
        <div className="text-center mb-10">
          <h1 className="text-2xl font-bold text-white mb-2">Building your graph</h1>
          <p className="text-zinc-500 text-sm">This takes about 30 seconds</p>
        </div>

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

        <div className="mt-10 h-1 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500 rounded-full transition-all duration-1000 ease-out"
            style={{ width: `${((Math.min(step, GRAPH_STAGES.length - 1) + 1) / GRAPH_STAGES.length) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
