'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

type Stage =
  | 'connecting'   // calling gmail-sync
  | 'thin'         // show paste textarea
  | 'ingesting'    // calling thin-ingest
  | 'generating'   // calling free-directive
  | 'very_thin'    // show email capture
  | 'thankyou'     // done — very thin path
  | 'error';

const STATUS_MESSAGES = [
  'Reading your sent mail...',
  'Identifying decisions...',
  'Looking for things that matter...',
  'Building your profile...',
];

export default function ProcessingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [stage, setStage] = useState<Stage>('connecting');
  const [statusMsg, setStatusMsg] = useState(STATUS_MESSAGES[0]);
  const [counts, setCounts] = useState({ patterns: 0, commitments: 0 });
  const [paste, setPaste] = useState('');
  const [email, setEmail] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const hasRun = useRef(false);

  // Redirect to /start if not authenticated
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/start');
    }
  }, [status, router]);

  // Kick off the sync once session is ready
  useEffect(() => {
    if (status !== 'authenticated' || hasRun.current) return;
    hasRun.current = true;
    runGmailSync();
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  async function runGmailSync() {
    setStage('connecting');

    // Rotate status messages while the API works
    let msgIdx = 0;
    const ticker = setInterval(() => {
      msgIdx = (msgIdx + 1) % STATUS_MESSAGES.length;
      setStatusMsg(STATUS_MESSAGES[msgIdx]);
    }, 3500);

    try {
      const res = await fetch('/api/onboard/gmail-sync', { method: 'POST' });
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
    setStatusMsg('Analyzing conversation history...');

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
    setStatusMsg('Getting your first read ready...');

    const res = await fetch('/api/onboard/free-directive', { method: 'POST' });

    if (res.status === 409) {
      // Already generated — go show the existing one
      router.replace('/start/result');
      return;
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? 'Failed to generate directive');
    }

    const data = await res.json();
    // Stash in sessionStorage so /start/result can display without an extra fetch
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
    return <Spinner message={statusMsg} />;
  }

  if (stage === 'error') {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <p className="text-red-400 mb-6">{errorMsg}</p>
          <button
            onClick={() => { hasRun.current = false; runGmailSync(); }}
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
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-6">
        <div className="max-w-xl w-full">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8">
            <p className="text-cyan-400 text-xs font-semibold tracking-widest uppercase mb-4">
              Almost there
            </p>
            <h2 className="text-2xl font-bold mb-3">
              Foldera found {counts.commitments} commitment{counts.commitments !== 1 ? 's' : ''} and{' '}
              {counts.patterns} pattern{counts.patterns !== 1 ? 's' : ''} in your recent email.
            </h2>
            <p className="text-slate-400 mb-6">
              For a stronger read, connect your Claude conversation history too.
            </p>
            <textarea
              value={paste}
              onChange={e => setPaste(e.target.value)}
              placeholder="Paste a Claude conversation export here..."
              className="w-full h-40 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-200 placeholder:text-slate-500 resize-none focus:outline-none focus:border-cyan-600 mb-4"
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
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-6">
        <div className="max-w-lg w-full">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center">
            <p className="text-4xl mb-5">📭</p>
            <h2 className="text-2xl font-bold mb-3">Foldera needs more history</h2>
            <p className="text-slate-400 mb-6 leading-relaxed">
              We found {counts.patterns} pattern{counts.patterns !== 1 ? 's' : ''} so far — not enough
              for an accurate read. We&apos;ll email you when we can generate your first directive.
            </p>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-600 mb-4"
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
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-6">
        <div className="max-w-lg w-full text-center">
          <p className="text-4xl mb-5">✓</p>
          <h2 className="text-2xl font-bold mb-3">You&apos;re on the list.</h2>
          <p className="text-slate-400 leading-relaxed">
            We&apos;ll reach out as soon as we have enough to generate your first read.
          </p>
        </div>
      </div>
    );
  }

  return <Spinner message="Redirecting..." />;
}

function Spinner({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-6">
      <div className="w-10 h-10 border-2 border-cyan-600 border-t-transparent rounded-full animate-spin" />
      <p className="text-slate-300 text-base">{message}</p>
    </div>
  );
}
