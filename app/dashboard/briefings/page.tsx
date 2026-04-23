'use client';

import { useEffect, useState } from 'react';
import { signOut, useSession } from 'next-auth/react';
import { LogOut } from 'lucide-react';
import { ProductShell } from '@/components/dashboard/ProductShell';
import { SIGN_OUT_CALLBACK_URL } from '@/lib/auth/constants';

type HistoryItem = {
  id: string;
  status: string;
  action_type: string;
  confidence: number | null;
  generated_at: string | null;
  directive_preview: string;
};

function statusClass(status: string) {
  switch (status) {
    case 'pending_approval':
      return 'border-accent-dim bg-accent-dim/20 text-accent-hover';
    case 'executed':
    case 'approved':
      return 'border-success bg-success/20 text-text-primary';
    case 'failed':
      return 'border-border-strong bg-panel-raised text-text-secondary';
    default:
      return 'border-border bg-panel-raised text-text-secondary';
  }
}

export default function BriefingsHistoryPage() {
  const { status } = useSession();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (status !== 'authenticated') {
      setLoading(false);
      return;
    }
    fetch('/api/conviction/history?limit=40')
      .then(async (response) => {
        if (!response.ok) {
          setError(true);
          setItems([]);
          return;
        }
        const data = (await response.json()) as { items?: HistoryItem[] };
        setItems(Array.isArray(data.items) ? data.items : []);
      })
      .catch(() => {
        setError(true);
        setItems([]);
      })
      .finally(() => setLoading(false));
  }, [status]);

  if (status === 'loading' || (status === 'authenticated' && loading)) {
    return (
      <ProductShell title="Briefings" subtitle="Daily history of generated directives.">
        <div className="space-y-3">
          <div className="h-24 animate-pulse rounded-card border border-border bg-panel" />
          <div className="h-24 animate-pulse rounded-card border border-border bg-panel" />
        </div>
      </ProductShell>
    );
  }

  if (status === 'unauthenticated') return null;

  return (
    <ProductShell
      title="Briefings"
      subtitle="Review recent directives and outcomes. Open Today for the active action card."
      headerActions={(
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: SIGN_OUT_CALLBACK_URL })}
          className="inline-flex min-h-[40px] items-center gap-2 rounded-button border border-border px-3 text-xs font-black uppercase tracking-[0.12em] text-text-secondary transition-colors hover:text-text-primary"
          aria-label="Sign out"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">Sign out</span>
        </button>
      )}
    >
      <h2 className="mb-4 text-sm font-black uppercase tracking-[0.12em] text-text-secondary">Past directives</h2>

      {error && (
        <div className="rounded-card border border-border-strong bg-panel-raised px-4 py-3 text-sm text-text-secondary">
          Could not load history. Try again.
        </div>
      )}

      {!error && items.length === 0 && (
        <div className="rounded-card border border-border-subtle bg-panel p-8 sm:p-10">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-accent">No briefings yet</p>
          <h2 className="mt-4 text-2xl font-black tracking-tight text-text-primary">You&apos;re clear for now.</h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-text-secondary">
            Foldera will add completed brief artifacts here after each morning cycle. Open Today for the active directive, or review connected sources in settings.
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <a
              href="/dashboard"
              className="inline-flex min-h-[44px] items-center justify-center rounded-button bg-accent px-4 text-xs font-black uppercase tracking-[0.12em] text-bg transition-colors hover:bg-accent-hover"
            >
              Open today
            </a>
            <a
              href="/dashboard/settings#connected-accounts"
              className="inline-flex min-h-[44px] items-center justify-center rounded-button border border-border px-4 text-xs font-black uppercase tracking-[0.12em] text-text-secondary transition-colors hover:text-text-primary"
            >
              Review sources
            </a>
          </div>
        </div>
      )}

      {items.length > 0 && (
        <ul className="space-y-3">
          {items.map((row) => (
            <li key={row.id} className="rounded-card border border-border bg-panel p-6">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-badge border px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${statusClass(row.status)}`}>
                  {row.status.replace(/_/g, ' ')}
                </span>
                <span className="text-[10px] font-black uppercase tracking-[0.12em] text-text-muted">
                  {row.action_type.replace(/_/g, ' ')}
                </span>
                {typeof row.confidence === 'number' && (
                  <span className="text-xs tabular-nums text-text-secondary">{row.confidence}%</span>
                )}
              </div>
              <p className="mt-3 text-sm leading-relaxed text-text-primary">{row.directive_preview || '—'}</p>
              {row.generated_at && (
                <p className="mt-3 text-xs text-text-muted">
                  {new Date(row.generated_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </ProductShell>
  );
}

