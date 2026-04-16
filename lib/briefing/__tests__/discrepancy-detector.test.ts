/**
 * Discrepancy Detector Tests
 *
 * Verifies all 5 discrepancy classes fire on the correct conditions,
 * and verifies that irrelevant data does NOT trigger false positives.
 */

import { describe, it, expect } from 'vitest';
import {
  detectDiscrepancies,
  extractBehavioralPatterns,
  getEntityRejectionReasons,
  type Discrepancy,
} from '../discrepancy-detector';

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
  signal_count_90d: number;
}> = {}) {
  return {
    id: overrides.id ?? 'entity-1',
    name: overrides.name ?? 'Alice Smith',
    total_interactions: overrides.total_interactions ?? 8,
    last_interaction: overrides.last_interaction ?? daysAgoISO(45),
    patterns: {
      bx_stats: {
        silence_detected: true,
        signal_count_90d: overrides.signal_count_90d ?? 3,
      },
    },
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
  it('returns at most 6 discrepancies total', () => {
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
    expect(result.length).toBeLessThanOrEqual(6);
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

describe('trust class filtering', () => {
  it('ignores junk and transactional entities/commitments', () => {
    const result = detectDiscrepancies({
      entities: [
        { ...makeSilentEntity({ id: 'junk-entity', total_interactions: 22 }), trust_class: 'junk' },
      ],
      commitments: [
        { ...makeCommitment({ id: 'txn-commit', due_at: daysFromNowISO(2) }), trust_class: 'transactional' },
      ],
      goals: [],
      decryptedSignals: [],
      now: NOW,
    });

    expect(result).toHaveLength(0);
  });

  it('ignores personal entities even with high interactions (krista/emmett class)', () => {
    // Regression: personal entities like krista (52 interactions, silence_detected)
    // and emmett (14 interactions, silence_detected) were ranking #1 and #3 as
    // discrepancy_risk and discrepancy_decay candidates in production.
    const result = detectDiscrepancies({
      entities: [
        {
          ...makeSilentEntity({ id: 'personal-high', name: 'krista', total_interactions: 52 }),
          trust_class: 'personal' as any,
        },
        {
          ...makeSilentEntity({ id: 'personal-low', name: 'emmett', total_interactions: 14 }),
          trust_class: 'personal' as any,
        },
      ],
      commitments: [],
      goals: [],
      decryptedSignals: [],
      now: NOW,
    });

    // No discrepancies should be generated from personal entities
    expect(result).toHaveLength(0);
    // Specifically: no risk or decay candidates for these entities
    expect(result.find((d) => d.id.includes('personal-high'))).toBeUndefined();
    expect(result.find((d) => d.id.includes('personal-low'))).toBeUndefined();
  });

  it('personal entities do not displace trusted candidates from top slots', () => {
    // When personal and trusted entities coexist, only trusted entities produce candidates
    const result = detectDiscrepancies({
      entities: [
        {
          ...makeSilentEntity({ id: 'personal-entity', name: 'krista', total_interactions: 52 }),
          trust_class: 'personal' as any,
        },
        {
          ...makeSilentEntity({ id: 'trusted-entity', name: 'sam devore', total_interactions: 44 }),
          trust_class: 'trusted',
        },
      ],
      commitments: [],
      goals: [],
      decryptedSignals: [],
      now: NOW,
    });

    // Only the trusted entity should produce a discrepancy
    const entityIds = result.map((d) => d.id);
    expect(entityIds.some((id) => id.includes('trusted-entity'))).toBe(true);
    expect(entityIds.some((id) => id.includes('personal-entity'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ENTITY ADMISSION CONTROL — getEntityRejectionReasons + full gate
// ---------------------------------------------------------------------------

describe('getEntityRejectionReasons — admission control unit tests', () => {
  const noGoals: any[] = [];
  const noSignals: string[] = [];

  function makeEntityRow(name: string, total_interactions: number, signal_count_90d: number) {
    return {
      id: `test-${name.replace(/\s+/g, '-')}`,
      name,
      total_interactions,
      last_interaction: daysAgoISO(45),
      patterns: { bx_stats: { silence_detected: true, signal_count_90d } },
    };
  }

  it('rejects a medical provider by name pattern', () => {
    const entity = makeEntityRow('Dr. Sarah Chen', 20, 3);
    const reasons = getEntityRejectionReasons(entity, noGoals, noSignals);
    expect(reasons).toContain('medical_or_service_contact');
  });

  it('rejects an ARNP entity by credential in name', () => {
    const entity = makeEntityRow('Sam Devore ARNP', 44, 1);
    const reasons = getEntityRejectionReasons(entity, noGoals, noSignals);
    expect(reasons).toContain('medical_or_service_contact');
  });

  it('rejects a health clinic entity by name', () => {
    const entity = makeEntityRow('Pinnacle Health Care Center', 5, 2);
    const reasons = getEntityRejectionReasons(entity, noGoals, noSignals);
    expect(reasons).toContain('medical_or_service_contact');
  });

  it('rejects an office/utility entity by name', () => {
    const entity = makeEntityRow('RTKL Office Building', 6, 2);
    const reasons = getEntityRejectionReasons(entity, noGoals, noSignals);
    expect(reasons).toContain('office_or_org_entity');
  });

  it('rejects low signal density only when total_interactions < 5', () => {
    // Post-migration: total_interactions reflects real email/calendar counts.
    // Entities with ≥5 real interactions are valid even with low 90d signal density.
    const lowInteractions = makeEntityRow('New Contact', 3, 1);
    expect(getEntityRejectionReasons(lowInteractions, noGoals, noSignals)).toContain('low_signal_density');

    // High interactions + low 90d density = valid (interactions predate 90d window)
    const highInteractions = makeEntityRow('Sam Devore', 44, 1);
    const reasons = getEntityRejectionReasons(highInteractions, noGoals, noSignals);
    expect(reasons).not.toContain('low_signal_density');
    // Still caught by mention_inflation (44/1 = 44x > 20x)
    expect(reasons).toContain('mention_inflation_only');
  });

  it('rejects mention-inflated entity (total_interactions >> signal_count_90d by 20x)', () => {
    // 44 total_interactions but only 2 real signals = 22x inflation
    const entity = makeEntityRow('Sam Devore', 44, 2);
    const reasons = getEntityRejectionReasons(entity, noGoals, noSignals);
    expect(reasons).toContain('mention_inflation_only');
  });

  it('does NOT reject mention inflation when ratio < 20x', () => {
    const entity = makeEntityRow('Alice Smith', 20, 5); // 4x — reasonable
    const reasons = getEntityRejectionReasons(entity, noGoals, noSignals);
    expect(reasons).not.toContain('mention_inflation_only');
  });

  it('rejects calendar-only contact when all signals look like calendar invites', () => {
    const entity = makeEntityRow('Sam Devore', 5, 3);
    const calendarSignals = [
      'You have a meeting invitation from Sam Devore. Attendees: Brandon. Accept | Decline | Maybe',
      'Meeting reminder: appointment with Sam Devore. Calendar invite attached.',
    ];
    const reasons = getEntityRejectionReasons(entity, noGoals, calendarSignals);
    expect(reasons).toContain('one_off_calendar_contact');
  });

  it('does NOT reject calendar-only when signals contain real email context', () => {
    const entity = makeEntityRow('Alice Smith', 8, 3);
    const mixedSignals = [
      'Hi Brandon, following up on our conversation about the consulting proposal. Alice.',
      'Meeting reminder with Alice Smith. Calendar invite.',
    ];
    const reasons = getEntityRejectionReasons(entity, noGoals, mixedSignals);
    expect(reasons).not.toContain('one_off_calendar_contact');
  });

  it('adds no_goal_linkage when signals mention entity but contain no outcome keywords', () => {
    const entity = makeEntityRow('Sam Devore', 5, 3);
    const noOutcomeSignals = [
      "Sam confirmed the appointment for next Tuesday at 2pm.",
      "Don't forget Sam is coming in for the follow-up visit.",
    ];
    const reasons = getEntityRejectionReasons(entity, noGoals, noOutcomeSignals);
    expect(reasons).toContain('no_goal_linkage');
  });

  it('does NOT add no_goal_linkage when signals contain outcome keywords', () => {
    const entity = makeEntityRow('Alice Smith', 8, 3);
    const outcomeSignals = [
      "Alice Smith is the recruiter at Acme. She's reviewing your application and wants to schedule an interview.",
      "Alice mentioned the offer would be ready by end of week.",
    ];
    const reasons = getEntityRejectionReasons(entity, noGoals, outcomeSignals);
    expect(reasons).not.toContain('no_goal_linkage');
  });

  it('does NOT add no_goal_linkage when decryptedSignals is empty (no evidence to analyze)', () => {
    const entity = makeEntityRow('Sam Devore', 8, 3);
    const reasons = getEntityRejectionReasons(entity, noGoals, noSignals);
    expect(reasons).not.toContain('no_goal_linkage');
  });

  it('passes a valid professional contact with real signals', () => {
    const entity = makeEntityRow('Alice Smith', 12, 4);
    const realSignals = [
      'Alice — thanks for the introduction to the board members. Looking forward to next steps.',
      'Alice confirmed the proposal review is scheduled for Thursday.',
    ];
    const reasons = getEntityRejectionReasons(entity, noGoals, realSignals);
    // No false positives for a real professional contact
    expect(reasons).not.toContain('medical_or_service_contact');
    expect(reasons).not.toContain('office_or_org_entity');
    expect(reasons).not.toContain('low_signal_density');
    expect(reasons).not.toContain('mention_inflation_only');
    expect(reasons).not.toContain('one_off_calendar_contact');
  });
});

describe('Entity admission gate — integration (decay/risk do not fire for rejected entities)', () => {
  it('decay does NOT fire for a medical provider entity even with 10 interactions', () => {
    const result = detectDiscrepancies({
      entities: [
        {
          id: 'medical-entity',
          name: 'Dr. Sarah Chen',
          total_interactions: 10,
          last_interaction: daysAgoISO(45),
          patterns: { bx_stats: { silence_detected: true, signal_count_90d: 3 } },
        },
      ],
      commitments: [],
      goals: [],
      decryptedSignals: [],
      now: NOW,
    });
    expect(result.filter((d) => d.class === 'decay')).toHaveLength(0);
  });

  it('risk does NOT fire for a mention-inflated entity (44 interactions, 2 signals)', () => {
    const result = detectDiscrepancies({
      entities: [
        {
          id: 'inflated-entity',
          name: 'Miranda Williams',
          total_interactions: 44,
          last_interaction: daysAgoISO(60),
          // signal_count_90d=2 → 44/2=22x inflation → rejected
          patterns: { bx_stats: { silence_detected: true, signal_count_90d: 2 } },
        },
      ],
      commitments: [],
      goals: [],
      decryptedSignals: [],
      now: NOW,
    });
    expect(result.filter((d) => d.class === 'risk')).toHaveLength(0);
  });

  it('decay DOES fire for entity with signal_count_90d < 2 but total_interactions >= 5 (post-migration real counts)', () => {
    const result = detectDiscrepancies({
      entities: [
        {
          id: 'sparse-entity',
          name: 'Candice Monroe',
          total_interactions: 8,
          last_interaction: daysAgoISO(45),
          patterns: { bx_stats: { silence_detected: true, signal_count_90d: 1 } },
        },
      ],
      commitments: [],
      goals: [],
      decryptedSignals: [],
      now: NOW,
    });
    // Post-migration: 8 real interactions is a verified relationship — low 90d density
    // just means the interactions predate the window, which is exactly what decay detects
    expect(result.filter((d) => d.class === 'decay')).toHaveLength(1);
    expect(result[0].entityName).toBe('Candice Monroe');
  });

  it('decay does NOT fire for entity with total_interactions < 5 and signal_count_90d < 2', () => {
    const result = detectDiscrepancies({
      entities: [
        {
          id: 'new-entity',
          name: 'New Contact',
          total_interactions: 3,
          last_interaction: daysAgoISO(45),
          patterns: { bx_stats: { silence_detected: true, signal_count_90d: 1 } },
        },
      ],
      commitments: [],
      goals: [],
      decryptedSignals: [],
      now: NOW,
    });
    expect(result.filter((d) => d.class === 'decay')).toHaveLength(0);
  });

  it('medical entity does NOT block a valid professional contact from firing', () => {
    const result = detectDiscrepancies({
      entities: [
        {
          id: 'medical-entity',
          name: 'Dr. Sarah Chen',
          total_interactions: 20,
          last_interaction: daysAgoISO(60),
          patterns: { bx_stats: { silence_detected: true, signal_count_90d: 3 } },
        },
        {
          id: 'valid-entity',
          name: 'Alice Smith',
          total_interactions: 12,
          last_interaction: daysAgoISO(45),
          patterns: { bx_stats: { silence_detected: true, signal_count_90d: 4 } },
        },
      ],
      commitments: [],
      goals: [],
      decryptedSignals: [],
      now: NOW,
    });
    // Alice Smith passes — should produce a decay or risk discrepancy
    const entityIds = result.map((d) => d.id);
    expect(entityIds.some((id) => id.includes('valid-entity'))).toBe(true);
    expect(entityIds.some((id) => id.includes('medical-entity'))).toBe(false);
  });

  it('calendar-only entity rejected by admission gate at the integration level', () => {
    const result = detectDiscrepancies({
      entities: [
        {
          id: 'calendar-only',
          name: 'Sam Devore',
          total_interactions: 6,
          last_interaction: daysAgoISO(30),
          patterns: { bx_stats: { silence_detected: true, signal_count_90d: 3 } },
        },
      ],
      commitments: [],
      goals: [],
      decryptedSignals: [
        'Meeting invitation from Sam Devore. You have been invited to: Annual Check-up. Accept | Decline.',
        'Calendar invite: follow-up appointment with Sam Devore. Meeting reminder.',
      ],
      now: NOW,
    });
    expect(result.filter((d) => d.class === 'decay')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Cross-source (calendar / drive / convergence)
// ---------------------------------------------------------------------------

describe('Cross-source discrepancy extractors', () => {
  it('emits schedule_conflict when two calendar events overlap in the next 7 days', () => {
    const d5 = daysFromNowISO(5).slice(0, 10);
    const structured = [
      {
        id: 'cal1',
        source: 'google_calendar',
        type: 'calendar_event',
        occurred_at: daysAgoISO(1),
        content:
          `[Calendar event: Sprint]\nStart: ${d5}T14:00:00.000Z\nEnd: ${d5}T15:00:00.000Z\nAttendees: a@example.com`,
      },
      {
        id: 'cal2',
        source: 'google_calendar',
        type: 'calendar_event',
        occurred_at: daysAgoISO(1),
        content:
          `[Calendar event: Review]\nStart: ${d5}T14:30:00.000Z\nEnd: ${d5}T16:00:00.000Z\nAttendees: b@example.com`,
      },
    ];
    const result = detectDiscrepancies({
      entities: [],
      commitments: [],
      goals: [],
      decryptedSignals: [],
      structuredSignals: structured,
      now: NOW,
    });
    expect(result.some((d) => d.class === 'schedule_conflict')).toBe(true);
  });

  it('emits stale_document when drive file had 3+ touches in one week then 14d idle', () => {
    const base = now - 40 * 86400000;
    const structured = [0, 1, 2].map((i) => ({
      id: `drv-${i}`,
      source: 'drive',
      type: 'file_modified',
      source_id: 'file-xyz',
      occurred_at: new Date(base + i * 86400000).toISOString(),
      content: `[File: Q2 Plan]\nType: application/pdf\nModified: ${new Date(base + i * 86400000).toISOString()}\nOwner: self`,
    }));
    const result = detectDiscrepancies({
      entities: [],
      commitments: [],
      goals: [{ goal_text: 'unrelated goal about fitness', priority: 4, goal_category: 'health' }],
      decryptedSignals: [],
      structuredSignals: structured,
      now: NOW,
    });
    expect(result.some((d) => d.class === 'stale_document')).toBe(true);
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

// ---------------------------------------------------------------------------
// EXTRACTOR 6: engagement_collapse
// ---------------------------------------------------------------------------

function makeCollapsingEntity(overrides: Partial<{
  id: string;
  name: string;
  total_interactions: number;
  velocity_ratio: number;
  signal_count_14d: number;
  signal_count_90d: number;
  silence_detected: boolean;
}> = {}) {
  return {
    id: overrides.id ?? 'entity-collapsing',
    name: overrides.name ?? 'Grace Kim',
    total_interactions: overrides.total_interactions ?? 25,
    last_interaction: daysAgoISO(10),
    patterns: {
      bx_stats: {
        silence_detected: overrides.silence_detected ?? false,
        velocity_ratio: overrides.velocity_ratio ?? 0.3,
        signal_count_14d: overrides.signal_count_14d ?? 2,
        signal_count_30d: 8,
        signal_count_90d: overrides.signal_count_90d ?? 18,
        open_loop_age_days: 10,
      },
    },
  };
}

describe('extractEngagementCollapse (class: engagement_collapse)', () => {
  it('fires when velocity_ratio < 0.5 and signal_count_90d >= 8 and not silent', () => {
    const result = detectDiscrepancies({
      entities: [makeCollapsingEntity({ velocity_ratio: 0.3 })],
      commitments: [],
      goals: [],
      decryptedSignals: [],
      now: NOW,
    });
    const collapse = result.filter((d) => d.class === 'engagement_collapse');
    expect(collapse).toHaveLength(1);
    expect(collapse[0].title).toMatch(/Engagement collapsing: Grace Kim/);
    expect(collapse[0].suggestedActionType).toBe('send_message');
  });

  it('does NOT fire when velocity_ratio >= 0.5', () => {
    const result = detectDiscrepancies({
      entities: [makeCollapsingEntity({ velocity_ratio: 0.6 })],
      commitments: [],
      goals: [],
      decryptedSignals: [],
      now: NOW,
    });
    expect(result.filter((d) => d.class === 'engagement_collapse')).toHaveLength(0);
  });

  it('does NOT fire when signal_count_90d < 8 (insufficient history)', () => {
    const result = detectDiscrepancies({
      entities: [makeCollapsingEntity({ velocity_ratio: 0.2, signal_count_90d: 5 })],
      commitments: [],
      goals: [],
      decryptedSignals: [],
      now: NOW,
    });
    expect(result.filter((d) => d.class === 'engagement_collapse')).toHaveLength(0);
  });

  it('does NOT fire when silence_detected=true (handled by decay/risk)', () => {
    const result = detectDiscrepancies({
      entities: [makeCollapsingEntity({ velocity_ratio: 0.2, silence_detected: true })],
      commitments: [],
      goals: [],
      decryptedSignals: [],
      now: NOW,
    });
    expect(result.filter((d) => d.class === 'engagement_collapse')).toHaveLength(0);
  });

  it('sets higher urgency for velocity_ratio < 0.3 than 0.3–0.5', () => {
    const severe = makeCollapsingEntity({ id: 'e-severe', velocity_ratio: 0.2 });
    const moderate = makeCollapsingEntity({ id: 'e-moderate', name: 'Moderate', velocity_ratio: 0.45 });
    const severeResult = detectDiscrepancies({
      entities: [severe], commitments: [], goals: [], decryptedSignals: [], now: NOW,
    });
    const moderateResult = detectDiscrepancies({
      entities: [moderate], commitments: [], goals: [], decryptedSignals: [], now: NOW,
    });
    const u1 = severeResult.find((d) => d.class === 'engagement_collapse')?.urgency ?? 0;
    const u2 = moderateResult.find((d) => d.class === 'engagement_collapse')?.urgency ?? 0;
    expect(u1).toBeGreaterThan(u2);
  });

  it('includes delta metrics in evidence as JSON', () => {
    const result = detectDiscrepancies({
      entities: [makeCollapsingEntity()],
      commitments: [],
      goals: [],
      decryptedSignals: [],
      now: NOW,
    });
    const collapse = result.find((d) => d.class === 'engagement_collapse');
    expect(collapse).toBeDefined();
    const parsed = JSON.parse(collapse!.evidence);
    expect(parsed).toHaveProperty('baseline');
    expect(parsed).toHaveProperty('current');
    expect(parsed).toHaveProperty('delta_pct');
    expect(parsed).toHaveProperty('timeframe');
    expect(parsed.delta_pct).toBeLessThan(0);
  });

  it('deduplicates: entity fires engagement_collapse, not also decay, when silence_detected=false', () => {
    const e = makeCollapsingEntity({ velocity_ratio: 0.3, silence_detected: false });
    const result = detectDiscrepancies({
      entities: [e], commitments: [], goals: [], decryptedSignals: [], now: NOW,
    });
    // Should appear once, as collapse not decay
    const byEntity = result.filter((d) => d.id.includes(e.id));
    expect(byEntity).toHaveLength(1);
    expect(byEntity[0].class).toBe('engagement_collapse');
  });
});

// ---------------------------------------------------------------------------
// EXTRACTOR 7: relationship_dropout
// ---------------------------------------------------------------------------

function makeDropoutEntity(overrides: Partial<{
  id: string;
  name: string;
  total_interactions: number;
  signal_count_30d: number;
  signal_count_90d: number;
  silence_detected: boolean;
  open_loop_age_days: number;
}> = {}) {
  return {
    id: overrides.id ?? 'entity-dropout',
    name: overrides.name ?? 'Henry Park',
    total_interactions: overrides.total_interactions ?? 4,
    last_interaction: daysAgoISO(35),
    patterns: {
      bx_stats: {
        silence_detected: overrides.silence_detected ?? false,
        velocity_ratio: null,
        signal_count_14d: 0,
        signal_count_30d: overrides.signal_count_30d ?? 0,
        signal_count_90d: overrides.signal_count_90d ?? 4,
        open_loop_age_days: overrides.open_loop_age_days ?? 35,
      },
    },
  };
}

describe('extractRelationshipDropout (class: relationship_dropout)', () => {
  it('fires when count_30d=0 and prior window >= 3 and not silence_detected', () => {
    const result = detectDiscrepancies({
      entities: [makeDropoutEntity({ signal_count_30d: 0, signal_count_90d: 4 })],
      commitments: [],
      goals: [],
      decryptedSignals: [],
      now: NOW,
    });
    const dropout = result.filter((d) => d.class === 'relationship_dropout');
    expect(dropout).toHaveLength(1);
    expect(dropout[0].title).toMatch(/Contact stopped: Henry Park/);
    expect(dropout[0].suggestedActionType).toBe('send_message');
  });

  it('does NOT fire when count_30d > 0', () => {
    const result = detectDiscrepancies({
      entities: [makeDropoutEntity({ signal_count_30d: 2, signal_count_90d: 5 })],
      commitments: [],
      goals: [],
      decryptedSignals: [],
      now: NOW,
    });
    expect(result.filter((d) => d.class === 'relationship_dropout')).toHaveLength(0);
  });

  it('does NOT fire when prior window < 3', () => {
    const result = detectDiscrepancies({
      entities: [makeDropoutEntity({ signal_count_30d: 0, signal_count_90d: 2 })],
      commitments: [],
      goals: [],
      decryptedSignals: [],
      now: NOW,
    });
    expect(result.filter((d) => d.class === 'relationship_dropout')).toHaveLength(0);
  });

  it('does NOT fire when silence_detected=true (caught by decay/risk)', () => {
    const result = detectDiscrepancies({
      entities: [makeDropoutEntity({ signal_count_30d: 0, signal_count_90d: 5, silence_detected: true })],
      commitments: [],
      goals: [],
      decryptedSignals: [],
      now: NOW,
    });
    expect(result.filter((d) => d.class === 'relationship_dropout')).toHaveLength(0);
  });

  it('evidence delta_pct is -100 (complete dropout)', () => {
    const result = detectDiscrepancies({
      entities: [makeDropoutEntity()],
      commitments: [],
      goals: [],
      decryptedSignals: [],
      now: NOW,
    });
    const dropout = result.find((d) => d.class === 'relationship_dropout');
    expect(dropout).toBeDefined();
    const parsed = JSON.parse(dropout!.evidence);
    expect(parsed.delta_pct).toBe(-100);
  });
});

// ---------------------------------------------------------------------------
// EXTRACTOR 8: deadline_staleness
// ---------------------------------------------------------------------------

describe('extractDeadlineStaleness (class: deadline_staleness)', () => {
  it('fires when commitment due ≤3 days and updated 3+ days ago', () => {
    const result = detectDiscrepancies({
      entities: [],
      commitments: [makeCommitment({ due_at: daysFromNowISO(2), updated_at: daysAgoISO(4) })],
      goals: [],
      decryptedSignals: [],
      now: NOW,
    });
    const staleness = result.filter((d) => d.class === 'deadline_staleness');
    expect(staleness).toHaveLength(1);
    expect(staleness[0].title).toMatch(/Deadline closing/);
    expect(staleness[0].suggestedActionType).toBe('write_document');
    expect(staleness[0].stakes).toBe(5);
  });

  it('fires when updated_at is null (never updated)', () => {
    // Use raw object — makeCommitment's ?? operator converts null to a default date
    const neverUpdated = {
      id: 'commit-null-update',
      description: 'Prepare investor deck',
      category: 'project',
      status: 'active',
      risk_score: 50,
      due_at: daysFromNowISO(1),
      implied_due_at: null,
      source_context: null,
      updated_at: null,
    };
    const result = detectDiscrepancies({
      entities: [],
      commitments: [neverUpdated],
      goals: [],
      decryptedSignals: [],
      now: NOW,
    });
    expect(result.filter((d) => d.class === 'deadline_staleness')).toHaveLength(1);
  });

  it('does NOT fire when due more than 3 days out', () => {
    const result = detectDiscrepancies({
      entities: [],
      commitments: [makeCommitment({ due_at: daysFromNowISO(4), updated_at: daysAgoISO(5) })],
      goals: [],
      decryptedSignals: [],
      now: NOW,
    });
    expect(result.filter((d) => d.class === 'deadline_staleness')).toHaveLength(0);
  });

  it('does NOT fire when updated within 3 days (still moving)', () => {
    const result = detectDiscrepancies({
      entities: [],
      commitments: [makeCommitment({ due_at: daysFromNowISO(2), updated_at: daysAgoISO(1) })],
      goals: [],
      decryptedSignals: [],
      now: NOW,
    });
    expect(result.filter((d) => d.class === 'deadline_staleness')).toHaveLength(0);
  });

  it('does NOT fire for completed commitments', () => {
    const result = detectDiscrepancies({
      entities: [],
      commitments: [makeCommitment({ due_at: daysFromNowISO(1), updated_at: daysAgoISO(5), status: 'completed' })],
      goals: [],
      decryptedSignals: [],
      now: NOW,
    });
    expect(result.filter((d) => d.class === 'deadline_staleness')).toHaveLength(0);
  });

  it('sets highest urgency for due today (0 days)', () => {
    const result = detectDiscrepancies({
      entities: [],
      commitments: [makeCommitment({ due_at: daysFromNowISO(0), updated_at: daysAgoISO(4) })],
      goals: [],
      decryptedSignals: [],
      now: NOW,
    });
    const s = result.find((d) => d.class === 'deadline_staleness');
    expect(s?.urgency).toBe(0.95);
  });

  it('evidence includes structured delta with timeframe', () => {
    const result = detectDiscrepancies({
      entities: [],
      commitments: [makeCommitment({ due_at: daysFromNowISO(2), updated_at: daysAgoISO(5) })],
      goals: [],
      decryptedSignals: [],
      now: NOW,
    });
    const s = result.find((d) => d.class === 'deadline_staleness');
    expect(s).toBeDefined();
    const parsed = JSON.parse(s!.evidence);
    expect(parsed).toHaveProperty('baseline');
    expect(parsed).toHaveProperty('current');
    expect(parsed).toHaveProperty('timeframe');
  });
});

// ---------------------------------------------------------------------------
// EXTRACTOR 9: goal_velocity_mismatch
// ---------------------------------------------------------------------------

function makeSignalBatch(count: number, keyword: string): string[] {
  return Array.from({ length: count }, (_, i) => `Signal ${i}: discussing ${keyword} progress and targets`);
}

describe('extractGoalVelocityMismatch (class: goal_velocity_mismatch)', () => {
  it('fires when recent signal density drops ≥50% vs historical baseline', () => {
    // 25 recent signals with 0 keyword matches + 50 historical with 10 matches
    const recentSignals = Array.from({ length: 25 }, () => 'Random signal about weather');
    const historicalSignals = [
      ...makeSignalBatch(10, 'revenue consulting'),
      ...Array.from({ length: 40 }, () => 'Unrelated signal'),
    ];
    const allSignals = [...recentSignals, ...historicalSignals];

    const result = detectDiscrepancies({
      entities: [],
      commitments: [],
      goals: [makeGoal({ goal_text: 'Grow consulting revenue to $15k/month', priority: 1 })],
      decryptedSignals: allSignals,
      now: NOW,
    });
    const velocity = result.filter((d) => d.class === 'goal_velocity_mismatch');
    expect(velocity).toHaveLength(1);
    expect(velocity[0].title).toMatch(/Goal losing momentum/);
    expect(velocity[0].suggestedActionType).toBe('make_decision');
    expect(velocity[0].matchedGoal).not.toBeNull();
  });

  it('does NOT fire when recent density is within 50% of baseline', () => {
    // Both recent and historical have similar keyword density
    const makeSignal = (i: number) => `Consulting revenue target review ${i}`;
    const allSignals = [
      ...Array.from({ length: 25 }, (_, i) => makeSignal(i)),           // recent: 25 matches
      ...Array.from({ length: 50 }, (_, i) => makeSignal(i + 25)),       // historical: 50 matches
    ];
    const result = detectDiscrepancies({
      entities: [],
      commitments: [],
      goals: [makeGoal({ goal_text: 'Grow consulting revenue to $15k/month', priority: 1 })],
      decryptedSignals: allSignals,
      now: NOW,
    });
    expect(result.filter((d) => d.class === 'goal_velocity_mismatch')).toHaveLength(0);
  });

  it('does NOT fire when fewer than 50 total signals (insufficient history)', () => {
    const allSignals = Array.from({ length: 40 }, () => 'Unrelated signal');
    const result = detectDiscrepancies({
      entities: [],
      commitments: [],
      goals: [makeGoal({ goal_text: 'Grow revenue through partnerships', priority: 1 })],
      decryptedSignals: allSignals,
      now: NOW,
    });
    expect(result.filter((d) => d.class === 'goal_velocity_mismatch')).toHaveLength(0);
  });

  it('does NOT fire when historical matches < 3 (no meaningful baseline)', () => {
    // Historical signals have only 2 keyword matches
    const allSignals = [
      ...Array.from({ length: 25 }, () => 'Unrelated recent signal'),
      ...makeSignalBatch(2, 'revenue consulting'),
      ...Array.from({ length: 30 }, () => 'Unrelated historical signal'),
    ];
    const result = detectDiscrepancies({
      entities: [],
      commitments: [],
      goals: [makeGoal({ goal_text: 'Grow consulting revenue to $15k/month', priority: 1 })],
      decryptedSignals: allSignals,
      now: NOW,
    });
    expect(result.filter((d) => d.class === 'goal_velocity_mismatch')).toHaveLength(0);
  });

  it('sets P1 goal to stakes=5, P3 goal to stakes=3', () => {
    const recentSignals = Array.from({ length: 25 }, () => 'Unrelated signal');
    const historicalSignals = [
      ...makeSignalBatch(8, 'product launch customer'),
      ...Array.from({ length: 42 }, () => 'Other signal'),
    ];
    const allSignals = [...recentSignals, ...historicalSignals];

    const p1Result = detectDiscrepancies({
      entities: [],
      commitments: [],
      goals: [makeGoal({ goal_text: 'Launch product to first paying customer', priority: 1 })],
      decryptedSignals: allSignals,
      now: NOW,
    });
    const p3Result = detectDiscrepancies({
      entities: [],
      commitments: [],
      goals: [makeGoal({ goal_text: 'Launch product to first paying customer', priority: 3 })],
      decryptedSignals: allSignals,
      now: NOW,
    });

    const p1v = p1Result.find((d) => d.class === 'goal_velocity_mismatch');
    const p3v = p3Result.find((d) => d.class === 'goal_velocity_mismatch');
    expect(p1v?.stakes).toBe(5);
    expect(p3v?.stakes).toBe(3);
  });

  it('evidence includes structured delta with baseline, current, and delta_pct', () => {
    const recentSignals = Array.from({ length: 25 }, () => 'Unrelated recent signal');
    const historicalSignals = [
      ...makeSignalBatch(6, 'revenue consulting'),
      ...Array.from({ length: 44 }, () => 'Unrelated historical'),
    ];
    const allSignals = [...recentSignals, ...historicalSignals];

    const result = detectDiscrepancies({
      entities: [],
      commitments: [],
      goals: [makeGoal({ goal_text: 'Grow consulting revenue to $15k/month', priority: 2 })],
      decryptedSignals: allSignals,
      now: NOW,
    });
    const v = result.find((d) => d.class === 'goal_velocity_mismatch');
    expect(v).toBeDefined();
    const parsed = JSON.parse(v!.evidence);
    expect(parsed).toHaveProperty('baseline');
    expect(parsed).toHaveProperty('current');
    expect(parsed.delta_pct).toBeLessThan(0);
    expect(parsed.timeframe).toMatch(/recent 25 signals/);
  });
});

// ---------------------------------------------------------------------------
// Delta-based priority: delta candidates outrank absence candidates
// ---------------------------------------------------------------------------

describe('Delta-based candidates outrank absence-based when both present', () => {
  it('engagement_collapse outranks decay for different entities', () => {
    const collapsingEntity = makeCollapsingEntity({
      id: 'e-collapsing',
      velocity_ratio: 0.3,
      total_interactions: 20,
    });
    const silentEntity = makeSilentEntity({
      id: 'e-silent',
      name: 'Silent Person',
      total_interactions: 8,
      last_interaction: daysAgoISO(40),
    });
    const result = detectDiscrepancies({
      entities: [collapsingEntity, silentEntity],
      commitments: [],
      goals: [],
      decryptedSignals: [],
      now: NOW,
    });
    const classes = result.map((d) => d.class);
    const collapseIdx = classes.indexOf('engagement_collapse');
    const decayIdx = classes.indexOf('decay');
    // engagement_collapse (urgency=0.75+) should rank above decay (urgency=0.55)
    expect(collapseIdx).toBeGreaterThanOrEqual(0);
    expect(collapseIdx).toBeLessThan(decayIdx === -1 ? Infinity : decayIdx);
  });

  it('deadline_staleness outranks avoidance (higher urgency)', () => {
    const staleness = makeCommitment({
      id: 'stale', due_at: daysFromNowISO(1), updated_at: daysAgoISO(5),
    });
    const avoidance = makeCommitment({
      id: 'avoid', status: 'at_risk', updated_at: daysAgoISO(20), due_at: null,
    });
    const result = detectDiscrepancies({
      entities: [],
      commitments: [staleness, avoidance],
      goals: [],
      decryptedSignals: [],
      now: NOW,
    });
    const classes = result.map((d) => d.class);
    const stalenessIdx = classes.indexOf('deadline_staleness');
    const avoidanceIdx = classes.indexOf('avoidance');
    expect(stalenessIdx).toBeGreaterThanOrEqual(0);
    expect(stalenessIdx).toBeLessThan(avoidanceIdx === -1 ? Infinity : avoidanceIdx);
  });
});

// ---------------------------------------------------------------------------
// TriggerMetadata — all discrepancies must include structured state-change data
// ---------------------------------------------------------------------------

describe('TriggerMetadata enforcement', () => {
  it('decay trigger has baseline_state, current_state, delta, outcome_class, why_now', () => {
    const result = detectDiscrepancies({
      entities: [makeSilentEntity({ name: 'Alice Smith', total_interactions: 8 })],
      commitments: [],
      goals: [],
      decryptedSignals: ['Alice sent proposal for $50k contract deal approval'],
      now: NOW,
    });
    const decay = result.find((d) => d.class === 'decay');
    expect(decay).toBeDefined();
    expect(decay!.trigger).toBeDefined();
    expect(decay!.trigger!.baseline_state).toContain('8 interactions');
    expect(decay!.trigger!.current_state).toContain('0 interactions');
    expect(decay!.trigger!.outcome_class).toBe('relationship');
    expect(decay!.trigger!.why_now.length).toBeGreaterThanOrEqual(20);
  });

  it('engagement_collapse trigger includes velocity delta', () => {
    const entity = {
      id: 'entity-collapse',
      name: 'Marcus Lee',
      total_interactions: 20,
      last_interaction: daysAgoISO(5),
      patterns: {
        bx_stats: {
          silence_detected: false,
          signal_count_14d: 1,
          signal_count_30d: 5,
          signal_count_90d: 18,
          velocity_ratio: 0.36,
          open_loop_age_days: 5,
        },
      },
    };
    const result = detectDiscrepancies({
      entities: [entity],
      commitments: [],
      goals: [],
      decryptedSignals: ['Marcus sent budget report for $200k funding approval'],
      now: NOW,
    });
    const collapse = result.find((d) => d.class === 'engagement_collapse');
    expect(collapse).toBeDefined();
    expect(collapse!.trigger).toBeDefined();
    expect(collapse!.trigger!.delta).toContain('drop');
    expect(collapse!.trigger!.outcome_class).toBe('relationship');
    expect(collapse!.trigger!.baseline_state).toContain('90-day');
  });

  it('deadline_staleness trigger has deadline outcome_class', () => {
    const commitment = {
      id: 'commit-stale',
      description: 'Submit Q2 budget proposal to board',
      category: 'project',
      status: 'active',
      risk_score: 3,
      due_at: daysFromNowISO(2),
      implied_due_at: null,
      source_context: null,
      updated_at: daysAgoISO(5),
    };
    const result = detectDiscrepancies({
      entities: [],
      commitments: [commitment],
      goals: [],
      decryptedSignals: [],
      now: NOW,
    });
    const staleness = result.find((d) => d.class === 'deadline_staleness');
    expect(staleness).toBeDefined();
    expect(staleness!.trigger).toBeDefined();
    expect(staleness!.trigger!.outcome_class).toBe('deadline');
    expect(staleness!.trigger!.current_state).toContain('deadline');
    expect(staleness!.trigger!.why_now).toContain('remain');
  });

  it('avoidance trigger has stall delta and why_now', () => {
    const commitment = {
      id: 'commit-avoid',
      description: 'Send contract to legal team for review',
      category: 'project',
      status: 'at_risk',
      risk_score: 4,
      due_at: daysFromNowISO(5),
      implied_due_at: null,
      source_context: null,
      updated_at: daysAgoISO(16),
    };
    const result = detectDiscrepancies({
      entities: [],
      commitments: [commitment],
      goals: [],
      decryptedSignals: [],
      now: NOW,
    });
    const avoidance = result.find((d) => d.class === 'avoidance');
    expect(avoidance).toBeDefined();
    expect(avoidance!.trigger).toBeDefined();
    expect(avoidance!.trigger!.delta).toContain('stalled');
    expect(avoidance!.trigger!.why_now).toContain('stalled');
  });

  it('goal_velocity_mismatch trigger has financial outcome_class for financial goals', () => {
    // Build 60+ signals with historical keyword density then recent drop
    const historicalSignals = Array.from({ length: 40 }, (_, i) =>
      `Signal ${i}: revenue projection meeting with investor and runway analysis`,
    );
    const recentSignals = Array.from({ length: 25 }, (_, i) =>
      `Signal ${i}: unrelated office admin task and scheduling`,
    );
    const allSignals = [...recentSignals, ...historicalSignals];

    const result = detectDiscrepancies({
      entities: [],
      commitments: [],
      goals: [{ goal_text: 'Close revenue projection with investor', priority: 1, goal_category: 'financial' }],
      decryptedSignals: allSignals,
      now: NOW,
    });
    const velocity = result.find((d) => d.class === 'goal_velocity_mismatch');
    expect(velocity).toBeDefined();
    expect(velocity!.trigger).toBeDefined();
    expect(velocity!.trigger!.outcome_class).toBe('money');
    expect(velocity!.trigger!.delta).toContain('drop');
  });

  it('exposure trigger has deadline outcome_class', () => {
    const commitment = {
      id: 'commit-exposure',
      description: 'Deliver client SOW by Friday',
      category: 'project',
      status: 'active',
      risk_score: 2,
      due_at: daysFromNowISO(3),
      implied_due_at: null,
      source_context: null,
      updated_at: daysAgoISO(1),
    };
    const result = detectDiscrepancies({
      entities: [],
      commitments: [commitment],
      goals: [],
      decryptedSignals: [],
      now: NOW,
    });
    const exposure = result.find((d) => d.class === 'exposure');
    expect(exposure).toBeDefined();
    expect(exposure!.trigger).toBeDefined();
    expect(exposure!.trigger!.outcome_class).toBe('deadline');
    expect(exposure!.trigger!.why_now.length).toBeGreaterThanOrEqual(20);
  });

  it('drift trigger for career goal has job outcome_class', () => {
    const result = detectDiscrepancies({
      entities: [],
      commitments: [],
      goals: [{ goal_text: 'Land engineering director position at target company', priority: 1, goal_category: 'career' }],
      decryptedSignals: ['unrelated grocery shopping list and errands'],
      now: NOW,
    });
    const drift = result.find((d) => d.class === 'drift');
    expect(drift).toBeDefined();
    expect(drift!.trigger).toBeDefined();
    expect(drift!.trigger!.outcome_class).toBe('job');
    expect(drift!.trigger!.delta).toContain('zero');
  });
});

// ---------------------------------------------------------------------------
// extractBehavioralPatterns (class: behavioral_pattern)
// ---------------------------------------------------------------------------

describe('extractBehavioralPatterns (class: behavioral_pattern)', () => {
  const entityAcme = {
    id: 'ent-acme',
    name: 'Acme Industries',
    last_interaction: daysAgoISO(5),
    total_interactions: 20,
    patterns: {},
    primary_email: 'sales@acme.test',
  };

  it('PATTERN 1: goal–behavior contradiction (inbound ≥3, zero outbound, goal keywords)', () => {
    const goal = { goal_text: 'Close Acme enterprise deal', priority: 3, goal_category: 'project' as const };
    const structured = [1, 2, 3].map((i) => ({
      id: `in-acme-${i}`,
      source: 'email_received',
      type: 'email_received',
      occurred_at: daysAgoISO(i),
      content: `Thread from Acme Industries about enterprise deal close ${i}`,
    }));
    const out = extractBehavioralPatterns(
      [entityAcme],
      [goal],
      [],
      structured,
      [],
      [],
      now,
    );
    const hit = out.filter((d) => d.class === 'behavioral_pattern');
    const p1 = hit.find((d) => d.title.includes('zero outbound action in 14 days'));
    expect(p1).toBeDefined();
    expect(p1!.title).toMatch(/despite 3 inbound signals/);
    expect(p1!.matchedGoal?.text).toContain('Acme');
    expect(p1!.sourceSignals[0]?.id).toBeTruthy();
  });

  it('PATTERN 2: repeated avoidance (3+ received, 0 sent, 0 reply)', () => {
    const ent = {
      id: 'ent-pat',
      name: 'Pat Lee',
      last_interaction: daysAgoISO(1),
      total_interactions: 10,
      patterns: {},
      primary_email: 'pat@example.com',
    };
    const structured = [1, 2, 4].map((i) => ({
      id: `in-pat-${i}`,
      source: 'email_received',
      type: 'email_received',
      occurred_at: daysAgoISO(i),
      content: `Question from Pat Lee about the roadmap ${i}`,
    }));
    const out = extractBehavioralPatterns([ent], [], [], structured, [], [], now);
    const hit = out.filter((d) => d.class === 'behavioral_pattern');
    expect(hit.some((d) => d.title.includes('0 replies in 14 days'))).toBe(true);
    expect(hit.find((d) => d.title.includes('Pat Lee'))?.suggestedActionType).toBe('send_message');
  });

  it('PATTERN 2: does not count inbound where entity name only appears on To (sender is someone else)', () => {
    const ent = {
      id: 'ent-jordan',
      name: 'Jordan Blake',
      last_interaction: daysAgoISO(1),
      total_interactions: 10,
      patterns: {},
      primary_email: 'jordan@example.com',
    };
    const structured = [1, 2, 3].map((i) => ({
      id: `to-jordan-${i}`,
      source: 'gmail',
      type: 'email_received',
      occurred_at: daysAgoISO(i),
      author: 'Alice Other <alice@other.com>',
      content: `[Email received: ${daysAgoISO(i)}]
From: Alice Other <alice@other.com>
To: Jordan Blake <jordan@example.com>
Subject: FYI ${i}
Body preview: Hey Jordan Blake — quick update ${i}`,
    }));
    const out = extractBehavioralPatterns([ent], [], [], structured, [], [], now);
    const avoid = out.filter(
      (d) => d.class === 'behavioral_pattern' && d.title.includes('0 replies in 14 days'),
    );
    expect(avoid.some((d) => d.entityName === 'Jordan Blake')).toBe(false);
  });

  it('PATTERN 2: does not count inbound From self mailbox as received-from-contact (selfEmails + From line)', () => {
    const ent = {
      id: 'ent-self-name',
      name: 'Brandon Kapp',
      last_interaction: daysAgoISO(1),
      total_interactions: 10,
      patterns: {},
      primary_email: 'b-kapp@outlook.com',
    };
    const selfEmails = new Set(['b.kapp1010@gmail.com', 'b-kapp@outlook.com']);
    const structured = [1, 2, 3].map((i) => ({
      id: `self-inbound-${i}`,
      source: 'outlook',
      type: 'email_received',
      occurred_at: daysAgoISO(i),
      author: 'Brandon Kapp <b-kapp@outlook.com>',
      content: `[Email received: ${daysAgoISO(i)}]
From: Brandon Kapp <b-kapp@outlook.com>
To: Someone <other@example.com>
Subject: Note to self ${i}
Body preview: Brandon Kapp — reminder ${i}`,
    }));
    const out = extractBehavioralPatterns([ent], [], [], structured, [], [], now, selfEmails);
    const avoid = out.filter(
      (d) => d.class === 'behavioral_pattern' && d.title.includes('0 replies in 14 days'),
    );
    expect(avoid.some((d) => d.entityName === 'Brandon Kapp')).toBe(false);
  });

  it('PATTERN 2: does not treat noreply / transactional-domain mail as inbound needing reply', () => {
    const ent = {
      id: 'ent-owner',
      name: 'Brandon Kapp',
      last_interaction: daysAgoISO(1),
      total_interactions: 10,
      patterns: {},
      primary_email: 'b@example.com',
    };
    const structured = [1, 2, 3].map((i) => ({
      id: `auto-${i}`,
      source: 'gmail',
      type: 'email_received',
      occurred_at: daysAgoISO(i),
      content: `[Email received: ${daysAgoISO(i)}]
From: Chase <alerts@secure.chase.com>
To: Brandon Kapp <b@example.com>
Subject: Payment reminder
Body preview: Hello Brandon Kapp — your statement is ready ${i}`,
    }));
    const out = extractBehavioralPatterns([ent], [], [], structured, [], [], now);
    const avoid = out.filter(
      (d) => d.class === 'behavioral_pattern' && d.title.includes('0 replies in 14 days'),
    );
    expect(avoid.some((d) => d.entityName === 'Brandon Kapp')).toBe(false);
  });

  it('PATTERN 1: goal contradiction ignores inbound that is only automated senders', () => {
    const goal = { goal_text: 'Close Acme enterprise deal', priority: 3, goal_category: 'project' as const };
    const entityAcme = {
      id: 'ent-acme2',
      name: 'Acme Industries',
      last_interaction: daysAgoISO(5),
      total_interactions: 20,
      patterns: {},
      primary_email: 'sales@acme.test',
    };
    const structured = [1, 2, 3].map((i) => ({
      id: `auto-acme-${i}`,
      source: 'email_received',
      type: 'email_received',
      occurred_at: daysAgoISO(i),
      content: `[Email received: ${daysAgoISO(i)}]
From: American Express <no-reply@welcome.americanexpress.com>
Subject: Acme Industries enterprise deal newsletter
Body preview: Acme Industries enterprise deal ${i}`,
    }));
    const out = extractBehavioralPatterns([entityAcme], [goal], [], structured, [], [], now);
    const p1 = out.filter((d) => d.class === 'behavioral_pattern').find((d) => d.title.includes('zero outbound'));
    expect(p1).toBeUndefined();
  });

  it('PATTERN 3: momentum then silence (dense mid-window, ≤1 in last 14d)', () => {
    const ent = {
      id: 'ent-sam',
      name: 'Sam Stone',
      last_interaction: daysAgoISO(40),
      total_interactions: 30,
      patterns: {},
      primary_email: null,
      emails: [] as string[],
    };
    const midDays = [40, 38, 36, 34, 32, 30, 28, 26, 24];
    const structured = midDays.map((d, i) => ({
      id: `mid-sam-${i}`,
      source: 'email_received',
      type: 'email_received',
      occurred_at: daysAgoISO(d),
      content: `Sam Stone update batch ${i} on project`,
    }));
    const out = extractBehavioralPatterns([ent], [], [], structured, [], [], now);
    const hit = out.filter((d) => d.class === 'behavioral_pattern' && d.title.includes('momentum lost'));
    expect(hit.length).toBeGreaterThanOrEqual(1);
    expect(hit[0].title).toMatch(/Sam Stone/);
    expect(hit[0].sourceSignals[0]?.id).toBeTruthy();
  });

  it('PATTERN 4: cross-entity theme', () => {
    const a = { id: 'e1', name: 'Alice Nova', last_interaction: daysAgoISO(2), total_interactions: 5, patterns: {} };
    const b = { id: 'e2', name: 'Bob Nova', last_interaction: daysAgoISO(2), total_interactions: 5, patterns: {} };
    const c = { id: 'e3', name: 'Carol Nova', last_interaction: daysAgoISO(2), total_interactions: 5, patterns: {} };
    const structured = [
      { id: 's1', source: 'email_received', type: 'email_received', occurred_at: daysAgoISO(5), content: 'Alice Nova: deadline for review' },
      { id: 's2', source: 'email_received', type: 'email_received', occurred_at: daysAgoISO(6), content: 'Bob Nova waiting on deadline signoff' },
      { id: 's3', source: 'email_received', type: 'email_received', occurred_at: daysAgoISO(7), content: 'Carol Nova project deadline tomorrow' },
    ];
    const out = extractBehavioralPatterns([a, b, c], [], [], structured, [], [], now);
    const hit = out.filter((d) => d.class === 'behavioral_pattern' && d.title.toLowerCase().includes('deadline'));
    expect(hit.length).toBeGreaterThanOrEqual(1);
    expect(hit[0].title).toMatch(/deadline appears across 3 contacts/);
    expect(hit[0].suggestedActionType).toBe('write_document');
  });

  it('PATTERN 5: said-but-never-did (active commitment, aged, no recent signals)', () => {
    const commitment = {
      id: 'c-old',
      description: 'Send revised proposal to Dana Liu',
      category: 'project',
      status: 'active',
      risk_score: 55,
      due_at: null,
      implied_due_at: null,
      source_context: null,
      updated_at: daysAgoISO(10),
      created_at: daysAgoISO(10),
    };
    const dana = {
      id: 'ent-dana',
      name: 'Dana Liu',
      last_interaction: daysAgoISO(20),
      total_interactions: 4,
      patterns: {},
      primary_email: 'dana@example.com',
    };
    const out = extractBehavioralPatterns([dana], [], [commitment], [], [], [], now);
    const hit = out.filter((d) => d.class === 'behavioral_pattern');
    expect(hit.some((d) => d.title.includes('no activity since'))).toBe(true);
    expect(hit.find((d) => d.title.includes('Committed'))?.sourceSignals[0]?.id).toBe('c-old');
  });

  it('returns no behavioral_pattern when no cross-signal patterns apply', () => {
    const goal = { goal_text: 'Ship product milestone', priority: 1, goal_category: 'project' as const };
    const ent = {
      id: 'ent-active',
      name: 'Taylor Kim',
      last_interaction: daysAgoISO(1),
      total_interactions: 12,
      patterns: {},
      primary_email: 't@example.com',
    };
    const structured = [1, 2, 3].map((i) => ({
      id: `sent-${i}`,
      source: 'email_sent',
      type: 'email_sent',
      occurred_at: daysAgoISO(i),
      content: `Taylor Kim thanks for reply ${i}`,
    }));
    const out = extractBehavioralPatterns([ent], [goal], [], structured, [], [], now);
    expect(out.filter((d) => d.class === 'behavioral_pattern')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Self-entity filtering in cross-entity theme detection
// ---------------------------------------------------------------------------
describe('extractBehavioralPatterns — selfEmails filter in cross-entity theme', () => {
  function makeThemeEntity(name: string, email: string, totalInteractions = 10) {
    return {
      id: `ent-${name.replace(/\s+/g, '-')}`,
      name,
      last_interaction: daysAgoISO(5),
      total_interactions: totalInteractions,
      patterns: {},
      primary_email: email,
      emails: [email],
    };
  }

  function makeThemeSignal(id: string, theme: string, entityName: string, daysAgo: number) {
    return {
      id,
      source: 'email',
      type: 'email',
      occurred_at: daysAgoISO(daysAgo),
      content: `From: ${entityName} <${entityName.toLowerCase().replace(/\s+/g, '.')}@example.com>\n${theme} deadline approaching`,
    };
  }

  it('includes owner entity in theme candidate when selfEmails is not provided', () => {
    const owner = makeThemeEntity('Brandon Kapp', 'b-kapp@outlook.com');
    const contact1 = makeThemeEntity('Alice Smith', 'alice@example.com');
    const contact2 = makeThemeEntity('Bob Jones', 'bob@example.com');
    const contact3 = makeThemeEntity('Carol White', 'carol@example.com');

    const signals = [
      makeThemeSignal('s1', 'deadline', 'Brandon Kapp', 10),
      makeThemeSignal('s2', 'deadline', 'Alice Smith', 12),
      makeThemeSignal('s3', 'deadline', 'Bob Jones', 14),
      makeThemeSignal('s4', 'deadline', 'Carol White', 16),
    ];

    const out = extractBehavioralPatterns(
      [owner, contact1, contact2, contact3], [], [], signals, [], [], now,
      // no selfEmails → owner is not filtered
    );
    const themeCandidates = out.filter((d) => d.id?.startsWith('discrepancy_bp_theme_'));
    // With 4 entities hitting the theme and no selfEmails filter, candidate should form
    expect(themeCandidates.length).toBeGreaterThan(0);
    const firstTitle = themeCandidates[0]?.title ?? '';
    expect(firstTitle).toContain('Brandon Kapp');
  });

  it('excludes owner entity from theme candidate title when selfEmails is provided', () => {
    const owner = makeThemeEntity('Brandon Kapp', 'b-kapp@outlook.com');
    const contact1 = makeThemeEntity('Alice Smith', 'alice@example.com');
    const contact2 = makeThemeEntity('Bob Jones', 'bob@example.com');
    const contact3 = makeThemeEntity('Carol White', 'carol@example.com');

    const signals = [
      makeThemeSignal('s1', 'deadline', 'Brandon Kapp', 10),
      makeThemeSignal('s2', 'deadline', 'Alice Smith', 12),
      makeThemeSignal('s3', 'deadline', 'Bob Jones', 14),
      makeThemeSignal('s4', 'deadline', 'Carol White', 16),
    ];

    const selfEmails = new Set(['b-kapp@outlook.com']);
    const out = extractBehavioralPatterns(
      [owner, contact1, contact2, contact3], [], [], signals, [], [], now, selfEmails,
    );
    const themeCandidates = out.filter((d) => d.id?.startsWith('discrepancy_bp_theme_'));
    // Owner filtered out → remaining 3 contacts still form the threshold
    expect(themeCandidates.length).toBeGreaterThan(0);
    const firstTitle = themeCandidates[0]?.title ?? '';
    // Owner must NOT appear in the title
    expect(firstTitle).not.toContain('Brandon Kapp');
    // Real contacts still appear
    expect(firstTitle).toContain('deadline');
  });

  it('drops theme candidate entirely when filtering owner leaves fewer than 3 contacts', () => {
    const owner = makeThemeEntity('Brandon Kapp', 'b-kapp@outlook.com');
    const contact1 = makeThemeEntity('Alice Smith', 'alice@example.com');
    const contact2 = makeThemeEntity('Bob Jones', 'bob@example.com');
    // Only 2 non-owner entities → below threshold of 3

    const signals = [
      makeThemeSignal('s1', 'deadline', 'Brandon Kapp', 10),
      makeThemeSignal('s2', 'deadline', 'Alice Smith', 12),
      makeThemeSignal('s3', 'deadline', 'Bob Jones', 14),
    ];

    const selfEmails = new Set(['b-kapp@outlook.com']);
    const out = extractBehavioralPatterns(
      [owner, contact1, contact2], [], [], signals, [], [], now, selfEmails,
    );
    const themeCandidates = out.filter((d) => d.id?.startsWith('discrepancy_bp_theme_'));
    expect(themeCandidates).toHaveLength(0);
  });
});

describe('extractBehavioralPatterns — interview week cluster', () => {
  it('detects a next-7-days interview cluster and excludes personal calendar noise', () => {
    const structured = [
      {
        id: 'int-1',
        source: 'google_calendar',
        type: 'calendar_event',
        occurred_at: daysAgoISO(1),
        content: [
          '[Calendar event: SHPC4 Interview - Social and Health Program Consultant 4 - DSHS]',
          'Start: 2026-03-30T16:00:00.000Z',
          'End: 2026-03-30T17:00:00.000Z',
          'Attendees: cheryl.anderson1@dshs.wa.gov',
        ].join('\n'),
      },
      {
        id: 'int-2',
        source: 'gmail',
        type: 'email',
        occurred_at: daysAgoISO(2),
        content: [
          'From: Cheryl Anderson <cheryl.anderson1@dshs.wa.gov>',
          'Subject: SHPC4 interview confirmation for March 30',
          'Body: Focus on program operations, stakeholder coordination, and policy interpretation.',
        ].join('\n'),
      },
      {
        id: 'int-3',
        source: 'google_calendar',
        type: 'calendar_event',
        occurred_at: daysAgoISO(1),
        content: [
          '[Calendar event: MEDS/MAS3 Interview - Administrative Specialist 3 - HCA]',
          'Start: 2026-04-01T18:30:00.000Z',
          'End: 2026-04-01T19:30:00.000Z',
          'Attendees: yadira.clapper@hca.wa.gov',
        ].join('\n'),
      },
      {
        id: 'int-4',
        source: 'gmail',
        type: 'email',
        occurred_at: daysAgoISO(2),
        content: [
          'From: Yadira Clapper <yadira.clapper@hca.wa.gov>',
          'Subject: MEDS/MAS3 interview packet',
          'Body: Bring examples of appeals coordination, training handoffs, and policy interpretation.',
        ].join('\n'),
      },
      {
        id: 'int-5',
        source: 'google_calendar',
        type: 'calendar_event',
        occurred_at: daysAgoISO(1),
        content: [
          '[Calendar event: Training & Appeals Program Manager Interview - WA Cares]',
          'Start: 2026-04-03T17:00:00.000Z',
          'End: 2026-04-03T18:00:00.000Z',
          'Attendees: keri.nopens@wacares.wa.gov',
        ].join('\n'),
      },
      {
        id: 'int-6',
        source: 'gmail',
        type: 'email',
        occurred_at: daysAgoISO(2),
        content: [
          'From: Keri Nopens <keri.nopens@wacares.wa.gov>',
          'Subject: Training & Appeals Program Manager interview agenda',
          'Body: Focus areas: training handoffs, stakeholder coordination, and program operations.',
        ].join('\n'),
      },
      {
        id: 'noise-1',
        source: 'google_calendar',
        type: 'calendar_event',
        occurred_at: daysAgoISO(1),
        content: [
          '[Calendar event: Dance]',
          'Start: 2026-03-31T21:15:00.000Z',
          'End: 2026-03-31T22:15:00.000Z',
        ].join('\n'),
      },
      {
        id: 'noise-2',
        source: 'google_calendar',
        type: 'calendar_event',
        occurred_at: daysAgoISO(1),
        content: [
          '[Calendar event: Put Trash Can Out]',
          'Start: 2026-04-01T02:00:00.000Z',
          'End: 2026-04-01T02:15:00.000Z',
        ].join('\n'),
      },
      {
        id: 'noise-3',
        source: 'google_calendar',
        type: 'calendar_event',
        occurred_at: daysAgoISO(1),
        content: [
          '[Calendar event: Bible study at Brightside]',
          'Start: 2026-04-02T02:00:00.000Z',
          'End: 2026-04-02T04:00:00.000Z',
        ].join('\n'),
      },
    ];

    const out = extractBehavioralPatterns(
      [],
      [{ goal_text: 'Land a state role in the next cycle', priority: 4, goal_category: 'career' }],
      [],
      structured,
      [],
      [],
      now,
    );

    const cluster = out.find((d) => d.id.includes('interview_week'));
    expect(cluster).toBeDefined();
    expect(cluster?.suggestedActionType).toBe('write_document');
    expect(cluster?.title).toContain('Interview week cluster detected');
    expect(cluster?.content).toContain('INTERVIEW_WEEK_CLUSTER');
    expect(cluster?.content).toContain('INTERVIEW_ITEM: 2026-03-30T16:00:00.000Z || 2026-03-30T17:00:00.000Z || SHPC4 Interview - Social and Health Program Consultant 4 - DSHS');
    expect(cluster?.content).toContain('INTERVIEW_ITEM: 2026-04-01T18:30:00.000Z || 2026-04-01T19:30:00.000Z || MEDS/MAS3 Interview - Administrative Specialist 3 - HCA');
    expect(cluster?.content).toContain('INTERVIEW_ITEM: 2026-04-03T17:00:00.000Z || 2026-04-03T18:00:00.000Z || Training & Appeals Program Manager Interview - WA Cares || Training & Appeals Program Manager || WA Cares || training handoffs, stakeholder coordination, and program operations || Keri Nopens');
    expect(cluster?.content).not.toContain('Training & Appeals Program Manager Interview - WA Cares || Training & Appeals Program Manager || WA Cares || appeals coordination, training handoffs, and policy interpretation || Yadira Clapper');
    expect(cluster?.content).toContain('EXCLUDED_ITEM: 2026-03-31T21:15:00.000Z || Dance || non-interview personal event');
    expect(cluster?.content).toContain('EXCLUDED_ITEM: 2026-04-01T02:00:00.000Z || Put Trash Can Out || non-interview personal event');
    expect(cluster?.content).toContain('EXCLUDED_ITEM: 2026-04-02T02:00:00.000Z || Bible study at Brightside || non-interview personal event');
  });
});
