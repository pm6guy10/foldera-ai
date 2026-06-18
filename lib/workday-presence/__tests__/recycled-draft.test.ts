import { describe, expect, it } from 'vitest';
import {
  artifactMatchesMove,
  attachRecycledDraft,
  draftFromArtifactRow,
} from '../recycled-draft';
import { draftIsReviewable, type WorkdayPresenceState } from '../model';

const nowIso = '2026-06-18T14:00:00.000Z';

function scoredWinnerState(overrides: Partial<WorkdayPresenceState> = {}): WorkdayPresenceState {
  return {
    current_focus: 'Pay the Supabase invoice',
    next_move: 'Review and take the smallest next step: Pay the Supabase invoice',
    why_it_matters: 'Top-scored open loop (score: 2.86).',
    blocker: null,
    do_not_touch: null,
    waiting_on: null,
    last_completed_step: null,
    state_source: 'scored_winner',
    source_trail: [],
    snoozed_until: null,
    interaction_history: [],
    created_at: nowIso,
    updated_at: nowIso,
    ...overrides,
  };
}

const groundedArtifact = {
  title: 'Pay the Supabase invoice',
  content: 'The Supabase invoice (#INV-2231) is overdue. Approve payment of $25 to keep the project active.',
  type: 'make_decision',
  evidence: [{ type: 'commitment', description: 'overdue invoice' }],
};

describe('draftFromArtifactRow', () => {
  it('maps a grounded brief artifact into a reviewable draft (no generation)', () => {
    const draft = draftFromArtifactRow(groundedArtifact);
    expect(draft).not.toBeNull();
    expect(draft!.action_type).toBe('make_decision');
    expect(draft!.title).toBe('Pay the Supabase invoice');
    expect(draft!.body).toContain('overdue');
    expect(draftIsReviewable(draft!)).toBe(true);
  });

  it('returns null for a title-only artifact (a label is not a reviewable draft)', () => {
    expect(draftFromArtifactRow({ title: 'Pay the invoice', type: 'make_decision' })).toBeNull();
  });

  it('returns null for non-object input', () => {
    expect(draftFromArtifactRow(null)).toBeNull();
    expect(draftFromArtifactRow('nope')).toBeNull();
  });
});

describe('artifactMatchesMove (anti-mismatch guard)', () => {
  it('matches identical and SYNC-prefixed titles', () => {
    expect(artifactMatchesMove('SYNC:payment_financial:Pay the Supabase invoice', 'Pay the Supabase invoice')).toBe(true);
    expect(artifactMatchesMove('Pay the Supabase invoice', 'Pay the Supabase invoice now')).toBe(true);
  });

  it('rejects an unrelated artifact (would be fabrication)', () => {
    expect(artifactMatchesMove('Pay the Supabase invoice', 'Reply to Sarah about the offsite agenda')).toBe(false);
  });

  it('rejects empty/tiny labels', () => {
    expect(artifactMatchesMove('', 'Pay the invoice')).toBe(false);
    expect(artifactMatchesMove('Pay the invoice', null)).toBe(false);
  });
});

describe('attachRecycledDraft', () => {
  it('attaches a matching grounded artifact to a draftless scored winner', () => {
    const out = attachRecycledDraft(scoredWinnerState(), groundedArtifact);
    expect(out.draft).toBeDefined();
    expect(draftIsReviewable(out.draft!)).toBe(true);
    expect(out.draft!.title).toBe('Pay the Supabase invoice');
  });

  it('does NOT attach a mismatched artifact (stays draftless → guardian stays quiet)', () => {
    const out = attachRecycledDraft(scoredWinnerState(), {
      title: 'Draft the Q3 OKR doc',
      content: 'A totally different piece of work.',
      type: 'write_document',
    });
    expect(out.draft).toBeUndefined();
  });

  it('is a no-op when the state already has a reviewable draft', () => {
    const existing = scoredWinnerState({
      draft: { action_type: 'send_message', title: 'Existing', preview: 'has body', body: 'real body' },
    });
    const out = attachRecycledDraft(existing, groundedArtifact);
    expect(out.draft!.title).toBe('Existing');
  });

  it('is a no-op for non-scored_winner states (e.g. manual_anchor)', () => {
    const out = attachRecycledDraft(scoredWinnerState({ state_source: 'manual_anchor' }), groundedArtifact);
    expect(out.draft).toBeUndefined();
  });

  it('is a no-op when the artifact is not reviewable', () => {
    const out = attachRecycledDraft(scoredWinnerState(), { title: 'Pay the Supabase invoice', type: 'make_decision' });
    expect(out.draft).toBeUndefined();
  });
});
