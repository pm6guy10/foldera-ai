'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Settings } from 'lucide-react';
import type { ConvictionAction } from '@/lib/briefing/types';

type ArtifactWithDraftedEmail = {
  type: string;
  to?: string;
  recipient?: string;
  subject?: string;
  body?: string;
  options?: Array<{ option: string; weight: number; rationale: string }>;
  recommendation?: string;
  context?: string;
  evidence?: string;
  tripwires?: string[];
  check_date?: string;
};

type ActionWithDomain = ConvictionAction & { domain?: string };

export default function DashboardPage() {
  const { status } = useSession();
  const router = useRouter();
  const [action, setAction] = useState<ActionWithDomain | null>(null);
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') {
      // Preserve deep-link params through login so email approve/skip links work
      const search = typeof window !== 'undefined' ? window.location.search : '';
      router.push(`/login?callbackUrl=${encodeURIComponent(`/dashboard${search}`)}`);
    }
  }, [status, router]);

  // Handle email deep-link params (approve/skip from morning email)
  useEffect(() => {
    if (status !== 'authenticated') return;
    const params = new URLSearchParams(window.location.search);
    const deepAction = params.get('action');
    const id = params.get('id');
    if (!deepAction || !id) return;
    window.history.replaceState({}, '', window.location.pathname);
    if (deepAction === 'approve' || deepAction === 'skip') {
      fetch('/api/conviction/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action_id: id, decision: deepAction }),
      })
        .then(async (res) => {
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            const msg = (data as { error?: string }).error ?? 'Could not update that action.';
            throw new Error(msg);
          }
          if (data.status === 'executed' || data.status === 'skipped') {
            setDone(true);
            setFlash(
              deepAction === 'approve'
                ? 'Done. Foldera executed that.'
                : 'Skipped. Foldera will adjust.',
            );
          } else {
            throw new Error('Unexpected response from Foldera.');
          }
        })
        .catch((err: unknown) => {
          setDone(true);
          setFlash(err instanceof Error ? err.message : 'Could not update that action.');
        });
    }
  }, [status]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Don't redirect to onboarding if this is a deep-link action (approve/skip from email)
      const params = new URLSearchParams(window.location.search);
      const hasDeepLink = params.get('action') && params.get('id');
      if (!hasDeepLink) {
        // Check onboarding status first
        const checkRes = await fetch('/api/onboard/check');
        if (checkRes.ok) {
          const checkData = await checkRes.json();
          if (!checkData.hasOnboarded) {
            router.push('/onboard');
            return;
          }
        }
      }

      const res = await fetch('/api/conviction/latest');
      const data = await res.json().catch(() => ({}));
      setAction(data?.id ? data : null);
    } catch {
      setAction(null);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (status === 'authenticated') load();
  }, [status, load]);

  const handleApprove = async () => {
    if (!action) return;
    try {
      const res = await fetch('/api/conviction/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action_id: action.id, decision: 'approve' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Approve failed');
      setDone(true);
      setFlash('Done. Foldera executed that.');
    } catch (err: unknown) {
      setFlash(err instanceof Error ? err.message : 'Approve failed');
    }
  };

  const handleSkip = async () => {
    if (!action) return;
    try {
      const res = await fetch('/api/conviction/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action_id: action.id, decision: 'skip' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Skip failed');
      setDone(true);
      setFlash('Skipped. Foldera will adjust.');
    } catch (err: unknown) {
      setFlash(err instanceof Error ? err.message : 'Skip failed');
    }
  };

  const artifact = action?.artifact as ArtifactWithDraftedEmail | null | undefined;
  const isEmail = artifact?.type === 'email' || artifact?.type === 'drafted_email';
  const isDecision = artifact?.type === 'decision_frame';
  const isWait = artifact?.type === 'wait_rationale';
  const recipient = artifact?.to || artifact?.recipient || '';

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Fixed header */}
      <header className="fixed top-0 left-0 right-0 z-10 bg-zinc-950 border-b border-zinc-800 h-14">
        <div className="max-w-2xl mx-auto h-full flex items-center justify-between px-4">
          <span className="text-lg font-bold text-white">Foldera</span>
          <Link href="/dashboard/settings">
            <Settings className="w-5 h-5 text-zinc-500 hover:text-white transition-colors" />
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="pt-20 pb-8 px-4 max-w-2xl mx-auto">
        {loading ? (
          <div className="animate-pulse space-y-4 mt-4">
            <div className="h-3 w-20 bg-zinc-800 rounded" />
            <div className="h-6 bg-zinc-800 rounded w-full" />
            <div className="h-6 bg-zinc-800 rounded w-4/5" />
            <div className="h-32 bg-zinc-800 rounded-xl mt-4" />
            <div className="flex gap-3 mt-4">
              <div className="h-12 bg-zinc-800 rounded-xl flex-1" />
              <div className="h-12 bg-zinc-800 rounded-xl flex-1" />
            </div>
          </div>
        ) : done ? (
          <div className="mt-20 text-center">
            {flash && <p className="text-white text-base mb-2">{flash}</p>}
            <p className="text-zinc-500 text-sm">Next sync at 7am Pacific.</p>
          </div>
        ) : !action ? (
          <div className="mt-20 text-center">
            <p className="text-zinc-400">Your first read arrives tomorrow morning.</p>
            <p className="text-zinc-600 text-sm mt-2">Foldera is learning your patterns.</p>
          </div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
            {/* Domain badge */}
            {action.domain && (
              <p className="text-xs uppercase tracking-wide text-emerald-500">
                {action.domain}
              </p>
            )}

            {/* Directive text */}
            <p className="text-xl font-semibold text-white mt-2 leading-relaxed">
              {action.directive}
            </p>

            {/* Artifact */}
            {artifact && (
              <div className="mt-6">
                {isEmail && (
                  <div className="bg-zinc-800 rounded-xl p-4">
                    {recipient && (
                      <p className="text-sm text-zinc-400">To: {recipient}</p>
                    )}
                    {artifact.subject && (
                      <p className="text-sm text-white mt-1 font-medium">
                        Subject: {artifact.subject}
                      </p>
                    )}
                    {artifact.body && (
                      <p className="text-sm text-zinc-300 mt-3 whitespace-pre-wrap">
                        {artifact.body}
                      </p>
                    )}
                  </div>
                )}

                {isDecision && artifact.options && (
                  <div className="grid grid-cols-2 gap-3">
                    {artifact.options.slice(0, 2).map((opt, i) => (
                      <div key={i} className="bg-zinc-800 rounded-xl p-4">
                        <p className="text-sm font-medium text-white">{opt.option}</p>
                        <p className="text-xs text-zinc-400 mt-1">{opt.rationale}</p>
                      </div>
                    ))}
                  </div>
                )}

                {isWait && (
                  <div className="bg-zinc-800 rounded-xl p-4">
                    {artifact.context && (
                      <p className="text-sm text-zinc-300">Why wait: {artifact.context}</p>
                    )}
                    {(artifact.tripwires?.[0] || artifact.check_date) && (
                      <p className="text-sm text-emerald-400 mt-2">
                        Resume when: {artifact.tripwires?.[0] ?? artifact.check_date}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Action buttons */}
            <div className="mt-6 flex gap-3">
              <button
                onClick={handleApprove}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-3 rounded-xl font-medium transition-colors"
              >
                Approve
              </button>
              <button
                onClick={handleSkip}
                className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 py-3 rounded-xl font-medium transition-colors"
              >
                Skip
              </button>
            </div>
          </div>
        )}

        {/* Footer — only when directive shown */}
        {!loading && !done && action && (
          <p className="text-xs text-zinc-600 text-center mt-8">Next sync at 7am Pacific</p>
        )}
      </main>
    </div>
  );
}
