'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import ConvictionCard from './conviction-card';
import type { SkipReason } from './conviction-card';
import type { ConvictionAction } from '@/lib/briefing/types';

interface EmailActionFeedback {
  tone: 'success' | 'error';
  text: string;
}

export default function DashboardContent() {
  const { status } = useSession();
  const router = useRouter();

  const [conviction, setConviction]     = useState<ConvictionAction | null>(null);
  const [convictionLoading, setConvictionLoading] = useState(true);
  const [emailActionMsg, setEmailActionMsg] = useState<EmailActionFeedback | null>(null);
  const [convictionError, setConvictionError] = useState<string | null>(null);
  const [isPro, setIsPro] = useState(true); // default true to avoid upgrade flash for paying users

  const showEmailActionFeedback = useCallback((tone: EmailActionFeedback['tone'], text: string) => {
    setEmailActionMsg({ tone, text });
    window.setTimeout(() => setEmailActionMsg(null), 4000);
  }, []);

  // Handle email deep-link: approve/skip → execute; outcome (worked/didnt_work) → conviction/outcome
  useEffect(() => {
    if (status !== 'authenticated') return;
    const params = new URLSearchParams(window.location.search);
    const action = params.get('action');
    const id     = params.get('id');
    const result = params.get('result');
    if (!action || !id) return;

    const cleanUrl = window.location.pathname;
    window.history.replaceState({}, '', cleanUrl);

    if (action === 'outcome' && (result === 'worked' || result === 'didnt_work')) {
      fetch('/api/conviction/outcome', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action_id: id, outcome: result }),
      })
        .then(res => {
          if (!res.ok) throw new Error('failed');
          return res.json();
        })
        .then(() => {
          showEmailActionFeedback('success', result === 'worked' ? "Recorded — it worked." : "Recorded — we'll adjust.");
        })
        .catch(() => {
          showEmailActionFeedback('error', "Couldn't record that — please try again.");
        });
      return;
    }

    if (action === 'approve' || action === 'skip') {
      fetch('/api/conviction/execute', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action_id: id, decision: action }),
      })
        .then(async (res) => {
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            throw new Error((data as { error?: string }).error ?? 'Could not update that action.');
          }
          return data;
        })
        .then(data => {
          if (data.status === 'executed' || data.status === 'skipped') {
            showEmailActionFeedback('success', action === 'approve' ? 'Done — Foldera executed that.' : 'Skipped. Foldera will adjust.');
            return;
          }
          throw new Error('Unexpected response from Foldera.');
        })
        .catch((error: unknown) => {
          showEmailActionFeedback(
            'error',
            error instanceof Error ? error.message : 'Could not update that action.',
          );
        });
    }
  }, [showEmailActionFeedback, status]);

  useEffect(() => {
    if (status === 'authenticated') {
      loadLatestConviction();
      // Fetch subscription status for Pro gating
      fetch('/api/subscription/status')
        .then(r => r.json())
        .then(data => {
          const pro = data.status === 'active' || data.status === 'active_trial';
          setIsPro(pro);
        })
        .catch(() => setIsPro(false));
    }
    if (status === 'unauthenticated') router.push('/start');
  }, [status]);

  const loadLatestConviction = async () => {
    setConvictionLoading(true);
    setConvictionError(null);
    try {
      const res = await fetch('/api/conviction/latest');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof (data as { error?: unknown }).error === 'string'
            ? ((data as { error: string }).error)
            : 'Could not load your latest directive right now.',
        );
      }
      setConviction(data.id ? data : null);
    } catch (error: unknown) {
      setConvictionError(error instanceof Error ? error.message : 'Could not load your latest directive right now.');
      setConviction(null);
    } finally { setConvictionLoading(false); }
  };

  const generateDirective = useCallback(async () => {
    setConvictionLoading(true);
    setConviction(null);
    setConvictionError(null);
    try {
      const res = await fetch('/api/conviction/generate', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof (data as { error?: unknown }).error === 'string'
            ? ((data as { error: string }).error)
            : 'Could not generate a directive right now.',
        );
      }
      setConviction(data);
    } catch (error: unknown) {
      setConvictionError(error instanceof Error ? error.message : 'Could not generate a directive right now.');
    } finally { setConvictionLoading(false); }
  }, []);

  const handleApprove = async (actionId: string) => {
    const res = await fetch('/api/conviction/execute', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action_id: actionId, decision: 'approve' }),
    });
    if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Execute failed'); }
    setConviction(prev => prev ? { ...prev, status: 'executed' } : prev);
  };

  const handleSkip = async (actionId: string, reason?: SkipReason) => {
    const payload: Record<string, string | undefined> = { action_id: actionId, decision: 'skip' };
    if (reason) payload.skip_reason = reason;

    const res = await fetch('/api/conviction/execute', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Skip failed'); }
    setConviction(prev => prev ? { ...prev, status: 'skipped' } : prev);
  };

  const handleOutcome = async (actionId: string, outcome: 'worked' | 'didnt_work') => {
    const res = await fetch('/api/conviction/outcome', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action_id: actionId, outcome }),
    });
    if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Could not save outcome'); }
  };

  return (
    <div className="space-y-6">
      {/* Email action confirmation banner */}
      {emailActionMsg && (
        <div className={`px-5 py-3 rounded-xl border ${
          emailActionMsg.tone === 'success'
            ? 'bg-emerald-500/10 border-emerald-500/30'
            : 'bg-rose-500/10 border-rose-500/30'
        }`}>
          <p className={`text-sm ${
            emailActionMsg.tone === 'success' ? 'text-emerald-300' : 'text-rose-300'
          }`}>{emailActionMsg.text}</p>
        </div>
      )}
      {convictionError && (
        <div className="px-5 py-3 rounded-xl border border-rose-500/30 bg-rose-500/10">
          <p className="text-sm text-rose-300">{convictionError}</p>
        </div>
      )}

      {/* The ONE thing: today's directive */}
      <ConvictionCard
        action={conviction}
        isLoading={convictionLoading}
        isPro={isPro}
        onGenerate={generateDirective}
        onApprove={handleApprove}
        onSkip={handleSkip}
        onOutcome={handleOutcome}
      />

      {/* Next sync */}
      <p className="text-center text-zinc-600 text-xs">
        Your next read arrives at 7am Pacific
      </p>
    </div>
  );
}
