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

describe('artifact quality gold set v1.2', () => {
  it('rejects every bad fixture with a deterministic reason', () => {
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
      expect(result.passes, item.id).toBe(false);
      expect(result.reasons, item.id).toContain(item.expectedReason);
    }
  });

  it('allows every good fixture that still fits the command-center wedge', () => {
    const allowedFixtures = GOOD_ARTIFACT_GOLD_SET_V1_2.filter((item) => (
      item.id !== 'good_skip_suppression_decision'
    ));
    const results = allowedFixtures.map((item) => ({
      item,
      result: evaluateArtifactQualityGate({
        directive: item.directive,
        artifact: item.artifact,
        sourceFacts: item.sourceFacts,
        now: item.now ?? new Date('2026-04-28T12:00:00.000Z'),
      }),
    }));

    expect(results).toHaveLength(9);
    for (const { item, result } of results) {
      expect(result.passes, `${item.id}: ${result.reasons.join(',')}`).toBe(true);
      expect(result.category, item.id).toBe(item.expectedCategory);
      expect(result.commandCenterClass, item.id).not.toBeNull();
      expect(result.reasons).toEqual([]);
    }
  });

  it('does not count suppression output as a saveable artifact', () => {
    const suppressionCase = GOOD_ARTIFACT_GOLD_SET_V1_2.find((item) => (
      item.id === 'good_skip_suppression_decision'
    ));
    expect(suppressionCase).toBeDefined();

    const result = evaluateArtifactQualityGate({
      directive: suppressionCase!.directive,
      artifact: suppressionCase!.artifact,
      sourceFacts: suppressionCase!.sourceFacts,
      now: suppressionCase!.now ?? new Date('2026-04-28T12:00:00.000Z'),
    });

    expect(result.passes).toBe(false);
    expect(result.commandCenterClass).toBeNull();
    expect(result.safeArtifactMessage).toBe('No safe artifact today.');
    expect(result.reasons).toContain('outside_command_center_scope');
  });

  it('treats stale interview prep as suppression behavior, not a good artifact', () => {
    const result = evaluateArtifactQualityGate({
      directive: STALE_INTERVIEW_SUPPRESSION_FIXTURE.directive,
      artifact: STALE_INTERVIEW_SUPPRESSION_FIXTURE.artifact,
      now: STALE_INTERVIEW_SUPPRESSION_FIXTURE.now,
    });

    expect(result.passes).toBe(false);
    expect(result.reasons).toContain('stale_event');
    expect(result.category).not.toBe('ROLE_FIT_PACKET');
  });

  it('keeps fail-safe alerts separate from artifact unblocking', () => {
    const current = summarizeArtifactQualityRun([
      { passes: false, category: null, reasons: ['generic_coaching'] },
      { passes: false, category: null, reasons: ['summary_only'] },
    ]);

    expect(evaluateArtifactQualityFailSafe({ current, deliveredLast24h: 0 })).toEqual({
      status: 'RED',
      rejectRate: 1,
      reason: 'all_artifacts_rejected_and_zero_delivered_24h',
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

describe('Brandon command-center artifact wedge', () => {
  it('blocks off-wedge candidates before generation when no approved artifact class is visible', () => {
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
      'outside_command_center_scope',
    ]));
    expect(result.commandCenterClass).toBeNull();
  });

  it('allows pre-generation document candidates only when they map to an approved command-center class', () => {
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
    expect(result.commandCenterClass).toBe('BENEFITS_PAYMENT_ADMIN_ACTION_PACKET');
    expect(result.reasons).toEqual([]);
  });

  it('fails write_document artifacts that fit a class label but still hand homework back to the user', () => {
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

    expect(result.passes).toBe(false);
    expect(result.reasons).toEqual(expect.arrayContaining([
      'prepare_instead_of_finished_work',
    ]));
  });

  it('allows only the five command-center artifact classes', () => {
    const cases = [
      {
        expectedClass: 'INTERVIEW_ROLE_FIT_PACKET',
        directive: {
          action_type: 'write_document' as const,
          directive: 'Save the role-fit packet for the ES Benefits Technician interview.',
          reason: 'The interview thread and resume facts support a ready answer.',
          evidence: [{ description: 'Source Email: ES Benefits Technician interview details from Darlene Craig.' }],
        },
        artifact: {
          type: 'document',
          title: 'ES Benefits Technician role-fit packet',
          content: 'Source Email: Darlene Craig sent ES Benefits Technician interview details. Resume source: eligibility documentation, customer service, and compliance follow-through. First-person answer: I am strongest where accuracy and calm service both matter. I have handled customer questions, documented eligibility outcomes, and followed compliance steps without losing the person on the other side. Use this answer as-is for the role-fit question.',
        },
      },
      {
        expectedClass: 'FOLLOW_UP_EMAIL_DRAFT',
        directive: {
          action_type: 'send_message' as const,
          directive: 'Draft the follow-up email to Darlene for review only.',
          reason: 'The recruiter asked for confirmation before the interview deadline.',
          evidence: [{ description: 'Source Email: Darlene Craig requested ES Benefits Technician interview confirmation.' }],
        },
        artifact: {
          type: 'email',
          to: 'darlene@example.com',
          subject: 'Confirming ES Benefits Technician interview',
          body: 'Hi Darlene,\n\nThank you for the ES Benefits Technician interview details. Could you confirm whether the May 2 at 10 AM PT slot is still the right time and whether there is anything specific you want me to have ready?\n\nThanks,\nBrandon',
        },
      },
      {
        expectedClass: 'DEADLINE_RISK_DECISION_BRIEF',
        directive: {
          action_type: 'write_document' as const,
          directive: 'Save the deadline risk decision brief.',
          reason: 'A job-search decision has to close before the Friday deadline.',
          evidence: [{ description: 'Source Email: CHC availability request competes with ES Benefits interview preparation by Friday.' }],
        },
        artifact: {
          type: 'document',
          title: 'CHC availability deadline decision brief',
          content: 'Source Email: CHC asked for availability this week. Calendar source: ES Benefits interview preparation window closes Friday. Decision: decline any CHC shift that overlaps the interview window. Criteria: preserve the higher-upside interview while keeping CHC warm. Deadline: reply before Friday noon. Next action: send availability after the interview window closes.',
        },
      },
      {
        expectedClass: 'BENEFITS_PAYMENT_ADMIN_ACTION_PACKET',
        directive: {
          action_type: 'write_document' as const,
          directive: 'Save the benefits payment admin action packet.',
          reason: 'A benefits payment deadline needs a concrete response packet.',
          evidence: [{ description: 'Source Email: benefits office requested payment verification before May 5.' }],
        },
        artifact: {
          type: 'document',
          title: 'Benefits payment verification action packet',
          content: 'Source Email: benefits office requested payment verification before May 5. Admin action: submit the payment confirmation number and attach the receipt. Deadline: May 5 before 5 PM PT. Risk: missing the deadline can pause benefit processing. Exact message: I am attaching the receipt and confirmation number for review. Next action: save the receipt, send the verification, and mark the deadline closed.',
        },
      },
      {
        expectedClass: 'CALENDAR_CONFLICT_RESOLUTION_BRIEF',
        directive: {
          action_type: 'write_document' as const,
          directive: 'Save the calendar conflict resolution brief.',
          reason: 'Two calendar events overlap today and require one resolved move.',
          evidence: [{ description: 'Calendar source: Comprehensive Healthcare phone screen overlaps with ES Benefits prep block today.' }],
        },
        artifact: {
          type: 'document',
          title: 'Calendar conflict resolution brief',
          content: 'Calendar source: Comprehensive Healthcare phone screen overlaps with ES Benefits prep block today. Conflict: the two calendar blocks overlap at 3 PM PT. Decision: keep the interview phone screen and move the prep block after 4 PM PT. Criteria: external interview time beats movable prep time. Deadline: resolve before 2 PM PT today. Next action: move the prep block and keep the phone screen unchanged.',
        },
      },
    ];

    for (const item of cases) {
      const result = evaluateArtifactQualityGate(item);
      expect(result.passes, `${item.expectedClass}: ${result.reasons.join(',')}`).toBe(true);
      expect(result.commandCenterClass).toBe(item.expectedClass);
      expect(result.safeArtifactMessage).toBeNull();
    }
  });

  it('returns the safe no-artifact message for everything outside the wedge', () => {
    const blockedCases = [
      {
        name: 'generic morning summary',
        directive: {
          action_type: 'write_document' as const,
          directive: 'Create the morning summary.',
          reason: 'Daily overview.',
          evidence: [{ description: 'Inbox summary: several unrelated messages arrived.' }],
        },
        artifact: {
          type: 'document',
          title: 'Morning summary',
          content: 'Source: inbox. Summary: three emails arrived, one calendar event is coming up, and several tasks may need review later.',
        },
      },
      {
        name: 'relationship silence artifact',
        directive: {
          action_type: 'write_document' as const,
          directive: 'Create the relationship silence decision map.',
          reason: 'Jane has not replied for 19 days.',
          evidence: [{ description: 'Source Email: Jane has not replied for 19 days after a personal catch-up thread.' }],
        },
        artifact: {
          type: 'document',
          title: 'Relationship silence decision map',
          content: 'Source Email: Jane has not replied for 19 days. Decision: decide whether the relationship is still active. Criteria: silence may mean the relationship needs closure. Deadline: today. Next action: resolve whether to move on.',
        },
      },
      {
        name: 'homework artifact',
        directive: {
          action_type: 'write_document' as const,
          directive: 'Prepare for the interview.',
          reason: 'Interview is upcoming.',
          evidence: [{ description: 'Calendar source: job interview is tomorrow.' }],
        },
        artifact: {
          type: 'document',
          title: 'Interview prep homework',
          content: 'Source: calendar. Prepare STAR examples, review the website, research the company, and practice questions before the interview.',
        },
      },
      {
        name: 'broad autonomy artifact',
        directive: {
          action_type: 'write_document' as const,
          directive: 'Create an autonomous weekly plan.',
          reason: 'Many unrelated signals exist.',
          evidence: [{ description: 'Signals include inbox, calendar, and tasks.' }],
        },
        artifact: {
          type: 'document',
          title: 'Autonomous weekly operating plan',
          content: 'Source: inbox and calendar. Decision: monitor all inboxes, research options, schedule time, draft replies, and decide which life areas need attention this week.',
        },
      },
    ];

    for (const item of blockedCases) {
      const result = evaluateArtifactQualityGate(item);
      expect(result.passes, item.name).toBe(false);
      expect(result.commandCenterClass, item.name).toBeNull();
      expect(result.safeArtifactMessage, item.name).toBe('No safe artifact today.');
    }
  });
});

describe('owner money-shot artifact suite', () => {
  it('blocks owner-shaped failures before they can become demo artifacts', () => {
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
      expect(result.passes, item.id).toBe(false);
      expect(result.reasons, item.id).toContain(item.expectedReason);
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
