import { describe, expect, it } from 'vitest';
import type { ScorerExactBlocker } from '../scorer';
import { formatExactBlockerToOperatorText } from '../generator';

describe('no_valid_action contract', () => {
  it('formatExactBlockerToOperatorText surfaces suppression goal text', () => {
    const block: ScorerExactBlocker = {
      blocker_type: 'no_valid_action_final_gate',
      blocker_reason: 'No candidate cleared the final bar.',
      top_blocked_candidate_title: 'Follow up with Keri on the reference',
      top_blocked_candidate_type: 'signal',
      top_blocked_candidate_action_type: 'send_message',
      suppression_goal_text: 'DO NOT contact Keri Vreeland about anything',
      survivors_before_final_gate: 1,
      rejected_by_stage: { final_gate: 2 },
    };
    const out = formatExactBlockerToOperatorText(block);
    expect(out.directive).toMatch(/not authorizing an outbound send/i);
    expect(out.why_now).toContain('DO NOT contact Keri');
    expect(out.blocked_by).toContain('Suppression:');
  });

  it('early-exit blocker stays concrete without top candidate', () => {
    const block: ScorerExactBlocker = {
      blocker_type: 'early_exit_stakes_gate',
      blocker_reason: 'No candidates passed the stakes gate (board-changing outcome required).',
      top_blocked_candidate_title: null,
      top_blocked_candidate_type: null,
      top_blocked_candidate_action_type: null,
      suppression_goal_text: null,
      survivors_before_final_gate: 0,
      rejected_by_stage: { stakes_gate: 3 },
    };
    const out = formatExactBlockerToOperatorText(block);
    expect(out.directive.toLowerCase()).toContain('not authorizing');
    expect(out.blocked_by).toContain('stakes_gate=3');
  });
});
