import { describe, expect, it } from 'vitest';
import { computeCommitmentRisk } from '../commitment-risk';

const NOW = '2026-06-13T00:00:00.000Z';

function risk(overrides: Partial<Parameters<typeof computeCommitmentRisk>[0]> = {}) {
  return computeCommitmentRisk({
    category: 'follow_up',
    description: 'Send the follow-up note',
    dueAt: null,
    promisorIsSelf: true,
    promiseeIsSelf: false,
    madeAtIso: NOW,
    nowIso: NOW,
    ...overrides,
  });
}

describe('computeCommitmentRisk — category ordering', () => {
  it('ranks money/document/decision work above calendar attendance', () => {
    const payment = risk({ category: 'payment_financial' }).risk_score;
    const document = risk({ category: 'deliver_document' }).risk_score;
    const decision = risk({ category: 'make_decision' }).risk_score;
    const followUp = risk({ category: 'follow_up' }).risk_score;
    const attend = risk({ category: 'attend_participate' }).risk_score;

    expect(payment).toBeGreaterThan(followUp);
    expect(document).toBeGreaterThan(followUp);
    expect(decision).toBeGreaterThan(followUp);
    expect(followUp).toBeGreaterThan(attend);
  });

  it('falls back to the default base for an unknown category', () => {
    const unknown = risk({ category: 'totally_made_up' }).risk_score;
    const other = risk({ category: 'other' }).risk_score;
    expect(unknown).toBe(other);
  });
});

describe('computeCommitmentRisk — direction', () => {
  it('weights what the user owes above what the user awaits', () => {
    const owedByUser = risk({ promisorIsSelf: true, promiseeIsSelf: false }).risk_score;
    const owedToUser = risk({ promisorIsSelf: false, promiseeIsSelf: true }).risk_score;
    expect(owedByUser).toBeGreaterThan(owedToUser);
  });
});

describe('computeCommitmentRisk — money signal', () => {
  it('raises risk when an explicit dollar amount is present', () => {
    const withMoney = risk({ description: 'Claude Pro subscription payment of $21.66' }).risk_score;
    const without = risk({ description: 'Reply to the thread' }).risk_score;
    expect(withMoney).toBeGreaterThan(without);
  });

  it('matches comma-grouped and spaced dollar amounts', () => {
    expect(risk({ description: 'Invoice for $1,200 due' }).risk_score).toBeGreaterThan(
      risk({ description: 'no amount here' }).risk_score,
    );
    expect(risk({ description: 'wire $ 50 today' }).risk_score).toBeGreaterThan(
      risk({ description: 'no amount here' }).risk_score,
    );
  });
});

describe('computeCommitmentRisk — timing', () => {
  it('makes an imminent deadline more urgent than a far-future one', () => {
    const soon = risk({ dueAt: '2026-06-14T00:00:00.000Z' }).risk_score; // +1 day
    const later = risk({ dueAt: '2026-09-01T00:00:00.000Z' }).risk_score; // ~80 days
    expect(soon).toBeGreaterThan(later);
  });

  it('treats a recently-lapsed deadline as urgent', () => {
    const justOverdue = risk({ dueAt: '2026-06-08T00:00:00.000Z' }).risk_score; // 5 days late
    const undated = risk({ dueAt: null }).risk_score;
    expect(justOverdue).toBeGreaterThan(undated);
  });

  it('collapses a long-overdue commitment so stale calendar rows lose', () => {
    const staleAttend = computeCommitmentRisk({
      category: 'attend_participate',
      description: 'Attend Project Onyx Office Hours',
      dueAt: '2025-12-22T00:00:00.000Z', // ~half a year stale at NOW
      promisorIsSelf: true,
      promiseeIsSelf: false,
      madeAtIso: '2025-12-01T00:00:00.000Z',
      nowIso: NOW,
    }).risk_score;

    const realPayment = computeCommitmentRisk({
      category: 'payment_financial',
      description: 'Claude Pro subscription payment of $21.66',
      dueAt: '2026-06-08T00:00:00.000Z',
      promisorIsSelf: true,
      promiseeIsSelf: false,
      madeAtIso: '2026-06-09T00:00:00.000Z',
      nowIso: NOW,
    }).risk_score;

    expect(realPayment).toBeGreaterThan(staleAttend);
    // The stale calendar row should be near the floor.
    expect(staleAttend).toBeLessThan(20);
  });
});

describe('computeCommitmentRisk — due resolution', () => {
  it('reports high confidence for an explicit due date', () => {
    expect(risk({ dueAt: '2026-06-20T00:00:00.000Z' }).due_confidence).toBe(0.9);
  });

  it('implies a due date for actionable undated categories and reports medium confidence', () => {
    const result = risk({ category: 'payment_financial', dueAt: null, madeAtIso: NOW });
    expect(result.implied_due_at).not.toBeNull();
    expect(result.due_confidence).toBe(0.6);
    // payment implies +7 days from madeAt
    expect(result.implied_due_at).toBe('2026-06-20T00:00:00.000Z');
  });

  it('reports honest low confidence (not 0.5) when nothing is known', () => {
    const result = risk({ category: 'attend_participate', dueAt: null, madeAtIso: NOW });
    expect(result.implied_due_at).toBeNull();
    expect(result.due_confidence).toBe(0.2);
  });
});

describe('computeCommitmentRisk — bounds', () => {
  it('always returns an integer in [0, 100]', () => {
    const samples = [
      risk({ category: 'payment_financial', dueAt: '2026-06-13T00:00:00.000Z', description: 'pay $9,999 now' }),
      risk({ category: 'attend_participate', dueAt: '2020-01-01T00:00:00.000Z' }),
      risk({ category: 'other', dueAt: null, madeAtIso: '2024-01-01T00:00:00.000Z' }),
    ];
    for (const s of samples) {
      expect(Number.isInteger(s.risk_score)).toBe(true);
      expect(s.risk_score).toBeGreaterThanOrEqual(0);
      expect(s.risk_score).toBeLessThanOrEqual(100);
    }
  });
});
