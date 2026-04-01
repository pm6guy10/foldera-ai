/**
 * Trigger → Action Lock Enforcement Tests
 *
 * For each of the 9 trigger classes:
 * - Input: synthetic trigger payload
 * - Output must:
 *   - include explicit ask
 *   - include time pressure
 *   - not contain banned phrases
 *   - not be self-addressed
 *   - map to the correct deterministic action_type
 */

import { describe, it, expect } from 'vitest';
import {
  TRIGGER_ACTION_MAP,
  artifactContainsDecayPipelineLeak,
  resolveTriggerAction,
  buildTriggerContextBlock,
  validateTriggerArtifact,
} from '../trigger-action-map';
import type { DiscrepancyClass, TriggerMetadata } from '../discrepancy-detector';

// ---------------------------------------------------------------------------
// Fixtures — one synthetic trigger per class
// ---------------------------------------------------------------------------

const TRIGGERS: Record<DiscrepancyClass, TriggerMetadata> = {
  decay: {
    baseline_state: '8 interactions total, ~2/14d baseline',
    current_state: '0 interactions in 45 days',
    delta: '8 → 0 (silence after 8 interactions)',
    timeframe: 'Silent for 45 days',
    outcome_class: 'relationship',
    why_now: '45 days of silence crosses the point where reconnection becomes awkward',
  },
  exposure: {
    baseline_state: 'Commitment accepted: "Deliver Q2 budget proposal"',
    current_state: 'Due in 3 day(s), no execution artifact exists',
    delta: 'commitment → no artifact (3d remaining)',
    timeframe: '3 day(s) to deadline',
    outcome_class: 'deadline',
    why_now: 'Due in 3 days with zero artifacts — this is an exposure gap',
  },
  drift: {
    baseline_state: 'P1 goal declared: "Close Series A funding round"',
    current_state: 'Zero matching activity in signals or commitments',
    delta: 'stated priority → zero observable action',
    timeframe: 'current signal and commitment window',
    outcome_class: 'money',
    why_now: 'P1 goal has no evidence of action — every day without movement is drift',
  },
  avoidance: {
    baseline_state: 'Commitment accepted as at_risk, last movement 21 days ago',
    current_state: 'No forward movement for 21 days, 5d until due',
    delta: 'active → stalled (21 days without externalization)',
    timeframe: '21 day stall, deadline in 5d',
    outcome_class: 'deadline',
    why_now: '21 days stalled — effectively abandoned unless a decision forces movement',
  },
  risk: {
    baseline_state: '22 interactions total, ~4/14d baseline — one of your highest-value relationships',
    current_state: 'Complete silence for 60 days',
    delta: '4/14d → 0/14d (100% drop)',
    timeframe: 'Silent for 60 days',
    outcome_class: 'relationship',
    why_now: '60 days of silence from a 22-interaction relationship',
  },
  engagement_collapse: {
    baseline_state: '3 interactions/14d (90-day average)',
    current_state: '1 interactions/14d (velocity_ratio=0.33)',
    delta: '67% drop in engagement rate',
    timeframe: '14-day vs 90-day baseline',
    outcome_class: 'relationship',
    why_now: 'Engagement dropped 67% — active withdrawal, not gradual fade',
  },
  relationship_dropout: {
    baseline_state: '5 interactions in the 30–90 day window',
    current_state: '0 interactions in the last 30 days',
    delta: '5 → 0 (100% drop, discrete stop)',
    timeframe: '30-day vs 30–90-day comparison window',
    outcome_class: 'relationship',
    why_now: 'Went from 5 interactions to zero — discrete break, not gradual',
  },
  deadline_staleness: {
    baseline_state: 'Active commitment, last updated 5 days ago',
    current_state: '2 day(s) until deadline with no movement',
    delta: '5 days stalled while deadline approaches (2d remaining)',
    timeframe: '5 day stall, 2d to deadline',
    outcome_class: 'deadline',
    why_now: 'Deadline in 2 days and last movement was 5 days ago',
  },
  goal_velocity_mismatch: {
    baseline_state: '12 goal-keyword matches across 80 historical signals',
    current_state: '2 matches in last 25 signals',
    delta: '65% drop in goal-aligned activity',
    timeframe: 'recent 25 signals vs historical baseline',
    outcome_class: 'money',
    why_now: 'P1 goal activity dropped 65% — behavior diverged from stated priority',
  },
  preparation_gap: {
    baseline_state: 'Ongoing relationship signals expected before meetings',
    current_state: 'Meeting in 2 days with Alice but no recent email thread',
    delta: 'meeting scheduled → no preparatory email contact in 14d',
    timeframe: '2 day(s) until event',
    outcome_class: 'relationship',
    why_now: 'A meeting is a forcing function — showing up without a recent thread increases misalignment risk.',
  },
  meeting_open_thread: {
    baseline_state: 'Last inbound thread still pending',
    current_state: 'Meeting in 3 days with no closing send after last inbound',
    delta: 'open thread + approaching meeting → reply gap',
    timeframe: '3 day(s) to meeting',
    outcome_class: 'relationship',
    why_now: 'The calendar event creates accountability — an open thread plus a hard date surfaces stall risk.',
  },
  schedule_conflict: {
    baseline_state: 'Non-overlapping calendar commitments',
    current_state: 'Overlap: Event A and Event B',
    delta: 'double-booked time window',
    timeframe: '2026-04-02',
    outcome_class: 'deadline',
    why_now: 'Overlapping events force an explicit priority call — otherwise you default under pressure.',
  },
  stale_document: {
    baseline_state: 'Active editing burst on Q2 plan',
    current_state: 'Document idle for 14+ days after burst',
    delta: 'high edit velocity → sudden stop',
    timeframe: 'last 90 days',
    outcome_class: 'job',
    why_now: 'Bursts that go cold often hide an implicit decision — archive, ship, or delegate.',
  },
  document_followup_gap: {
    baseline_state: 'File linked to Alice',
    current_state: 'No follow-up email in 5 days referencing this doc',
    delta: 'shared artifact → communication drop-off',
    timeframe: '14 days',
    outcome_class: 'relationship',
    why_now: 'Shared documents without follow-through often stall commitments made in thread.',
  },
  convergence: {
    baseline_state: 'Low cross-channel density',
    current_state: 'Alice appears across: calendar, drive, email',
    delta: 'multi-source convergence in a short window',
    timeframe: '14 days',
    outcome_class: 'risk',
    why_now: 'When the same person hits email, calendar, and files in one week, something is threading without an owner.',
  },
  unresolved_intent: {
    baseline_state: 'Conversation captured intent: follow up with the bank',
    current_state: 'No follow-on directive detected within 7 days',
    delta: 'stated intent → no system action',
    timeframe: '7 days',
    outcome_class: 'risk',
    why_now: 'The user externalized a commitment to the assistant — without a directive, it stays imaginary.',
  },
  behavioral_pattern: {
    baseline_state: 'Repeated inbound thematic signals across multiple contacts',
    current_state: 'User has not connected the pattern into one consolidated move',
    delta: 'isolated threads → visible cross-signal theme',
    timeframe: '30 days',
    outcome_class: 'risk',
    why_now: 'The same behavioral shape appears in multiple channels — without naming the pattern, each thread feels like a one-off.',
  },
};

// ---------------------------------------------------------------------------
// 1. Mapping table completeness — all 9 classes covered
// ---------------------------------------------------------------------------

describe('Trigger Action Map — completeness', () => {
  const ALL_CLASSES: DiscrepancyClass[] = [
    'decay', 'exposure', 'drift', 'avoidance', 'risk',
    'engagement_collapse', 'relationship_dropout', 'deadline_staleness', 'goal_velocity_mismatch',
    'preparation_gap', 'meeting_open_thread', 'schedule_conflict', 'stale_document',
    'document_followup_gap', 'unresolved_intent', 'convergence', 'behavioral_pattern',
  ];

  it('covers all discrepancy classes', () => {
    for (const cls of ALL_CLASSES) {
      expect(TRIGGER_ACTION_MAP[cls]).toBeDefined();
      expect(TRIGGER_ACTION_MAP[cls].primary_action).toBeTruthy();
      expect(TRIGGER_ACTION_MAP[cls].artifact_shape).toBeTruthy();
      expect(TRIGGER_ACTION_MAP[cls].required_elements.length).toBeGreaterThan(0);
    }
  });

  it('every class has a synthetic trigger fixture', () => {
    for (const cls of ALL_CLASSES) {
      expect(TRIGGERS[cls]).toBeDefined();
      expect(TRIGGERS[cls].baseline_state).toBeTruthy();
      expect(TRIGGERS[cls].current_state).toBeTruthy();
      expect(TRIGGERS[cls].delta).toBeTruthy();
      expect(TRIGGERS[cls].why_now).toBeTruthy();
      expect(TRIGGERS[cls].outcome_class).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Deterministic action resolution
// ---------------------------------------------------------------------------

describe('resolveTriggerAction — deterministic mapping', () => {
  it('decay → send_message (with recipient)', () => {
    expect(resolveTriggerAction('decay', true)).toBe('send_message');
  });
  it('decay → write_document (no recipient)', () => {
    expect(resolveTriggerAction('decay', false)).toBe('write_document');
  });
  it('risk → send_message (with recipient)', () => {
    expect(resolveTriggerAction('risk', true)).toBe('send_message');
  });
  it('engagement_collapse → send_message (with recipient)', () => {
    expect(resolveTriggerAction('engagement_collapse', true)).toBe('send_message');
  });
  it('relationship_dropout → send_message (with recipient)', () => {
    expect(resolveTriggerAction('relationship_dropout', true)).toBe('send_message');
  });
  it('deadline_staleness → send_message (with recipient)', () => {
    expect(resolveTriggerAction('deadline_staleness', true)).toBe('send_message');
  });
  it('deadline_staleness → write_document (no recipient)', () => {
    expect(resolveTriggerAction('deadline_staleness', false)).toBe('write_document');
  });
  it('drift → send_message (with recipient), do_nothing (no recipient)', () => {
    expect(resolveTriggerAction('drift', true)).toBe('send_message');
    expect(resolveTriggerAction('drift', false)).toBe('do_nothing');
  });
  it('goal_velocity_mismatch → send_message (with recipient), do_nothing (no recipient)', () => {
    expect(resolveTriggerAction('goal_velocity_mismatch', true)).toBe('send_message');
    expect(resolveTriggerAction('goal_velocity_mismatch', false)).toBe('do_nothing');
  });
  it('exposure → write_document always', () => {
    expect(resolveTriggerAction('exposure', true)).toBe('write_document');
    expect(resolveTriggerAction('exposure', false)).toBe('write_document');
  });
  it('avoidance → write_document always', () => {
    expect(resolveTriggerAction('avoidance', true)).toBe('write_document');
    expect(resolveTriggerAction('avoidance', false)).toBe('write_document');
  });
  it('behavioral_pattern → send_message with recipient, write_document without', () => {
    expect(resolveTriggerAction('behavioral_pattern', true)).toBe('send_message');
    expect(resolveTriggerAction('behavioral_pattern', false)).toBe('write_document');
  });
});

// ---------------------------------------------------------------------------
// 3. TRIGGER_CONTEXT prompt block — structure
// ---------------------------------------------------------------------------

describe('buildTriggerContextBlock', () => {
  it('includes all required fields', () => {
    for (const [cls, trigger] of Object.entries(TRIGGERS) as [DiscrepancyClass, TriggerMetadata][]) {
      const block = buildTriggerContextBlock(cls, trigger);
      expect(block).toContain('TRIGGER_CONTEXT');
      expect(block).toContain(`type: ${cls}`);
      expect(block).toContain(`baseline: ${trigger.baseline_state}`);
      expect(block).toContain(`current: ${trigger.current_state}`);
      expect(block).toContain(`delta: ${trigger.delta}`);
      expect(block).toContain(`timeframe: ${trigger.timeframe}`);
      expect(block).toContain(`why_now: ${trigger.why_now}`);
      expect(block).toContain(`outcome_class: ${trigger.outcome_class}`);
      expect(block).toContain('locked_action:');
      expect(block).toContain('artifact_shape:');
      expect(block).toContain('TRIGGER RULES');
      expect(block).toContain('Banned phrases');
    }
  });

  it('includes formatted delta_metrics when evidenceJson is provided', () => {
    const block = buildTriggerContextBlock('engagement_collapse', TRIGGERS.engagement_collapse, {
      evidenceJson: '{"baseline":"3/14d","delta_pct":-67}',
    });
    expect(block).toContain('delta_metrics');
    expect(block).toContain('baseline');
    expect(block).toContain('-67');
    expect(block).toContain('EVIDENCE_DELTA');
    expect(block).toMatch(/delta_pct=-67/);
  });

  it('includes EVIDENCE_DELTA on decay when evidenceJson encodes delta_pct', () => {
    const block = buildTriggerContextBlock('decay', TRIGGERS.decay, {
      evidenceJson:
        '{"baseline":"8 exchanges/90d","current":"0 in 14d","delta_pct":-100,"timeframe":"14d"}',
    });
    expect(block).toContain('EVIDENCE_DELTA');
    expect(block).toMatch(/delta_pct=-100/);
    expect(block).toMatch(/timeframe=14d/);
  });

  it('delta-based triggers include delta in the prompt rules', () => {
    const block = buildTriggerContextBlock('engagement_collapse', TRIGGERS.engagement_collapse);
    expect(block).toContain('67% drop in engagement rate');
  });
});

// ---------------------------------------------------------------------------
// 4. Artifact validation — enforcement per trigger class
// ---------------------------------------------------------------------------

describe('validateTriggerArtifact — enforcement', () => {
  // GOOD artifact: passes all checks
  it('PASS: decay trigger with valid send_message artifact', () => {
    const result = validateTriggerArtifact(
      'decay',
      TRIGGERS.decay,
      'After 8 exchanges over the past months, there has been complete silence for 45 days. Can you meet for coffee Thursday to discuss the partnership proposal?',
      'send_message',
      'Alice Smith',
    );
    expect(result.pass).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('FAIL: decay artifact that pastes pipeline metrics (→, /14d, interactions total)', () => {
    const bad =
      'We went from 6 interactions total, ~0.2/14d baseline → 0. Reply by 2026-04-08 with 6 → 0 (silence after 6 interactions). Can you confirm?';
    expect(artifactContainsDecayPipelineLeak(bad)).toBe(true);
    const result = validateTriggerArtifact('decay', TRIGGERS.decay, bad, 'send_message', 'Pat');
    expect(result.pass).toBe(false);
    expect(result.violations.some(v => v.includes('decay_pipeline_metric_echo'))).toBe(true);
  });

  // BAD: wrong action type
  it('FAIL: decay trigger with wrong action_type', () => {
    const result = validateTriggerArtifact(
      'decay',
      TRIGGERS.decay,
      'After silence for 45 days. Can you meet Thursday?',
      'schedule_block', // wrong — should be send_message
      'Alice Smith',
    );
    expect(result.pass).toBe(false);
    expect(result.violations.some(v => v.includes('action_mismatch'))).toBe(true);
  });

  // BAD: contains banned phrase
  it('FAIL: artifact with banned phrase "just checking in"', () => {
    const result = validateTriggerArtifact(
      'risk',
      TRIGGERS.risk,
      'Hi, just checking in after our last 22 interactions. How are things?',
      'send_message',
      'Bob',
    );
    expect(result.pass).toBe(false);
    expect(result.violations.some(v => v.includes('banned_phrase'))).toBe(true);
  });

  // BAD: no explicit ask
  it('FAIL: artifact with no explicit ask', () => {
    const result = validateTriggerArtifact(
      'exposure',
      TRIGGERS.exposure,
      'The Q2 budget proposal commitment has no artifact with 3 days remaining. The deadline approaches.',
      'write_document',
      'Budget Team',
    );
    expect(result.pass).toBe(false);
    expect(result.violations.some(v => v.includes('missing_explicit_ask'))).toBe(true);
  });

  // GOOD: drift trigger now requires send_message (external action)
  it('PASS: drift trigger with valid send_message artifact', () => {
    const result = validateTriggerArtifact(
      'drift',
      TRIGGERS.drift,
      'Your stated priority is Series A funding, but zero observable action has been taken. Can you send the updated term sheet by Friday so we can schedule 3 investor meetings this week?',
      'send_message',
      'Investor Relations Lead',
    );
    expect(result.pass).toBe(true);
  });

  // BAD: drift artifact uses hedging language
  it('FAIL: drift trigger with hedging "you might want to"', () => {
    const result = validateTriggerArtifact(
      'drift',
      TRIGGERS.drift,
      'You have zero observable action on Series A. You might want to consider reaching out to investors.',
      'send_message',
      'Investor',
    );
    expect(result.pass).toBe(false);
    expect(result.violations.some(v => v.includes('banned_phrase'))).toBe(true);
  });

  // GOOD: engagement_collapse with send_message
  it('PASS: engagement_collapse with explicit ask referencing delta', () => {
    const result = validateTriggerArtifact(
      'engagement_collapse',
      TRIGGERS.engagement_collapse,
      'Our engagement has dropped 67% over the last 14 days compared to our 90-day baseline. Are we still aligned on the project timeline? Can you confirm by Wednesday?',
      'send_message',
      'Partner',
    );
    expect(result.pass).toBe(true);
  });

  // GOOD: deadline_staleness with consequence
  it('PASS: deadline_staleness with consequence and time pressure', () => {
    const result = validateTriggerArtifact(
      'deadline_staleness',
      TRIGGERS.deadline_staleness,
      'The commitment has been stalled for 5 days with only 2 days remaining. Can you send the deliverable draft by end of day tomorrow? Without it, the client review will slip.',
      'send_message',
      'Team Lead',
    );
    expect(result.pass).toBe(true);
  });

  // GOOD: avoidance trigger
  it('PASS: avoidance trigger with forcing function', () => {
    const result = validateTriggerArtifact(
      'avoidance',
      TRIGGERS.avoidance,
      'This commitment has been stalled for 21 days without externalization. The deadline is in 5 days. Decision: either complete the draft today or escalate to your manager. Please choose one by 5pm.',
      'write_document',
      null,
    );
    expect(result.pass).toBe(true);
  });

  // BAD: avoidance with "no rush"
  it('FAIL: avoidance with banned phrase "no rush"', () => {
    const result = validateTriggerArtifact(
      'avoidance',
      TRIGGERS.avoidance,
      'The commitment is stalled for 21 days. No rush, but when you get a chance, please take a look.',
      'write_document',
      null,
    );
    expect(result.pass).toBe(false);
    expect(result.violations.some(v => v.includes('banned_phrase'))).toBe(true);
  });

  // write_document fallback for send_message trigger without recipient
  it('PASS: decay trigger falls back to write_document when no recipient', () => {
    const result = validateTriggerArtifact(
      'decay',
      TRIGGERS.decay,
      'After 8 interactions and 45 days of silence, this relationship needs attention. Draft a reconnection message referencing the last discussion topic. Please finalize by Friday.',
      'write_document', // fallback because no recipient
      null,
    );
    expect(result.pass).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. Full sweep: every trigger class produces a non-empty mapping
// ---------------------------------------------------------------------------

describe('Full sweep: all 9 classes have deterministic, non-empty rules', () => {
  const ALL_CLASSES: DiscrepancyClass[] = [
    'decay', 'exposure', 'drift', 'avoidance', 'risk',
    'engagement_collapse', 'relationship_dropout', 'deadline_staleness', 'goal_velocity_mismatch',
    'behavioral_pattern',
  ];

  for (const cls of ALL_CLASSES) {
    it(`${cls}: primary_action is send_message or write_document (no branching)`, () => {
      const rule = TRIGGER_ACTION_MAP[cls];
      expect(['send_message', 'write_document', 'make_decision']).toContain(rule.primary_action);
      // No do_nothing, no wait_rationale — triggers must produce action
      expect(rule.primary_action).not.toBe('do_nothing');
      expect(rule.primary_action).not.toBe('wait_rationale');
    });

    it(`${cls}: has banned phrases (no generic rendering)`, () => {
      const rule = TRIGGER_ACTION_MAP[cls];
      expect(rule.banned_phrases.length).toBeGreaterThan(0);
    });

    it(`${cls}: required_elements includes explicit_ask`, () => {
      const rule = TRIGGER_ACTION_MAP[cls];
      expect(rule.required_elements).toContain('explicit_ask');
    });

    it(`${cls}: required_elements includes trigger_delta_reference`, () => {
      const rule = TRIGGER_ACTION_MAP[cls];
      expect(rule.required_elements).toContain('trigger_delta_reference');
    });
  }
});
