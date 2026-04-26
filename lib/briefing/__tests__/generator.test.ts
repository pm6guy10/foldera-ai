import { describe, expect, it, vi } from 'vitest';
import { OWNER_USER_ID } from '@/lib/auth/constants';
import {
  applyPinnedGoals,
  getCandidateConstraintViolations,
  getDirectiveConstraintViolations,
} from '../pinned-constraints';
import {
  applyScheduleConflictCanonicalUserFacingCopy,
  enrichCandidateContext,
  extractJsonFromResponse,
  getDecisionEnforcementIssues,
  getFinancialPaymentToneValidationIssues,
  normalizeEmailArtifactContentField,
  parseGeneratedPayload,
  pickHighestStakesPaymentSignal,
  validateDirectiveForPersistence,
} from '../generator';
import type { CompressedSignal } from '../generator';
import type { ScoredLoop } from '../scorer';
import type { ConvictionDirective } from '../types';

function buildDirective(overrides: Partial<ConvictionDirective>): ConvictionDirective {
  return {
    directive: 'Draft email to Holly requesting specific reference talking points for your MAS3 candidacy.',
    action_type: 'send_message',
    confidence: 79,
    reason: 'MAS3 is in final stages and reference preparation could be the deciding factor between candidates.',
    evidence: [
      {
        type: 'signal',
        description:
          'Holly (holly@example.com) can strengthen the MAS3 reference package right now.',
      },
    ],
    ...overrides,
  };
}

describe('daily brief pinned constraints', () => {
  it('does not inject code-local pinned goals for any user (per-user data lives in DB)', () => {
    const goals = applyPinnedGoals(OWNER_USER_ID, []);
    expect(goals).toEqual([]);
    const merged = applyPinnedGoals(OWNER_USER_ID, [
      { goal_text: 'Ship the product', priority: 4, goal_category: 'project' },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.goal_text).toBe('Ship the product');
  });

  it('does not flag foldera_primary_conflict on long consulting-style candidate text', () => {
    const violations = getCandidateConstraintViolations(
      'aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee',
      'Decide whether to abandon the 10 paying users goal and commit fully to the MAS3 health job path, or block out specific daily hours for customer acquisition work starting tomorrow.',
    );
    expect(violations.map((violation) => violation.code)).not.toContain('foldera_primary_conflict');
  });

  it.each([
    {
      directive:
        'Should you abandon the 10 paying users goal and commit fully to the MAS3 health job path, or block out specific daily hours for customer acquisition work starting tomorrow?',
      reason: 'The goal-behavior misalignment is creating daily decision paralysis and preventing focus on either path.',
      artifact: {
        type: 'decision_frame',
        options: [
          { option: 'Commit fully to MAS3', weight: 0.6, rationale: 'Primary lane' },
          { option: 'Split time with customer acquisition', weight: 0.4, rationale: 'Fallback' },
        ],
        recommendation: 'Decide whether to commit fully to MAS3 or split time with customer acquisition.',
      },
    },
    {
      directive:
        'Have you considered drafting a 30-day revenue bridge plan with three specific client acquisition tactics for your consulting services?',
      reason: 'MAS3 outcome uncertainty combined with June delivery deadline requires immediate revenue diversification beyond state employment.',
      artifact: {
        type: 'decision_frame',
        options: [
          { option: 'Consulting bridge plan', weight: 0.7, rationale: 'Revenue hedge' },
          { option: 'Wait on MAS3 only', weight: 0.3, rationale: 'Higher focus' },
        ],
        recommendation: 'Use consulting services as the revenue bridge.',
      },
    },
    {
      directive:
        'Have you considered drafting a 30-day financial bridge plan assuming MAS3 doesn\'t materialize by April 1st?',
      reason: 'March 17th marks 6 weeks since MAS3 interview with no timeline clarity and financial runway critically short.',
      artifact: {
        type: 'decision_frame',
        options: [
          { option: 'Contingency bridge plan', weight: 0.7, rationale: 'Fallback' },
          { option: 'No bridge plan', weight: 0.3, rationale: 'Stay focused' },
        ],
        recommendation: 'Build the contingency bridge plan if MAS3 does not materialize.',
      },
    },
  ])('rejects bad output from today: $directive', ({ directive, reason, artifact }) => {
    const issues = validateDirectiveForPersistence({
      userId: OWNER_USER_ID,
      directive: buildDirective({
        directive,
        action_type: 'make_decision',
        confidence: 77,
        reason,
      }),
      artifact,
    });

    expect(issues.length).toBeGreaterThan(0);
  });

  it('allows a concrete MAS3-supporting directive with one finished artifact', () => {
    const issues = validateDirectiveForPersistence({
      userId: OWNER_USER_ID,
      directive: buildDirective({}),
      artifact: {
        type: 'email',
        to: 'holly@example.com',
        subject: 'Reference talking points for MAS3',
        body: 'Hi Holly,\n\nCan you confirm by 4 PM PT today the two or three strongest talking points you would use for my MAS3 candidacy, and who should own final packaging? If we miss this cutoff, the reference packet slips past the interview decision window.\n\nThanks,\nBrandon',
        draft_type: 'email_compose',
      },
    });

    expect(issues).toEqual([]);
  });

  it('rejects send_message when directive and artifact use conflicting event timing', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-14T23:30:00.000Z'));
    try {
      const issues = validateDirectiveForPersistence({
        userId: OWNER_USER_ID,
        directive: buildDirective({
          directive:
            'Phone screen with Alex Crisler is 30 hours away (April 15, 22:15 UTC); your last reply was April 13, and Alex\'s confirmation arrived April 14 with no acknowledgment since.',
        }),
        artifact: {
          type: 'email',
          to: 'alex.crisler@comphc.org',
          subject: 'Re: Comprehensive Healthcare - Phone Screen',
          body: 'Hi Alex,\n\nThanks for confirming tomorrow\'s call at 9:15 PM.\n\nBest,\nBrandon',
          draft_type: 'email_compose',
        },
      });

      expect(issues).toContain('send_message temporal reference conflicts with directive timing');
    } finally {
      vi.useRealTimers();
    }
  });

  it('allows send_message when a UTC timestamp and relative wording resolve to the same Pacific anchor', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-14T23:30:00.000Z'));
    try {
      const issues = validateDirectiveForPersistence({
        userId: OWNER_USER_ID,
        directive: buildDirective({
          directive:
            'Phone screen with Alex Crisler is 30 hours away (April 15, 22:15 UTC); your last reply was April 13, and Alex\'s confirmation arrived April 14 with no acknowledgment since.',
        }),
        artifact: {
          type: 'email',
          to: 'alex.crisler@comphc.org',
          subject: 'Re: Comprehensive Healthcare - Phone Screen',
          body: 'Hi Alex,\n\nThanks for confirming tomorrow\'s call at 10:15 PM.\n\nBest,\nBrandon',
          draft_type: 'email_compose',
        },
      });

      expect(issues).not.toContain('send_message temporal reference conflicts with directive timing');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('generator response parsing', () => {
  it('extracts JSON from prefixed non-json fenced responses', () => {
    const raw = `Here is the directive:
\`\`\`jsonc
{
  "directive": "Send the follow-up email to the MAS3 hiring manager today.",
  "artifact_type": "send_message",
  "artifact": {
    "to": "manager@example.com",
    "subject": "MAS3 timeline follow-up",
    "body": "Hi,\\n\\nI wanted to follow up on the MAS3 interview timeline.\\n\\nThank you,\\nBrandon"
  },
  "evidence": "The interview window closes this week and the manager has not replied.",
  "why_now": "The timing window closes this week."
}
\`\`\``;

    expect(extractJsonFromResponse(raw)).toMatch(/^\{/);
    expect(parseGeneratedPayload(raw)).toMatchObject({
      directive: 'Send the follow-up email to the MAS3 hiring manager today.',
      artifact_type: 'send_message',
      artifact: expect.objectContaining({
        to: 'manager@example.com',
        subject: 'MAS3 timeline follow-up',
      }),
    });
  });

  it('parses discrepancy-engine write_document action payloads without artifact_type', () => {
    const raw = JSON.stringify({
      action: 'write_document',
      reason: 'Signal velocity on the runway goal dropped sharply this week.',
      artifact: {
        content: 'Decision required: lock contingency owner by 5 PM PT today.',
      },
      causal_diagnosis: {
        why_exists_now: 'The June 2026 runway goal had fewer decision-thread updates this week than last week.',
        mechanism: 'Critical runway planning shifted into passive tracking without assigned owner accountability.',
      },
    });

    expect(parseGeneratedPayload(raw)).toMatchObject({
      artifact_type: 'write_document',
      decision: 'ACT',
      insight: 'Signal velocity on the runway goal dropped sharply this week.',
      directive: 'Signal velocity on the runway goal dropped sharply this week.',
      artifact: expect.objectContaining({
        document_purpose: 'decision memo',
        target_reader: 'decision owner',
        content: 'Decision required: lock contingency owner by 5 PM PT today.',
      }),
    });
  });

  it('maps directive_text and action_type in legacy-shaped LLM JSON (interview prep path)', () => {
    const raw = JSON.stringify({
      action_type: 'write_document',
      directive_text: 'Alex sent interview confirmation April 21. Here is your prep sheet for April 29.',
      confidence: 72,
      reason: 'Interview is 7 days away; calendar time differs from email.',
      artifact: {
        type: 'document',
        title: 'Interview prep',
        content: 'Confirmed interview with candidate Alex for Care Coordinator role on April 29, 2026.',
      },
    });

    expect(parseGeneratedPayload(raw)).toMatchObject({
      artifact_type: 'write_document',
      directive: 'Alex sent interview confirmation April 21.',
      artifact: expect.objectContaining({
        title: 'Interview prep',
        content: expect.stringContaining('April 29, 2026'),
      }),
    });
  });
});

describe('system_introspection constraint (global — all users)', () => {
  const NON_OWNER_USER = 'user-abc-123';

  it.each([
    { text: 'Investigate the 229-signal spike in the data pipeline', label: 'signal spike' },
    { text: 'Check why signal processing stalled overnight', label: 'processing stalled' },
    { text: 'Review tkg_signals table for unprocessed count anomalies', label: 'tkg_signals reference' },
    { text: 'Debug the sync failure in the Microsoft data pipeline', label: 'sync failure' },
    { text: 'Investigate why the orchestrator cron job failed', label: 'orchestrator reference' },
    { text: 'Check the API rate limit errors from last night', label: 'API rate limit' },
  ])('BLOCKS system introspection candidate: $label', ({ text }) => {
    // Must work for non-owner users too
    const violations = getCandidateConstraintViolations(NON_OWNER_USER, text);
    expect(violations.some((v) => v.code === 'system_introspection')).toBe(true);
  });

  it.each([
    { text: 'Send a follow-up email to Yadira about the project timeline', label: 'follow-up email' },
    { text: 'Review your calendar for Thursday and block focus time', label: 'calendar review' },
    { text: 'Draft a thank-you note to the hiring manager', label: 'thank-you note' },
    { text: 'Research competitive salary data for the state position', label: 'salary research' },
  ])('ALLOWS user-serving candidate: $label', ({ text }) => {
    const violations = getCandidateConstraintViolations(NON_OWNER_USER, text);
    expect(violations.some((v) => v.code === 'system_introspection')).toBe(false);
  });

  it('blocks system introspection in directive-level validation for any user', () => {
    const violations = getDirectiveConstraintViolations({
      userId: NON_OWNER_USER,
      directive: 'Investigate the signal processing backlog and diagnose why 50 signals remain unprocessed',
      reason: 'The tkg_signals backlog has not decreased in 48 hours',
    });
    expect(violations.some((v) => v.code === 'system_introspection')).toBe(true);
  });

  it('allows user-serving directive for any user', () => {
    const violations = getDirectiveConstraintViolations({
      userId: NON_OWNER_USER,
      directive: 'Send a follow-up email to Yadira',
      reason: 'You committed to following up by end of week and the window closes Friday.',
    });
    expect(violations.some((v) => v.code === 'system_introspection')).toBe(false);
  });
});

describe('consulting_decision_frame constraint (global — all users)', () => {
  const NON_OWNER_USER = 'user-abc-123';

  it.each([
    { text: 'Should you apply to the HCBM Contracts Analyst role?', label: 'should you' },
    { text: 'Consider whether to attend the networking event on Friday', label: 'consider whether' },
    { text: 'Decide if now is the right time to follow up with the recruiter', label: 'decide if' },
    { text: 'Evaluate whether the FPA3 position aligns with your career goals', label: 'evaluate whether' },
    { text: 'Stop creating new commitments and focus exclusively on the three overdue items', label: 'stop creating + focus exclusively' },
    { text: 'You need to pause all new work and address the backlog', label: 'you need to + pause all' },
    { text: 'You should focus energy on completing the application', label: 'you should + focus energy' },
    { text: 'This requires intervention before the deadline passes', label: 'requires intervention' },
  ])('BLOCKS consulting decision frame: $label', ({ text }) => {
    const violations = getCandidateConstraintViolations(NON_OWNER_USER, text);
    expect(violations.some((v) => v.code === 'consulting_decision_frame')).toBe(true);
  });

  it.each([
    {
      text: 'Option A: accept the MAS3 offer at Step C. Option B: negotiate for Step E.',
      label: 'real decision with tradeoffs',
    },
    {
      text: 'Draft a response to the hiring manager with your salary expectations',
      label: 'concrete action',
    },
    {
      text: 'Block 2 hours Thursday morning to complete the state application',
      label: 'scheduling action',
    },
  ])('ALLOWS valid directive: $label', ({ text }) => {
    const violations = getCandidateConstraintViolations(NON_OWNER_USER, text);
    expect(violations.some((v) => v.code === 'consulting_decision_frame')).toBe(false);
  });

  it('blocks consulting in directive-level validation', () => {
    const violations = getDirectiveConstraintViolations({
      userId: NON_OWNER_USER,
      directive: 'Should you apply to the HCBM role before the deadline?',
      reason: 'The posting closes March 20.',
    });
    expect(violations.some((v) => v.code === 'consulting_decision_frame')).toBe(true);
  });

  it('allows real decision frame in directive-level validation', () => {
    const violations = getDirectiveConstraintViolations({
      userId: NON_OWNER_USER,
      directive: 'Option A: accept the MAS3 offer at Step C. Option B: negotiate for Step E.',
      reason: 'The offer letter expires Friday and a response is required.',
    });
    expect(violations.some((v) => v.code === 'consulting_decision_frame')).toBe(false);
  });
});

describe('applyScheduleConflictCanonicalUserFacingCopy', () => {
  it('overrides LLM directive and why_now from scorer discrepancy fields', () => {
    const raw = JSON.stringify({
      insight: 'x',
      causal_diagnosis: { why_exists_now: 'a', mechanism: 'b' },
      decision: 'ACT',
      directive: 'Parents visiting creates reconnect opportunity.',
      artifact_type: 'write_document',
      artifact: { type: 'document', title: 'T', content: '1. Open calendar' },
      why_now: 'Wrong why.',
    });
    const payload = parseGeneratedPayload(raw);
    expect(payload).not.toBeNull();

    const winner = {
      id: 'discrepancy_conflict_sig_a_sig_b',
      type: 'discrepancy',
      title: 'Overlapping events on 2026-04-02',
      content:
        'You have overlapping calendar commitments on 2026-04-02: "Baby Hannah\'s Bday" and "Parents visit".',
      discrepancyClass: 'schedule_conflict',
      trigger: {
        baseline_state: 'Non-overlapping',
        current_state: 'Overlap',
        delta: 'double-booked',
        timeframe: '2026-04-02',
        outcome_class: 'deadline',
        why_now:
          'Overlapping events force an explicit priority call — otherwise you default under pressure in the moment.',
      },
    } as ScoredLoop;

    applyScheduleConflictCanonicalUserFacingCopy(payload!, winner);
    expect(payload!.directive).toBe('Overlapping events on 2026-04-02.');
    expect(payload!.why_now).toContain('explicit priority');
  });

  it('getDecisionEnforcementIssues passes for schedule_conflict resolution note with ask, time anchor, pressure, and ownership', () => {
    const issues = getDecisionEnforcementIssues({
      actionType: 'write_document',
      directiveText: 'Overlapping events on 2026-04-02.',
      reason: 'Overlapping events force an explicit priority call.',
      artifact: {
        type: 'document',
        title: 'Resolve overlap',
        content: `## Situation
Sam's check-in and the client review overlap on 2026-04-02.

## Conflicting commitments or risk
Both are scheduled; one must move.

## Recommendation / decision
Move Sam's check-in to Friday; keep the client review fixed.

## Owner / next step
You confirm with Sam before 2026-04-01 which option holds.

## Timing / deadline
Decide by 2026-04-01; overlap date is 2026-04-02.`,
      },
      discrepancyClass: 'schedule_conflict',
    });
    expect(issues.some((i) => i.includes('missing_owner_assignment'))).toBe(false);
    expect(issues.length).toBe(0);
  });
});

describe('getDecisionEnforcementIssues — payment finished work', () => {
  it('treats persisted artifact action label `document` like write_document for task-manager gates', () => {
    const issues = getDecisionEnforcementIssues({
      actionType: 'document',
      directiveText: 'American Express minimum payment is due April 11, 2026.',
      reason: 'Waiting increases late fee risk on the open balance shown in the statement email.',
      artifact: {
        type: 'document',
        title: 'AmEx payment',
        content: 'NEXT_ACTION: Pay $198 minimum before April 9. Owner: you.',
      },
    });
    expect(issues.some((i) => i.includes('forbidden_task_manager_next_action_label'))).toBe(true);
    expect(issues.some((i) => i.includes('forbidden_owner_you_task_line'))).toBe(true);
  });

  it('rejects write_document with NEXT_ACTION / Owner: you task-manager lines', () => {
    const issues = getDecisionEnforcementIssues({
      actionType: 'write_document',
      directiveText: 'American Express minimum payment is due April 11, 2026.',
      reason: 'Waiting increases late fee risk on the open balance shown in the statement email.',
      artifact: {
        type: 'document',
        title: 'AmEx payment',
        content: 'NEXT_ACTION: Pay $198 minimum before April 9. Owner: you.',
      },
    });
    expect(issues.some((i) => i.includes('forbidden_task_manager_next_action_label'))).toBe(true);
    expect(issues.some((i) => i.includes('forbidden_owner_you_task_line'))).toBe(true);
  });

  it('financial payment doc passes decision enforcement without Owner: you when URL and pay language present', () => {
    const issues = getDecisionEnforcementIssues({
      actionType: 'write_document',
      directiveText: 'American Express minimum payment is due April 11, 2026.',
      reason: 'The statement shows $9,540.53 with $198 minimum due by April 11 — paying before then avoids late fees.',
      artifact: {
        type: 'document',
        title: 'AmEx — schedule minimum',
        content:
          'Pay the $198.00 minimum on or before April 11, 2026. Online: https://www.americanexpress.com/en-us/account/login (use the exact pay link from your statement if it differs). Missing the due date risks late fees on the open balance.',
      },
      matchedGoalCategory: 'financial',
    });
    const de = issues.filter((i) => i.startsWith('decision_enforcement:'));
    expect(de).toHaveLength(0);
  });
});

describe('pickHighestStakesPaymentSignal', () => {
  it('selects statement minimum-due signal over confirmations and P2P noise', () => {
    const signals: CompressedSignal[] = [
      {
        source: 'gmail',
        occurred_at: '2026-04-01',
        entity: null,
        summary: 'Venmo — You paid Alex $12',
        direction: 'received',
      },
      {
        source: 'gmail',
        occurred_at: '2026-04-01',
        entity: null,
        summary: 'Chase — payment received, thank you',
        direction: 'received',
      },
      {
        source: 'gmail',
        occurred_at: '2026-04-01',
        entity: null,
        summary: 'Spectrum bill reminder',
        direction: 'received',
      },
      {
        source: 'gmail',
        occurred_at: '2026-04-01',
        entity: null,
        summary: 'American Express — minimum payment due $198.00 by April 11, 2026',
        direction: 'received',
      },
      {
        source: 'gmail',
        occurred_at: '2026-04-01',
        entity: null,
        summary: 'Teladoc appointment confirmed',
        direction: 'received',
      },
    ];
    const out = pickHighestStakesPaymentSignal(signals);
    expect(out).toHaveLength(1);
    expect(out[0]!.summary).toMatch(/American Express/i);
  });
});

describe('normalizeEmailArtifactContentField', () => {
  it('mirrors body to content when content is empty', () => {
    const out = normalizeEmailArtifactContentField({
      type: 'email',
      to: 'a@b.com',
      subject: 'Hi',
      body: 'Email body text',
    });
    expect(out?.content).toBe('Email body text');
    expect(out?.body).toBe('Email body text');
  });
});

describe('validateDirectiveForPersistence — evidence array safety', () => {
  it('does not throw when evidence is undefined (payment-heuristic path)', () => {
    const directive = buildDirective({
      directive: 'Utility bill minimum $40 is due Friday.',
      reason: 'Avoid late fee.',
      evidence: undefined as unknown as ConvictionDirective['evidence'],
    });
    expect(() =>
      validateDirectiveForPersistence({
        userId: OWNER_USER_ID,
        directive,
        artifact: { type: 'document', title: 'Pay', content: '$40 minimum due 2026-04-10' },
        matchedGoalCategory: null,
      }),
    ).not.toThrow();
  });

  it('rejects the exact recursive Resend decision-memo artifact before persistence', () => {
    const directive = buildDirective({
      directive:
        'Write a decision memo on "High-value relationship at risk: onboarding@resend.dev" — lock the final decision and owner for "High-value relationship at risk: onboarding@resend.dev" by end of day PT on 2026-04-26.',
      action_type: 'write_document',
      reason: 'The time window expires faster than ownership is being assigned.',
    });

    const issues = validateDirectiveForPersistence({
      userId: OWNER_USER_ID,
      directive,
      artifact: {
        type: 'document',
        document_purpose: 'proposal',
        target_reader: 'decision owner',
        title: 'Decision lock: High-value relationship at risk: onboarding@resend.dev',
        content: [
          'Decision required for "High-value relationship at risk: onboarding@resend.dev": confirm the path, name one owner, and time-bound the commitment.',
          '',
          'Ask: lock the final decision and owner for "High-value relationship at risk: onboarding@resend.dev" by end of day PT on 2026-04-26.',
          '',
          'Consequence: if unresolved by end of day PT on 2026-04-26, the execution window closes before owners can act.',
        ].join('\n'),
      },
      matchedGoalCategory: null,
    });

    expect(issues).toContain('decision_enforcement:recursive_directive_template_sludge');
  });

  it('rejects weak behavioral_pattern write_document artifacts that omit the blocked goal and send/stop move', () => {
    const directive = buildDirective({
      directive: 'Pat Lee keeps going quiet.',
      action_type: 'write_document',
      reason: 'The pattern is visible now.',
      discrepancyClass: 'behavioral_pattern' as import('../discrepancy-detector').DiscrepancyClass,
      generationLog: {
        outcome: 'selected',
        stage: 'generation',
        reason: 'Behavioral pattern winner.',
        candidateFailureReasons: [],
        candidateDiscovery: {
          candidateCount: 1,
          suppressedCandidateCount: 0,
          selectionMargin: 1,
          selectionReason: 'Behavioral pattern selected.',
          failureReason: null,
          topCandidates: [
            {
              id: 'bp-1',
              rank: 1,
              candidateType: 'discrepancy',
              discrepancyClass: 'behavioral_pattern' as import('../discrepancy-detector').DiscrepancyClass,
              actionType: 'write_document',
              score: 8.7,
              scoreBreakdown: {
                stakes: 4,
                urgency: 0.8,
                tractability: 0.75,
                freshness: 1,
                actionTypeRate: 0.5,
                entityPenalty: 0,
              },
              targetGoal: {
                text: 'pilot decision',
                priority: 4,
                category: 'work',
              },
              sourceSignals: [],
              decision: 'selected',
              decisionReason: 'Grounded goal + repeated silence pattern.',
            },
          ],
        },
      },
    });

    const issues = validateDirectiveForPersistence({
      userId: OWNER_USER_ID,
      directive,
      artifact: {
        type: 'document',
        title: 'Reply-gap summary',
        content: 'Pat Lee has gone quiet and the thread needs attention. Review the pattern and decide what to do next.',
      },
      candidateType: 'discrepancy',
      matchedGoalCategory: 'work',
    });

    expect(issues).toContain('decision_enforcement:behavioral_pattern_missing_goal_anchor');
    expect(issues).toContain('decision_enforcement:behavioral_pattern_missing_actual_move');
    expect(issues).toContain('decision_enforcement:behavioral_pattern_missing_stop_rule');
  });

  it('accepts a long-horizon behavioral-pattern execution artifact without requiring outbound send copy', () => {
    const directive = buildDirective({
      directive: 'Pat Lee keeps going quiet.',
      action_type: 'write_document',
      reason: 'The pattern is visible now.',
      discrepancyClass: 'behavioral_pattern' as import('../discrepancy-detector').DiscrepancyClass,
      generationLog: {
        outcome: 'selected',
        stage: 'generation',
        reason: 'Behavioral pattern winner.',
        candidateFailureReasons: [],
        candidateDiscovery: {
          candidateCount: 1,
          suppressedCandidateCount: 0,
          selectionMargin: 1,
          selectionReason: 'Behavioral pattern selected.',
          failureReason: null,
          topCandidates: [
            {
              id: 'bp-1',
              rank: 1,
              candidateType: 'discrepancy',
              discrepancyClass: 'behavioral_pattern' as import('../discrepancy-detector').DiscrepancyClass,
              actionType: 'write_document',
              score: 8.7,
              scoreBreakdown: {
                stakes: 4,
                urgency: 0.8,
                tractability: 0.75,
                freshness: 1,
                actionTypeRate: 0.5,
                entityPenalty: 0,
              },
              targetGoal: {
                text: 'pilot decision',
                priority: 4,
                category: 'work',
              },
              sourceSignals: [],
              decision: 'selected',
              decisionReason: 'Grounded goal + repeated silence pattern.',
            },
          ],
        },
      },
    });

    const issues = validateDirectiveForPersistence({
      userId: OWNER_USER_ID,
      directive,
      artifact: {
        type: 'document',
        title: 'Execution rule for the pilot decision',
        content: [
          'The pilot decision matters over the next 30-90 days. Pat Lee has stopped moving the thread.',
          '',
          'Execution move: stop holding live bandwidth open for Pat Lee today. Treat it as inactive until a concrete next-step signal arrives.',
          '',
          'Why this beats the alternatives: another generic nudge is more likely to preserve ambiguity than improve the odds on the pilot decision.',
          '',
          'Deprioritize: do not draft another status-check message.',
          '',
          'Consequence: if this stays mentally open past 2026-04-24, the pilot decision keeps losing real bandwidth.',
          '',
          'Reopen trigger: only reopen if a concrete next step, decision, or scheduling signal arrives by 2026-04-24.',
          '',
          'Deadline: 2026-04-24',
        ].join('\n'),
      },
      candidateType: 'discrepancy',
      matchedGoalCategory: 'work',
    });

    expect(issues).not.toContain('decision_enforcement:behavioral_pattern_missing_actual_move');
    expect(issues).not.toContain('decision_enforcement:behavioral_pattern_missing_long_horizon_rationale');
    expect(issues).not.toContain('decision_enforcement:behavioral_pattern_missing_deprioritization');
    expect(issues).not.toContain('decision_enforcement:behavioral_pattern_missing_reopen_trigger');
  });

  it('does not flag stop_rule when the draft uses a close-the-loop + stop-following-up rule', () => {
    const directive = buildDirective({
      directive: 'Pat Lee keeps going quiet.',
      action_type: 'write_document',
      reason: 'The pattern is visible now.',
      discrepancyClass: 'behavioral_pattern' as import('../discrepancy-detector').DiscrepancyClass,
      generationLog: {
        outcome: 'selected',
        stage: 'generation',
        reason: 'Behavioral pattern winner.',
        candidateFailureReasons: [],
        candidateDiscovery: {
          candidateCount: 1,
          suppressedCandidateCount: 0,
          selectionMargin: 1,
          selectionReason: 'Behavioral pattern selected.',
          failureReason: null,
          topCandidates: [
            {
              id: 'bp-1',
              rank: 1,
              candidateType: 'discrepancy',
              discrepancyClass: 'behavioral_pattern' as import('../discrepancy-detector').DiscrepancyClass,
              actionType: 'write_document',
              score: 8.7,
              scoreBreakdown: {
                stakes: 4,
                urgency: 0.8,
                tractability: 0.75,
                freshness: 1,
                actionTypeRate: 0.5,
                entityPenalty: 0,
              },
              targetGoal: {
                text: 'pilot decision',
                priority: 4,
                category: 'work',
              },
              sourceSignals: [],
              decision: 'selected',
              decisionReason: 'Grounded goal + repeated silence pattern.',
            },
          ],
        },
      },
    });

    const issues = validateDirectiveForPersistence({
      userId: OWNER_USER_ID,
      directive,
      artifact: {
        type: 'document',
        title: 'Pilot decision — Pat Lee',
        content:
          'The pilot decision is still open.\n\nSend tonight:\n\nShort line — no long quoted block here.\n\nIf you don’t hear back after this, close the loop and stop following up.',
      },
      candidateType: 'discrepancy',
      matchedGoalCategory: 'work',
    });

    expect(issues).not.toContain('decision_enforcement:behavioral_pattern_missing_actual_move');
    expect(issues).not.toContain('decision_enforcement:behavioral_pattern_missing_stop_rule');
  });

  it('accepts an embedded drafted email with a dated no-response stop rule', () => {
    const directive = buildDirective({
      directive: 'Waiting on the MAS3 hiring decision has stayed mentally open for a week.',
      action_type: 'write_document',
      reason: 'The interview happened on April 15 and the mid-May decision window is already tightening.',
      discrepancyClass: 'behavioral_pattern' as import('../discrepancy-detector').DiscrepancyClass,
      generationLog: {
        outcome: 'selected',
        stage: 'generation',
        reason: 'Behavioral pattern winner.',
        candidateFailureReasons: [],
        candidateDiscovery: {
          candidateCount: 1,
          suppressedCandidateCount: 0,
          selectionMargin: 1,
          selectionReason: 'Behavioral pattern selected.',
          failureReason: null,
          topCandidates: [
            {
              id: 'bp-1',
              rank: 1,
              candidateType: 'discrepancy',
              discrepancyClass: 'behavioral_pattern' as import('../discrepancy-detector').DiscrepancyClass,
              actionType: 'write_document',
              score: 9.1,
              scoreBreakdown: {
                stakes: 4.2,
                urgency: 0.85,
                tractability: 0.8,
                freshness: 1,
                actionTypeRate: 0.5,
                entityPenalty: 0,
              },
              targetGoal: {
                text: 'MAS3 hiring decision',
                priority: 4,
                category: 'work',
              },
              sourceSignals: [],
              decision: 'selected',
              decisionReason: 'Grounded goal + passive wait pattern.',
            },
          ],
        },
      },
    });

    const issues = validateDirectiveForPersistence({
      userId: OWNER_USER_ID,
      directive,
      artifact: {
        type: 'document',
        title: 'MAS3 Interview Follow-Up — Secure Decision Timeline',
        content:
          'SITUATION\nYou interviewed for the MAS3 role on 2026-04-15.\n\nDRAFT EMAIL TO SEND:\n\nTo: jennifer.dunbar@hca.wa.gov\nSubject: MAS3 Interview Follow-Up — Timeline Confirmation\n\nJennifer,\n\nThank you for the interview opportunity on April 15th for the Health Benefits Specialist 3 position. I remain very interested in the role.\n\nTo help me plan appropriately, could you share the expected timeline for the hiring decision?\n\nIf I have not heard from you by April 24th, I will follow up again to confirm status.\n\nThank you,\nBrandon Kapp\n\nEXECUTION\nSend this email to jennifer.dunbar@hca.wa.gov by end of business 2026-04-18.\n\nIf no response arrives by 2026-04-24, send one follow-up. Do not send a third message. If silence continues past 2026-04-24, mark this thread stalled and activate the mid-May contingency decision.',
      },
      candidateType: 'discrepancy',
      matchedGoalCategory: 'work',
    });

    expect(issues).not.toContain('decision_enforcement:behavioral_pattern_missing_actual_move');
    expect(issues).not.toContain('decision_enforcement:behavioral_pattern_missing_stop_rule');
    expect(issues).not.toContain('decision_enforcement:missing_explicit_ask');
  });
});

describe('getFinancialPaymentToneValidationIssues', () => {
  it('flags moralizing inbound/outbound phrasing for financial payment context', () => {
    const issues = getFinancialPaymentToneValidationIssues(
      {
        matched_goal_category: 'financial',
        candidate_title: 'Test',
        selected_candidate: '$100 due',
      },
      {
        directive: '3 inbound → 0 outbound/reply pattern across 14 days compounds daily.',
        insight: 'x',
        why_now: 'y',
        causal_diagnosis: {
          why_exists_now: 'Deadline is near because statement date.',
          mechanism: 'Logistical fee risk before April 9.',
        },
        artifact: { title: 'Pay', content: 'Pay $198 by April 9.' },
      },
    );
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.some((i) => i.includes('financial_payment_tone'))).toBe(true);
  });

  it('allows neutral payment directive without moralizing vocabulary', () => {
    const issues = getFinancialPaymentToneValidationIssues(
      {
        matched_goal_category: 'financial',
        candidate_title: 'AmEx',
        selected_candidate: 'Minimum $198 due April 11',
      },
      {
        directive: 'American Express minimum payment $198.00 is due April 11, 2026.',
        insight: 'Statement shows the minimum before late fees apply.',
        why_now: 'The due date is within one week per the issuer email.',
        causal_diagnosis: {
          why_exists_now: 'Calendar proximity to posted due date.',
          mechanism: 'Late fee applies after the statement due date.',
        },
        artifact: {
          title: 'AmEx minimum',
          content: 'Pay $198.00 before April 11, 2026 via your AmEx account.',
        },
      },
    );
    expect(issues).toHaveLength(0);
  });
});

describe('enrichCandidateContext (hunt)', () => {
  it('does not inject unrelated inbox threads into HUNT_CONTEXT', () => {
    const winner: ScoredLoop = {
      id: 'hunt_unreplied_win-signal-id',
      type: 'hunt',
      title: 'hunt',
      content: 'Inbound email unanswered',
      suggestedActionType: 'send_message',
      sourceSignals: [
        {
          kind: 'signal',
          id: 'win-signal-id',
          source: 'outlook',
          summary: 'Inbound email unanswered 14+ days — Your FICO score',
        },
      ],
    } as ScoredLoop;

    const evidence = [
      {
        source: 'outlook',
        date: '2026-03-27',
        subject: 'Other thread',
        snippet: 'Brandon: closed account',
        author: 'other@example.com',
        direction: 'received' as const,
        signal_id: 'other-signal-id',
      },
      {
        source: 'outlook',
        date: '2026-03-27',
        subject: 'FICO',
        snippet: 'Score increased',
        author: 'fico@example.com',
        direction: 'received' as const,
        signal_id: 'win-signal-id',
      },
    ];

    const ctx = enrichCandidateContext(winner, evidence);
    expect(ctx).toContain('FICO');
    expect(ctx).not.toContain('closed account');
  });
});
