'use client';

/**
 * DraftQueue
 *
 * Displays pending draft actions proposed by Foldera and waits for
 * one-tap approval or rejection from the user.
 *
 * - Polls /api/drafts/pending on mount and after each decision
 * - Each card shows what Foldera wants to do + a preview of the content
 * - Approve → POST /api/drafts/decide { decision: 'approve' }
 * - Reject  → POST /api/drafts/decide { decision: 'reject' }
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Send,
  FileText,
  Calendar,
  Search,
  GitFork,
  Pause,
  Check,
  X,
  Loader2,
  Inbox,
} from 'lucide-react';
import type { DraftAction, ActionType } from '@/lib/briefing/types';

// ---------------------------------------------------------------------------
// Action icon map
// ---------------------------------------------------------------------------

const ACTION_ICON: Record<ActionType, React.ElementType> = {
  send_message:   Send,
  write_document: FileText,
  schedule:       Calendar,
  research:       Search,
  make_decision:  GitFork,
  do_nothing:     Pause,
};

// ---------------------------------------------------------------------------
// DraftQueue
// ---------------------------------------------------------------------------

interface DraftQueueProps {
  /** Called after any decision so the parent can refresh related counts */
  onDecided?: () => void;
}

export default function DraftQueue({ onDecided }: DraftQueueProps) {
  const [drafts, setDrafts]   = useState<DraftAction[]>([]);
  const [loading, setLoading] = useState(true);

  const loadDrafts = useCallback(async () => {
    try {
      const res = await fetch('/api/drafts/pending');
      if (res.ok) setDrafts(await res.json());
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadDrafts(); }, [loadDrafts]);

  const decide = async (draftId: string, decision: 'approve' | 'reject') => {
    // Optimistically remove from list
    setDrafts(prev => prev.filter(d => d.id !== draftId));

    try {
      await fetch('/api/drafts/decide', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ draft_id: draftId, decision }),
      });
      onDecided?.();
    } catch {
      // Reload on failure — optimistic update may have been wrong
      loadDrafts();
    }
  };

  if (loading) return null; // Don't flash a skeleton; only render when data ready
  if (drafts.length === 0) return null; // Zero drafts = hidden section

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl">
      {/* Header */}
      <div className="p-5 border-b border-zinc-800 flex items-center justify-between">
        <div>
          <h2 className="text-zinc-50 font-semibold flex items-center gap-2">
            <Inbox className="w-4 h-4 text-violet-400" />
            Foldera wants to act
          </h2>
          <p className="text-zinc-500 text-sm mt-0.5">
            {drafts.length} action{drafts.length !== 1 ? 's' : ''} waiting for approval
          </p>
        </div>
        {/* Badge */}
        <span className="text-xs font-semibold bg-violet-600 text-white px-2 py-0.5 rounded-full">
          {drafts.length}
        </span>
      </div>

      {/* Draft list */}
      <ul className="divide-y divide-zinc-800">
        {drafts.map(draft => (
          <DraftCard key={draft.id} draft={draft} onDecide={decide} />
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single draft card
// ---------------------------------------------------------------------------

interface DraftCardProps {
  draft:    DraftAction;
  onDecide: (id: string, decision: 'approve' | 'reject') => Promise<void>;
}

function DraftCard({ draft, onDecide }: DraftCardProps) {
  const [deciding, setDeciding] = useState<'approve' | 'reject' | null>(null);

  const handleDecide = async (decision: 'approve' | 'reject') => {
    setDeciding(decision);
    await onDecide(draft.id, decision);
    setDeciding(null);
  };

  const Icon = ACTION_ICON[draft.action_type] ?? Send;

  return (
    <li className="p-4 sm:p-5 space-y-3">
      {/* Title row */}
      <div className="flex items-start gap-3">
        <div className="mt-0.5 p-1.5 rounded-lg bg-zinc-800 shrink-0">
          <Icon className="w-3.5 h-3.5 text-violet-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-zinc-50 text-sm font-medium leading-snug">{draft.title}</p>
          <p className="text-zinc-500 text-xs mt-0.5">{draft.description}</p>
        </div>
      </div>

      {/* Draft payload preview */}
      <DraftPreview draft={draft} />

      {/* Approve / Reject */}
      <div className="flex gap-2 pt-1">
        <button
          onClick={() => handleDecide('approve')}
          disabled={!!deciding}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors disabled:opacity-60"
        >
          {deciding === 'approve' ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Check className="w-3.5 h-3.5" />
          )}
          Approve
        </button>
        <button
          onClick={() => handleDecide('reject')}
          disabled={!!deciding}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold transition-colors disabled:opacity-60"
        >
          {deciding === 'reject' ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <X className="w-3.5 h-3.5" />
          )}
          Reject
        </button>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// DraftPreview — renders the draft payload as a readable block
// ---------------------------------------------------------------------------

function DraftPreview({ draft }: { draft: DraftAction }) {
  const { draft: payload } = draft;
  if (!payload) return null;

  // Email-like drafts
  if (payload.to || payload.subject) {
    return (
      <div className="bg-zinc-800/60 rounded-lg p-3 text-xs font-mono space-y-1 text-zinc-400">
        {payload.to      && <div><span className="text-zinc-500">To: </span>{String(payload.to)}</div>}
        {payload.subject && <div><span className="text-zinc-500">Subject: </span>{String(payload.subject)}</div>}
        {payload.body    && (
          <div className="mt-1.5 text-zinc-300 leading-relaxed whitespace-pre-wrap line-clamp-4">
            {String(payload.body)}
          </div>
        )}
      </div>
    );
  }

  // Generic — show any non-private keys
  const entries = Object.entries(payload).filter(
    ([k]) => !k.startsWith('_') && k !== 'draft_type' && k !== 'source' && k !== 'source_id',
  );
  if (entries.length === 0) return null;

  return (
    <div className="bg-zinc-800/60 rounded-lg p-3 text-xs font-mono space-y-1 text-zinc-400">
      {entries.map(([k, v]) => (
        <div key={k}>
          <span className="text-zinc-500">{k}: </span>
          <span className="text-zinc-300">{String(v)}</span>
        </div>
      ))}
    </div>
  );
}
