'use client';

import { useState } from 'react';
import type { RightNowCard } from '@/lib/workday-presence/model';

type SaveInput = {
  current_focus: string;
  next_move: string;
  why_it_matters: string;
  blocker: string;
  do_not_touch: string;
  waiting_on: string;
  last_completed_step: string;
};

export function MorningAnchorCard({
  card,
  onSave,
}: {
  card: RightNowCard;
  onSave: (input: SaveInput) => Promise<void>;
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
        <section className="mx-auto w-full max-w-[760px] rounded-[20px] border border-white/10 bg-white/[0.025] p-6 sm:p-8">
          <h2 className="text-[34px] font-semibold leading-[1.05] tracking-[-0.02em] text-text-primary sm:text-[42px]">
            {card.prompt}
          </h2>
          <div className="mt-5 grid gap-3">
            <input className="foldera-input" placeholder="Current focus" value={input.current_focus} onChange={(e) => setInput((v) => ({ ...v, current_focus: e.target.value }))} />
            <input className="foldera-input" placeholder="Next move" value={input.next_move} onChange={(e) => setInput((v) => ({ ...v, next_move: e.target.value }))} />
            <input className="foldera-input" placeholder="Why this matters" value={input.why_it_matters} onChange={(e) => setInput((v) => ({ ...v, why_it_matters: e.target.value }))} />
            <input className="foldera-input" placeholder="Blocker (optional)" value={input.blocker} onChange={(e) => setInput((v) => ({ ...v, blocker: e.target.value }))} />
            <input className="foldera-input" placeholder="Do not touch (optional)" value={input.do_not_touch} onChange={(e) => setInput((v) => ({ ...v, do_not_touch: e.target.value }))} />
            <input className="foldera-input" placeholder="Waiting on (optional)" value={input.waiting_on} onChange={(e) => setInput((v) => ({ ...v, waiting_on: e.target.value }))} />
            <input className="foldera-input" placeholder="Last completed step (optional)" value={input.last_completed_step} onChange={(e) => setInput((v) => ({ ...v, last_completed_step: e.target.value }))} />
          </div>
          <button
            type="button"
            className="foldera-button-primary mt-5"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await onSave(input);
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
      <section className="mx-auto w-full max-w-[760px] rounded-[20px] border border-white/10 bg-white/[0.025] p-6 sm:p-8">
        <h2 className="text-[34px] font-semibold leading-[1.05] tracking-[-0.02em] text-text-primary sm:text-[42px]">
          {card.heading}
        </h2>
        <p className="mt-3 text-sm text-text-secondary">{card.return_here}</p>
        <p className="mt-3 text-base text-text-primary">{card.next_move}</p>
        <p className="mt-3 text-sm text-text-secondary">{card.why_this_matters}</p>
        {card.do_not_touch ? <p className="mt-3 text-sm text-amber-200">{card.do_not_touch}</p> : null}
        <p className="mt-4 text-sm font-semibold text-text-primary">{card.stop_when_done}</p>
      </section>
    </div>
  );
}
