'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, X } from 'lucide-react';

interface SubStatus {
  status: string;
  plan?: string;
  daysRemaining?: number;
}

export function TrialBanner() {
  const [sub, setSub]         = useState<SubStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    fetch('/api/subscription/status')
      .then((r) => r.json())
      .then((data) => setSub(data))
      .catch(() => null);
  }, []);

  if (!sub || dismissed) return null;

  // Show nothing for healthy paid subscriptions
  if (sub.status === 'active' && sub.plan === 'pro') return null;

  // ── Trial expired / cancelled / none → hard banner (not dismissible) ──
  const isExpired = sub.status === 'expired' || sub.status === 'cancelled' || sub.status === 'none';

  // ── Trial running with days remaining ───────────────────────────────────
  const isTrialWarning =
    sub.status === 'active' &&
    typeof sub.daysRemaining === 'number' &&
    sub.daysRemaining <= 3 &&
    sub.daysRemaining > 0;

  const isPastDue = sub.status === 'past_due';

  if (!isExpired && !isTrialWarning && !isPastDue) return null;

  function handleUpgrade() {
    fetch('/api/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ price_id: process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.url) window.location.href = data.url;
      })
      .catch(console.error);
  }

  if (isExpired) {
    return (
      <div className="bg-amber-500/10 border-b border-amber-500/30 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <p className="text-sm text-amber-200">
              Your trial ended.{' '}
              <span className="text-zinc-400">Subscribe to keep executing.</span>
            </p>
          </div>
          <button
            onClick={handleUpgrade}
            className="shrink-0 px-4 py-1.5 rounded-lg bg-amber-500 text-black text-sm font-semibold hover:bg-amber-400 transition-colors"
          >
            Subscribe — $19/mo
          </button>
        </div>
      </div>
    );
  }

  if (isPastDue) {
    return (
      <div className="bg-rose-500/10 border-b border-rose-500/30 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <p className="text-sm text-rose-200">
              Payment failed.{' '}
              <span className="text-zinc-400">Update your billing to restore full access.</span>
            </p>
          </div>
          <button
            onClick={handleUpgrade}
            className="shrink-0 px-4 py-1.5 rounded-lg bg-rose-500 text-white text-sm font-semibold hover:bg-rose-400 transition-colors"
          >
            Update billing
          </button>
        </div>
      </div>
    );
  }

  // Trial warning (≤3 days left)
  return (
    <div className="bg-cyan-500/5 border-b border-cyan-500/20 px-4 py-3">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        <p className="text-sm text-zinc-400">
          <span className="text-cyan-400 font-medium">{sub.daysRemaining} day{sub.daysRemaining !== 1 ? 's' : ''} left</span>
          {' '}in your free trial.
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={handleUpgrade}
            className="shrink-0 px-4 py-1.5 rounded-lg bg-white text-black text-sm font-semibold hover:bg-zinc-200 transition-colors"
          >
            Subscribe
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="p-1 text-zinc-500 hover:text-white transition-colors"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
