'use client';

import { useCallback, useEffect, useState } from 'react';
import type { DraftAction } from '@/lib/briefing/types';

export function AgentSystemPanel() {
  const [drafts, setDrafts] = useState<DraftAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/drafts/pending?scope=system');
      if (!res.ok) {
        setDrafts([]);
        return;
      }
      const data = (await res.json()) as DraftAction[];
      setDrafts(Array.isArray(data) ? data : []);
    } catch {
      setDrafts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide(id: string, decision: 'approve' | 'reject') {
    setBusyId(id);
    setMsg(null);
    try {
      const res = await fetch('/api/drafts/decide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft_id: id, decision }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg((data as { error?: string }).error ?? 'Update failed');
        return;
      }
      setMsg(decision === 'approve' ? 'Saved to your signal log.' : 'Skipped. Agent will learn from this.');
      await load();
    } catch {
      setMsg('Network error');
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <div className="animate-pulse space-y-3 mt-6">
        <div className="h-8 bg-zinc-800/80 rounded-lg w-2/3" />
        <div className="h-24 bg-zinc-800/50 rounded-xl" />
      </div>
    );
  }

  if (drafts.length === 0) {
    return (
      <div className="mt-10 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-6 py-10 text-center">
        <p className="text-sm text-zinc-300">No agent drafts in queue.</p>
        <p className="text-xs text-zinc-500 mt-2">Silence means healthy — or agents are off in System tools.</p>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-4">
      {msg && (
        <div className="rounded-xl border border-white/10 bg-zinc-950/80 px-4 py-3 text-sm text-zinc-300">{msg}</div>
      )}
      {drafts.map((d) => (
        <article
          key={d.id}
          className="rounded-2xl border border-emerald-500/25 bg-[#0a0a0f] overflow-hidden shadow-[0_20px_60px_-30px_rgba(16,185,129,0.25)]"
        >
          <div className="px-5 py-4 border-b border-white/10">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400 mb-1">Agent output</p>
            <h2 className="text-lg font-bold text-white leading-snug">{d.title}</h2>
            <p className="text-sm text-zinc-400 mt-2">{d.description}</p>
          </div>
          <div className="px-5 py-4 text-sm text-zinc-300 max-h-72 overflow-y-auto whitespace-pre-wrap font-mono text-xs leading-relaxed">
            {typeof d.draft?.content === 'string'
              ? d.draft.content
              : JSON.stringify(d.draft, null, 2)}
          </div>
          <div className="flex gap-2 p-4 bg-white/[0.02] border-t border-white/10">
            <button
              type="button"
              disabled={busyId === d.id}
              onClick={() => void decide(d.id, 'approve')}
              className="flex-1 bg-emerald-500 text-black py-3 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-emerald-400 disabled:opacity-50"
            >
              {busyId === d.id ? '…' : 'Approve'}
            </button>
            <button
              type="button"
              disabled={busyId === d.id}
              onClick={() => void decide(d.id, 'reject')}
              className="px-5 py-3 rounded-xl border border-white/15 text-zinc-400 text-xs font-black uppercase tracking-widest hover:bg-white/5 disabled:opacity-50"
            >
              Skip
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
