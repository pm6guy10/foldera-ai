import { describe, expect, it } from 'vitest';
import {
  COMMAND_STATE_VERDICTS,
  isCommandStateVerdict,
  resolveCommandState,
} from '../command-state-resolver';

const NOW_ISO = '2026-06-12T17:00:00.000Z';

/** Vague-homework language must never be the resolver's product value. */
const BANNED_OUTPUT_RE = /(do_nothing|task list|inbox summary|dashboard dump)/i;

function baseStateRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
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
    created_at: '2026-06-12T12:00:00.000Z',
    updated_at: '2026-06-12T12:10:00.000Z',
    ...overrides,
  };
}

describe('command state resolver contract', () => {
  it('exposes exactly four allowed verdicts, frozen', () => {
    expect([...COMMAND_STATE_VERDICTS]).toEqual(['MERGE_READY', 'FIX_FIRST', 'WAIT', 'CLEAR']);
    expect(Object.isFrozen(COMMAND_STATE_VERDICTS)).toBe(true);
  });

  it('isCommandStateVerdict accepts only the four allowed outputs', () => {
    for (const verdict of COMMAND_STATE_VERDICTS) {
      expect(isCommandStateVerdict(verdict)).toBe(true);
    }
    for (const rejected of ['READY', 'BLOCKED', 'merge_ready', '', null, undefined, 42, {}]) {
      expect(isCommandStateVerdict(rejected)).toBe(false);
    }
  });

  it('every resolution is a member of the closed verdict set, even on adversarial input', () => {
    const adversarialInputs: unknown[] = [
      null,
      undefined,
      '',
      'MERGE_READY',
      42,
      [],
      {},
      { current_focus: '   ' },
      { verdict: 'SHIP_IT_NOW' },
      baseStateRow({ blocker: 'x'.repeat(5000) }),
      baseStateRow({ snoozed_until: 'not-a-date' }),
      baseStateRow({ draft: { action_type: 'send_message' } }),
      baseStateRow({ source_trail: 'not-an-array', waiting_on: { nested: true } }),
    ];
    for (const state of adversarialInputs) {
      const resolved = resolveCommandState({ state, nowIso: NOW_ISO });
      expect(resolved.kind).toBe('command_state_resolution');
      expect(isCommandStateVerdict(resolved.verdict)).toBe(true);
      expect(resolved.reason.length).toBeGreaterThan(0);
      expect(resolved.resolved_at).toBe(NOW_ISO);
      expect(JSON.stringify(resolved)).not.toMatch(BANNED_OUTPUT_RE);
    }
  });
});

describe('absent or weak truth collapses to CLEAR, never to action verdicts', () => {
  it('null state resolves CLEAR with no_saved_state', () => {
    const resolved = resolveCommandState({ state: null, nowIso: NOW_ISO });
    expect(resolved.verdict).toBe('CLEAR');
    expect(resolved.rule).toBe('no_saved_state');
    expect(resolved.state_source).toBeNull();
    expect(resolved.source_trail_count).toBe(0);
  });

  it('malformed state (missing required fields) resolves CLEAR, not fake confidence', () => {
    const resolved = resolveCommandState({
      state: { current_focus: 'Something', next_move: '' },
      nowIso: NOW_ISO,
    });
    expect(resolved.verdict).toBe('CLEAR');
    expect(resolved.rule).toBe('no_saved_state');
  });

  it('a scored winner with nothing prepared behind it resolves CLEAR (no-homework standard)', () => {
    const resolved = resolveCommandState({
      state: baseStateRow({
        state_source: 'scored_winner',
        next_move: 'Review and take the smallest next step: Close ACME renewal decision',
        draft: null,
        blocker: null,
        waiting_on: null,
      }),
      nowIso: NOW_ISO,
    });
    expect(resolved.verdict).toBe('CLEAR');
    expect(resolved.rule).toBe('no_justified_command');
    expect(resolved.state_source).toBe('scored_winner');
  });

  it('a draft with a title but no reviewable content does not produce MERGE_READY', () => {
    const resolved = resolveCommandState({
      state: baseStateRow({
        draft: { action_type: 'send_message', title: 'Reply to ACME', preview: '', body: '' },
      }),
      nowIso: NOW_ISO,
    });
    expect(resolved.verdict).toBe('CLEAR');
    expect(resolved.rule).toBe('no_justified_command');
    expect(resolved.reason).toContain('no reviewable content');
  });
});

describe('verdict rules fire on recorded truth', () => {
  it('a reviewable prepared draft resolves MERGE_READY with source proof', () => {
    const resolved = resolveCommandState({
      state: baseStateRow({
        draft: {
          action_type: 'send_message',
          title: 'Confirm ACME renewal terms',
          preview: 'Hi Dana — confirming the renewal terms we discussed…',
          to: 'dana@acme.example',
        },
      }),
      nowIso: NOW_ISO,
    });
    expect(resolved.verdict).toBe('MERGE_READY');
    expect(resolved.rule).toBe('prepared_draft');
    expect(resolved.reason).toContain('Confirm ACME renewal terms');
    expect(resolved.evidence.join('\n')).toContain('Draft ready (send_message)');
    expect(resolved.source_trail_count).toBe(1);
  });

  it('a scored winner WITH a reviewable draft resolves MERGE_READY (prepared object unlocks action)', () => {
    const resolved = resolveCommandState({
      state: baseStateRow({
        state_source: 'scored_winner',
        draft: {
          action_type: 'write_document',
          title: 'Renewal decision packet',
          body: 'Options, pricing deltas, and the recommended call.',
        },
      }),
      nowIso: NOW_ISO,
    });
    expect(resolved.verdict).toBe('MERGE_READY');
    expect(resolved.rule).toBe('prepared_draft');
  });

  it('a recorded blocker resolves FIX_FIRST naming the blocker', () => {
    const resolved = resolveCommandState({
      state: baseStateRow({ blocker: 'Legal sign-off missing on pricing exhibit' }),
      nowIso: NOW_ISO,
    });
    expect(resolved.verdict).toBe('FIX_FIRST');
    expect(resolved.rule).toBe('named_blocker');
    expect(resolved.reason).toContain('Legal sign-off missing on pricing exhibit');
    expect(resolved.evidence).toContain('Legal sign-off missing on pricing exhibit');
  });

  it('an external wait resolves WAIT naming the owner', () => {
    const resolved = resolveCommandState({
      state: baseStateRow({ waiting_on: 'Waiting on Dana (ACME) to send the countersigned order form' }),
      nowIso: NOW_ISO,
    });
    expect(resolved.verdict).toBe('WAIT');
    expect(resolved.rule).toBe('external_wait');
    expect(resolved.reason).toContain('Waiting on Dana');
  });

  it('a future snooze resolves WAIT regardless of everything else', () => {
    const resolved = resolveCommandState({
      state: baseStateRow({
        snoozed_until: '2026-06-12T19:00:00.000Z',
        blocker: 'Legal sign-off missing',
        draft: { action_type: 'send_message', title: 'Reply', body: 'Draft body' },
        waiting_on: 'Waiting on Dana',
      }),
      nowIso: NOW_ISO,
    });
    expect(resolved.verdict).toBe('WAIT');
    expect(resolved.rule).toBe('snoozed_state');
    expect(resolved.reason).toContain('2026-06-12T19:00:00.000Z');
  });

  it('an expired snooze is ignored and resolution continues down the precedence chain', () => {
    const resolved = resolveCommandState({
      state: baseStateRow({
        snoozed_until: '2026-06-12T09:00:00.000Z',
        draft: { action_type: 'send_message', title: 'Reply', body: 'Draft body' },
      }),
      nowIso: NOW_ISO,
    });
    expect(resolved.verdict).toBe('MERGE_READY');
    expect(resolved.rule).toBe('prepared_draft');
  });

  it('clean source-backed state with nothing prepared, blocking, or waiting resolves CLEAR as a real win', () => {
    const resolved = resolveCommandState({ state: baseStateRow(), nowIso: NOW_ISO });
    expect(resolved.verdict).toBe('CLEAR');
    expect(resolved.rule).toBe('no_justified_command');
    expect(resolved.reason).toContain('Close ACME renewal decision');
  });
});

describe('precedence is deterministic and conservative', () => {
  it('a recorded blocker beats a reviewable draft: never say ship while the user says blocked', () => {
    const resolved = resolveCommandState({
      state: baseStateRow({
        blocker: 'Pricing not approved yet',
        draft: {
          action_type: 'send_message',
          title: 'Reply to ACME',
          body: 'Full drafted reply ready to send.',
        },
      }),
      nowIso: NOW_ISO,
    });
    expect(resolved.verdict).toBe('FIX_FIRST');
    expect(resolved.rule).toBe('named_blocker');
  });

  it('a reviewable draft beats an external wait: acting on the prepared object is the move', () => {
    const resolved = resolveCommandState({
      state: baseStateRow({
        waiting_on: 'Waiting on Dana (ACME)',
        draft: {
          action_type: 'send_message',
          title: 'Nudge Dana on the order form',
          body: 'Hi Dana — checking in on the countersigned order form.',
        },
      }),
      nowIso: NOW_ISO,
    });
    expect(resolved.verdict).toBe('MERGE_READY');
    expect(resolved.rule).toBe('prepared_draft');
  });

  it('a recorded blocker beats an external wait: the blocker is actionable by the user', () => {
    const resolved = resolveCommandState({
      state: baseStateRow({
        blocker: 'CI is red on the release branch',
        waiting_on: 'Waiting on Dana (ACME)',
      }),
      nowIso: NOW_ISO,
    });
    expect(resolved.verdict).toBe('FIX_FIRST');
    expect(resolved.rule).toBe('named_blocker');
  });
});

describe('resolution object is small, honest, and redacted', () => {
  it('evidence is capped and carries only working-state strings', () => {
    const resolved = resolveCommandState({
      state: baseStateRow({ blocker: 'Legal sign-off missing' }),
      nowIso: NOW_ISO,
    });
    expect(resolved.evidence.length).toBeLessThanOrEqual(4);
    for (const entry of resolved.evidence) {
      expect(typeof entry).toBe('string');
      expect(entry.trim().length).toBeGreaterThan(0);
    }
  });

  it('reason strings are rule-prefixed and machine-greppable', () => {
    const cases: Array<{ state: unknown; prefix: string }> = [
      { state: null, prefix: 'clear:' },
      { state: baseStateRow({ blocker: 'B' }), prefix: 'fix_first:' },
      { state: baseStateRow({ waiting_on: 'W' }), prefix: 'wait:' },
      {
        state: baseStateRow({
          draft: { action_type: 'send_message', title: 'T', body: 'B' },
        }),
        prefix: 'merge_ready:',
      },
    ];
    for (const { state, prefix } of cases) {
      expect(resolveCommandState({ state, nowIso: NOW_ISO }).reason.startsWith(prefix)).toBe(true);
    }
  });
});
