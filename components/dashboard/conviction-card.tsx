'use client';

import { useState } from 'react';
import {
  FileText,
  Send,
  GitFork,
  Pause,
  Calendar,
  Search,
  Check,
  X,
  ThumbsUp,
  ThumbsDown,
  Loader2,
  ChevronDown,
  ChevronUp,
  Shield,
} from 'lucide-react';
import type { ConvictionAction, ActionType, EvidenceItem } from '@/lib/briefing/types';

// ---------------------------------------------------------------------------
// Action type metadata
// ---------------------------------------------------------------------------

const ACTION_META: Record<ActionType, { label: string; icon: React.ElementType; color: string }> = {
  write_document: { label: 'Write',    icon: FileText, color: 'text-violet-400' },
  send_message:   { label: 'Send',     icon: Send,     color: 'text-cyan-400'   },
  make_decision:  { label: 'Decide',   icon: GitFork,  color: 'text-amber-400'  },
  do_nothing:     { label: 'Wait',     icon: Pause,    color: 'text-zinc-400'   },
  schedule:       { label: 'Schedule', icon: Calendar, color: 'text-emerald-400'},
  research:       { label: 'Research', icon: Search,   color: 'text-blue-400'   },
};

// ---------------------------------------------------------------------------
// Phase type
// ---------------------------------------------------------------------------

type Phase = 'idle' | 'outcome' | 'done';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ConvictionCardProps {
  action:     ConvictionAction | null;
  isLoading:  boolean;
  onGenerate: () => void;
  onApprove:  (id: string) => Promise<void>;
  onSkip:     (id: string) => Promise<void>;
  onOutcome:  (id: string, outcome: 'worked' | 'didnt_work') => Promise<void>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ConvictionCard({
  action,
  isLoading,
  onGenerate,
  onApprove,
  onSkip,
  onOutcome,
}: ConvictionCardProps) {
  const [approving, setApproving]       = useState(false);
  const [skipping, setSkipping]         = useState(false);
  const [confirming, setConfirming]     = useState<'worked' | 'didnt_work' | null>(null);
  const [phase, setPhase]               = useState<Phase>('idle');
  const [doneMsg, setDoneMsg]           = useState('');
  const [error, setError]               = useState<string | null>(null);
  const [showEvidence, setShowEvidence] = useState(false);

  const meta = action ? ACTION_META[action.action_type] ?? ACTION_META.research : null;
  const Icon = meta?.icon ?? Search;

  const handleApprove = async () => {
    if (!action?.id) return;
    setError(null);
    setApproving(true);
    try {
      await onApprove(action.id);
      setPhase('outcome');           // ← show outcome prompt instead of dead-end message
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Execute failed');
    } finally {
      setApproving(false);
    }
  };

  const handleSkip = async () => {
    if (!action?.id) return;
    setError(null);
    setSkipping(true);
    try {
      await onSkip(action.id);
      setDoneMsg('Skipped. The engine will recalibrate.');
      setPhase('done');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Skip failed');
    } finally {
      setSkipping(false);
    }
  };

  const handleOutcome = async (outcome: 'worked' | 'didnt_work') => {
    if (!action?.id) return;
    setError(null);
    setConfirming(outcome);
    try {
      await onOutcome(action.id, outcome);
      setDoneMsg(outcome === 'worked'
        ? 'Foldera learned. Pattern reinforced.'
        : 'Noted. That pattern will be deprioritized.'
      );
      setPhase('done');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not save outcome');
    } finally {
      setConfirming(null);
    }
  };

  const confidenceColor =
    (action?.confidence ?? 0) >= 70
      ? 'text-emerald-400 bg-emerald-900/30 border-emerald-700/40'
      : (action?.confidence ?? 0) >= 45
      ? 'text-amber-400 bg-amber-900/30 border-amber-700/40'
      : 'text-zinc-400 bg-zinc-800 border-zinc-700';

  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 border-b border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-violet-400" />
          <span className="text-zinc-200 font-semibold text-sm uppercase tracking-wider">
            Today's Directive
          </span>
        </div>
        <button
          onClick={onGenerate}
          disabled={isLoading}
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1 disabled:opacity-40"
        >
          {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
          {isLoading ? 'Generating...' : 'Regenerate'}
        </button>
      </div>

      {/* Body */}
      <div className="p-5">
        {isLoading ? (
          <LoadingSkeleton />
        ) : !action ? (
          <EmptyState onGenerate={onGenerate} />
        ) : phase === 'outcome' ? (
          <OutcomePrompt
            onOutcome={handleOutcome}
            confirming={confirming}
            error={error}
            onSkipOutcome={() => { setDoneMsg('Directive executed.'); setPhase('done'); }}
          />
        ) : phase === 'done' ? (
          <DoneState message={doneMsg} onReset={() => { setPhase('idle'); onGenerate(); }} />
        ) : (
          <>
            {/* Action type badge */}
            {meta && (
              <div className={`inline-flex items-center gap-1.5 mb-4 text-xs font-mono font-semibold uppercase tracking-widest ${meta.color}`}>
                <Icon className="w-3.5 h-3.5" />
                {meta.label}
              </div>
            )}

            {/* THE DIRECTIVE — front and center */}
            <p className="text-zinc-50 text-lg font-semibold leading-snug mb-3">
              {action.directive}
            </p>

            {/* Confidence + reason */}
            <div className="flex items-start gap-3 mb-5">
              <span className={`shrink-0 text-xs font-mono font-bold px-2 py-0.5 rounded border ${confidenceColor}`}>
                {action.confidence}%
              </span>
              <p className="text-zinc-400 text-sm leading-relaxed">{action.reason}</p>
            </div>

            {/* Error */}
            {error && (
              <p className="text-red-400 text-xs mb-3">{error}</p>
            )}

            {/* Approve / Skip buttons */}
            {action.status === 'pending_approval' && (
              <div className="flex gap-3 mb-4">
                <button
                  onClick={handleApprove}
                  disabled={approving || skipping}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors disabled:opacity-50"
                >
                  {approving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  {approving ? 'Executing...' : 'Approve'}
                </button>
                <button
                  onClick={handleSkip}
                  disabled={approving || skipping}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {skipping ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                  {skipping ? 'Logging...' : 'Skip'}
                </button>
              </div>
            )}

            {/* Already executed — show outcome prompt if no outcome yet */}
            {(action.status === 'executed' || action.status === 'approved') && (
              <div className="flex items-center gap-2 mb-4 text-emerald-400 text-sm">
                <Check className="w-4 h-4" />
                {action.status === 'executed' ? 'Executed' : 'Approved'}
                {action.approvedAt ? ` · ${new Date(action.approvedAt).toLocaleTimeString()}` : ''}
                {/* Re-surface outcome prompt if not yet confirmed */}
                {action.status === 'executed' && !(action.executionResult as any)?.outcome && (
                  <button
                    onClick={() => setPhase('outcome')}
                    className="ml-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    Did it work? →
                  </button>
                )}
              </div>
            )}

            {/* Evidence toggle */}
            {action.evidence && action.evidence.length > 0 && (
              <button
                onClick={() => setShowEvidence(v => !v)}
                className="flex items-center gap-1.5 text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
              >
                {showEvidence ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                {showEvidence ? 'Hide' : 'Show'} evidence ({action.evidence.length} items)
              </button>
            )}

            {showEvidence && action.evidence && (
              <EvidencePanel items={action.evidence} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function OutcomePrompt({
  onOutcome,
  confirming,
  error,
  onSkipOutcome,
}: {
  onOutcome:     (o: 'worked' | 'didnt_work') => void;
  confirming:    'worked' | 'didnt_work' | null;
  error:         string | null;
  onSkipOutcome: () => void;
}) {
  return (
    <div className="py-2">
      <p className="text-zinc-300 text-sm font-medium mb-1">Did it work?</p>
      <p className="text-zinc-500 text-xs mb-4">One tap. Foldera learns from your answer.</p>

      <div className="flex gap-3 mb-3">
        <button
          onClick={() => onOutcome('worked')}
          disabled={confirming !== null}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-emerald-900/40 hover:bg-emerald-900/70 border border-emerald-700/40 text-emerald-400 text-sm font-medium transition-colors disabled:opacity-50"
        >
          {confirming === 'worked'
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <ThumbsUp className="w-4 h-4" />}
          It worked
        </button>
        <button
          onClick={() => onOutcome('didnt_work')}
          disabled={confirming !== null}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-400 text-sm font-medium transition-colors disabled:opacity-50"
        >
          {confirming === 'didnt_work'
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <ThumbsDown className="w-4 h-4" />}
          Didn't work
        </button>
      </div>

      {error && <p className="text-red-400 text-xs mb-2">{error}</p>}

      <button
        onClick={onSkipOutcome}
        className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
      >
        Skip for now
      </button>
    </div>
  );
}

function DoneState({ message, onReset }: { message: string; onReset: () => void }) {
  return (
    <div className="text-center py-4">
      <p className="text-zinc-300 text-sm mb-4">{message}</p>
      <button
        onClick={onReset}
        className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        Generate new directive →
      </button>
    </div>
  );
}

function EvidencePanel({ items }: { items: EvidenceItem[] }) {
  const typeColor: Record<string, string> = {
    signal:     'text-cyan-500',
    commitment: 'text-violet-500',
    goal:       'text-emerald-500',
    pattern:    'text-amber-500',
  };

  return (
    <div className="mt-3 space-y-2 border-t border-zinc-800 pt-3">
      {items.map((item, i) => (
        <div key={i} className="flex gap-2 text-xs">
          <span className={`shrink-0 font-mono font-bold uppercase ${typeColor[item.type] ?? 'text-zinc-500'}`}>
            {item.type.slice(0, 3)}
          </span>
          <span className="text-zinc-400 leading-relaxed">
            {item.description}
            {item.date ? <span className="text-zinc-600 ml-1">· {item.date}</span> : null}
          </span>
        </div>
      ))}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-3 w-16 bg-zinc-800 rounded" />
      <div className="h-6 bg-zinc-800 rounded w-full" />
      <div className="h-6 bg-zinc-800 rounded w-4/5" />
      <div className="h-4 bg-zinc-800 rounded w-3/4 mt-2" />
      <div className="flex gap-3 mt-4">
        <div className="h-10 bg-zinc-800 rounded flex-1" />
        <div className="h-10 bg-zinc-800 rounded flex-1" />
      </div>
    </div>
  );
}

function EmptyState({ onGenerate }: { onGenerate: () => void }) {
  return (
    <div className="text-center py-6">
      <Shield className="w-8 h-8 text-zinc-700 mx-auto mb-3" />
      <p className="text-zinc-400 text-sm mb-4">No directive generated yet.</p>
      <button
        onClick={onGenerate}
        className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors"
      >
        Generate Today's Directive
      </button>
    </div>
  );
}
