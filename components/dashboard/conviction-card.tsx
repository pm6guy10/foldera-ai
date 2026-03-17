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
  Loader2,
  Shield,
} from 'lucide-react';
import type { ConvictionAction, ActionType, ConvictionArtifact } from '@/lib/briefing/types';

// ---------------------------------------------------------------------------
// Action type metadata
// ---------------------------------------------------------------------------

const ACTION_META: Record<ActionType, { label: string; icon: React.ElementType; color: string }> = {
  write_document: { label: 'Write',    icon: FileText, color: 'text-cyan-400'   },
  send_message:   { label: 'Send',     icon: Send,     color: 'text-cyan-400'   },
  make_decision:  { label: 'Decide',   icon: GitFork,  color: 'text-amber-400'  },
  do_nothing:     { label: 'Wait',     icon: Pause,    color: 'text-zinc-400'   },
  schedule:       { label: 'Schedule', icon: Calendar, color: 'text-emerald-400'},
  research:       { label: 'Research', icon: Search,   color: 'text-blue-400'   },
};

// ---------------------------------------------------------------------------
// Phase type
// ---------------------------------------------------------------------------

type Phase = 'idle' | 'done';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export type SkipReason = 'not_relevant' | 'already_handled' | 'wrong_approach';

interface ConvictionCardProps {
  action:     ConvictionAction | null;
  isLoading:  boolean;
  onGenerate: () => void;
  onApprove:  (id: string) => Promise<void>;
  onSkip:     (id: string, reason?: SkipReason) => Promise<void>;
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
  const [approving, setApproving]             = useState(false);
  const [skipping, setSkipping]               = useState(false);
  const [phase, setPhase]                     = useState<Phase>('idle');
  const [doneMsg, setDoneMsg]                 = useState('');
  const [error, setError]                     = useState<string | null>(null);

  const meta = action ? ACTION_META[action.action_type] ?? ACTION_META.research : null;
  const Icon = meta?.icon ?? Search;

  const handleApprove = async () => {
    if (!action?.id) return;
    setError(null);
    setApproving(true);
    try {
      await onApprove(action.id);
      setDoneMsg('Done. Foldera executed that.');
      setPhase('done');
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
      setDoneMsg('Skipped. Foldera will adjust.');
      setPhase('done');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Skip failed');
    } finally {
      setSkipping(false);
    }
  };

  // Strip score breakdown from reason text before display
  const cleanReason = action?.reason?.split('[score=')[0].trim() ?? '';

  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 border-b border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-cyan-400" />
          <span className="text-zinc-200 font-semibold text-xs uppercase tracking-widest font-mono">
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
        ) : phase === 'done' ? (
          <DoneState
            message={doneMsg}
            terminal={doneMsg.startsWith('Skipped')}
            onReset={() => { setPhase('idle'); onGenerate(); }}
          />
        ) : (
          <>
            {/* Action type badge */}
            {meta && (
              <div className={`inline-flex items-center gap-1.5 mb-4 text-xs font-mono font-semibold uppercase tracking-widest ${meta.color}`}>
                <Icon className="w-3.5 h-3.5" />
                {meta.label}
              </div>
            )}

            {/* THE ACTION — front and center */}
            <p className="text-zinc-50 text-lg font-semibold leading-snug mb-3">
              {action.directive}
            </p>

            {/* Reason (no confidence score, no score breakdown) */}
            {cleanReason && (
              <p className="text-zinc-400 text-sm leading-relaxed mb-5">{cleanReason}</p>
            )}

            {/* Artifact preview */}
            {action.artifact && (
              <ArtifactPreview artifact={action.artifact as ConvictionArtifact} />
            )}
            {!action.artifact && action.executionResult && (action.executionResult as any).artifact && (
              <ArtifactPreview artifact={(action.executionResult as any).artifact as ConvictionArtifact} />
            )}

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
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors disabled:opacity-50"
                >
                  {approving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  {approving ? 'Executing...' : 'Approve'}
                </button>
                <button
                  onClick={handleSkip}
                  disabled={approving || skipping}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {skipping ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                  {skipping ? 'Logging...' : 'Skip'}
                </button>
              </div>
            )}

            {/* Already executed */}
            {(action.status === 'executed' || action.status === 'approved') && (
              <div className="flex items-center gap-2 mb-4 text-emerald-400 text-sm">
                <Check className="w-4 h-4" />
                {action.status === 'executed' ? 'Executed' : 'Approved'}
                {action.approvedAt ? ` · ${new Date(action.approvedAt).toLocaleTimeString()}` : ''}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function DoneState({ message, terminal, onReset }: { message: string; terminal: boolean; onReset: () => void }) {
  return (
    <div className="text-center py-4">
      <p className="text-zinc-300 text-sm mb-4">{message}</p>
      {!terminal && (
        <button
          onClick={onReset}
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          Generate new directive →
        </button>
      )}
      {terminal && (
        <p className="text-zinc-600 text-xs">Your next directive arrives tomorrow morning.</p>
      )}
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
      <p className="text-zinc-300 text-sm font-medium mb-1">Your next directive arrives at 7am tomorrow.</p>
      <p className="text-zinc-500 text-xs mb-4">Foldera is assembling one finished artifact from your latest signals.</p>
      <button
        onClick={onGenerate}
        className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-black text-sm font-medium transition-colors"
      >
        Generate a directive now
      </button>
    </div>
  );
}

function ArtifactPreview({ artifact }: { artifact: ConvictionArtifact }) {
  const waitArtifact = artifact.type === 'wait_rationale'
    ? artifact
    : (artifact as { type?: string; context?: string; evidence?: string }).type === 'affirmation'
      ? artifact as unknown as { context: string; evidence?: string }
      : null;

  return (
    <div className="mb-4 rounded-lg border border-zinc-700/60 bg-zinc-800/50 overflow-hidden">
      <div className="px-4 py-2 border-b border-zinc-700/40 flex items-center gap-2">
        <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-zinc-500">
          {artifact.type === 'email' ? 'Draft Email' :
           artifact.type === 'document' ? 'Document' :
           artifact.type === 'calendar_event' ? 'Calendar Event' :
           artifact.type === 'research_brief' ? 'Research Brief' :
           artifact.type === 'decision_frame' ? 'Decision Frame' :
           'Insight'}
        </span>
      </div>
      <div className="p-4">
        {artifact.type === 'email' && (
          <div className="space-y-2">
            <div className="flex gap-2 text-xs">
              <span className="text-zinc-500 shrink-0">To:</span>
              <span className="text-zinc-300">{artifact.to}</span>
            </div>
            <div className="flex gap-2 text-xs">
              <span className="text-zinc-500 shrink-0">Subject:</span>
              <span className="text-zinc-300 font-medium">{artifact.subject}</span>
            </div>
            <div className="mt-2 text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto">
              {artifact.body}
            </div>
          </div>
        )}
        {artifact.type === 'document' && (
          <div className="space-y-2">
            <p className="text-zinc-200 text-sm font-medium">{artifact.title}</p>
            <div className="text-sm text-zinc-400 leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto">
              {artifact.content.slice(0, 2000)}{artifact.content.length > 2000 ? '...' : ''}
            </div>
          </div>
        )}
        {artifact.type === 'calendar_event' && (
          <div className="space-y-2">
            <p className="text-zinc-200 text-sm font-medium">{artifact.title}</p>
            <div className="flex gap-4 text-xs text-zinc-400">
              <span>{new Date(artifact.start).toLocaleString()}</span>
              <span>→</span>
              <span>{new Date(artifact.end).toLocaleString()}</span>
            </div>
            {artifact.description && (
              <p className="text-sm text-zinc-400 leading-relaxed">{artifact.description}</p>
            )}
          </div>
        )}
        {artifact.type === 'research_brief' && (
          <div className="space-y-2">
            <div className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto">
              {artifact.findings.slice(0, 2000)}{artifact.findings.length > 2000 ? '...' : ''}
            </div>
            {artifact.sources.length > 0 && (
              <div className="pt-2 border-t border-zinc-700/40">
                <p className="text-[10px] font-mono text-zinc-500 uppercase mb-1">Sources</p>
                <div className="space-y-0.5">
                  {artifact.sources.slice(0, 5).map((s, i) => (
                    <p key={i} className="text-xs text-cyan-400 truncate">{s}</p>
                  ))}
                </div>
              </div>
            )}
            {artifact.recommended_action && (
              <div className="pt-2 border-t border-zinc-700/40">
                <p className="text-[10px] font-mono text-zinc-500 uppercase mb-1">Next Step</p>
                <p className="text-sm text-emerald-400">{artifact.recommended_action}</p>
              </div>
            )}
          </div>
        )}
        {artifact.type === 'decision_frame' && Array.isArray(artifact.options) && artifact.options.length > 0 && (
          <div className="space-y-2">
            {artifact.recommendation && (
              <div className="pb-2 border-b border-zinc-700/40">
                <p className="text-[10px] font-mono text-zinc-500 uppercase mb-1">Recommendation</p>
                <p className="text-sm text-emerald-400">{artifact.recommendation}</p>
              </div>
            )}
            {artifact.options.map((opt, i) => {
              const weight = typeof opt.weight === 'number' && !isNaN(opt.weight) ? opt.weight : null;
              return (
                <div key={i} className="flex items-start gap-2 text-sm">
                  {weight !== null && (
                    <span className={`shrink-0 font-mono font-bold text-xs px-1.5 py-0.5 rounded ${
                      i === 0 ? 'text-emerald-400 bg-emerald-900/30' : 'text-zinc-400 bg-zinc-800'
                    }`}>
                      {Math.round(weight * 100)}%
                    </span>
                  )}
                  <div>
                    <p className="text-zinc-200">{opt.option}</p>
                    {opt.rationale && <p className="text-zinc-500 text-xs">{opt.rationale}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {waitArtifact && (
          <div className="space-y-2">
            <p className="text-sm text-zinc-300 leading-relaxed">{waitArtifact.context}</p>
            {waitArtifact.evidence && (
              <p className="text-xs text-zinc-500 italic">{waitArtifact.evidence}</p>
            )}
            {Array.isArray((waitArtifact as { tripwires?: string[] }).tripwires) && (waitArtifact as { tripwires?: string[] }).tripwires!.length > 0 && (
              <div className="pt-2 border-t border-zinc-700/40">
                <p className="text-[10px] font-mono text-zinc-500 uppercase mb-1">Tripwires</p>
                <div className="space-y-1">
                  {(waitArtifact as { tripwires?: string[] }).tripwires!.slice(0, 3).map((tripwire, index) => (
                    <p key={index} className="text-xs text-zinc-400">• {tripwire}</p>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
