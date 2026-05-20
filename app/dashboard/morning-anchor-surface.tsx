'use client';

import { useEffect } from 'react';
import { MorningAnchorCard } from '@/components/dashboard/MorningAnchorCard';
import type { RightNowCard } from '@/lib/workday-presence/model';

export function useLoadMorningAnchorCard(
  status: 'loading' | 'authenticated' | 'unauthenticated',
  setMorningAnchorCard: (card: RightNowCard | null) => void,
) {
  useEffect(() => {
    if (status !== 'authenticated') {
      setMorningAnchorCard(null);
      return;
    }

    let cancelled = false;
    void fetch('/api/workday-presence')
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (!cancelled && payload?.card) {
          setMorningAnchorCard(payload.card as RightNowCard);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMorningAnchorCard(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [setMorningAnchorCard, status]);
}

export function MorningAnchorEmptyState({
  card,
  onSaveFailed,
  onSaved,
}: {
  card: RightNowCard;
  onSaveFailed: () => void;
  onSaved: (card: RightNowCard) => void;
}) {
  return (
    <MorningAnchorCard
      card={card}
      onSave={async (input) => {
        const response = await fetch('/api/workday-presence', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload?.card) {
          onSaveFailed();
          return;
        }
        onSaved(payload.card as RightNowCard);
      }}
    />
  );
}

