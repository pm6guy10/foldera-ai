import { describe, expect, it } from 'vitest';
import type { CommandStateResolution } from '../command-state-resolver';
import { buildRightNowCardForLiveLoop } from '../live-loop-presentation';
import { normalizeWorkdayPresenceState } from '../model';

function resolution(
  overrides: Partial<CommandStateResolution>,
): CommandStateResolution {
  return {
    kind: 'command_state_resolution',
    verdict: 'CLEAR',
    rule: 'no_justified_command',
    reason: 'clear: default',
    evidence: [],
    source_trail_count: 0,
    state_source: 'manual_anchor',
    resolved_at: '2026-06-12T17:00:00.000Z',
    ...overrides,
  };
}

describe('live loop resolver presentation', () => {
  it('adds a no-saved-state verdict line to the setup card', () => {
    const card = buildRightNowCardForLiveLoop(
      null,
      resolution({
        verdict: 'CLEAR',
        rule: 'no_saved_state',
        state_source: null,
      }),
    );

    expect(card.mode).toBe('setup');
    expect(card.verdict_line).toContain('No justified move yet');
  });

  it('keeps manual anchors active while naming the trusted verdict', () => {
    const state = normalizeWorkdayPresenceState({
      current_focus: 'Close ACME renewal decision',
      next_move: 'Keep "Close ACME renewal decision" moving with the next real action you already trust.',
      why_it_matters:
        'Foldera will hold this as your re-entry point until connected work proves a clearer move.',
      state_source: 'manual_anchor',
    });

    const card = buildRightNowCardForLiveLoop(
      state,
      resolution({
        verdict: 'CLEAR',
        rule: 'no_justified_command',
        state_source: 'manual_anchor',
      }),
    );

    expect(card.mode).toBe('active');
    if (card.mode === 'active') {
      expect(card.next_move).toContain('Close ACME renewal decision');
      expect(card.verdict_line).toContain('Anchor saved');
    }
  });

  it('turns source-backed CLEAR into honest quiet instead of a fake next move', () => {
    const state = normalizeWorkdayPresenceState({
      current_focus: 'Close ACME renewal decision',
      next_move: 'Send owner confirmation note',
      why_it_matters: 'The renewal window closes at 4 PM PT.',
      state_source: 'source_backed',
      source_trail: [
        {
          table: 'tkg_commitments',
          source: 'gmail',
          type: 'commitment',
          redacted_summary: 'Renewal confirmation owed to ACME',
          selection_reason: 'active commitment row is the safest source-backed next move',
        },
      ],
    });

    const card = buildRightNowCardForLiveLoop(
      state,
      resolution({
        verdict: 'CLEAR',
        rule: 'no_justified_command',
        state_source: 'source_backed',
        source_trail_count: 1,
      }),
    );

    expect(card.mode).toBe('active');
    if (card.mode === 'active') {
      expect(card.next_move).toBe('Next move: Stay quiet until connected work proves something is ready.');
      expect(card.verdict_line).toContain('Clear right now');
    }
  });

  it('turns WAIT into a hold instruction that matches the resolver', () => {
    const state = normalizeWorkdayPresenceState({
      current_focus: 'Close ACME renewal decision',
      next_move: 'Send owner confirmation note',
      why_it_matters: 'The renewal window closes at 4 PM PT.',
      waiting_on: 'Dana to send the countersigned order form',
      state_source: 'source_backed',
    });

    const card = buildRightNowCardForLiveLoop(
      state,
      resolution({
        verdict: 'WAIT',
        rule: 'external_wait',
        state_source: 'source_backed',
      }),
    );

    expect(card.mode).toBe('active');
    if (card.mode === 'active') {
      expect(card.next_move).toBe('Next move: Hold here until Dana to send the countersigned order form.');
      expect(card.verdict_line).toContain('Hold');
    }
  });
});
