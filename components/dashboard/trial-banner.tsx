'use client';

import { useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';

interface SubStatus {
  status: string;
  plan?: string;
}

export function TrialBanner() {
  const [sub, setSub] = useState<SubStatus | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [upgrading, setUpgrading] = useState(false);

  useEffect(() => {
    fetch('/api/subscription/status')
      .then((r) => r.json())
      .then((data) => setSub(data))
      .catch(() => null);
  }, []);

  if (!sub) return null;

  // Only show banner for past_due billing issues on pro subscribers
  if (sub.status !== 'past_due') return null;

  async function handleUpdateBilling() {
    setCheckoutError(null);
    setUpgrading(true);

    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.url) {
        throw new Error(data.error || 'Checkout unavailable');
      }

      window.location.href = data.url;
    } catch {
      setCheckoutError('Checkout is unavailable right now. Try again in a moment.');
    } finally {
      setUpgrading(false);
    }
  }

  return (
    <div className="bg-rose-500/10 border-b border-rose-500/30 px-4 py-3">
      <div className="max-w-7xl mx-auto space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <p className="text-sm text-rose-200">
              Payment failed.{' '}
              <span className="text-zinc-400">Update your billing to restore full access.</span>
            </p>
          </div>
          <button
            onClick={handleUpdateBilling}
            disabled={upgrading}
            className="shrink-0 px-4 py-1.5 rounded-lg bg-rose-500 text-white text-sm font-semibold hover:bg-rose-400 transition-colors disabled:opacity-60"
          >
            {upgrading ? 'Loading...' : 'Update billing'}
          </button>
        </div>
        {checkoutError && <p className="text-sm text-rose-200/90">{checkoutError}</p>}
      </div>
    </div>
  );
}
