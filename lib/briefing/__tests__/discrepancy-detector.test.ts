/**
 * Discrepancy Detector Tests
 *
 * Verifies all 5 discrepancy classes fire on the correct conditions,
 * and verifies that irrelevant data does NOT trigger false positives.
 */

import { describe, it, expect } from 'vitest';
import { detectDiscrepancies, type Discrepancy } from '../discrepancy-detector';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = new Date('2026-03-28T12:00:00Z');
const now = NOW.getTime();

function daysAgoISO(days: number): string {
  return new Date(now - days * 86400000).toISOString();
}

function daysFromNowISO(days: number): string {
  return new Date(now + days * 86400000).toISOString();
}

function makeSilentEntity(overrides: Partial<{
  id: string;
  name: string;
  total_interactions: number;
  last_interaction: string | null;
}> = {}) {
  return {
    id: overrides.id ?? 'entity-1',
    name: overrides.name ?? 'Alice Smith',
    total_interactions: overrides.total_interactions ?? 8,
    last_interaction: overrides.last_interaction ?? daysAgoISO(45),
    patterns: { bx_stats: { silence_detected: true } },
  };
}

function makeActiveEntity(name = 'Bob Jones') {
  return {
    id: 'entity-active',
    name,
    total_interactions: 12,
    last_interaction: daysAgoISO(2),
    patterns: { bx_stats: { silence_detected: false } },
  };
}

function makeCommitment(overrides: Partial<{
  id: string;
  description: string;
  status: string;
  due_at: string | null;
  implied_due_at: string | null;
  updated_at: string | null;
  risk_score: number | null;
}> = {}) {
  return {
    id: overrides.id ?? 'commit-1',
    description: overrides.description ?? 'Finish quarterly report',
    category: 'project',
    status: overrides.status ?? 'active',
    risk_score: overrides.risk_score ?? 50,
    due_at: overrides.due_at ?? null,
    implied_due_at: overrides.implied_due_at ?? null,
    source_context: null,
    updated_at: overrides.updated_at ?? daysAgoISO(2),
  };
}

function makeGoal(overrides: Partial<{
  goal_text: string;
  priority: number;
  goal_category: string;
}> = {}) {
  return {
    goal_text: overrides.goal_text ?? 'Grow consulting revenue to $15k/month',
    priority: overrides.priority ?? 1,
    goal_category: overrides.goal_category ?? 'financial',
  };
}

// ---------------------------------------------------------------------------
// EXTRACTOR 1: decay
// ---------------------------------------------------------------------------

describe('extractDecay (class: decay)', () => {
  it('fires for entity with silence_detected=true and 5–14 interactions', () => {
    const result = detectDiscrepancies({
      entities: [makeSilentEntity({ total_interactions: 8 })],
      commitments: [],
      goals: [],
      decryptedSignals: [],
      now: NOW,
    });
    const decay = result.filter((d) => d.class === 'decay');
    expect(decay).toHaveLength(1);
    expect(decay[0].title).toMatch(/Fading connection: Alice Smith/);
    expect(decay[0].suggestedActionType).toBe('send_message');
  });

  it('does NOT fire for active entity (silence_detected=false)', () => {
    const result = detectDiscrepancies({
      entities: [makeActiveEntity()],
      commitments: [],
      goals: [],
      decryptedSignals: [],
      now: NOW,
    });
    expect(result.filter((d) => d.class === 'decay')).toHaveLength(0);
  });

  it('does NOT fire for silent entity with fewer than 5 interactions', () => {
    const result = detectDiscrepancies({
      entities: [makeSilentEntity({ total_interactions: 3 })],
      commitments: [],
      goals: [],
      decryptedSignals: [],
      now: NOW,
    });
    expect(result.filter((d) => d.class === 'decay')).toHaveLength(0);
  });

  it('does NOT fire for entity with ≥15 interactions (risk extractor handles those)', () => {
    const result = detectDiscrepancies({
      entities: [makeSilentEntity({ total_interactions: 20 })],
      commitments: [],
      goals: [],
      decryptedSignals: [],
      now: NOW,
    });
    expect(result.filter((d) => d.class === 'decay')).toHaveLength(0);
    // risk extractor should fire instead
    expect(result.filter((d) => d.class === 'risk')).toHaveLength(1);
  });

  it('sets higher urgency for entity silent 60+ days', () => {
    const longSilent = makeSilentEntity({ last_interaction: daysAgoISO(75) });
    const shortSilent = makeSilentEntity({
      id: 'entity-2',
      name: 'Carol',
      last_interaction: daysAgoISO(35),
    });
    const longResult = detectDiscrepancies({
      entities: [longSilent],
      commitments: [],
      goals: [],
      decryptedSignals: [],
      now: NOW,
    });
    const shortResult = detectDiscrepancies({
      entities: [shortSilent],
      commitments: [],
      goals: [],
      decryptedSignals: [],
      now: NOW,
    });
    const longUrgency = longResult.find((d) => d.class === 'decay')?.urgency ?? 0;
    const shortUrgency = shortResult.find((d) => d.class === 'decay')?.urgency ?? 0;
    expect(longUrgency).toBeGreaterThan(shortUrgency);
  });
});

// ---------------------------------------------------------------------------
// EXTRACTOR 2: exposure
// ---------------------------------------------------------------------------

describe('extractExposure (class: exposure)', () => {
  it('fires for commitment due within 7 days', () => {
    const result = detectDiscrepancies({
      entities: [],
      commitments: [makeCommitment({ due_at: daysFromNowISO(3) })],
      goals: [],
      decryptedSignals: [],
      now: NOW,
    });
    const exposure = result.filter((d) => d.class === 'exposure');
    expect(exposure).toHaveLength(1);
    expect(exposure[0].title).toMatch(/Commitment due in 3d/);
    expect(exposure[0].suggestedActionType).toBe('write_document');
  });

  it('fires using implied_due_at when due_at is null', () => {
    const result = detectDiscrepancies({
      entities: [],
      commitments: [makeCommitment({ due_at: null, implied_due_at: daysFromNowISO(2) })],
      goals: [],
      decryptedSignals: [],
      now: NOW,
    });
    expect(result.filter((d) => d.class === 'exposure')).toHaveLength(1);
  });

  it('does NOT fire for commitment due more than 7 days out', () => {
    const result = detectDiscrepancies({
      entities: [],
      commitments: [makeCommitment({ due_at: daysFromNowISO(10) })],
      goals: [],
      decryptedSignals: [],
      now: NOW,
    });
    expect(result.filter((d) => d.class === 'exposure')).toHaveLength(0);
  });

  it('does NOT fire for past-due commitment (already overdue)', () => {
    const result = detectDiscrepancies({
      entities: [],
      commitments: [makeCommitment({ due_at: daysAgoISO(2) })],
      goals: [],
      decryptedSignals: [],
      now: NOW,
    });
    expect(result.filter((d) => d.class === 'exposure')).toHaveLength(0);
  });

  it('sets higher urgency for commitments due sooner', () => {
    const urgent = makeCommitment({ id: 'c1', due_at: daysFromNowISO(1) });
    const soonish = makeCommitment({ id: 'c2', due_at: daysFromNowISO(6) });
    const urgentResult = detectDiscrepancies({
      entities: [],
      commitments: [urgent],
      goals: [],
      decryptedSignals: [],
      now: NOW,
    });
    const soonishResult = detectDiscrepancies({
      entities: [],
      commitments: [soonish],
      goals: [],
      decryptedSignals: [],
      now: NOW,
    });
    const urgentUrgency = urgentResult.find((d) => d.class === 'exposure')?.urgency ?? 0;
    const soonishUrgency = soonishResult.find((d) => d.class === 'exposure')?.urgency ?? 0;
    expect(urgentUrgency).toBeGreaterThan(soonishUrgency);
  });
});

// ---------------------------------------------------------------------------
// EXTRACTOR 3: drift
// ---------------------------------------------------------------------------

describe('extractDrift (class: drift)', () => {
  it('fires for P1 goal with no matching signals or commitments', () => {
    const result = detectDiscrepancies({
      entities: [],
      commitments: [],
      goals: [makeGoal({ goal_text: 'Launch SaaS product to first paying customer', priority: 1 })],
      decryptedSignals: ['Dear Brandon, hope this email finds you well.'],
      now: NOW,
    });
    const drift = result.filter((d) => d.class === 'drift');
    expect(drift).toHaveLength(1);
    expect(drift[0].title).toMatch(/Goal drift/);
    expect(drift[0].suggestedActionType).toBe('make_decision');
    expect(drift[0].matchedGoal).not.toBeNull();
    expect(drift[0].matchedGoal!.priority).toBe(1);
  });

  it('sets P1 goal to stakes=5', () => {
    const result = detectDiscrepancies({
      entities: [],
      commitments: [],
      goals: [makeGoal({ goal_text: 'Launch new product line this quarter', priority: 1 })],
      decryptedSignals: [],
      now: NOW,
    });
    const drift = result.find((d) => d.class === 'drift');
    expect(drift?.stakes).toBe(5);
  });

  it('sets P2 goal to stakes=4', () => {
    const result = detectDiscrepancies({
      entities: [],
      commitments: [],
      goals: [makeGoal({ goal_text: 'Hire senior engineer for platform team', priority: 2 })],
      decryptedSignals: [],
      now: NOW,
    });
    const drift = result.find((d) => d.class === 'drift');
    expect(drift?.stakes).toBe(4);
  });

  it('does NOT fire when signal contains 2+ matching keywords from the goal', () => {
    const result = detectDiscrepancies({
      entities: [],
      commitments: [],
      goals: [makeGoal({ goal_text: 'Launch consulting practice and land clients', priority: 1 })],
      decryptedSignals: [
        // Contains "consulting" and "practice" — both in goal keywords, satisfies min(2) threshold
        'Spoke with a prospective consulting practice client about engagement terms today',
      ],
      now: NOW,
    });
    expect(result.filter((d) => d.class === 'drift')).toHaveLength(0);
  });

  it('does NOT fire for P3+ goals', () => {
    const result = detectDiscrepancies({
      entities: [],
      commitments: [],
      goals: [makeGoal({ goal_text: 'Read more books about leadership', priority: 3 })],
      decryptedSignals: [],
      now: NOW,
    });
    expect(result.filter((d) => d.class === 'drift')).toHaveLength(0);
  });

  it('does NOT misfire when "Dear Brandon" appears in signal text (no entity leak)', () => {
    // This test is the proof that signal body text does NOT become entity suppression data.
    // The drift extractor looks for goal keyword overlap in signals — "Brandon" is not
    // a keyword in any goal, so this signal will NOT block or create a false positive.
    const result = detectDiscrepancies({
      entities: [],
      commitments: [],
      goals: [makeGoal({ goal_text: 'Build recurring revenue stream', priority: 1 })],
      decryptedSignals: [
        'Dear Brandon, I wanted to reach out about your outstanding invoice.',
        'Hi Brandon, please find attached the contract renewal for your review.',
      ],
      now: NOW,
    });
    const drift = result.filter((d) => d.class === 'drift');
    // Drift fires because "build recurring revenue stream" has no keyword match in the spam signals
    expect(drift).toHaveLength(1);
    // Critically: the discrepancy is about the GOAL, not about "Brandon"
    expect(drift[0].title).toMatch(/Goal drift/);
    expect(drift[0].content).not.toMatch(/Brandon/);
  });
});

// ---------------------------------------------------------------------------
// EXTRACTOR 4: avoidance
// ---------------------------------------------------------------------------

describe('extractAvoidance (class: avoidance)', () => {
  it('fires for at_risk commitment stalled 14+ days', () => {
    const result = detectDiscrepancies({
      entities: [],
      commitments: [
        makeCommitment({ status: 'at_risk', updated_at: daysAgoISO(20) }),
      ],
      goals: [],
      decryptedSignals: [],
      now: NOW,
    });
    const avoidance = result.filter((d) => d.class === 'avoidance');
    expect(avoidance).toHaveLength(1);
    expect(avoidance[0].suggestedActionType).toBe('make_decision');
    expect(avoidance[0].title).toMatch(/Stalled commitment/);
  });

  it('does NOT fire for at_risk commitment updated within 14 days', () => {
    const result = detectDiscrepancies({
      entities: [],
      commitments: [
        makeCommitment({ status: 'at_risk', updated_at: daysAgoISO(5) }),
      ],
      goals: [],
      decryptedSignals: [],
      now: NOW,
    });
    expect(result.filter((d) => d.class === 'avoidance')).toHaveLength(0);
  });

  it('does NOT fire for active (non-at_risk) commitments', () => {
    const result = detectDiscrepancies({
      entities: [],
      commitments: [
        makeCommitment({ status: 'active', updated_at: daysAgoISO(20) }),
      ],
      goals: [],
      decryptedSignals: [],
      now: NOW,
    });
    expect(result.filter((d) => d.class === 'avoidance')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// EXTRACTOR 5: risk
// ---------------------------------------------------------------------------

describe('extractRisk (class: risk)', () => {
  it('fires for entity with silence_detected=true and ≥15 interactions', () => {
    const result = detectDiscrepancies({
      entities: [makeSilentEntity({ total_interactions: 22 })],
      commitments: [],
      goals: [],
      decryptedSignals: [],
      now: NOW,
    });
    const risk = result.filter((d) => d.class === 'risk');
    expect(risk).toHaveLength(1);
    expect(risk[0].title).toMatch(/High-value relationship at risk/);
    expect(risk[0].stakes).toBe(5);
    expect(risk[0].suggestedActionType).toBe('send_message');
  });

  it('does NOT fire for silent entity below 15 interactions', () => {
    const result = detectDiscrepancies({
      entities: [makeSilentEntity({ total_interactions: 10 })],
      commitments: [],
      goals: [],
      decryptedSignals: [],
      now: NOW,
    });
    expect(result.filter((d) => d.class === 'risk')).toHaveLength(0);
  });

  it('sets higher urgency for entity silent 90+ days', () => {
    const veryLongSilent = makeSilentEntity({
      last_interaction: daysAgoISO(95),
      total_interactions: 20,
    });
    const longSilent = makeSilentEntity({
      id: 'entity-2',
      name: 'Dave',
      last_interaction: daysAgoISO(45),
      total_interactions: 16,
    });
    const veryLongResult = detectDiscrepancies({
      entities: [veryLongSilent],
      commitments: [],
      goals: [],
      decryptedSignals: [],
      now: NOW,
    });
    const longResult = detectDiscrepancies({
      entities: [longSilent],
      commitments: [],
      goals: [],
      decryptedSignals: [],
      now: NOW,
    });
    const u1 = veryLongResult.find((d) => d.class === 'risk')?.urgency ?? 0;
    const u2 = longResult.find((d) => d.class === 'risk')?.urgency ?? 0;
    expect(u1).toBeGreaterThan(u2);
  });
});

// ---------------------------------------------------------------------------
// Ordering and limits
// ---------------------------------------------------------------------------

describe('detectDiscrepancies — ordering and output limits', () => {
  it('returns at most 5 discrepancies total', () => {
    const manyEntities = Array.from({ length: 10 }, (_, i) =>
      makeSilentEntity({ id: `e-${i}`, name: `Person ${i}`, total_interactions: 6 + i }),
    );
    const result = detectDiscrepancies({
      entities: manyEntities,
      commitments: [],
      goals: [],
      decryptedSignals: [],
      now: NOW,
    });
    expect(result.length).toBeLessThanOrEqual(5);
  });

  it('sorts by urgency × stakes descending', () => {
    const result = detectDiscrepancies({
      entities: [makeSilentEntity({ total_interactions: 20, last_interaction: daysAgoISO(100) })],
      commitments: [makeCommitment({ due_at: daysFromNowISO(1) })],
      goals: [],
      decryptedSignals: [],
      now: NOW,
    });
    for (let i = 1; i < result.length; i++) {
      const prev = result[i - 1];
      const curr = result[i];
      expect(prev.urgency * prev.stakes).toBeGreaterThanOrEqual(curr.urgency * curr.stakes);
    }
  });

  it('returns empty array when no discrepancies qualify', () => {
    const result = detectDiscrepancies({
      entities: [makeActiveEntity()],
      commitments: [],
      goals: [makeGoal({ priority: 4 })],
      decryptedSignals: [],
      now: NOW,
    });
    expect(result).toHaveLength(0);
  });

  it('risk outranks decay for same entity when ≥15 interactions', () => {
    // An entity with 20 interactions qualifies for risk but NOT decay
    // (decay handles 5–14; risk handles 15+)
    const result = detectDiscrepancies({
      entities: [
        makeSilentEntity({ id: 'high-value', name: 'Eve', total_interactions: 20 }),
        makeSilentEntity({ id: 'medium', name: 'Frank', total_interactions: 8 }),
      ],
      commitments: [],
      goals: [],
      decryptedSignals: [],
      now: NOW,
    });
    const classes = result.map((d) => d.class);
    // risk should come first (higher urgency × stakes)
    expect(classes[0]).toBe('risk');
  });

  it('exposure outranks drift when commitment is due in 1 day', () => {
    const result = detectDiscrepancies({
      entities: [],
      commitments: [makeCommitment({ due_at: daysFromNowISO(1) })],
      goals: [makeGoal({ goal_text: 'Grow revenue through partnerships', priority: 1 })],
      decryptedSignals: [],
      now: NOW,
    });
    const firstClass = result[0]?.class;
    expect(firstClass).toBe('exposure');
  });
});

// ---------------------------------------------------------------------------
// ID stability
// ---------------------------------------------------------------------------

describe('Discrepancy ID format', () => {
  it('decay IDs are prefixed with discrepancy_decay_', () => {
    const result = detectDiscrepancies({
      entities: [makeSilentEntity()],
      commitments: [],
      goals: [],
      decryptedSignals: [],
      now: NOW,
    });
    const decay = result.find((d) => d.class === 'decay');
    expect(decay?.id).toMatch(/^discrepancy_decay_/);
  });

  it('exposure IDs are prefixed with discrepancy_exposure_', () => {
    const result = detectDiscrepancies({
      entities: [],
      commitments: [makeCommitment({ id: 'commit-abc', due_at: daysFromNowISO(3) })],
      goals: [],
      decryptedSignals: [],
      now: NOW,
    });
    const exposure = result.find((d) => d.class === 'exposure');
    expect(exposure?.id).toMatch(/^discrepancy_exposure_/);
  });
});
