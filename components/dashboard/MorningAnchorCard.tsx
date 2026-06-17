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

/** Dashboard contract: two buttons only — View Draft (when a draft exists) and Dismiss. */
export type RightNowCardActionId = Extract<
  RightNowMessageActionId,
  'view_draft' | 'dismiss'
>;

export function MorningAnchorCard({
  card,
  onSave,
  onAction,
  onAutoDetect,
  actionPending = false,
}: {
  card: RightNowCard;
  onSave: (input: SaveInput) => Promise<void>;
  onAction?: (actionId: RightNowCardActionId) => Promise<void>;
  onAutoDetect?: () => Promise<void>;
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

  if (card.mode === 'setup') {
    return (
      <div className="foldera-dashboard-brief-card flex h-full w-full items-start justify-center overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
        <section className="mx-auto w-full max-w-[760px] rounded-[24px] border border-accent/20 bg-accent-dim/20 backdrop-blur-md p-6 sm:p-8 shadow-[0_0_30px_rgba(245,166,35,0.05)]">
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-white">
            {card.prompt}
          </h2>
          {card.verdict_line ? (
            <p className="mt-3 text-sm text-accent-hover/80">{card.verdict_line}</p>
          ) : null}
          <div className="mt-5 grid gap-3">
            <input
              className="w-full min-h-[56px] rounded-2xl border border-white/10 bg-black/40 px-5 py-3 text-[15px] font-medium text-white placeholder-white/30 outline-none transition-all focus:border-accent/50 focus:bg-black/60 focus:ring-4 focus:ring-accent/10"
              placeholder="What are you trying to move forward today?"
              value={input.current_focus}
              onChange={(e) => setInput((v) => ({ ...v, current_focus: e.target.value }))}
            />
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              className="foldera-button-primary disabled:cursor-wait disabled:opacity-50"
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
            {onAutoDetect ? (
              <button
                type="button"
                className="foldera-button-secondary disabled:cursor-wait disabled:opacity-50"
                disabled={saving}
                onClick={async () => {
                  setSaving(true);
                  try {
                    await onAutoDetect();
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                {saving ? 'Detecting...' : 'Auto-detect next move'}
              </button>
            ) : null}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="foldera-dashboard-brief-card flex h-full w-full items-start justify-center overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
      <section
        data-testid="right-now-card"
        className="mx-auto w-full max-w-[760px] rounded-[24px] border border-accent/20 bg-accent-dim/20 backdrop-blur-md p-6 sm:p-8 shadow-[0_0_30px_rgba(245,166,35,0.05)]"
      >
        <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-white">
          {card.heading}
        </h2>
        <p className="mt-3 text-sm text-text-secondary">{card.return_here}</p>
        <p className="mt-3 text-base text-text-primary">{card.next_move}</p>
        <p className="mt-3 text-sm text-text-secondary">{card.why_this_matters}</p>
        {card.verdict_line ? (
          <p className="mt-3 text-sm font-semibold text-accent-hover/90">{card.verdict_line}</p>
        ) : null}
        <p className="mt-3 text-sm text-accent-hover/80">{card.source_line}</p>
        {card.last_interaction ? (
          <p className="mt-3 text-sm text-accent-hover">{card.last_interaction}</p>
        ) : null}
        {card.do_not_touch ? <p className="mt-3 text-sm text-amber-200">{card.do_not_touch}</p> : null}
        <p className="mt-4 text-sm font-semibold text-text-primary">{card.stop_when_done}</p>
        {card.draft_ready ? (
          <p className="mt-4 text-sm font-semibold text-accent-hover" data-testid="right-now-draft-ready">
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
            {card.draft_ready && !card.draft_expanded ? (
              <button
                type="button"
                className="foldera-button-primary disabled:cursor-wait disabled:opacity-50"
                disabled={actionPending}
                onClick={() => void onAction('view_draft')}
              >
                View Draft
              </button>
            ) : null}
            <button
              type="button"
              className="foldera-button-secondary disabled:cursor-wait disabled:opacity-50"
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
