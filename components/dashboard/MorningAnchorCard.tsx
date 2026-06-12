'use client';

import { useState } from 'react';
import type { RightNowCard } from '@/lib/workday-presence/model';
import { buildStateFromPrompt } from '@/lib/workday-presence/model';
import type { RightNowMessageActionId } from '@/lib/workday-presence/message';

type SaveInput = {
  current_focus: string;
  next_move: string;
  why_it_matters: string;
  blocker: string;
  do_not_touch: string;
  waiting_on: string;
  last_completed_step: string;
};

/** Dashboard contract: acknowledge the move, inspect the draft, defer it, or dismiss it. */
export type RightNowCardActionId = Extract<
  RightNowMessageActionId,
  'done' | 'view_draft' | 'snooze' | 'dismiss'
>;

export function MorningAnchorCard({
  card,
  onSave,
  onAction,
  actionPending = false,
}: {
  card: RightNowCard;
  onSave: (input: SaveInput) => Promise<void>;
  onAction?: (actionId: RightNowCardActionId) => Promise<void>;
  actionPending?: boolean;
}) {
  const [input, setInput] = useState<SaveInput>({
    current_focus: '',
    next_move: '',
    why_it_matters: '',
    blocker: '',
    do_not_touch: '',
    waiting_on: '',
    last_completed_step: '',
  });
  const [saving, setSaving] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  if (card.mode === 'setup') {
    return (
      <div className="foldera-dashboard-brief-card flex h-full w-full items-start justify-center overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
        <section className="mx-auto w-full max-w-[760px] rounded-[20px] border border-white/10 bg-white/[0.025] p-6 sm:p-8">
          <h2 className="text-[34px] font-semibold leading-[1.05] tracking-[-0.02em] text-text-primary sm:text-[42px]">
            {card.prompt}
          </h2>
          <div className="mt-5 grid gap-3">
            <input
              className="foldera-input"
              placeholder="What are you trying to move forward today?"
              value={input.current_focus}
              onChange={(e) => setInput((v) => ({ ...v, current_focus: e.target.value }))}
            />
            <button
              type="button"
              className="foldera-button-secondary w-fit"
              onClick={() => setDetailsOpen((open) => !open)}
            >
              {detailsOpen ? 'Hide details' : 'Add details (optional)'}
            </button>
            {detailsOpen ? (
              <div className="grid gap-3">
                <input className="foldera-input" placeholder="Next move (optional)" value={input.next_move} onChange={(e) => setInput((v) => ({ ...v, next_move: e.target.value }))} />
                <input className="foldera-input" placeholder="Why this matters (optional)" value={input.why_it_matters} onChange={(e) => setInput((v) => ({ ...v, why_it_matters: e.target.value }))} />
                <input className="foldera-input" placeholder="Blocker (optional)" value={input.blocker} onChange={(e) => setInput((v) => ({ ...v, blocker: e.target.value }))} />
                <input className="foldera-input" placeholder="Do not touch (optional)" value={input.do_not_touch} onChange={(e) => setInput((v) => ({ ...v, do_not_touch: e.target.value }))} />
                <input className="foldera-input" placeholder="Waiting on (optional)" value={input.waiting_on} onChange={(e) => setInput((v) => ({ ...v, waiting_on: e.target.value }))} />
                <input className="foldera-input" placeholder="Last completed step (optional)" value={input.last_completed_step} onChange={(e) => setInput((v) => ({ ...v, last_completed_step: e.target.value }))} />
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className="foldera-button-primary mt-5"
            disabled={saving || input.current_focus.trim().length === 0}
            onClick={async () => {
              setSaving(true);
              try {
                const draft = buildStateFromPrompt({
                  prompt: input.current_focus,
                  next_move: input.next_move,
                  why_it_matters: input.why_it_matters,
                  blocker: input.blocker,
                  do_not_touch: input.do_not_touch,
                  waiting_on: input.waiting_on,
                  last_completed_step: input.last_completed_step,
                });
                await onSave({
                  current_focus: draft.current_focus,
                  next_move: draft.next_move,
                  why_it_matters: draft.why_it_matters,
                  blocker: draft.blocker ?? '',
                  do_not_touch: draft.do_not_touch ?? '',
                  waiting_on: draft.waiting_on ?? '',
                  last_completed_step: draft.last_completed_step ?? '',
                });
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? 'Saving…' : 'Set Morning Anchor'}
          </button>
        </section>
      </div>
    );
  }

  return (
    <div className="foldera-dashboard-brief-card flex h-full w-full items-start justify-center overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
      <section
        data-testid="right-now-card"
        className="mx-auto w-full max-w-[760px] rounded-[20px] border border-white/10 bg-white/[0.025] p-6 sm:p-8"
      >
        <h2 className="text-[34px] font-semibold leading-[1.05] tracking-[-0.02em] text-text-primary sm:text-[42px]">
          {card.heading}
        </h2>
        <p className="mt-3 text-sm text-text-secondary">{card.return_here}</p>
        <p className="mt-3 text-base text-text-primary">{card.next_move}</p>
        <p className="mt-3 text-sm text-text-secondary">{card.why_this_matters}</p>
        <p className="mt-3 text-sm text-cyan-100/80">{card.source_line}</p>
        {card.last_interaction ? (
          <p className="mt-3 text-sm text-cyan-200">{card.last_interaction}</p>
        ) : null}
        {card.do_not_touch ? <p className="mt-3 text-sm text-amber-200">{card.do_not_touch}</p> : null}
        <p className="mt-4 text-sm font-semibold text-text-primary">{card.stop_when_done}</p>
        {card.draft_ready ? (
          <p className="mt-4 text-sm font-semibold text-cyan-100" data-testid="right-now-draft-ready">
            {card.draft_ready}
          </p>
        ) : null}
        {card.draft_expanded ? (
          <pre
            data-testid="right-now-draft-expanded"
            className="mt-3 whitespace-pre-wrap rounded-[14px] border border-white/10 bg-black/30 p-4 text-sm leading-6 text-text-primary"
          >
            {card.draft_expanded}
          </pre>
        ) : null}
        {onAction ? (
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              className="foldera-button-primary"
              disabled={actionPending}
              onClick={() => void onAction('done')}
            >
              Done
            </button>
            {card.draft_ready && !card.draft_expanded ? (
              <button
                type="button"
                className="foldera-button-secondary"
                disabled={actionPending}
                onClick={() => void onAction('view_draft')}
              >
                View Draft
              </button>
            ) : null}
            <button
              type="button"
              className="foldera-button-secondary"
              disabled={actionPending}
              onClick={() => void onAction('snooze')}
            >
              Snooze
            </button>
            <button
              type="button"
              className="foldera-button-secondary"
              disabled={actionPending}
              onClick={() => void onAction('dismiss')}
            >
              Dismiss
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
