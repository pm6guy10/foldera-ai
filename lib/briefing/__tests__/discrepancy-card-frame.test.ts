import { describe, expect, it } from 'vitest';
import {
  buildDiscrepancyFrameFromActionPayload,
  buildDiscrepancyFrameFromDirective,
  deriveDiscrepancyPatternMemory,
  evaluateDiscrepancyCardFrame,
} from '../discrepancy-card-frame';
import type { ConvictionDirective } from '../types';

const GOOD_FRAME = {
  claim: 'The MAS3 interview packet is ready for final owner review.',
  contradiction:
    'The source thread says Alex confirmed the April 29 interview, but the packet still has no named owner for the role-fit proof bundle.',
  risk: 'If the owner is not assigned today, the interview packet may miss the same-day prep window.',
  evidence: [
    'Gmail: Alex confirmed the April 29 interview and shared the panel details.',
    'Drive: the role-fit bundle still has no owner field filled in.',
  ],
  next_action:
    'Assign Holly as packet owner and have her confirm the role-fit proof bundle before 4 PM PT today.',
  why_now: 'The interview prep window closes today.',
  source_refs: ['gmail:alex-interview-confirmed', 'drive:mas3-role-fit-bundle'],
  confidence: 0.88,
  pattern_keys: ['discrepancy:interview_role_fit', 'action:write_document'],
};

describe('discrepancy-card frame contract', () => {
  it('rejects generic follow-up sludge without evidence-backed discrepancy fields', () => {
    const result = evaluateDiscrepancyCardFrame({
      claim: 'Follow up with Keri.',
      contradiction: '',
      risk: '',
      evidence: [],
      next_action: 'Follow up with Keri.',
      why_now: 'It has been a while.',
      source_refs: [],
      confidence: 0.6,
      pattern_keys: ['generic:follow_up'],
    });

    expect(result.passes).toBe(false);
    expect(result.blocked_by).toEqual(
      expect.arrayContaining([
        'missing_contradiction',
        'missing_evidence',
        'missing_risk',
        'missing_source_refs',
        'generic_helper_language',
      ]),
    );
    expect(result.rejection_reason).toContain('missing_contradiction');
  });

  it('rejects a plausible artifact when one required frame field is missing', () => {
    const result = evaluateDiscrepancyCardFrame({
      ...GOOD_FRAME,
      risk: '',
    });

    expect(result.passes).toBe(false);
    expect(result.blocked_by).toContain('missing_risk');
  });

  it('passes strong discrepancy cards with all required fields', () => {
    const result = evaluateDiscrepancyCardFrame(GOOD_FRAME);

    expect(result.passes).toBe(true);
    expect(result.quality_score).toBeGreaterThanOrEqual(0.8);
    expect(result.pattern_keys).toEqual(GOOD_FRAME.pattern_keys);
    expect(result.rejection_reason).toBeNull();
  });

  it('keeps the weak-risk bar while accepting deadline exposure framed as real risk', () => {
    const oldReminderDefense = evaluateDiscrepancyCardFrame({
      claim: 'Commitment due in 0d: Submit high-quality .docx documents',
      contradiction:
        'Expected: commitment accepted, but current state has no execution artifact with 0 days remaining.',
      risk: 'Due in 0 day(s) with zero artifacts - this is not a reminder, it is an exposure gap',
      evidence: [
        'Commitment: Submit high-quality .docx documents for document collection project ($50 per accepted document).',
        'due_at=2026-05-15T00:00:00+00:00, days_until_due=0, status=active',
      ],
      next_action:
        'Write the document-submission decision memo with owner, next action, and same-day deadline.',
      why_now: 'Due in 0 day(s) with zero artifacts - this is not a reminder, it is an exposure gap',
      source_refs: ['commitment:1d0e3ecb-899c-4ec1-96d0-748485678dfe'],
      confidence: 0.45,
      pattern_keys: ['discrepancy:exposure', 'candidate:discrepancy', 'action:write_document'],
    });

    expect(oldReminderDefense.passes).toBe(false);
    expect(oldReminderDefense.blocked_by).toEqual(
      expect.arrayContaining(['weak_risk', 'reminder_without_risk']),
    );

    const realRisk = evaluateDiscrepancyCardFrame({
      claim: 'Commitment due in 0d: Submit high-quality .docx documents',
      contradiction:
        'Expected: commitment accepted, but current state has no execution artifact with 0 days remaining.',
      risk:
        'Deadline is in 0 day(s) with zero artifacts; missing the submission window risks losing the accepted commitment opportunity.',
      evidence: [
        'Commitment: Submit high-quality .docx documents for document collection project ($50 per accepted document).',
        'due_at=2026-05-15T00:00:00+00:00, days_until_due=0, status=active',
      ],
      next_action:
        'Write the document-submission decision memo with owner, next action, and same-day deadline.',
      why_now:
        'Deadline is in 0 day(s) with zero artifacts; missing the submission window risks losing the accepted commitment opportunity.',
      source_refs: ['commitment:1d0e3ecb-899c-4ec1-96d0-748485678dfe'],
      confidence: 0.45,
      pattern_keys: ['discrepancy:exposure', 'candidate:discrepancy', 'action:write_document'],
    });

    expect(realRisk.passes).toBe(true);
    expect(realRisk.blocked_by).toEqual([]);
  });

  it('rejects title-shaped next actions that do not name a concrete move', () => {
    const result = evaluateDiscrepancyCardFrame({
      ...GOOD_FRAME,
      claim: 'Commitment due in 6d: Virtual event to announce new Developer Platform primitives',
      next_action: 'Commitment due in 6d: Virtual event to announce new Developer Platform primitives',
    });

    expect(result.passes).toBe(false);
    expect(result.blocked_by).toContain('weak_next_action');
  });

  it('builds the display frame from persisted execution receipts instead of prose guessing', () => {
    const frame = buildDiscrepancyFrameFromActionPayload({
      id: 'action-1',
      directive: 'Finalize the MAS3 interview packet owner.',
      reason: 'The prep window closes today.',
      evidence: [{ description: 'Gmail confirmed the interview panel.' }],
      executionResult: {
        discrepancy_card: GOOD_FRAME,
      },
      artifact: {
        type: 'document',
        title: 'MAS3 packet owner decision',
        body: 'Finished packet body.',
      },
    });

    expect(frame).toEqual(GOOD_FRAME);
  });

  it('can build a frame from directive metadata when source facts are already present', () => {
    const directive: ConvictionDirective = {
      directive: 'Finalize the MAS3 interview packet owner.',
      action_type: 'write_document',
      confidence: 88,
      reason:
        'The April 29 interview is confirmed, but the packet has no named owner before the prep window closes.',
      discrepancyClass: 'behavioral_pattern',
      evidence: [
        {
          type: 'signal',
          description:
            'Gmail confirmed the April 29 interview while the packet owner field remains blank.',
        },
      ],
      generationLog: {
        outcome: 'selected',
        stage: 'generation',
        reason: 'selected',
        candidateFailureReasons: [],
        candidateDiscovery: {
          candidateCount: 1,
          suppressedCandidateCount: 0,
          selectionMargin: null,
          selectionReason: null,
          failureReason: null,
          topCandidates: [
            {
              id: 'disc-1',
              rank: 1,
              candidateType: 'discrepancy',
              discrepancyClass: 'behavioral_pattern',
              actionType: 'write_document',
              score: 8,
              scoreBreakdown: {
                stakes: 3,
                urgency: 0.8,
                tractability: 0.7,
                freshness: 0.9,
                actionTypeRate: 0.5,
                entityPenalty: 0,
              },
              targetGoal: null,
              sourceSignals: [
                {
                  kind: 'signal',
                  id: 'sig-1',
                  source: 'gmail',
                  summary:
                    'Alex confirmed the interview but the packet owner is still blank.',
                  occurredAt: new Date().toISOString(),
                },
              ],
              decision: 'selected',
              decisionReason: 'best discrepancy',
            },
          ],
        },
      },
    };

    const frame = buildDiscrepancyFrameFromDirective(directive, {
      type: 'document',
      title: 'MAS3 packet owner decision',
      content:
        'Assign Holly as packet owner and confirm the role-fit bundle by 4 PM PT today.',
    });

    expect(frame).not.toBeNull();
    expect(frame?.claim).toContain('Finalize the MAS3 interview packet owner');
    expect(frame?.contradiction).toContain('but');
    expect(frame?.evidence).toContain(
      'Gmail confirmed the April 29 interview while the packet owner field remains blank.',
    );
    expect(evaluateDiscrepancyCardFrame(frame).passes).toBe(true);
  });

  it('derives reusable pattern memory from existing action history', () => {
    const memory = deriveDiscrepancyPatternMemory([
      {
        status: 'executed',
        action_type: 'write_document',
        directive_text: 'MAS3 packet owner decision',
        execution_result: {
          discrepancy_quality: { pattern_keys: ['discrepancy:interview_role_fit'] },
        },
      },
      {
        status: 'skipped',
        skip_reason: 'not_relevant',
        action_type: 'send_message',
        directive_text: 'Follow up with old thread',
        execution_result: {
          discrepancy_quality: { pattern_keys: ['generic:follow_up'] },
        },
      },
      {
        status: 'skipped',
        skip_reason: 'not_relevant',
        action_type: 'send_message',
        directive_text: 'Check in again',
        execution_result: {
          discrepancy_card: { pattern_keys: ['generic:follow_up'] },
        },
      },
    ]);

    expect(memory.boostedPatternKeys).toContain('discrepancy:interview_role_fit');
    expect(memory.penalizedPatternKeys).toContain('generic:follow_up');

    const generic = evaluateDiscrepancyCardFrame({
      ...GOOD_FRAME,
      pattern_keys: ['generic:follow_up'],
    }, { patternMemory: memory });

    expect(generic.passes).toBe(false);
    expect(generic.blocked_by).toContain('noisy_pattern_memory');
  });

  it('does not learn noisy memory from operational auto-suppressed proof rows', () => {
    const memory = deriveDiscrepancyPatternMemory([
      {
        status: 'skipped',
        skip_reason: 'Auto-suppressed pending action for dev brain-receipt force-fresh run.',
        action_type: 'write_document',
        directive_text: 'Event is 3 days away with no calendar block or preparation.',
        execution_result: {
          discrepancy_quality: {
            pattern_keys: ['discrepancy:exposure', 'candidate:discrepancy', 'action:write_document'],
          },
        },
      },
    ]);

    expect(memory.penalizedPatternKeys).not.toContain('discrepancy:exposure');
    expect(memory.blockedPatternKeys).not.toContain('discrepancy:exposure');
    expect(memory.blockedPatternKeys).not.toContain('candidate:discrepancy');
  });

  it('does not hard-block broad candidate category keys from no-send receipts', () => {
    const memory = deriveDiscrepancyPatternMemory([
      {
        status: 'skipped',
        action_type: 'do_nothing',
        directive_text: 'Nothing cleared the bar today after evaluating candidates.',
        execution_result: {
          discrepancy_quality: {
            blocked_by: ['missing_risk'],
            rejection_reason: 'missing_risk',
            pattern_keys: ['candidate:discrepancy', 'action:do_nothing'],
          },
        },
      },
    ]);

    expect(memory.blockedPatternKeys).not.toContain('candidate:discrepancy');
  });

  it('does not treat valid pending discrepancy cards with empty blockers as noisy memory', () => {
    const memory = deriveDiscrepancyPatternMemory([
      {
        status: 'pending_approval',
        action_type: 'write_document',
        directive_text: 'WorkSourceWA account activity closeout',
        execution_result: {
          discrepancy_quality: {
            passes: true,
            blocked_by: [],
            rejection_reason: null,
            pattern_keys: [
              'discrepancy:deadline_staleness',
              'discrepancy:exposure',
              'action:write_document',
            ],
          },
        },
      },
    ]);

    expect(memory.penalizedPatternKeys).not.toContain('discrepancy:deadline_staleness');
    expect(memory.blockedPatternKeys).not.toContain('discrepancy:deadline_staleness');
    expect(memory.blockedPatternKeys).not.toContain('discrepancy:exposure');
  });
});
