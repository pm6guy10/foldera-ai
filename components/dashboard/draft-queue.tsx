'use client';

/**
 * DraftQueue
 *
 * Displays pending draft actions proposed by Foldera and keeps the
 * decision surface read-only: one-tap approve or skip.
 *
 * - Polls /api/drafts/pending on mount
 * - Draft payloads render as read-only previews
 * - Approve POSTs the stored artifact to /api/drafts/decide
 * - Cards exit with a smooth fade+scale animation (no page reload)
 * - Per-card inline error state on API failure
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
  AlertCircle,
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
// DraftQueue — manages the list; each card manages itself
// ---------------------------------------------------------------------------

interface DraftQueueProps {
  /** Called after any decision so the parent can refresh related counts */
  onDecided?: () => void;
}

export default function DraftQueue({ onDecided }: DraftQueueProps) {
  const [drafts, setDrafts] = useState<DraftAction[]>([]);
  const [loading, setLoading] = useState(true);

  const loadDrafts = useCallback(async () => {
    try {
      const res = await fetch('/api/drafts/pending');
      if (res.ok) setDrafts(await res.json());
    } catch {
      // silent — don't crash the dashboard on network hiccup
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadDrafts(); }, [loadDrafts]);

  const removeDraft = useCallback((id: string) => {
    setDrafts(prev => prev.filter(d => d.id !== id));
    onDecided?.();
  }, [onDecided]);

  if (loading) return <DraftQueueSkeleton />;
  if (drafts.length === 0) return null;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl">
      {/* Header */}
      <div className="p-5 border-b border-zinc-800 flex items-center justify-between">
        <div>
          <h2 className="text-zinc-50 font-semibold tracking-tight flex items-center gap-2">
            <Inbox className="w-4 h-4 text-cyan-400" />
            Foldera wants to act
          </h2>
          <p className="text-zinc-500 text-sm mt-0.5">
            {drafts.length} action{drafts.length !== 1 ? 's' : ''} waiting for approval
          </p>
        </div>
        <span className="text-xs font-semibold bg-cyan-500 text-black px-2 py-0.5 rounded-full">
          {drafts.length}
        </span>
      </div>

      {/* Draft list */}
      <ul className="divide-y divide-zinc-800">
        {drafts.map(draft => (
          <DraftCard key={draft.id} draft={draft} onRemove={removeDraft} />
        ))}
      </ul>
    </div>
  );
}

function DraftQueueSkeleton() {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl animate-pulse">
      <div className="p-5 border-b border-zinc-800 flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-4 w-40 bg-zinc-800 rounded" />
          <div className="h-3 w-32 bg-zinc-800 rounded" />
        </div>
        <div className="h-6 w-8 rounded-full bg-zinc-800" />
      </div>
      <div className="divide-y divide-zinc-800">
        {[0, 1].map((item) => (
          <div key={item} className="p-4 sm:p-5 space-y-3">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 w-7 h-7 rounded-lg bg-zinc-800 shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-2/3 bg-zinc-800 rounded" />
                <div className="h-3 w-1/2 bg-zinc-800 rounded" />
              </div>
            </div>
            <div className="bg-zinc-800/60 rounded-lg p-3 space-y-2">
              <div className="h-3 w-1/4 bg-zinc-800 rounded" />
              <div className="h-3 w-3/4 bg-zinc-800 rounded" />
              <div className="h-3 w-full bg-zinc-800 rounded" />
            </div>
            <div className="flex gap-2 pt-1">
              <div className="h-10 flex-1 rounded-lg bg-zinc-800" />
              <div className="h-10 flex-1 rounded-lg bg-zinc-800" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single draft card — owns its own state, API calls, and animation
// ---------------------------------------------------------------------------

interface DraftCardProps {
  draft:    DraftAction;
  onRemove: (id: string) => void;
}

function DraftCard({ draft, onRemove }: DraftCardProps) {
  const [deciding, setDeciding] = useState<'approve' | 'reject' | null>(null);
  const [exiting, setExiting]   = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  /** Show feedback message, then trigger exit animation */
  const exitWithFeedback = (msg: string) => {
    setFeedback(msg);
    setTimeout(() => {
      setExiting(true);
      setTimeout(() => onRemove(draft.id), 280);
    }, 1200);
  };

  const handleApprove = async () => {
    setDeciding('approve');
    setCardError(null);

    const body: Record<string, unknown> = {
      draft_id: draft.id,
      decision: 'approve',
    };

    try {
      const res = await fetch('/api/drafts/decide', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        setCardError((payload as { error?: string }).error ?? 'Failed to send — please try again.');
        setDeciding(null);
        return;
      }

      exitWithFeedback('Approved. Foldera will handle it.');
    } catch {
      setCardError('Network error — please try again.');
      setDeciding(null);
    }
  };

  const handleReject = async () => {
    setDeciding('reject');
    setCardError(null);

    try {
      const res = await fetch('/api/drafts/decide', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ draft_id: draft.id, decision: 'reject' }),
      });

      if (!res.ok) {
        setCardError('Failed to dismiss — please try again.');
        setDeciding(null);
        return;
      }

      exitWithFeedback('Skipped. Foldera will move on.');
    } catch {
      setCardError('Network error — please try again.');
      setDeciding(null);
    }
  };

  const Icon = ACTION_ICON[draft.action_type] ?? Send;

  return (
    <li
      className={[
        'p-4 sm:p-5 space-y-3',
        'transition-all duration-[280ms] ease-out',
        exiting
          ? 'opacity-0 -translate-y-1 scale-[0.97] pointer-events-none'
          : 'opacity-100 translate-y-0 scale-100',
      ].join(' ')}
    >
      {/* Title row */}
      <div className="flex items-start gap-3">
        <div className="mt-0.5 p-1.5 rounded-lg bg-zinc-800 shrink-0">
          <Icon className="w-3.5 h-3.5 text-cyan-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-zinc-50 text-sm font-medium leading-snug">{draft.title}</p>
          <p className="text-zinc-500 text-xs mt-0.5">{draft.description}</p>
        </div>
      </div>

      <ArtifactPreview draft={draft} />

      {/* Feedback toast — shown briefly after approve/dismiss */}
      {feedback && (
        <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-950/30 border border-emerald-900/40 rounded-lg px-3 py-2">
          <Check className="w-3.5 h-3.5 shrink-0" />
          {feedback}
        </div>
      )}

      {/* Inline error — shown inside the card, not as a banner */}
      {cardError && (
        <div className="flex items-center gap-2 text-xs text-red-400 bg-red-950/30 border border-red-900/40 rounded-lg px-3 py-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          {cardError}
        </div>
      )}

      {/* Approve / Reject */}
      {!feedback && <div className="flex gap-2 pt-1">
        <button
          onClick={handleApprove}
          disabled={!!deciding}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors disabled:opacity-60"
        >
          {deciding === 'approve' ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Check className="w-3.5 h-3.5" />
          )}
          Approve
        </button>
        <button
          onClick={handleReject}
          disabled={!!deciding}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold transition-colors disabled:opacity-60"
        >
          {deciding === 'reject' ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <X className="w-3.5 h-3.5" />
          )}
          Skip
        </button>
      </div>}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ArtifactPreview({ draft }: { draft: DraftAction }) {
  const payload = draft.draft;
  const emailTo = typeof payload?.to === 'string' ? payload.to : null;
  const emailSubject = typeof payload?.subject === 'string' ? payload.subject : null;
  const emailBody = typeof payload?.body === 'string' ? payload.body : null;

  if (emailTo || emailSubject || emailBody) {
    return (
      <div className="bg-zinc-800/60 rounded-lg divide-y divide-zinc-700/50 text-xs">
        {emailTo && (
          <div className="flex items-center gap-3 px-3 py-2">
            <span className="text-zinc-500 w-14 shrink-0">To</span>
            <span className="text-zinc-200 break-all">{emailTo}</span>
          </div>
        )}
        {emailSubject && (
          <div className="flex items-center gap-3 px-3 py-2">
            <span className="text-zinc-500 w-14 shrink-0">Subject</span>
            <span className="text-zinc-200">{emailSubject}</span>
          </div>
        )}
        {emailBody && (
          <div className="px-3 py-3">
            <p className="text-zinc-200 whitespace-pre-wrap leading-relaxed">{emailBody}</p>
          </div>
        )}
      </div>
    );
  }

  const previewLines = [
    readPreviewLine('Title', payload?.title),
    readPreviewLine('When', formatScheduleWindow(payload)),
    readPreviewLine('Summary', payload?.summary),
    readPreviewLine('Recommendation', payload?.recommendation),
    readPreviewLine('Next step', payload?.recommended_action),
    readPreviewLine('Content', payload?.content),
    readPreviewLine('Details', payload?.description),
    readPreviewLine('Notes', payload?.notes),
    readPreviewLine('Findings', payload?.findings),
  ].filter((line): line is { label: string; value: string } => line !== null);

  const options = Array.isArray(payload?.options)
    ? payload.options
        .map((option) => formatDecisionOption(option))
        .filter((option): option is string => option !== null)
    : [];

  if (previewLines.length === 0 && options.length === 0) {
    return (
      <div className="bg-zinc-800/60 rounded-lg px-3 py-3 text-xs text-zinc-400">
        Foldera prepared the finished work for this action.
      </div>
    );
  }

  return (
    <div className="bg-zinc-800/60 rounded-lg px-3 py-3 space-y-3 text-xs">
      {previewLines.length > 0 && (
        <div className="space-y-2">
          {previewLines.map((line) => (
            <div key={line.label}>
              <p className="text-zinc-500 mb-1">{line.label}</p>
              <p className="text-zinc-200 whitespace-pre-wrap leading-relaxed">{line.value}</p>
            </div>
          ))}
        </div>
      )}
      {options.length > 0 && (
        <div>
          <p className="text-zinc-500 mb-1">Options</p>
          <ul className="space-y-1 text-zinc-200">
            {options.map((option) => (
              <li key={option}>{option}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function readPreviewLine(label: string, value: unknown) {
  return typeof value === 'string' && value.trim()
    ? { label, value: value.trim() }
    : null;
}

function formatScheduleWindow(payload: DraftAction['draft']) {
  const start = typeof payload?.start === 'string' ? payload.start : null;
  const end = typeof payload?.end === 'string' ? payload.end : null;

  if (!start && !end) return null;

  const startText = start ? new Date(start).toLocaleString() : null;
  const endText = end ? new Date(end).toLocaleString() : null;

  if (startText && endText) return `${startText} to ${endText}`;
  return startText ?? endText;
}

function formatDecisionOption(option: unknown) {
  if (!option || typeof option !== 'object') return null;

  const candidate = option as { option?: unknown; rationale?: unknown };
  const title = typeof candidate.option === 'string' ? candidate.option.trim() : '';
  const rationale = typeof candidate.rationale === 'string' ? candidate.rationale.trim() : '';

  if (!title) return null;
  return rationale ? `${title}: ${rationale}` : title;
}
