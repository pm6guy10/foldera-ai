import { describe, it, expect } from 'vitest';
import {
  applyStakesGate,
  isTimeBoundInterviewExecutionCandidate,
  type StakesCandidate,
} from '../stakes-gate';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCandidate(overrides: Partial<StakesCandidate> = {}): StakesCandidate {
  return {
    id: 'test-1',
    type: 'commitment',
    title: 'Follow up with Sarah Chen about Q3 budget approval',
    content: 'Sarah Chen (VP Finance) needs to approve the Q3 budget by Friday. No response in 3 days.',
    actionType: 'send_message',
    urgency: 0.7,
    matchedGoal: { text: 'Close Q3 budget cycle', priority: 1, category: 'financial' },
    domain: 'financial',
    sourceSignals: [{ kind: 'commitment' as const, occurredAt: new Date(Date.now() - 2 * 86400000).toISOString() }],
    ...overrides,
  };
}

// A candidate that passes all 5 conditions
function boardChangingCandidate(overrides: Partial<StakesCandidate> = {}): StakesCandidate {
  return makeCandidate(overrides);
}

const LONG_NON_CALENDAR_SNIPPET =
  'Recruiter Alex Crisler confirmed the Care Coordinator interview, shared the hiring panel names, ' +
  'linked the role packet, and asked Brandon to use this brief to answer the panel questions with role-specific evidence.';

// ---------------------------------------------------------------------------
// ALL 5 CONDITIONS PASS
// ---------------------------------------------------------------------------

describe('Stakes Gate — all conditions pass', () => {
  it('passes a board-changing candidate with all 5 conditions met', () => {
    const result = applyStakesGate([boardChangingCandidate()]);
    expect(result.passed).toHaveLength(1);
    expect(result.dropped).toHaveLength(0);
  });

  it('passes hiring thread with recruiter', () => {
    const c = boardChangingCandidate({
      title: 'Reply to Michael Torres about Senior Engineer interview',
      content: 'Michael Torres (Hiring Manager at Acme Corp) wants to schedule final round interview. Offer deadline next week.',
      actionType: 'schedule',
    });
    const result = applyStakesGate([c]);
    expect(result.passed).toHaveLength(1);
  });

  it('passes deal/contract thread', () => {
    const c = boardChangingCandidate({
      title: 'Send contract to DataFlow Inc',
      content: 'DataFlow Inc (CEO: James Park) $45k contract. Must sign by end of month. Counter-offer pending.',
      actionType: 'send_message',
    });
    const result = applyStakesGate([c]);
    expect(result.passed).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// CONDITION 1: Real External Entity
// ---------------------------------------------------------------------------

describe('Stakes Gate — Condition 1: Real External Entity', () => {
  it('drops system-generated notifications', () => {
    const c = boardChangingCandidate({
      title: 'Automated security alert',
      content: 'Your automated system notification: account verification required. No response needed.',
      actionType: 'send_message',
    });
    const result = applyStakesGate([c]);
    expect(result.dropped).toHaveLength(1);
    expect(result.dropped[0].failedCondition).toBe(1);
  });

  it('drops candidates with no real entity reference', () => {
    const c = boardChangingCandidate({
      title: 'review the document',
      content: 'some generic task that needs to be done by the deadline with urgency. must decide now.',
    });
    const result = applyStakesGate([c]);
    expect(result.dropped).toHaveLength(1);
    expect(result.dropped[0].failedCondition).toBe(1);
  });

  it('passes relationship candidate with real entity name', () => {
    const c = boardChangingCandidate({
      type: 'relationship',
      entityName: 'Sam Devore',
      title: 'Follow up with Sam Devore',
      content: 'Sam Devore: last contact 5 days ago, 23 total interactions. Budget approval pending.',
    });
    const result = applyStakesGate([c]);
    expect(result.passed).toHaveLength(1);
  });

  it('drops relationship candidate with system entity name', () => {
    const c = boardChangingCandidate({
      type: 'relationship',
      entityName: 'noreply@system.com',
      title: 'Follow up with noreply',
      content: 'noreply@system.com: last contact 2 days ago, 5 total interactions. Deadline pending.',
    });
    const result = applyStakesGate([c]);
    expect(result.dropped).toHaveLength(1);
    expect(result.dropped[0].failedCondition).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// CONDITION 2: Active or Live Thread
// ---------------------------------------------------------------------------

describe('Stakes Gate — Condition 2: Active or Live Thread', () => {
  it('drops candidate with no recent interaction and no pending expectation', () => {
    const c = boardChangingCandidate({
      urgency: 0,
      sourceSignals: [{ kind: 'commitment', occurredAt: new Date(Date.now() - 30 * 86400000).toISOString() }],
      content: 'Sarah Chen (VP Finance) discussed Q3 budget. Completed review.',
    });
    const result = applyStakesGate([c]);
    expect(result.dropped).toHaveLength(1);
    // Fails at condition 2 (no active thread) or later — the key is it's dropped
    expect(result.dropped[0].failedCondition).toBeGreaterThanOrEqual(2);
  });

  it('passes candidate with interaction within 14 days', () => {
    const c = boardChangingCandidate({
      sourceSignals: [{ kind: 'signal', occurredAt: new Date(Date.now() - 5 * 86400000).toISOString() }],
    });
    const result = applyStakesGate([c]);
    expect(result.passed).toHaveLength(1);
  });

  it('passes mail signal candidate 20 days old (30d live-thread window)', () => {
    const c = boardChangingCandidate({
      type: 'signal',
      actionType: 'send_message',
      urgency: 0.22, // below 0.4 — would fail condition 3 without signal carve-out
      sourceSignals: [{ kind: 'signal', occurredAt: new Date(Date.now() - 20 * 86400000).toISOString() }],
      title: 'Re: project timeline from Alex Morgan',
      content:
        'Alex Morgan (alex@acmecorp.com) asked for a quick status on the rollout. Plain thread, no explicit deadline wording.',
    });
    const result = applyStakesGate([c]);
    expect(result.passed).toHaveLength(1);
    expect(result.dropped).toHaveLength(0);
  });

  it('drops mail signal candidate 35 days old without pending-expectation language', () => {
    const c = boardChangingCandidate({
      type: 'signal',
      actionType: 'send_message',
      urgency: 0.15,
      sourceSignals: [{ kind: 'signal', occurredAt: new Date(Date.now() - 35 * 86400000).toISOString() }],
      title: 'Old thread',
      content:
        'Jordan Lee discussed notes from last month. General recap, no open ask.',
    });
    const result = applyStakesGate([c]);
    expect(result.dropped).toHaveLength(1);
    expect(result.dropped[0].reason).toBe('no_active_thread');
  });

  it('passes old thread with pending expectation language', () => {
    const c = boardChangingCandidate({
      urgency: 0,
      sourceSignals: [{ kind: 'commitment', occurredAt: new Date(Date.now() - 20 * 86400000).toISOString() }],
      content: 'Sarah Chen (VP Finance) — awaiting reply on Q3 budget approval. Deadline Friday.',
    });
    const result = applyStakesGate([c]);
    expect(result.passed).toHaveLength(1);
  });

  it('passes commitment with non-zero urgency even if old', () => {
    const c = boardChangingCandidate({
      type: 'commitment',
      urgency: 0.3,
      sourceSignals: [{ kind: 'commitment', occurredAt: new Date(Date.now() - 20 * 86400000).toISOString() }],
    });
    const result = applyStakesGate([c]);
    expect(result.passed).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// CONDITION 3: Time Pressure or Decay
// ---------------------------------------------------------------------------

describe('Stakes Gate — Condition 3: Time Pressure or Decay', () => {
  it('drops candidate with no time pressure and low urgency', () => {
    const c = boardChangingCandidate({
      urgency: 0.1,
      content: 'Sarah Chen (VP Finance) general discussion about budget planning for next year.',
    });
    const result = applyStakesGate([c]);
    expect(result.dropped).toHaveLength(1);
    expect(result.dropped[0].failedCondition).toBe(3);
  });

  it('passes candidate with high urgency', () => {
    const c = boardChangingCandidate({ urgency: 0.5 });
    const result = applyStakesGate([c]);
    expect(result.passed).toHaveLength(1);
  });

  it('passes relationship with 48h+ silence', () => {
    const c = boardChangingCandidate({
      type: 'relationship',
      entityName: 'Sam Devore',
      urgency: 0.2,
      title: 'Follow up with Sam Devore',
      content: 'Sam Devore: last contact 5 days ago, 23 total interactions. Deal review pending.',
    });
    const result = applyStakesGate([c]);
    expect(result.passed).toHaveLength(1);
  });

  it('passes relationship send_message with fresh last contact (open-commitment path)', () => {
    const c = boardChangingCandidate({
      type: 'relationship',
      entityName: 'Keri Nopens',
      actionType: 'send_message',
      urgency: 0.08,
      sourceSignals: [{ kind: 'relationship', occurredAt: new Date(Date.now() - 86400000).toISOString() }],
      title: 'keri nopens: Send outreach email to Keri Nopens',
      content:
        'keri nopens: Open thread: Send outreach email to Keri Nopens. Last contact 1 days ago, 12 total interactions.',
    });
    const result = applyStakesGate([c]);
    expect(result.passed).toHaveLength(1);
    expect(result.dropped).toHaveLength(0);
  });

  it('passes candidate with deadline language', () => {
    const c = boardChangingCandidate({
      urgency: 0.2,
      content: 'Sarah Chen (VP Finance) — deadline Friday for Q3 budget sign-off.',
    });
    const result = applyStakesGate([c]);
    expect(result.passed).toHaveLength(1);
  });

  it('passes accepted interview write_document even when phrasing is mild', () => {
    const c = boardChangingCandidate({
      actionType: 'write_document',
      urgency: 0.05,
      title: 'Accepted Interview - Recruitment 2026-02344 ESB Tech',
      content:
        'ESD recruiter Darlene Craig confirmed the interview for the ES Benefits Technician role. Accepted interview for recruitment 2026-02344.',
    });
    const result = applyStakesGate([c]);
    expect(result.passed).toHaveLength(1);
    expect(result.dropped).toHaveLength(0);
  });

  it('passes scheduled phone screen write_document with external hiring context', () => {
    const c = boardChangingCandidate({
      actionType: 'write_document',
      urgency: 0.08,
      title: 'Phone screen for Care Coordinator role',
      content:
        'Alex Crisler (Recruiter at Comprehensive Healthcare) scheduled the phone screen for the Care Coordinator role next week.',
    });
    const result = applyStakesGate([c]);
    expect(result.passed).toHaveLength(1);
    expect(result.dropped).toHaveLength(0);
  });

  it('passes dated hiring commitment write_document with low urgency', () => {
    const c = boardChangingCandidate({
      actionType: 'write_document',
      urgency: 0.06,
      title: 'Interview; DSHS HCLA Developmental Disabilities Case/Resource Manager',
      content:
        'Nicholas Robertson (Hiring Manager at DSHS) scheduled the interview for 2026-04-20 for the Developmental Disabilities Case/Resource Manager position.',
    });
    const result = applyStakesGate([c]);
    expect(result.passed).toHaveLength(1);
    expect(result.dropped).toHaveLength(0);
  });

  it('fails interview candidate when provided sources are calendar-only', () => {
    const c = boardChangingCandidate({
      actionType: 'write_document',
      urgency: 0.05,
      title: 'Accepted Interview - Recruitment 2026-02344 ESB Tech',
      content:
        'ESD recruiter Darlene Craig confirmed the interview for the ES Benefits Technician role. Accepted interview for recruitment 2026-02344.',
    });

    expect(isTimeBoundInterviewExecutionCandidate(c, [
      { source: 'calendar', snippet: LONG_NON_CALENDAR_SNIPPET },
    ])).toBe(false);
  });

  it('fails interview candidate when non-calendar sources are too thin', () => {
    const c = boardChangingCandidate({
      actionType: 'write_document',
      urgency: 0.05,
      title: 'Accepted Interview - Recruitment 2026-02344 ESB Tech',
      content:
        'ESD recruiter Darlene Craig confirmed the interview for the ES Benefits Technician role. Accepted interview for recruitment 2026-02344.',
    });

    expect(isTimeBoundInterviewExecutionCandidate(c, [
      { source: 'gmail', snippet: 'Interview confirmed.' },
    ])).toBe(false);
  });

  it('passes interview candidate when a substantive non-calendar source is present', () => {
    const c = boardChangingCandidate({
      actionType: 'write_document',
      urgency: 0.05,
      title: 'Accepted Interview - Recruitment 2026-02344 ESB Tech',
      content:
        'ESD recruiter Darlene Craig confirmed the interview for the ES Benefits Technician role. Accepted interview for recruitment 2026-02344.',
    });

    expect(isTimeBoundInterviewExecutionCandidate(c, [
      { source: 'calendar', snippet: 'Accepted Interview - Recruitment 2026-02344 ESB Tech' },
      { source: 'gmail', snippet: LONG_NON_CALENDAR_SNIPPET },
    ])).toBe(true);
  });

  it('preserves existing behavior when sourceSignals are omitted', () => {
    const c = boardChangingCandidate({
      actionType: 'write_document',
      urgency: 0.05,
      title: 'Accepted Interview - Recruitment 2026-02344 ESB Tech',
      content:
        'ESD recruiter Darlene Craig confirmed the interview for the ES Benefits Technician role. Accepted interview for recruitment 2026-02344.',
    });

    expect(isTimeBoundInterviewExecutionCandidate(c)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CONDITION 4: Decision Leverage
// ---------------------------------------------------------------------------

describe('Stakes Gate — Condition 4: Decision Leverage', () => {
  it('drops informational-only candidate', () => {
    const c = boardChangingCandidate({
      urgency: 0.5,
      content: 'Sarah Chen (VP Finance) sent FYI update on Q3 numbers. No response needed. Deadline EOW.',
    });
    const result = applyStakesGate([c]);
    expect(result.dropped).toHaveLength(1);
    expect(result.dropped[0].failedCondition).toBe(4);
  });

  it('passes candidate with decision-maker title', () => {
    const c = boardChangingCandidate({
      content: 'Sarah Chen (VP Finance) needs to approve the Q3 budget by Friday.',
    });
    const result = applyStakesGate([c]);
    expect(result.passed).toHaveLength(1);
  });

  it('passes make_decision action type', () => {
    const c = boardChangingCandidate({
      actionType: 'make_decision',
      content: 'John Smith at Acme Corp — need to decide on offer terms. Urgent timeline.',
    });
    const result = applyStakesGate([c]);
    expect(result.passed).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// CONDITION 5: Forcing Function
// ---------------------------------------------------------------------------

describe('Stakes Gate — Condition 5: Forcing Function', () => {
  it('drops write_document with no forcing language', () => {
    const c = boardChangingCandidate({
      actionType: 'write_document',
      content: 'Sarah Chen (VP Finance) general budget document. Timeline flexible. No deadline pressure.',
      urgency: 0.5,
    });
    const result = applyStakesGate([c]);
    expect(result.dropped).toHaveLength(1);
    expect(result.dropped[0].failedCondition).toBe(5);
  });

  it('passes send_message (inherently forcing)', () => {
    const c = boardChangingCandidate({ actionType: 'send_message' });
    const result = applyStakesGate([c]);
    expect(result.passed).toHaveLength(1);
  });

  it('passes write_document with forcing function language', () => {
    const c = boardChangingCandidate({
      actionType: 'write_document',
      content: 'Sarah Chen (VP Finance) — must submit proposal by EOW. Confirm terms and finalize.',
      urgency: 0.5,
    });
    const result = applyStakesGate([c]);
    expect(result.passed).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// ZERO PENALTY
// ---------------------------------------------------------------------------

describe('Stakes Gate — zero penalty patterns', () => {
  it('drops newsletter/marketing candidates', () => {
    const c = boardChangingCandidate({
      title: 'Newsletter from TechCrunch',
      content: 'Weekly newsletter digest. Unsubscribe here. Sarah Chen (VP) mentioned in article.',
    });
    const result = applyStakesGate([c]);
    expect(result.dropped).toHaveLength(1);
    expect(result.dropped[0].failedCondition).toBe(0);
  });

  it('drops Amazon order notifications', () => {
    const c = boardChangingCandidate({
      content: 'Amazon order delivery update. Package arriving Thursday.',
    });
    const result = applyStakesGate([c]);
    expect(result.dropped).toHaveLength(1);
    expect(result.dropped[0].failedCondition).toBe(0);
  });

  it('drops do_nothing action type', () => {
    const c = boardChangingCandidate({ actionType: 'do_nothing' });
    const result = applyStakesGate([c]);
    expect(result.dropped).toHaveLength(1);
    expect(result.dropped[0].failedCondition).toBe(5);
    expect(result.dropped[0].reason).toBe('non_forcing_action_type');
  });

  it('drops research action type', () => {
    const c = boardChangingCandidate({ actionType: 'research' });
    const result = applyStakesGate([c]);
    expect(result.dropped).toHaveLength(1);
    expect(result.dropped[0].failedCondition).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// PRIORITY RANKING
// ---------------------------------------------------------------------------

describe('Stakes Gate — priority ranking', () => {
  it('ranks hiring above money above approvals', () => {
    const hiring = boardChangingCandidate({
      id: 'hiring',
      title: 'Interview with Lisa Park',
      content: 'Lisa Park (Recruiter at Meta) wants to schedule interview. Offer deadline next week.',
      actionType: 'schedule',
    });
    const money = boardChangingCandidate({
      id: 'money',
      title: 'Invoice to DataFlow Inc',
      content: 'DataFlow Inc (CEO: James Park) — $45k invoice payment deadline Friday.',
    });
    const approval = boardChangingCandidate({
      id: 'approval',
      title: 'Board approval from Sarah Chen',
      content: 'Sarah Chen (VP Finance) — Q3 board sign-off due Friday. Decision pending.',
    });

    const result = applyStakesGate([approval, money, hiring]);
    expect(result.passed).toHaveLength(3);
    expect(result.passed[0].id).toBe('hiring');
    expect(result.passed[1].id).toBe('money');
    expect(result.passed[2].id).toBe('approval');
  });
});

// ---------------------------------------------------------------------------
// EMPTY / NO_ACTION behavior
// ---------------------------------------------------------------------------

describe('Stakes Gate — NO_ACTION scenarios', () => {
  it('returns empty passed array when all candidates fail', () => {
    const noise = [
      makeCandidate({
        id: 'noise-1',
        title: 'check on status update',
        content: 'generic task with no real entity, no deadline, no forcing function',
        urgency: 0.1,
        actionType: 'do_nothing',
      }),
      makeCandidate({
        id: 'noise-2',
        title: 'Newsletter subscription confirmation',
        content: 'Weekly newsletter from marketing team. Unsubscribe link below.',
        actionType: 'research',
      }),
    ];
    const result = applyStakesGate(noise);
    expect(result.passed).toHaveLength(0);
    expect(result.dropped).toHaveLength(2);
  });

  it('returns empty for empty input', () => {
    const result = applyStakesGate([]);
    expect(result.passed).toHaveLength(0);
    expect(result.dropped).toHaveLength(0);
  });

  it('empty thread-backed pool after stakes gate must not skip structural discrepancy scoring in scoreOpenLoops', () => {
    // Regression: scoreOpenLoops previously returned early_exit_stakes_gate / entity_reality_gate
    // when candidates.length === 0, before detectDiscrepancies() ran. Calendar/drive discrepancies
    // are not thread-backed candidates and must still be evaluated (see scorer.ts).
    expect(applyStakesGate([]).passed).toEqual([]);
  });
});
