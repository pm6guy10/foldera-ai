import { beforeEach, describe, expect, it, vi } from 'vitest';

// The shared lib reads BUDGET_CAP_DIRECTIVE_SENTINEL from the generator; mock it so
// the test never pulls the real (heavy) generation module.
vi.mock('@/lib/briefing/generator', () => ({
  BUDGET_CAP_DIRECTIVE_SENTINEL: '__BUDGET_CAP_REACHED__',
}));

import type { createServerClient } from '@/lib/db/client';
import type { ConvictionArtifact, ConvictionDirective } from '@/lib/briefing/types';
import {
  directiveToPresenceState,
  draftFromArtifact,
  isRealMove,
  sendDraftIsGrounded,
  seedWorkdayPresenceStateFromBrief,
} from '../seed-from-directive';

const SEND_DIRECTIVE = {
  directive: 'Reply to Deanne confirming the 2 PM slot and attach the curriculum outline.',
  action_type: 'send_message',
  confidence: 78,
  reason: 'Deanne asked twice and the meeting is today; a one-line confirm closes the loop.',
  evidence: [
    { type: 'commitment', description: 'Homeschool meeting due today', date: '2026-06-12T09:00:00Z' },
  ],
} as unknown as ConvictionDirective;

const THREAD_BACKED_ARTIFACT = {
  type: 'email',
  to: 'deanne@example.com',
  subject: 'Confirming 2 PM today',
  body: 'Hi Deanne — confirming 2 PM works. Curriculum outline attached. — Brandon',
  gmail_thread_id: 'thread-abc-123',
} as unknown as ConvictionArtifact;

const WRITE_DOC_DIRECTIVE = {
  directive: 'Finalize the curriculum outline document before the 2 PM meeting.',
  action_type: 'write_document',
  confidence: 75,
  reason: 'The meeting is today and the outline is the agreed prep artifact.',
  evidence: [
    { type: 'commitment', description: 'Homeschool meeting due today', date: '2026-06-12T09:00:00Z' },
  ],
} as unknown as ConvictionDirective;

const nowIso = '2026-06-18T14:00:00.000Z';

describe('isRealMove', () => {
  it('accepts a real send move', () => {
    expect(isRealMove(SEND_DIRECTIVE)).toBe(true);
  });
  it('rejects do_nothing', () => {
    expect(isRealMove({ ...SEND_DIRECTIVE, action_type: 'do_nothing' } as ConvictionDirective)).toBe(false);
  });
  it('rejects the generation-failed sentinel', () => {
    expect(isRealMove({ ...SEND_DIRECTIVE, directive: '__GENERATION_FAILED__' } as ConvictionDirective)).toBe(false);
  });
  it('rejects the budget-cap sentinel', () => {
    expect(isRealMove({ ...SEND_DIRECTIVE, directive: '__BUDGET_CAP_REACHED__' } as ConvictionDirective)).toBe(false);
  });
});

describe('draftFromArtifact', () => {
  it('maps a send artifact into a reviewable draft', () => {
    const draft = draftFromArtifact(SEND_DIRECTIVE, THREAD_BACKED_ARTIFACT);
    expect(draft).not.toBeNull();
    expect(draft?.action_type).toBe('send_message');
    expect(draft?.title).toBe('Confirming 2 PM today');
    expect(draft?.to).toBe('deanne@example.com');
    expect(draft?.preview).toContain('confirming 2 PM works');
    expect(draft?.body).toContain('Curriculum outline attached');
  });
  it('returns null when there is no artifact', () => {
    expect(draftFromArtifact(WRITE_DOC_DIRECTIVE, null)).toBeNull();
  });
});

describe('sendDraftIsGrounded', () => {
  it('accepts a thread-backed reply', () => {
    expect(sendDraftIsGrounded(SEND_DIRECTIVE, THREAD_BACKED_ARTIFACT)).toBe(true);
  });
  it('accepts a recipient that appears in cited evidence', () => {
    const directive = {
      ...SEND_DIRECTIVE,
      evidence: [{ type: 'signal', description: 'Email from deanne@example.com about the slot', date: nowIso }],
    } as unknown as ConvictionDirective;
    const artifact = { type: 'email', to: 'deanne@example.com', subject: 'x', body: 'y' } as unknown as ConvictionArtifact;
    expect(sendDraftIsGrounded(directive, artifact)).toBe(true);
  });
  it('rejects a reply to an email that never happened (no thread, recipient not in evidence)', () => {
    const artifact = { type: 'email', to: 'deanne@example.com', subject: 'x', body: 'y' } as unknown as ConvictionArtifact;
    expect(sendDraftIsGrounded(SEND_DIRECTIVE, artifact)).toBe(false);
  });
});

describe('directiveToPresenceState', () => {
  it('builds a scored_winner state with the real move, not a title echo', () => {
    const state = directiveToPresenceState(SEND_DIRECTIVE, 'Homeschool meeting with Deanne', THREAD_BACKED_ARTIFACT, nowIso);
    expect(state.state_source).toBe('scored_winner');
    expect(state.current_focus).toBe('Homeschool meeting with Deanne');
    expect(state.next_move).toBe(SEND_DIRECTIVE.directive);
    expect(state.next_move).not.toContain('Review and take the smallest next step');
    expect(state.why_it_matters).toBe(SEND_DIRECTIVE.reason);
    expect(state.draft?.title).toBe('Confirming 2 PM today');
  });
});

describe('seedWorkdayPresenceStateFromBrief', () => {
  const OWNER = 'e40b7cd8-4925-42f7-bc99-5022969f1d22';
  let getUserById: ReturnType<typeof vi.fn>;
  let updateUserById: ReturnType<typeof vi.fn>;
  let supabase: ReturnType<typeof createServerClient>;

  beforeEach(() => {
    getUserById = vi.fn().mockResolvedValue({ data: { user: { user_metadata: {} } }, error: null });
    updateUserById = vi.fn().mockResolvedValue({ error: null });
    supabase = { auth: { admin: { getUserById, updateUserById } } } as unknown as ReturnType<typeof createServerClient>;
  });

  it('seeds a grounded send winner and clears any suppression trace', async () => {
    const result = await seedWorkdayPresenceStateFromBrief({
      supabase,
      userId: OWNER,
      directive: SEND_DIRECTIVE,
      artifact: THREAD_BACKED_ARTIFACT,
      winnerTitle: 'Homeschool meeting with Deanne',
      nowIso,
    });
    expect(result.seeded).toBe(true);
    const written = updateUserById.mock.calls[0][1].user_metadata;
    expect(written.workday_presence_state.state_source).toBe('scored_winner');
    expect(written.workday_presence_state.current_focus).toBe('Homeschool meeting with Deanne');
    expect(written.workday_presence_state.next_move).toBe(SEND_DIRECTIVE.directive);
    expect(written.workday_presence_state.draft.to).toBe('deanne@example.com');
    expect(written.workday_presence_suppression_trace).toBeNull();
  });

  it('refuses to seed an ungrounded send draft and writes nothing', async () => {
    const ungrounded = { type: 'email', to: 'deanne@example.com', subject: 'x', body: 'y' } as unknown as ConvictionArtifact;
    const result = await seedWorkdayPresenceStateFromBrief({
      supabase,
      userId: OWNER,
      directive: SEND_DIRECTIVE,
      artifact: ungrounded,
      nowIso,
    });
    expect(result.seeded).toBe(false);
    expect(result.reason).toBe('ungrounded_send_draft');
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it('refuses to seed a do_nothing directive', async () => {
    const result = await seedWorkdayPresenceStateFromBrief({
      supabase,
      userId: OWNER,
      directive: { ...SEND_DIRECTIVE, action_type: 'do_nothing' } as ConvictionDirective,
      artifact: THREAD_BACKED_ARTIFACT,
      nowIso,
    });
    expect(result.seeded).toBe(false);
    expect(result.reason).toBe('not_a_real_move');
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it('seeds a non-send winner even when no artifact was produced (the move is the value)', async () => {
    const result = await seedWorkdayPresenceStateFromBrief({
      supabase,
      userId: OWNER,
      directive: WRITE_DOC_DIRECTIVE,
      artifact: null,
      winnerTitle: 'Curriculum outline',
      nowIso,
    });
    expect(result.seeded).toBe(true);
    const written = updateUserById.mock.calls[0][1].user_metadata;
    expect(written.workday_presence_state.next_move).toBe(WRITE_DOC_DIRECTIVE.directive);
    expect(written.workday_presence_state.draft).toBeNull();
  });

  it('PRESERVES an existing active snooze so an automatic reseed never wakes a silenced card', async () => {
    const futureSnooze = '2999-01-01T00:00:00.000Z';
    getUserById.mockResolvedValue({
      data: {
        user: {
          user_metadata: {
            workday_presence_state: {
              current_focus: 'Old focus',
              next_move: 'Old move',
              why_it_matters: 'Old reason',
              state_source: 'scored_winner',
              source_trail: [],
              snoozed_until: futureSnooze,
              interaction_history: [],
              created_at: nowIso,
              updated_at: nowIso,
            },
          },
        },
      },
      error: null,
    });
    const result = await seedWorkdayPresenceStateFromBrief({
      supabase,
      userId: OWNER,
      directive: SEND_DIRECTIVE,
      artifact: THREAD_BACKED_ARTIFACT,
      winnerTitle: 'Fresh winner',
      nowIso,
    });
    expect(result.seeded).toBe(true);
    const written = updateUserById.mock.calls[0][1].user_metadata;
    expect(written.workday_presence_state.current_focus).toBe('Fresh winner');
    expect(written.workday_presence_state.snoozed_until).toBe(futureSnooze);
  });

  it('throws on a hard Supabase read error so the caller can log it', async () => {
    getUserById.mockResolvedValue({ data: null, error: new Error('db down') });
    await expect(
      seedWorkdayPresenceStateFromBrief({
        supabase,
        userId: OWNER,
        directive: SEND_DIRECTIVE,
        artifact: THREAD_BACKED_ARTIFACT,
        nowIso,
      }),
    ).rejects.toThrow('db down');
  });
});
