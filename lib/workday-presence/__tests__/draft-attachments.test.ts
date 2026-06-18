import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/briefing/generator', () => ({
  BUDGET_CAP_DIRECTIVE_SENTINEL: '__BUDGET_CAP_REACHED__',
}));

import type { ConvictionArtifact, ConvictionDirective } from '@/lib/briefing/types';
import {
  buildRightNowCard,
  normalizeWorkdayPresenceState,
  type WorkdayPresenceState,
} from '../model';
import { draftFromArtifact } from '../seed-from-directive';

const SEND_DIRECTIVE = {
  directive: 'Send the Q3 budget to Dana with the updated forecast attached.',
  action_type: 'send_message',
  confidence: 80,
  reason: 'Dana asked for the numbers before the board call.',
  evidence: [{ type: 'commitment', description: 'Board call prep', date: '2026-06-17T09:00:00Z' }],
} as unknown as ConvictionDirective;

const ARTIFACT_WITH_ATTACHMENTS = {
  type: 'email',
  to: 'dana@example.com',
  subject: 'Q3 budget + forecast',
  body: 'Dana — attached is the updated Q3 budget and the forecast. — Brandon',
  gmail_thread_id: 'thread-xyz',
  attachments: [
    { filename: 'Q3-Budget.md', mime_type: 'text/markdown', content: '# Q3 Budget\nBurn: $480k' },
    { filename: 'Forecast.csv', mime_type: 'text/csv', content: 'month,rev\nJul,120000' },
  ],
} as unknown as ConvictionArtifact;

describe('draftFromArtifact carries attachments', () => {
  it('maps grounded artifact attachments into the draft', () => {
    const draft = draftFromArtifact(SEND_DIRECTIVE, ARTIFACT_WITH_ATTACHMENTS, 'action-1');
    expect(draft?.attachments).toHaveLength(2);
    expect(draft?.attachments?.map((a) => a.filename)).toEqual(['Q3-Budget.md', 'Forecast.csv']);
  });

  it('omits attachments when the artifact has none', () => {
    const draft = draftFromArtifact(
      SEND_DIRECTIVE,
      { ...ARTIFACT_WITH_ATTACHMENTS, attachments: undefined } as unknown as ConvictionArtifact,
      'action-1',
    );
    expect(draft?.attachments).toBeUndefined();
  });
});

describe('normalizeWorkdayPresenceState round-trips attachments', () => {
  it('keeps a valid attachment list on the draft', () => {
    const state = normalizeWorkdayPresenceState({
      current_focus: 'Board prep',
      next_move: 'Send the budget',
      why_it_matters: 'Board call is tomorrow',
      state_source: 'scored_winner',
      draft: {
        action_type: 'send_message',
        title: 'Q3 budget + forecast',
        preview: 'attached is the updated Q3 budget',
        to: 'dana@example.com',
        body: 'Dana — attached…',
        action_id: 'action-1',
        attachments: [{ filename: 'Q3-Budget.md', mime_type: 'text/markdown', content: '# Q3' }],
      },
    });
    expect(state?.draft?.attachments).toHaveLength(1);
  });

  it('drops a malformed attachment entry', () => {
    const state = normalizeWorkdayPresenceState({
      current_focus: 'Board prep',
      next_move: 'Send the budget',
      why_it_matters: 'Board call is tomorrow',
      state_source: 'scored_winner',
      draft: {
        action_type: 'send_message',
        title: 'Q3 budget',
        preview: 'x',
        attachments: [{ filename: 'no-mime.txt' }],
      },
    });
    expect(state?.draft?.attachments).toBeUndefined();
  });
});

describe('buildRightNowCard surfaces attachments', () => {
  const baseState: WorkdayPresenceState = {
    current_focus: 'Board prep',
    next_move: 'Send the budget to Dana',
    why_it_matters: 'Board call is tomorrow',
    blocker: null,
    do_not_touch: null,
    waiting_on: null,
    last_completed_step: null,
    state_source: 'scored_winner',
    source_trail: [],
    draft: {
      action_type: 'send_message',
      title: 'Q3 budget + forecast',
      preview: 'attached is the updated Q3 budget',
      to: 'dana@example.com',
      body: 'Dana — attached is the budget.',
      action_id: 'action-1',
      attachments: [
        { filename: 'Q3-Budget.md', mime_type: 'text/markdown', content: '# Q3' },
        { filename: 'Forecast.csv', mime_type: 'text/csv', content: 'a,b' },
      ],
    },
    snoozed_until: null,
    interaction_history: [],
    created_at: '2026-06-18T10:00:00Z',
    updated_at: '2026-06-18T10:00:00Z',
  };

  it('names the attachments in the draft_ready line', () => {
    const card = buildRightNowCard(baseState);
    expect(card.mode).toBe('active');
    if (card.mode !== 'active') return;
    expect(card.draft_ready).toContain('2 attached');
    expect(card.draft_ready).toContain('Q3-Budget.md');
    expect(card.draft_ready).toContain('Forecast.csv');
  });

  it('lists attachments in the expanded draft after a view_draft tap', () => {
    const card = buildRightNowCard({
      ...baseState,
      interaction_history: [
        {
          interaction_type: 'view_draft',
          timestamp: '2026-06-18T10:05:00Z',
          resulting_state: {
            next_move: 'Send the budget to Dana',
            blocker: null,
            waiting_on: null,
            last_completed_step: null,
          },
        },
      ],
    });
    if (card.mode !== 'active') throw new Error('expected active card');
    expect(card.draft_expanded).toContain('Attachments: Q3-Budget.md, Forecast.csv');
  });
});
