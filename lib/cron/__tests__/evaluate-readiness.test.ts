import { describe, expect, it } from 'vitest';
import { effectiveDiscrepancyClassForGates, evaluateReadiness, isSendWorthy } from '../daily-brief-generate';
import type { DailyBriefUserResult } from '../daily-brief-types';
import type { ConvictionArtifact, ConvictionDirective } from '@/lib/briefing/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSignalResult(
  code: DailyBriefUserResult['code'],
  success: boolean,
  freshSignals = 0,
  detail?: string,
): DailyBriefUserResult {
  return {
    code,
    success,
    detail,
    meta: { processed_fresh_signals_count: freshSignals },
  };
}

const NO_COOLDOWN = { recentDoNothingGeneratedAt: null };
const RECENT_DO_NOTHING = {
  recentDoNothingGeneratedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30 min ago
};
const EXPIRED_DO_NOTHING = {
  recentDoNothingGeneratedAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(), // 5h ago
};

// ---------------------------------------------------------------------------
// evaluateReadiness
// ---------------------------------------------------------------------------

describe('evaluateReadiness', () => {
  it('returns INSUFFICIENT_SIGNAL when signal_processing_failed', () => {
    const result = evaluateReadiness(
      makeSignalResult('signal_processing_failed', false, 0, 'processing error'),
      NO_COOLDOWN,
    );
    expect(result.decision).toBe('INSUFFICIENT_SIGNAL');
    expect(result.stage).toBe('system');
    expect(result.reason).toContain('processing error');
  });

  it('returns INSUFFICIENT_SIGNAL when stale_signal_backlog_remaining', () => {
    const result = evaluateReadiness(
      makeSignalResult('stale_signal_backlog_remaining', false),
      NO_COOLDOWN,
    );
    expect(result.decision).toBe('INSUFFICIENT_SIGNAL');
  });

  it('returns SEND when no_unprocessed_signals and no cooldown (signals already pre-processed)', () => {
    // Signals may have been processed by a prior sync step; entity summaries exist.
    // isSendWorthy() handles silence if the generator produces do_nothing.
    const result = evaluateReadiness(
      makeSignalResult('no_unprocessed_signals', true, 0),
      NO_COOLDOWN,
    );
    expect(result.decision).toBe('SEND');
  });

  it('returns NO_SEND when cooldown active and no fresh signals', () => {
    const result = evaluateReadiness(
      makeSignalResult('signals_caught_up', true, 0),
      RECENT_DO_NOTHING,
    );
    expect(result.decision).toBe('NO_SEND');
    expect(result.reason).toMatch(/no new signals/i);
  });

  it('returns SEND when signals_caught_up with fresh signals', () => {
    const result = evaluateReadiness(
      makeSignalResult('signals_caught_up', true, 12),
      NO_COOLDOWN,
    );
    expect(result.decision).toBe('SEND');
  });

  it('returns SEND when no_unprocessed_signals but fresh signals > 0 (processed externally)', () => {
    const result = evaluateReadiness(
      makeSignalResult('no_unprocessed_signals', true, 5),
      NO_COOLDOWN,
    );
    expect(result.decision).toBe('SEND');
  });

  it('returns SEND when cooldown expired (> 4h) even with zero fresh signals', () => {
    const result = evaluateReadiness(
      makeSignalResult('signals_caught_up', true, 0),
      EXPIRED_DO_NOTHING,
    );
    expect(result.decision).toBe('SEND');
  });

  it('returns NO_SEND when no_unprocessed_signals and cooldown is active', () => {
    // No new signals processed AND do_nothing was recent → cooldown wins
    const result = evaluateReadiness(
      makeSignalResult('no_unprocessed_signals', true, 0),
      RECENT_DO_NOTHING,
    );
    expect(result.decision).toBe('NO_SEND');
  });

  it('returns SEND when signals_caught_up with fresh signals and expired cooldown', () => {
    const result = evaluateReadiness(
      makeSignalResult('signals_caught_up', true, 3),
      EXPIRED_DO_NOTHING,
    );
    expect(result.decision).toBe('SEND');
  });
});

// ---------------------------------------------------------------------------
// isSendWorthy
// ---------------------------------------------------------------------------

function makeDirective(overrides: Partial<ConvictionDirective> = {}): ConvictionDirective {
  return {
    directive: 'Can you confirm by 4 PM PT today whether we approve contract filing and assign the submission owner?',
    action_type: 'send_message',
    confidence: 82,
    reason: 'If we miss today\'s cutoff, the filing window slips and contract execution risk increases.',
    evidence: [{ type: 'email', summary: 'Contract email from Alice 5 days ago', date: '2026-03-20' }],
    generationLog: null,
    ...overrides,
  } as unknown as ConvictionDirective;
}

function makeArtifact(overrides: Partial<ConvictionArtifact> = {}): ConvictionArtifact {
  return {
    type: 'drafted_email',
    subject: 'Decision needed today: contract filing owner by 4 PM PT',
    body: 'Hi Alice,\n\nCan you confirm by 4 PM PT today whether we should file the contract now, and name the owner for submission? If we miss this cutoff, filing slips and execution risk increases.\n\nThanks,\nBrandon',
    to: 'alice@example.com',
    ...overrides,
  } as unknown as ConvictionArtifact;
}

describe('effectiveDiscrepancyClassForGates', () => {
  it('returns schedule_conflict when top candidate id uses discrepancy_conflict_ prefix', () => {
    const d = makeDirective({
      generationLog: {
        outcome: 'selected',
        stage: 'generation',
        reason: 'ok',
        candidateFailureReasons: [],
        candidateDiscovery: {
          candidateCount: 2,
          suppressedCandidateCount: 0,
          selectionMargin: 0.1,
          selectionReason: 'x',
          failureReason: null,
          topCandidates: [
            {
              id: 'discrepancy_conflict_a-b-c-d-e_f-g-h-i-j',
              rank: 1,
              candidateType: 'discrepancy',
              actionType: 'write_document',
              score: 2,
              scoreBreakdown: {
                stakes: 2,
                urgency: 0.5,
                tractability: 0.7,
                freshness: 1,
                actionTypeRate: 0.5,
                entityPenalty: 0,
              },
              targetGoal: null,
              sourceSignals: [],
              decision: 'selected',
              decisionReason: '',
            },
          ],
        },
      },
    });
    expect(effectiveDiscrepancyClassForGates(d)).toBe('schedule_conflict');
  });
});

describe('isSendWorthy', () => {
  it('returns worthy:true for a valid send_message directive', () => {
    const result = isSendWorthy(makeDirective(), makeArtifact());
    expect(result.worthy).toBe(true);
  });

  it('blocks do_nothing directives', () => {
    const result = isSendWorthy(makeDirective({ action_type: 'do_nothing' }), makeArtifact());
    expect(result.worthy).toBe(false);
    expect(result.reason).toBe('do_nothing_directive');
  });

  it('allows first-morning welcome path via firstMorningBypass', () => {
    const result = isSendWorthy(
      makeDirective({
        action_type: 'write_document',
        confidence: 78,
        evidence: [{ type: 'goal', description: 'Test goal' }],
        generationLog: {
          outcome: 'selected',
          stage: 'persistence',
          reason: 'first_morning_welcome',
          candidateFailureReasons: [],
          candidateDiscovery: null,
          firstMorningBypass: true,
        },
      }),
      {
        type: 'document',
        title: 'Welcome',
        content: 'x'.repeat(400),
      } as unknown as ConvictionArtifact,
    );
    expect(result.worthy).toBe(true);
    expect(result.reason).toBe('first_morning_welcome');
  });

  it('blocks send_message directives below send threshold (< 65)', () => {
    const result = isSendWorthy(makeDirective({ confidence: 64 }), makeArtifact());
    expect(result.worthy).toBe(false);
    expect(result.reason).toBe('below_send_threshold');
  });

  it('allows send_message at confidence exactly 65 (lowered threshold)', () => {
    const result = isSendWorthy(makeDirective({ confidence: 65 }), makeArtifact());
    expect(result.worthy).toBe(true);
  });

  it('blocks non-send_message directive at confidence 65 (still uses 70 threshold)', () => {
    const result = isSendWorthy(makeDirective({ confidence: 65, action_type: 'write_document' }), makeArtifact());
    expect(result.worthy).toBe(false);
    expect(result.reason).toBe('below_send_threshold');
  });

  it('blocks directives with no evidence', () => {
    const result = isSendWorthy(makeDirective({ evidence: [] }), makeArtifact());
    expect(result.worthy).toBe(false);
    expect(result.reason).toBe('no_evidence');
  });

  it('blocks artifacts with placeholder content [NAME]', () => {
    const result = isSendWorthy(
      makeDirective(),
      makeArtifact({ body: 'Hi [NAME], following up on the contract.' }),
    );
    expect(result.worthy).toBe(false);
    expect(result.reason).toBe('placeholder_content');
  });

  it('blocks artifacts with placeholder [RECIPIENT]', () => {
    const result = isSendWorthy(
      makeDirective(),
      makeArtifact({ to: '[RECIPIENT]' }),
    );
    expect(result.worthy).toBe(false);
    expect(result.reason).toBe('placeholder_content');
  });

  it('blocks artifacts with [INSERT placeholder]', () => {
    const result = isSendWorthy(
      makeDirective(),
      makeArtifact({ body: 'Please [INSERT relevant detail] before replying.' }),
    );
    expect(result.worthy).toBe(false);
    expect(result.reason).toBe('placeholder_content');
  });

  it('blocks write_document artifacts with [specific date] bracket', () => {
    const result = isSendWorthy(
      makeDirective({ action_type: 'write_document', confidence: 80 }),
      {
        type: 'document',
        title: 'Calendar',
        content: '1. Text them: can we meet [specific date]?',
      } as unknown as import('@/lib/briefing/types').ConvictionArtifact,
    );
    expect(result.worthy).toBe(false);
    expect(result.reason).toBe('placeholder_content');
  });

  it('allows a finished internal execution brief with no external recipient', () => {
    const result = isSendWorthy(
      makeDirective({
        action_type: 'write_document',
        confidence: 80,
        directive: 'Write the answer architecture for the Care Coordinator interview before April 15.',
        reason: 'The interview is on April 15 and a generic answer weakens fit before the window closes.',
      }),
      {
        type: 'document',
        document_purpose: 'interview answer architecture',
        target_reader: 'candidate',
        title: 'Care Coordinator — role-specific answer architecture',
        content: [
          'Use this in the April 15 phone screen when they ask why you are a fit for the Care Coordinator role.',
          '',
          'Deadline: April 15.',
          '',
          'This is a real interview risk: if this answer stays generic, you lose the clearest fit signal before April 15 and the panel only hears motivation.',
          '',
          'Answer script:',
          'Open with the community-based client support, the reimbursed travel, and the resource coordination already named in the recruiter thread.',
        ].join('\n'),
      } as unknown as import('@/lib/briefing/types').ConvictionArtifact,
    );

    expect(result.worthy).toBe(true);
  });

  it('blocks an internal execution brief that is only a prep checklist', () => {
    const result = isSendWorthy(
      makeDirective({
        action_type: 'write_document',
        confidence: 80,
        directive: 'Write the answer architecture for the Care Coordinator interview before April 15.',
        reason: 'The interview is on April 15 and a generic answer weakens fit before the window closes.',
      }),
      {
        type: 'document',
        document_purpose: 'interview answer architecture',
        target_reader: 'candidate',
        title: 'Care Coordinator interview prep',
        content: [
          '1. Prepare two client stories for the panel.',
          '2. Review the organization website before the interview.',
          '3. Research the latest policy changes and gather examples.',
          'Deadline: April 15.',
        ].join('\n'),
      } as unknown as import('@/lib/briefing/types').ConvictionArtifact,
    );

    expect(result.worthy).toBe(false);
    expect(result.reason).toBe('decision_enforcement_missing_explicit_ask');
  });

  it('allows send_message at confidence 70 (above threshold)', () => {
    const result = isSendWorthy(makeDirective({ confidence: 70 }), makeArtifact());
    expect(result.worthy).toBe(true);
  });

  it('blocks do_nothing even with high confidence', () => {
    const result = isSendWorthy(makeDirective({ action_type: 'do_nothing', confidence: 95 }), makeArtifact());
    expect(result.worthy).toBe(false);
    expect(result.reason).toBe('do_nothing_directive');
  });

  // --- New checks ---

  it('blocks send_message with no @ in recipient', () => {
    const result = isSendWorthy(makeDirective(), makeArtifact({ to: 'Alice' }));
    expect(result.worthy).toBe(false);
    expect(result.reason).toBe('invalid_recipient');
  });

  it('blocks send_message with empty to field', () => {
    const result = isSendWorthy(makeDirective(), makeArtifact({ to: '' }));
    expect(result.worthy).toBe(false);
    expect(result.reason).toBe('invalid_recipient');
  });

  it('blocks send_message to Outlier workflow inbox wfe-*@outlier.ai', () => {
    const result = isSendWorthy(
      makeDirective(),
      makeArtifact({ to: 'wfe-6921e4b356ccff5a5f336b22@outlier.ai' }),
    );
    expect(result.worthy).toBe(false);
    expect(result.reason).toBe('automated_routing_recipient');
  });

  it('blocks send_message with body shorter than 30 chars', () => {
    const result = isSendWorthy(makeDirective(), makeArtifact({ body: 'Short.' }));
    expect(result.worthy).toBe(false);
    expect(result.reason).toBe('body_too_short');
  });

  it('blocks send_message with vague subject "Follow up"', () => {
    const result = isSendWorthy(makeDirective(), makeArtifact({ subject: 'Follow up' }));
    expect(result.worthy).toBe(false);
    expect(result.reason).toBe('vague_subject');
  });

  it('blocks send_message with vague subject "Following up"', () => {
    const result = isSendWorthy(makeDirective(), makeArtifact({ subject: 'Following up' }));
    expect(result.worthy).toBe(false);
    expect(result.reason).toBe('vague_subject');
  });

  it('blocks subject "Following up on the contract" as passive tone when the artifact has no question mark', () => {
    // Default makeArtifact body ends with a question — that triggers sendMessageHasQuestion and strips
    // passive_or_ignorable per generator.ts. Use a declarative body so the subject line is the signal.
    const result = isSendWorthy(
      makeDirective(),
      makeArtifact({
        subject: 'Following up on the contract',
        body: 'Hi Alice, we need alignment on contract filing before end of day. Please confirm the submission owner so we avoid missing the filing window. If we miss the cutoff, execution risk increases. Thanks, Brandon',
      }),
    );
    expect(result.worthy).toBe(false);
    expect(result.reason).toBe('decision_enforcement_passive_or_ignorable_tone');
  });

  it('blocks artifact with generic opener "I hope this email finds you well"', () => {
    const result = isSendWorthy(
      makeDirective(),
      makeArtifact({ body: 'I hope this email finds you well. I wanted to discuss the permit.' }),
    );
    expect(result.worthy).toBe(false);
    expect(result.reason).toBe('generic_language');
  });

  it('blocks artifact with "just wanted to reach out"', () => {
    const result = isSendWorthy(
      makeDirective(),
      makeArtifact({ body: 'Hi Alice, just wanted to reach out about the contract status.' }),
    );
    expect(result.worthy).toBe(false);
    expect(result.reason).toBe('generic_language');
  });

  it('allows a specific, grounded body with no generic language', () => {
    const result = isSendWorthy(
      makeDirective(),
      makeArtifact({
        body: 'Alice, can you confirm by 2 PM PT today whether the signed permit appeal draft is approved, and name who owns final filing? If we miss this cutoff, the filing window slips.',
      }),
    );
    expect(result.worthy).toBe(true);
  });

  // --- Self-address guard ---

  it('blocks send_message addressed to the user\'s own email', () => {
    const userEmails = new Set(['b-kapp@outlook.com', 'brandon@foldera.ai']);
    const result = isSendWorthy(
      makeDirective(),
      makeArtifact({ to: 'b-kapp@outlook.com' }),
      userEmails,
    );
    expect(result.worthy).toBe(false);
    expect(result.reason).toBe('self_addressed');
  });

  it('blocks self-addressed email with case mismatch', () => {
    const userEmails = new Set(['b-kapp@outlook.com']);
    const result = isSendWorthy(
      makeDirective(),
      makeArtifact({ to: 'B-Kapp@Outlook.com' }),
      userEmails,
    );
    expect(result.worthy).toBe(false);
    expect(result.reason).toBe('self_addressed');
  });

  it('allows send_message to an external recipient when userEmails provided', () => {
    const userEmails = new Set(['b-kapp@outlook.com']);
    const result = isSendWorthy(
      makeDirective(),
      makeArtifact({ to: 'alice@example.com' }),
      userEmails,
    );
    expect(result.worthy).toBe(true);
  });

  it('does not block when userEmails is undefined (backwards compatible)', () => {
    const result = isSendWorthy(
      makeDirective(),
      makeArtifact({ to: 'b-kapp@outlook.com' }),
    );
    expect(result.worthy).toBe(true);
  });

  it('does not block when userEmails is empty set', () => {
    const result = isSendWorthy(
      makeDirective(),
      makeArtifact({ to: 'b-kapp@outlook.com' }),
      new Set(),
    );
    expect(result.worthy).toBe(true);
  });

  // --- Weak winner auto-fail ---

  it('blocks "just a heads up" soft contact maintenance', () => {
    const result = isSendWorthy(
      makeDirective(),
      makeArtifact({ body: 'Hi Alice, just a heads up about the upcoming changes to the project timeline and deliverables.' }),
    );
    expect(result.worthy).toBe(false);
    expect(result.reason).toBe('weak_winner_no_pressure');
  });

  it('blocks "keeping you in the loop" no-pressure language', () => {
    const result = isSendWorthy(
      makeDirective(),
      makeArtifact({ body: 'Alice, keeping you in the loop on the latest developments with the contract review process.' }),
    );
    expect(result.worthy).toBe(false);
    expect(result.reason).toBe('weak_winner_no_pressure');
  });

  it('blocks "no action needed" explicit non-pressure', () => {
    const result = isSendWorthy(
      makeDirective(),
      makeArtifact({ body: 'Hi Alice, no action needed from your side. I just wanted to share the updated figures for Q2.' }),
    );
    expect(result.worthy).toBe(false);
    expect(result.reason).toBe('weak_winner_no_pressure');
  });

  it('blocks "for your awareness" passive language', () => {
    const result = isSendWorthy(
      makeDirective(),
      makeArtifact({ body: 'Sending this for your awareness — the vendor contract auto-renews in two weeks.' }),
    );
    expect(result.worthy).toBe(false);
    expect(result.reason).toBe('weak_winner_no_pressure');
  });

  it('allows a pressure-bearing artifact with deadline and explicit ask', () => {
    const result = isSendWorthy(
      makeDirective(),
      makeArtifact({
        subject: 'Decision needed: contract filing owner by 4 PM PT today',
        body: 'Alice, can you confirm by 4 PM PT today whether we should file the contract now, and name the owner for submission? If we miss this cutoff, filing slips and execution risk increases.',
      }),
    );
    expect(result.worthy).toBe(true);
  });

  it('blocks schedule_conflict write_document when artifact is a numbered owner checklist', () => {
    const discovery = {
      candidateCount: 5,
      suppressedCandidateCount: 0,
      selectionMargin: 0.1,
      selectionReason: null,
      failureReason: null,
      topCandidates: [
        {
          id: 'disc-1',
          rank: 1,
          candidateType: 'discrepancy',
          discrepancyClass: 'schedule_conflict' as const,
          actionType: 'write_document' as const,
          score: 2.1,
          scoreBreakdown: {
            stakes: 2,
            urgency: 0.5,
            tractability: 0.7,
            freshness: 1,
            actionTypeRate: 0.5,
            entityPenalty: 0,
          },
          targetGoal: null,
          sourceSignals: [],
          decision: 'selected' as const,
          decisionReason: '',
        },
      ],
    };
    const result = isSendWorthy(
      makeDirective({
        action_type: 'write_document',
        confidence: 80,
        directive: 'Pick one block on 2026-04-02.',
        reason: 'Two calendar items collide.',
        discrepancyClass: 'schedule_conflict',
        generationLog: {
          outcome: 'selected',
          stage: 'persistence',
          reason: 'ok',
          candidateFailureReasons: [],
          candidateDiscovery: discovery,
        },
        evidence: [{ type: 'signal', description: 'Calendar overlap detected' }],
      }),
      {
        type: 'document',
        title: 'Resolve overlap on 2026-04-02',
        content: '1. Open your calendar for 2026-04-02.\n2. Move the lower-priority block to another slot.',
      } as unknown as ConvictionArtifact,
    );
    expect(result.worthy).toBe(false);
    expect(result.reason).toBe('schedule_conflict_not_finished_outbound');
  });

  it('blocks schedule_conflict write_document with outbound message copy (MESSAGE TO)', () => {
    const discovery = {
      candidateCount: 5,
      suppressedCandidateCount: 0,
      selectionMargin: 0.1,
      selectionReason: null,
      failureReason: null,
      topCandidates: [
        {
          id: 'disc-1',
          rank: 1,
          candidateType: 'discrepancy',
          discrepancyClass: 'schedule_conflict' as const,
          actionType: 'write_document' as const,
          score: 2.1,
          scoreBreakdown: {
            stakes: 2,
            urgency: 0.5,
            tractability: 0.7,
            freshness: 1,
            actionTypeRate: 0.5,
            entityPenalty: 0,
          },
          targetGoal: null,
          sourceSignals: [],
          decision: 'selected' as const,
          decisionReason: '',
        },
      ],
    };
    const result = isSendWorthy(
      makeDirective({
        action_type: 'write_document',
        confidence: 80,
        directive: 'Pick one block on 2026-04-02.',
        reason: 'Two calendar items collide.',
        discrepancyClass: 'schedule_conflict',
        generationLog: {
          outcome: 'selected',
          stage: 'persistence',
          reason: 'ok',
          candidateFailureReasons: [],
          candidateDiscovery: discovery,
        },
        evidence: [{ type: 'signal', description: 'Calendar overlap detected' }],
      }),
      {
        type: 'document',
        title: 'Messages — 2026-04-02',
        content:
          'MESSAGE TO Pat:\n\nHi Pat — I am double-booked on 2026-04-02 (calendar conflict). Could we shift our sync to Wednesday afternoon?',
      } as unknown as ConvictionArtifact,
    );
    expect(result.worthy).toBe(false);
    expect(result.reason).toBe('schedule_conflict_not_finished_outbound');
  });

  it('rejects schedule_conflict write_document with grounded resolution note and ISO dates', () => {
    const discovery = {
      candidateCount: 5,
      suppressedCandidateCount: 0,
      selectionMargin: 0.1,
      selectionReason: null,
      failureReason: null,
      topCandidates: [
        {
          id: 'disc-1',
          rank: 1,
          candidateType: 'discrepancy',
          discrepancyClass: 'schedule_conflict' as const,
          actionType: 'write_document' as const,
          score: 2.1,
          scoreBreakdown: {
            stakes: 2,
            urgency: 0.5,
            tractability: 0.7,
            freshness: 1,
            actionTypeRate: 0.5,
            entityPenalty: 0,
          },
          targetGoal: null,
          sourceSignals: [],
          decision: 'selected' as const,
          decisionReason: '',
        },
      ],
    };
    const result = isSendWorthy(
      makeDirective({
        action_type: 'write_document',
        confidence: 80,
        directive: 'Pick one block on 2026-04-02.',
        reason: 'Two calendar items collide.',
        discrepancyClass: 'schedule_conflict',
        generationLog: {
          outcome: 'selected',
          stage: 'persistence',
          reason: 'ok',
          candidateFailureReasons: [],
          candidateDiscovery: discovery,
        },
        evidence: [{ type: 'signal', description: 'Calendar overlap detected' }],
      }),
      {
        type: 'document',
        title: 'Resolution — overlap 2026-04-02',
        content: `## Situation
Pat's sync and the vendor call both sit on 2026-04-02 in the same window.

## Conflicting commitments or risk
Overlapping blocks mean one invite must move or decline — trade-off is planning vs vendor cadence.

## Recommendation / decision
Move the vendor check-in to Wednesday afternoon; keep Pat's sync if it is the planning source of truth.

## Owner / next step
You confirm which event slides and notify Pat before 2026-04-01.

## Timing / deadline
Lock the call by 2026-04-01; conflict date is 2026-04-02.`,
      } as unknown as ConvictionArtifact,
    );
    expect(result.worthy).toBe(false);
    expect(result.reason).toBe('schedule_conflict_not_finished_outbound');
  });

  it('rejects schedule_conflict write_document when class is inferred from id and overlap language exists without numbered list', () => {
    const discovery = {
      candidateCount: 5,
      suppressedCandidateCount: 0,
      selectionMargin: 0.1,
      selectionReason: null,
      failureReason: null,
      topCandidates: [
        {
          id: 'discrepancy_conflict_55d2755f-7f3a-4d5d-bc41-03d57218adaf_bb5baac8-b4a7-4a84-8c61-c85ab5d15557',
          rank: 1,
          candidateType: 'discrepancy',
          actionType: 'write_document' as const,
          score: 2.1,
          scoreBreakdown: {
            stakes: 2,
            urgency: 0.5,
            tractability: 0.7,
            freshness: 1,
            actionTypeRate: 0.5,
            entityPenalty: 0,
          },
          targetGoal: null,
          sourceSignals: [],
          decision: 'selected' as const,
          decisionReason: '',
        },
      ],
    };
    const result = isSendWorthy(
      makeDirective({
        action_type: 'write_document',
        confidence: 80,
        directive: 'Resolve overlapping commitments on your calendar for 2026-04-02.',
        reason: 'Two calendar blocks overlap; communicate the trade-off.',
        generationLog: {
          outcome: 'selected',
          stage: 'persistence',
          reason: 'ok',
          candidateFailureReasons: [],
          candidateDiscovery: discovery,
        },
        evidence: [{ type: 'signal', description: 'Calendar overlap detected' }],
      }),
      {
        type: 'document',
        title: 'Calendar resolution — 2026-04-02',
        content: `## Situation
Chris's sync and the board prep session overlap on 2026-04-02.

## Conflicting commitments or risk
Double-booking risks missing board materials review.

## Recommendation / decision
Slide Chris's sync to Thursday morning; keep board prep fixed.

## Owner / next step
You tell Chris today so invites update before 2026-04-02.

## Timing / deadline
Confirm by 2026-04-01 EOD.`,
      } as unknown as ConvictionArtifact,
    );
    expect(result.worthy).toBe(false);
    expect(result.reason).toBe('schedule_conflict_not_finished_outbound');
  });
});
