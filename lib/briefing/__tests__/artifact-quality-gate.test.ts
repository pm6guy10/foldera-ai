import { describe, expect, it } from 'vitest';
import {
  evaluateCommandCenterCandidateGate,
  evaluateArtifactQualityFailSafe,
  evaluateArtifactQualityGate,
  summarizeArtifactQualityRun,
} from '../artifact-quality-gate';
import {
  BAD_ARTIFACT_GOLD_SET_V1_2,
  GOOD_ARTIFACT_GOLD_SET_V1_2,
  STALE_INTERVIEW_SUPPRESSION_FIXTURE,
} from './artifact-gold-set-v1-2.fixture';
import {
  OWNER_MONEY_SHOT_BAD_ARTIFACTS,
  OWNER_MONEY_SHOT_GOOD_ARTIFACT,
} from './owner-money-shot-artifact.fixture';

const SOFT_WARNING_REASONS = new Set([
  'no_source_grounding',
  'reminder_only',
  'summary_only',
  'generic_coaching',
  'prepare_instead_of_finished_work',
  'only_follow_up_check_in_or_monitor',
  'no_concrete_outcome',
]);

function isSoftWarning(reason: string | undefined): boolean {
  return Boolean(reason && SOFT_WARNING_REASONS.has(reason));
}

describe('artifact quality gold set v1.2', () => {
  it('keeps hard safety failures blocking while demoting quality failures to soft warnings', () => {
    const results = BAD_ARTIFACT_GOLD_SET_V1_2.map((item) => ({
      item,
      result: evaluateArtifactQualityGate({
        directive: item.directive,
        artifact: item.artifact,
        sourceFacts: item.sourceFacts,
        now: item.now ?? new Date('2026-04-28T12:00:00.000Z'),
      }),
    }));

    expect(results).toHaveLength(18);
    for (const { item, result } of results) {
      if (isSoftWarning(item.expectedReason)) {
        expect(result.passes, item.id).toBe(true);
        expect(result.reasons, item.id).toEqual([]);
        expect(result.soft_warnings, item.id).toContain(item.expectedReason);
        expect(result.safeArtifactMessage, item.id).toBeNull();
      } else {
        expect(result.passes, item.id).toBe(false);
        expect(result.reasons, item.id).toContain(item.expectedReason);
        expect(result.safeArtifactMessage, item.id).toBe('No safe artifact today.');
      }
    }
  });

  it('allows every good fixture without requiring a command-center class', () => {
    const results = GOOD_ARTIFACT_GOLD_SET_V1_2.map((item) => ({
      item,
      result: evaluateArtifactQualityGate({
        directive: item.directive,
        artifact: item.artifact,
        sourceFacts: item.sourceFacts,
        now: item.now ?? new Date('2026-04-28T12:00:00.000Z'),
      }),
    }));

    expect(results).toHaveLength(10);
    for (const { item, result } of results) {
      expect(result.passes, `${item.id}: ${result.reasons.join(',')}`).toBe(true);
      expect(result.category, item.id).toBe(item.expectedCategory);
      expect(result.reasons, item.id).toEqual([]);
      expect(result.safeArtifactMessage, item.id).toBeNull();
    }
  });

  it('treats stale interview prep as a hard safety block', () => {
    const result = evaluateArtifactQualityGate({
      directive: STALE_INTERVIEW_SUPPRESSION_FIXTURE.directive,
      artifact: STALE_INTERVIEW_SUPPRESSION_FIXTURE.artifact,
      now: STALE_INTERVIEW_SUPPRESSION_FIXTURE.now,
    });

    expect(result.passes).toBe(false);
    expect(result.reasons).toContain('stale_event');
    expect(result.soft_warnings.length).toBeGreaterThan(0);
    expect(result.category).not.toBe('ROLE_FIT_PACKET');
  });

  it('keeps fail-safe alerts separate from artifact unblocking', () => {
    const current = summarizeArtifactQualityRun([
      { passes: true, category: null, reasons: [], soft_warnings: ['generic_coaching'], safeArtifactMessage: null },
      { passes: true, category: null, reasons: [], soft_warnings: ['summary_only'], safeArtifactMessage: null },
    ]);

    expect(evaluateArtifactQualityFailSafe({ current, deliveredLast24h: 0 })).toEqual({
      status: 'GREEN',
      rejectRate: 0,
      reason: null,
    });

    expect(
      evaluateArtifactQualityFailSafe({
        current: { rejected: 9, allowed: 1, delivered: 1 },
        previous: { rejected: 6, allowed: 0, delivered: 0 },
        deliveredLast24h: 1,
      }),
    ).toEqual({
      status: 'YELLOW',
      rejectRate: 0.9,
      reason: 'reject_rate_above_85pct_two_runs',
    });
  });
});

describe('safety-only pre-generation candidate gate', () => {
  it('does not scope-lock off-wedge candidates before the LLM sees them', () => {
    const result = evaluateCommandCenterCandidateGate({
      recommendedAction: 'write_document',
      suggestedActionType: 'write_document',
      hasRealRecipient: false,
      candidateText: [
        'Morning summary for unrelated inbox and calendar signals',
        'Summary: three emails arrived, one calendar event is coming up, and several tasks may need review later.',
      ].join('\n'),
      sourceFacts: ['Inbox summary: several unrelated messages arrived.'],
    });

    expect(result.passes).toBe(true);
    expect(result.reasons).toEqual([]);
    expect(result.soft_warnings).toEqual(expect.arrayContaining(['summary_only']));
  });

  it('still blocks transactional sender decision pressure before generation', () => {
    const result = evaluateCommandCenterCandidateGate({
      recommendedAction: 'write_document',
      suggestedActionType: 'write_document',
      hasRealRecipient: false,
      candidateText: [
        'Resend relationship status and interview decision map',
        'From: Resend <onboarding@resend.dev>',
        'Subject: Welcome to Resend',
        'The sender has been silent for 19 days and may create professional risk before interview decisions are final.',
      ].join('\n'),
      sourceFacts: ['From: Resend <onboarding@resend.dev>', 'Subject: Welcome to Resend'],
    });

    expect(result.passes).toBe(false);
    expect(result.reasons).toEqual(expect.arrayContaining([
      'transactional_sender_decision_pressure',
      'relationship_silence_artifact',
    ]));
  });

  it('still blocks send_message candidates without a real recipient', () => {
    const result = evaluateCommandCenterCandidateGate({
      recommendedAction: 'send_message',
      suggestedActionType: 'send_message',
      hasRealRecipient: false,
      candidateText: 'Follow up with someone about the open decision by today.',
      sourceFacts: ['No grounded recipient email exists.'],
    });

    expect(result.passes).toBe(false);
    expect(result.reasons).toEqual(['action_type_mismatch']);
  });

  it('allows grounded pre-generation document candidates with no scope classification', () => {
    const result = evaluateCommandCenterCandidateGate({
      recommendedAction: 'write_document',
      suggestedActionType: 'write_document',
      hasRealRecipient: false,
      candidateText: [
        'Benefits payment verification action packet',
        'Source Email: benefits office requested payment verification before May 5.',
        'Admin action: submit the payment confirmation number and attach the receipt.',
        'Deadline: May 5 before 5 PM PT.',
      ].join('\n'),
      sourceFacts: ['Source Email: benefits office requested payment verification before May 5.'],
    });

    expect(result.passes).toBe(true);
    expect(result.reasons).toEqual([]);
  });
});

describe('safety-only post-generation artifact gate', () => {
  it('demotes homework and unfinished-work quality failures to soft warnings', () => {
    const result = evaluateArtifactQualityGate({
      directive: {
        action_type: 'write_document',
        directive: 'Save the benefits payment admin action packet.',
        reason: 'A benefits payment deadline needs tracking.',
        evidence: [{ description: 'Source Email: benefits office requested payment verification before May 5.' }],
      },
      artifact: {
        type: 'document',
        title: 'Benefits payment verification action packet',
        content: 'Source Email: benefits office requested payment verification before May 5. Admin action: review the benefits payment note, prepare the receipt, and consider what to submit before the deadline. Deadline: May 5 before 5 PM PT. Risk: processing could pause.',
      },
      sourceFacts: ['Source Email: benefits office requested payment verification before May 5.'],
    });

    expect(result.passes).toBe(true);
    expect(result.reasons).toEqual([]);
    expect(result.soft_warnings).toEqual(expect.arrayContaining([
      'prepare_instead_of_finished_work',
    ]));
  });

  it('does not turn off-wedge generated artifacts into hard no-send results', () => {
    const result = evaluateArtifactQualityGate({
      directive: {
        action_type: 'write_document',
        directive: 'Create the morning summary.',
        reason: 'Daily overview.',
        evidence: [{ description: 'Inbox summary: several unrelated messages arrived.' }],
      },
      artifact: {
        type: 'document',
        title: 'Morning summary',
        content: 'Source: inbox. Summary: three emails arrived, one calendar event is coming up, and several tasks may need review later.',
      },
    });

    expect(result.passes).toBe(true);
    expect(result.reasons).toEqual([]);
    expect(result.soft_warnings).toContain('summary_only');
    expect(result.safeArtifactMessage).toBeNull();
  });

  it('still blocks relationship-silence artifacts as hard failures', () => {
    const result = evaluateArtifactQualityGate({
      directive: {
        action_type: 'write_document',
        directive: 'Create the relationship silence decision map.',
        reason: 'Jane has not replied for 19 days.',
        evidence: [{ description: 'Source Email: Jane has not replied for 19 days after a personal catch-up thread.' }],
      },
      artifact: {
        type: 'document',
        title: 'Relationship silence decision map',
        content: 'Source Email: Jane has not replied for 19 days. Decision: decide whether the relationship is still active. Criteria: silence may mean the relationship needs closure. Deadline: today. Next action: resolve whether to move on.',
      },
    });

    expect(result.passes).toBe(false);
    expect(result.reasons).toContain('relationship_silence_artifact');
    expect(result.safeArtifactMessage).toBe('No safe artifact today.');
  });
});

describe('owner money-shot artifact suite', () => {
  it('blocks hard owner-shaped failures and softens quality-only failures', () => {
    const results = OWNER_MONEY_SHOT_BAD_ARTIFACTS.map((item) => ({
      item,
      result: evaluateArtifactQualityGate({
        directive: item.directive,
        artifact: item.artifact,
        sourceFacts: item.sourceFacts,
        strictActionTypeMatch: true,
        now: item.now ?? new Date('2026-04-29T12:00:00.000Z'),
      }),
    }));

    expect(results).toHaveLength(5);
    for (const { item, result } of results) {
      if (isSoftWarning(item.expectedReason)) {
        expect(result.passes, item.id).toBe(true);
        expect(result.reasons, item.id).toEqual([]);
        expect(result.soft_warnings, item.id).toContain(item.expectedReason);
      } else {
        expect(result.passes, item.id).toBe(false);
        expect(result.reasons, item.id).toContain(item.expectedReason);
      }
    }
  });

  it('passes one finished owner-shaped artifact that can be used without rewriting', () => {
    const result = evaluateArtifactQualityGate({
      directive: OWNER_MONEY_SHOT_GOOD_ARTIFACT.directive,
      artifact: OWNER_MONEY_SHOT_GOOD_ARTIFACT.artifact,
      sourceFacts: OWNER_MONEY_SHOT_GOOD_ARTIFACT.sourceFacts,
      now: OWNER_MONEY_SHOT_GOOD_ARTIFACT.now ?? new Date('2026-04-29T12:00:00.000Z'),
    });

    expect(result.passes, result.reasons.join(',')).toBe(true);
    expect(result.category).toBe(OWNER_MONEY_SHOT_GOOD_ARTIFACT.expectedCategory);
    expect(result.reasons).toEqual([]);
  });

  it('keeps action-type mismatch opt-in so legacy persistence does not block valid documents', () => {
    const actionMismatchCase = OWNER_MONEY_SHOT_BAD_ARTIFACTS.find((item) => (
      item.expectedReason === 'action_type_mismatch'
    ));
    expect(actionMismatchCase).toBeDefined();

    const result = evaluateArtifactQualityGate({
      directive: actionMismatchCase!.directive,
      artifact: actionMismatchCase!.artifact,
      sourceFacts: actionMismatchCase!.sourceFacts,
      now: actionMismatchCase!.now ?? new Date('2026-04-29T12:00:00.000Z'),
    });

    expect(result.reasons).not.toContain('action_type_mismatch');
  });
});
