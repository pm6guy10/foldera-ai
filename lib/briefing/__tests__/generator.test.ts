import { describe, expect, it } from 'vitest';
import { OWNER_USER_ID } from '@/lib/auth/constants';
import {
  applyPinnedGoals,
  getCandidateConstraintViolations,
  getDirectiveConstraintViolations,
} from '../pinned-constraints';
import { extractJsonFromResponse, parseGeneratedPayload, validateDirectiveForPersistence } from '../generator';
import type { ConvictionDirective } from '../types';

function buildDirective(overrides: Partial<ConvictionDirective>): ConvictionDirective {
  return {
    directive: 'Draft email to Holly requesting specific reference talking points for your MAS3 candidacy.',
    action_type: 'send_message',
    confidence: 79,
    reason: 'MAS3 is in final stages and reference preparation could be the deciding factor between candidates.',
    evidence: [
      { type: 'signal', description: 'Holly can strengthen the MAS3 reference package right now.' },
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
