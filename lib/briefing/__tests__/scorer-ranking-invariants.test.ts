import { describe, expect, it } from 'vitest';
import {
  applyRankingInvariants,
  DISCREPANCY_FAILURE_SUPPRESSION_CLASS_SET,
  passesTop3RankingInvariants,
  type ScoredLoop,
} from '../scorer';

const BASE_BREAKDOWN = {
  stakes: 3,
  urgency: 0.7,
  tractability: 0.7,
  freshness: 1,
  actionTypeRate: 0.5,
  entityPenalty: 0,
};

function candidate(overrides: Partial<ScoredLoop> & { id: string; score: number }): ScoredLoop {
  return {
    id: overrides.id,
    type: overrides.type ?? 'signal',
    title: overrides.title ?? 'Candidate',
    content: overrides.content ?? 'Candidate content with concrete detail.',
    suggestedActionType: overrides.suggestedActionType ?? 'send_message',
    matchedGoal: overrides.matchedGoal ?? { text: 'Land role offer by May', priority: 1, category: 'career' },
    score: overrides.score,
    breakdown: overrides.breakdown ?? BASE_BREAKDOWN,
    relatedSignals: overrides.relatedSignals ?? ['Signal with outcome evidence'],
    sourceSignals: overrides.sourceSignals ?? [{ kind: 'signal', summary: 'Signal with outcome evidence' }],
    confidence_prior: overrides.confidence_prior ?? 70,
    ...overrides,
  };
}

describe('applyRankingInvariants', () => {
  it('weak generic candidate cannot rank #1 over discrepancy', () => {
    const before = [
      candidate({
        id: 'generic-task',
        score: 4.8,
        type: 'commitment',
        title: 'Follow up with hiring team',
        content: 'Follow up with hiring team.',
      }),
      candidate({
        id: 'discrepancy',
        score: 4.1,
        type: 'discrepancy',
        suggestedActionType: 'write_document',
        title: 'Behavior drift: interview signals rose while application output dropped',
        content: 'Interview momentum up 3x while outbound applications dropped to zero ahead of deadline.',
      }),
    ];

    expect([...before].sort((a, b) => b.score - a.score)[0]?.id).toBe('generic-task');

    const { ranked } = applyRankingInvariants(before);
    expect(ranked[0]?.id).toBe('discrepancy');
  });

  it('duplicate-like candidates collapse to one survivor', () => {
    const rankedInput = [
      candidate({
        id: 'dup-a',
        score: 3.9,
        title: 'Send update to hiring manager on reference packet',
        content: 'Send update to hiring manager on reference packet before Monday.',
      }),
      candidate({
        id: 'dup-b',
        score: 3.8,
        title: 'Send update to hiring manager on references packet',
        content: 'Send update to hiring manager on references packet before Monday morning.',
      }),
      candidate({
        id: 'discrepancy',
        score: 3.5,
        type: 'discrepancy',
        suggestedActionType: 'write_document',
        title: 'Timing asymmetry: deadlines tightening while prep time shrinks',
        content: 'Decision window narrowed from 9 days to 3 days with no updated plan.',
      }),
    ];

    const { ranked } = applyRankingInvariants(rankedInput);
    const positive = ranked.filter((c) => c.score > 0).map((c) => c.id);
    expect(positive).toContain('dup-a');
    expect(positive).toContain('discrepancy');
    expect(positive).not.toContain('dup-b');
  });

  it('discrepancy beats generic task every time when both exist', () => {
    const input = [
      candidate({
        id: 'task',
        score: 5.0,
        type: 'commitment',
        title: 'Follow up with team',
        content: 'Follow up with team this week.',
      }),
      candidate({
        id: 'risk-discrepancy',
        score: 3.6,
        type: 'discrepancy',
        suggestedActionType: 'write_document',
        title: 'Unseen risk: approval blocker surfaced in latest thread',
        content: 'Approval thread now cites missing supervisor reference while offer timeline continues.',
      }),
    ];

    const { ranked } = applyRankingInvariants(input);
    expect(ranked[0]?.id).toBe('risk-discrepancy');
  });

  it('thread-backed relationship send_message beats internal write_document discrepancy (no forced discrepancy steal)', () => {
    const input = [
      candidate({
        id: 'ext-keri',
        score: 6.0,
        type: 'relationship',
        entityName: 'Keri Nopens',
        suggestedActionType: 'send_message',
        title: 'Send outreach email to Keri Nopens',
        content: 'Outreach to Keri with concrete reference timeline and next step.',
        relatedSignals: ['Thread: Keri agreed to supervisor reference for MAS3'],
      }),
      candidate({
        id: 'drift-doc',
        score: 4.5,
        type: 'discrepancy',
        discrepancyClass: 'goal_velocity_mismatch',
        suggestedActionType: 'write_document',
        title: 'Goal momentum lost on Foldera revenue work',
        content: 'Signal velocity on stated revenue goal dropped versus prior window.',
        matchedGoal: { text: 'Build Foldera into a revenue-generating product.', priority: 1, category: 'project' },
      }),
    ];

    const { ranked, diagnostics } = applyRankingInvariants(input);
    const extD = diagnostics.find((d) => d.id === 'ext-keri');
    expect(extD?.hardRejectReasons ?? []).toEqual([]);
    const top = ranked.filter((c) => c.score > 0).sort((a, b) => b.score - a.score)[0];
    expect(top?.id).toBe('ext-keri');
  });

  it('obvious first-layer advice is penalized below high-signal discrepancy', () => {
    const input = [
      candidate({
        id: 'obvious',
        score: 4.7,
        type: 'signal',
        title: 'Check in with recruiter',
        content: 'Check in with recruiter.',
      }),
      candidate({
        id: 'high-signal-discrepancy',
        score: 3.4,
        type: 'discrepancy',
        suggestedActionType: 'write_document',
        title: 'Contradiction: cash-constrained goal with rising nonessential spend',
        content: 'Cash runway target tightened while discretionary spend rose 22% across two weeks.',
        relatedSignals: [
          'Budget thread documents target runway change',
          'Spend report shows discretionary increase',
        ],
      }),
    ];

    const { ranked } = applyRankingInvariants(input);
    expect(ranked[0]?.id).toBe('high-signal-discrepancy');
  });

  it('discrepancy titles that match obvious_first_layer patterns still pass invariants', () => {
    const disc: ScoredLoop = candidate({
      id: 'disc-follow-up-shaped',
      score: 3.8,
      type: 'discrepancy',
      suggestedActionType: 'write_document',
      discrepancyClass: 'meeting_open_thread',
      title: 'Follow up on open thread before meeting',
      content: 'Meeting starts in 2h; last inbound thread has no owner reply.',
      matchedGoal: null,
      relatedSignals: [],
      sourceSignals: [{ kind: 'signal', id: 'sig-1' }],
    });
    expect(passesTop3RankingInvariants(disc)).toBe(true);
  });

  it('calendar/admin discrepancy without goal anchor does not force-rank over stronger candidate', () => {
    const input = [
      candidate({
        id: 'strong-outbound',
        score: 5.4,
        type: 'relationship',
        entityName: 'Brandon Kapp',
        suggestedActionType: 'send_message',
        title: 'Reply to Brandon on active decision thread',
        content: 'Decision thread with Brandon has concrete ask and unresolved approval dependency.',
      }),
      candidate({
        id: 'meeting-admin',
        score: 4.8,
        type: 'discrepancy',
        discrepancyClass: 'meeting_open_thread',
        suggestedActionType: 'send_message',
        matchedGoal: null,
        title: 'Calendar meeting has no execution artifacts',
        content: 'Meeting starts today and calendar metadata is incomplete.',
      }),
    ];

    const { ranked, diagnostics } = applyRankingInvariants(input);
    expect(ranked[0]?.id).toBe('strong-outbound');
    const meetingDiag = diagnostics.find((d) => d.id === 'meeting-admin');
    expect(meetingDiag?.penaltyReasons).toContain('calendar_admin_discrepancy_no_priority_boost');
  });

  it('decisive scheduling pressure outranks generic prep document before generation', () => {
    const input = [
      candidate({
        id: 'generic-prep-doc',
        score: 2.4,
        type: 'discrepancy',
        discrepancyClass: 'behavioral_pattern',
        suggestedActionType: 'write_document',
        title: 'MAS3 interview week prep memo',
        content: 'Build a broad prep document for interview themes and talking points.',
        sourceSignals: [{ kind: 'signal', summary: 'Interview prep theme across calendar and email' }],
      }),
      candidate({
        id: 'scheduling-action',
        score: 1.6,
        type: 'discrepancy',
        discrepancyClass: 'exposure',
        suggestedActionType: 'write_document',
        title: 'Commitment due in 3d: MAS3 Project interview',
        content:
          'You committed to the MAS3 Project interview. The interview is April 20, 2026, ' +
          'the slot is not yet scheduled on careers.wa.gov, and the required next step is to self-schedule ' +
          'and confirm appointment. Interview slots are reserved on a first-come-first-served basis.',
        sourceSignals: [
          {
            kind: 'commitment',
            summary:
              'MAS3 Project interview: authorization forms sent April 15; scheduling still required before April 20.',
          },
        ],
        trigger: {
          baseline_state: 'Commitment accepted: MAS3 Project interview',
          current_state: 'Due in 3 day(s), no execution artifact exists and no interview slot is scheduled',
          delta: 'commitment -> no artifact, no confirmed appointment (3d remaining)',
          timeframe: '3 day(s) to deadline',
          outcome_class: 'deadline',
          why_now:
            'The scheduling instruction is explicit and slots are first-come-first-served, so the next artifact must move appointment confirmation now.',
        },
      }),
    ];

    expect([...input].sort((a, b) => b.score - a.score)[0]?.id).toBe('generic-prep-doc');

    const { ranked, diagnostics } = applyRankingInvariants(input);
    expect(ranked[0]?.id).toBe('scheduling-action');
    expect(diagnostics.find((d) => d.id === 'scheduling-action')?.penaltyReasons)
      .toContain('decisive_scheduling_forced_over_generic_prep_document');
  });

  it('normal prep document can still outrank exposure when scheduling pressure is absent', () => {
    const input = [
      candidate({
        id: 'normal-prep-doc',
        score: 2.4,
        type: 'discrepancy',
        discrepancyClass: 'behavioral_pattern',
        suggestedActionType: 'write_document',
        title: 'Interview prep memo',
        content: 'Build a prep document for role themes and talking points.',
        sourceSignals: [{ kind: 'signal', summary: 'Interview prep theme across calendar and email' }],
      }),
      candidate({
        id: 'ordinary-exposure',
        score: 1.6,
        type: 'discrepancy',
        discrepancyClass: 'exposure',
        suggestedActionType: 'write_document',
        title: 'Commitment due in 3d: practice interview answers',
        content:
          'You committed to practice interview answers and it is due in 3 days. ' +
          'No execution artifact exists yet.',
        sourceSignals: [{ kind: 'commitment', summary: 'Practice interview answers' }],
      }),
    ];

    const { ranked, diagnostics } = applyRankingInvariants(input);
    expect(ranked[0]?.id).toBe('normal-prep-doc');
    expect(diagnostics.find((d) => d.id === 'ordinary-exposure')?.penaltyReasons)
      .not.toContain('decisive_scheduling_forced_over_generic_prep_document');
  });

  it('urgent interview outcome artifact outranks relationship maintenance and abstract theme discrepancies', () => {
    const input = [
      candidate({
        id: 'alex-decay',
        score: 1.359,
        type: 'discrepancy',
        discrepancyClass: 'decay',
        suggestedActionType: 'send_message',
        matchedGoal: null,
        title: 'Fading connection: alex crisler',
        content:
          'Your relationship with Alex Crisler has gone silent after 10 past interactions. ' +
          'No contact in 7 days. Baseline was 2.1 interactions per 14 days.',
        breakdown: {
          ...BASE_BREAKDOWN,
          stakes: 4,
          urgency: 0.75,
        },
        relatedSignals: [],
        sourceSignals: [{ kind: 'relationship', summary: 'Alex Crisler: 10 total interactions, last seen 7 days ago' }],
      }),
      candidate({
        id: 'deadline-theme',
        score: 1.358,
        type: 'discrepancy',
        discrepancyClass: 'behavioral_pattern',
        suggestedActionType: 'write_document',
        matchedGoal: null,
        title: 'deadline appears across 8 contacts: alex crisler, wellfound, cursor team',
        content: 'The same deadline theme repeats across 8 contacts and hides a broad process risk.',
        breakdown: {
          ...BASE_BREAKDOWN,
          stakes: 4,
          urgency: 0.8,
        },
      }),
      candidate({
        id: 'dshs-interview',
        score: 1.299,
        type: 'discrepancy',
        discrepancyClass: 'exposure',
        suggestedActionType: 'write_document',
        matchedGoal: null,
        title: 'Commitment due in 3d: Interview; DSHS HCLA Developmental Disabilities Case/Resource Manager',
        content:
          'You committed to the DSHS HCLA Developmental Disabilities Case/Resource Manager interview. ' +
          'The interview is already scheduled this week and no execution artifact exists yet.',
        breakdown: {
          ...BASE_BREAKDOWN,
          stakes: 4,
          urgency: 0.7,
        },
        sourceSignals: [
          { kind: 'commitment', summary: 'Interview; DSHS HCLA Developmental Disabilities Case/Resource Manager' },
        ],
      }),
    ];

    const { ranked, diagnostics } = applyRankingInvariants(input);
    expect(ranked[0]?.id).toBe('dshs-interview');
    expect(diagnostics.find((d) => d.id === 'dshs-interview')?.penaltyReasons)
      .toContain('priority_career_outcome_forced_over_relationship_maintenance');
    expect(diagnostics.find((d) => d.id === 'deadline-theme')?.penaltyReasons)
      .toContain('relationship_maintenance_yielded_to_priority_career_outcome');
  });

  it('only behavioral_pattern discrepancies are subject to failure-suppression class set', () => {
    expect(DISCREPANCY_FAILURE_SUPPRESSION_CLASS_SET.has('behavioral_pattern')).toBe(true);
    expect(DISCREPANCY_FAILURE_SUPPRESSION_CLASS_SET.has('decay')).toBe(false);
    expect(DISCREPANCY_FAILURE_SUPPRESSION_CLASS_SET.has('unresolved_intent')).toBe(false);
  });

  it('top 3 after invariants are all actionable SEND/WRITE-quality candidates', () => {
    const input = [
      candidate({
        id: 'discrepancy-1',
        score: 4.2,
        type: 'discrepancy',
        suggestedActionType: 'write_document',
        title: 'Behavior drift: outcome-critical thread stalled before deadline',
        content: 'Critical approval thread has no owner response within 4 days of deadline.',
      }),
      candidate({
        id: 'strong-commitment',
        score: 4.0,
        type: 'commitment',
        title: 'Send signed packet to review board by 2026-04-02',
        content: 'Send signed packet to review board by 2026-04-02; board contact is panel@review.gov.',
      }),
      candidate({
        id: 'decision-frame',
        score: 3.6,
        type: 'signal',
        suggestedActionType: 'make_decision',
        title: 'Decide between two interview tracks with opposite risk profiles',
        content: 'Two interview tracks conflict on start date and reference requirements.',
      }),
      candidate({
        id: 'schedule-only',
        score: 4.5,
        type: 'signal',
        suggestedActionType: 'schedule',
        title: 'Schedule a 30 minute block to think',
        content: 'Schedule a 30 minute block to think about options.',
      }),
      candidate({
        id: 'generic-check',
        score: 4.4,
        type: 'signal',
        title: 'Check account status',
        content: 'Check account status update.',
      }),
    ];

    const { ranked } = applyRankingInvariants(input);
    const top3 = ranked.filter((c) => c.score > 0).slice(0, 3);
    expect(top3).toHaveLength(3);
    expect(top3.every((c) => passesTop3RankingInvariants(c))).toBe(true);
  });
});

