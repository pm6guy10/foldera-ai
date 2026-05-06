import { describe, expect, it } from 'vitest';
import {
  getDashboardDiscrepancyFrame,
  isVisibleDashboardAction,
  type DashboardAction,
} from '../dashboard-page-model';

const VALID_DISCREPANCY_ACTION: DashboardAction = {
  id: 'action-valid',
  directive: 'Finalize the MAS3 interview packet owner.',
  action_type: 'write_document',
  reason:
    'The interview is confirmed, but the packet still has no owner before the prep window closes.',
  evidence: [{ description: 'Alex confirmed the interview.' }],
  artifact: {
    type: 'document',
    title: 'MAS3 packet owner decision',
    body: 'Assign Holly as packet owner by 4 PM PT today.',
  },
  discrepancy_card: {
    claim: 'The MAS3 interview packet is ready for final owner review.',
    contradiction:
      'Alex confirmed the April 29 interview, but the packet still has no named owner.',
    risk: 'The packet may miss the same-day prep window if ownership is not assigned today.',
    evidence: [
      'Gmail: Alex confirmed the April 29 interview.',
      'Drive: packet owner field is still blank.',
    ],
    next_action: 'Assign Holly as packet owner before 4 PM PT today.',
    why_now: 'The prep window closes today.',
    source_refs: ['gmail:alex-confirmed', 'drive:packet-owner'],
    confidence: 0.86,
    pattern_keys: ['discrepancy:interview_role_fit', 'action:write_document'],
  },
};

describe('dashboard discrepancy visibility contract', () => {
  it('allows a valid artifact only when it carries a passing discrepancy frame', () => {
    expect(isVisibleDashboardAction(VALID_DISCREPANCY_ACTION)).toBe(true);
    expect(getDashboardDiscrepancyFrame(VALID_DISCREPANCY_ACTION)?.claim).toContain(
      'MAS3 interview packet',
    );
  });

  it('blocks a generic evidence-free artifact from reaching the dashboard', () => {
    const weakAction: DashboardAction = {
      id: 'action-weak',
      directive: 'Follow up with Keri.',
      action_type: 'send_message',
      reason: 'It has been a while.',
      evidence: [],
      artifact: {
        type: 'email',
        to: 'keri@example.com',
        subject: 'Checking in',
        body: 'Hi Keri, just checking in.',
      },
    };

    expect(isVisibleDashboardAction(weakAction)).toBe(false);
    expect(getDashboardDiscrepancyFrame(weakAction)).toBeNull();
  });
});
