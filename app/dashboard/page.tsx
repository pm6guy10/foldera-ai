'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { MorningAnchorCard, type RightNowCardActionId } from '@/components/dashboard/MorningAnchorCard';
import type { RightNowCard } from '@/lib/workday-presence/model';

type ConnectedSourceState = 'loading' | 'connected' | 'missing' | 'error';

function hasActiveSource(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const integrations = (payload as { integrations?: unknown }).integrations;
  if (!Array.isArray(integrations)) return false;
  return integrations.some((integration) => {
    if (!integration || typeof integration !== 'object') return false;
    const row = integration as { provider?: unknown; is_active?: unknown };
    return (
      row.is_active === true &&
      (row.provider === 'google' || row.provider === 'azure_ad' || row.provider === 'microsoft')
    );
  });
}

function readCard(payload: unknown): RightNowCard | null {
  if (!payload || typeof payload !== 'object') return null;
  const card = (payload as { card?: unknown }).card;
  if (!card || typeof card !== 'object') return null;
  return card as RightNowCard;
}

export default function DashboardPage() {
  const { status } = useSession();
  const [card, setCard] = useState<RightNowCard | null>(null);
  const [cardLoading, setCardLoading] = useState(true);
  const [actionPending, setActionPending] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [sourceState, setSourceState] = useState<ConnectedSourceState>('loading');

  const loadCard = useCallback(async () => {
    try {
      const response = await fetch('/api/workday-presence');
      const payload = await response.json().catch(() => null);
      setCard(response.ok ? readCard(payload) : null);
    } catch {
      setCard(null);
    } finally {
      setCardLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status !== 'authenticated') {
      if (status === 'unauthenticated') setCardLoading(false);
      return;
    }
    void loadCard();
  }, [status, loadCard]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    let cancelled = false;
    fetch('/api/integrations/status')
      .then(async (response) => {
        if (!response.ok) throw new Error('integration status unavailable');
        return response.json();
      })
      .then((payload) => {
        if (!cancelled) setSourceState(hasActiveSource(payload) ? 'connected' : 'missing');
      })
      .catch(() => {
        if (!cancelled) setSourceState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [status]);

  const saveAnchor = useCallback(
    async (input: {
      current_focus: string;
      next_move: string;
      why_it_matters: string;
      blocker: string;
      do_not_touch: string;
      waiting_on: string;
      last_completed_step: string;
    }) => {
      setSaveError(null);
      const response = await fetch('/api/workday-presence', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const payload = await response.json().catch(() => null);
      const nextCard = response.ok ? readCard(payload) : null;
      if (!nextCard) {
        setSaveError('Could not save your anchor. Try again.');
        return;
      }
      setCard(nextCard);
    },
    [],
  );

  const respond = useCallback(
    async (actionId: RightNowCardActionId) => {
      setActionPending(true);
      setSaveError(null);
      try {
        const response = await fetch('/api/workday-presence/message-action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action_id: actionId }),
        });
        if (!response.ok) {
          setSaveError('Could not record your response. Try again.');
          return;
        }
        await loadCard();
      } finally {
        setActionPending(false);
      }
    },
    [loadCard],
  );

  return (
    <main className="min-h-screen bg-[#030305] text-white">
      <header className="border-b border-white/10">
        <div className="mx-auto flex h-14 w-full max-w-4xl items-center justify-between px-4 sm:px-6">
          <Link
            href="/"
            aria-label="Foldera"
            className="text-base font-semibold tracking-[-0.025em] text-white"
          >
            Foldera
          </Link>
          <Link
            href="/dashboard/settings"
            className="text-sm text-white/70 transition-colors hover:text-white"
          >
            Sources
          </Link>
        </div>
      </header>

      <section className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
        {sourceState === 'missing' ? (
          <div
            data-testid="dashboard-connect-strip"
            className="mb-6 rounded-2xl border border-cyan-300/25 bg-cyan-300/5 px-6 py-5"
          >
            <p className="text-sm font-semibold text-white">Connect one source</p>
            <p className="mt-1 text-sm leading-6 text-white/60">
              Foldera reads connected context to find your re-entry point. Nothing sends without
              your approval.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <a
                href="/api/google/connect"
                className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-[#46F4FF] px-5 text-sm font-semibold text-[#031016] transition-colors hover:bg-[#7df8ff]"
              >
                Connect Google
              </a>
              <a
                href="/api/microsoft/connect"
                className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-white/20 px-5 text-sm font-semibold text-white transition-colors hover:border-white/45"
              >
                Connect Microsoft
              </a>
            </div>
          </div>
        ) : null}

        {cardLoading || status === 'loading' ? (
          <div className="flex justify-center py-24" data-testid="dashboard-card-loading">
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-[#46F4FF] border-t-transparent" />
          </div>
        ) : (
          <MorningAnchorCard
            card={
              card ?? {
                mode: 'setup',
                prompt: 'What are you trying to move forward today?',
                verdict_line: null,
              }
            }
            onSave={saveAnchor}
            onAction={respond}
            actionPending={actionPending}
          />
        )}

        {saveError ? (
          <p role="alert" className="mt-4 text-center text-sm text-amber-200">
            {saveError}
          </p>
        ) : null}

        <div
          data-testid="trust-rail"
          className="mx-auto mt-8 max-w-[760px] rounded-2xl border border-white/10 bg-white/5 px-6 py-4"
        >
          <p className="text-xs leading-5 text-white/50">
            Foldera reads your connected sources. Nothing is stored raw.
          </p>
          <p className="mt-1 text-xs leading-5 text-white/50">
            Nothing sends without your explicit approval.
          </p>
          <Link
            href="/dashboard/settings"
            className="mt-3 inline-block text-xs text-[#46F4FF]/70 underline-offset-2 hover:text-[#46F4FF] hover:underline"
          >
            Manage sources →
          </Link>
        </div>
      </section>
    </main>
  );
}
