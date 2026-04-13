'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { signOut, useSession } from 'next-auth/react';
import { History, LogOut, Settings } from 'lucide-react';

import { SIGN_OUT_CALLBACK_URL } from '@/lib/auth/constants';
import { FolderaMark } from '@/components/nav/FolderaMark';

type HistoryItem = {
  id: string;
  status: string;
  action_type: string;
  confidence: number | null;
  generated_at: string | null;
  directive_preview: string;
};

function statusStyle(status: string): string {
  switch (status) {
    case 'pending_approval':
      return 'bg-cyan-500/15 text-cyan-300 border-cyan-500/25';
    case 'executed':
    case 'approved':
      return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25';
    case 'skipped':
      return 'bg-zinc-500/15 text-zinc-400 border-zinc-600/40';
    case 'failed':
      return 'bg-red-500/15 text-red-300 border-red-500/25';
    default:
      return 'bg-zinc-500/15 text-zinc-400 border-zinc-600/40';
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
      .then(async (res) => {
        if (!res.ok) {
          setError(true);
          setItems([]);
          return;
        }
        const data = (await res.json()) as { items?: HistoryItem[] };
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
      <div className="min-h-[100dvh] bg-[#07070c] text-white flex items-center justify-center">
        <p className="text-zinc-500 text-sm">Loading…</p>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return null;
  }

  return (
    <div className="min-h-[100dvh] bg-[#07070c] text-white overflow-x-hidden selection:bg-cyan-500/30 selection:text-white">
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,#000_20%,transparent_100%)]" />
      </div>

      <header className="fixed top-0 left-0 right-0 z-50 bg-[#07070c]/90 backdrop-blur-xl border-b border-white/5 pt-[env(safe-area-inset-top,0px)]">
        <div className="max-w-2xl mx-auto h-14 flex items-center justify-between px-4 gap-2">
          <Link href="/dashboard" className="flex items-center gap-2.5 group min-w-0">
            <FolderaMark
              size="sm"
              className="shadow-[0_0_20px_rgba(255,255,255,0.15)] transition-transform group-hover:scale-105 shrink-0"
            />
            <span className="text-sm font-black tracking-tighter text-white uppercase truncate">Foldera</span>
          </Link>
          <div className="flex items-center gap-1 shrink-0">
            <Link
              href="/dashboard/settings"
              className="touch-manipulation min-w-[44px] min-h-[44px] p-2 rounded-lg text-zinc-500 hover:text-white hover:bg-white/5 transition-colors flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#07070c]"
              aria-label="Settings"
            >
              <Settings className="w-5 h-5" />
            </Link>
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: SIGN_OUT_CALLBACK_URL })}
              className="touch-manipulation min-w-[44px] min-h-[44px] p-2 rounded-lg text-zinc-500 hover:text-white hover:bg-white/5 transition-colors flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#07070c]"
              aria-label="Sign out"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main
        id="main"
        className="relative z-10 pt-[calc(5rem+env(safe-area-inset-top,0px))] pb-[calc(3.5rem+env(safe-area-inset-bottom,0px))] px-4 max-w-2xl mx-auto w-full min-w-0"
      >
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-cyan-600/20 flex items-center justify-center">
            <History className="w-4 h-4 text-cyan-400" />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-400">History</p>
            <h1 className="text-xl font-bold text-white">Past directives</h1>
          </div>
        </div>
        <p className="text-zinc-500 text-sm mb-6 ml-12">
          Recent morning directives generated for your account. Open the dashboard for today&apos;s actionable card.
        </p>

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200 mb-4">
            Could not load history. Try again or open Settings if your session expired.
          </div>
        )}

        {!error && items.length === 0 && (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 px-5 py-8 text-center">
            <p className="text-zinc-400 text-sm">No directives yet. Connect a source and check back after your next brief.</p>
            <Link
              href="/dashboard"
              className="inline-flex mt-4 text-cyan-400 text-sm font-semibold hover:text-cyan-300"
            >
              Back to dashboard
            </Link>
          </div>
        )}

        {items.length > 0 && (
          <ul className="space-y-3">
            {items.map((row) => (
              <li
                key={row.id}
                className="rounded-2xl border border-zinc-800 bg-zinc-900/60 px-4 py-3.5"
              >
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span
                    className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md border ${statusStyle(row.status)}`}
                  >
                    {row.status.replace(/_/g, ' ')}
                  </span>
                  <span className="text-[10px] text-zinc-500 uppercase tracking-wider">{row.action_type}</span>
                  {typeof row.confidence === 'number' && (
                    <span className="text-[10px] text-zinc-500 tabular-nums">{row.confidence}%</span>
                  )}
                </div>
                <p className="text-sm text-zinc-200 leading-relaxed break-words">
                  {row.directive_preview || '—'}
                </p>
                {row.generated_at && (
                  <p className="text-xs text-zinc-600 mt-2 tabular-nums">
                    {new Date(row.generated_at).toLocaleString(undefined, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-8">
          <Link
            href="/dashboard"
            className="text-sm font-semibold text-cyan-400 hover:text-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 rounded"
          >
            Back to today&apos;s directive
          </Link>
        </div>
      </main>
    </div>
  );
}
