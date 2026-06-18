import { describe, expect, it, vi } from 'vitest';

// Isolate the finished-work gate from the independent hidden-op fallback path
// (a different mechanism, out of scope for #394) so this test asserts only the
// scored-winner/silent-payload gating.
vi.mock('@/lib/signals/hidden-op-detector', () => ({
  detectHiddenOps: () => [],
}));

import { runWorkdayPresenceTriggerRunner } from '../trigger-runner';
import type { WorkdayPresenceState } from '../model';

const nowIso = '2026-06-18T14:00:00.000Z';
// Benign focus (no money/medical/legal keywords) so the hidden-op fallback does
// not independently fire — this test isolates the finished-work gate.
const FOCUS = 'Update the onboarding wiki page';

function scoredWinnerState(draftReviewable: boolean): WorkdayPresenceState {
  return {
    current_focus: FOCUS,
    next_move: `Review and take the smallest next step: ${FOCUS}`,
    why_it_matters: 'Top-scored open loop (score: 2.10).',
    blocker: null,
    do_not_touch: null,
    waiting_on: null,
    last_completed_step: null,
    state_source: 'scored_winner',
    source_trail: [],
    ...(draftReviewable
      ? { draft: { action_type: 'write_document', title: FOCUS, preview: 'p', body: 'A real prepared body for the wiki update.' } }
      : {}),
    snoozed_until: null,
    interaction_history: [],
    created_at: nowIso,
    updated_at: nowIso,
  };
}

const commitmentSignal = {
  id: 'commit-1',
  source: 'calendar',
  title: FOCUS,
  starts_at_iso: '2026-06-18T18:00:00.000Z',
  due_at_iso: '2026-06-18T18:00:00.000Z',
  commitment_lapsing: true,
};

function mockSlack() {
  const postMessage = vi.fn().mockResolvedValue({ ok: true, mode: 'live' as const, channel: 'C1', message_ts: '1' });
  return { postMessage };
}

describe('finished-work gate (#394)', () => {
  it('does NOT send Slack when a scored winner has no reviewable draft (silent payload is noise)', async () => {
    const slack = mockSlack();
    const result = await runWorkdayPresenceTriggerRunner({
      channel: 'C1',
      cursor: null,
      nowIso,
      signals: [commitmentSignal],
      slack,
      state: scoredWinnerState(false),
    });

    expect(slack.postMessage).not.toHaveBeenCalled();
    expect(result.outcome).toBe('quiet');
    expect(result.slack_result).toBeNull();
    expect(result.reason).toMatch(/no reviewable move|finished work/i);
  });

  it('DOES send Slack when the scored winner carries a reviewable draft (finished work)', async () => {
    const slack = mockSlack();
    const result = await runWorkdayPresenceTriggerRunner({
      channel: 'C1',
      cursor: null,
      nowIso,
      signals: [commitmentSignal],
      slack,
      state: scoredWinnerState(true),
    });

    expect(result.outcome).toBe('intervention');
    expect(slack.postMessage).toHaveBeenCalledTimes(1);
  });
});
