import { describe, expect, it } from 'vitest';
import { buildDecisionEnforcedFallbackPayload, getDecisionEnforcementIssues } from '../generator';
import type { ScoredLoop } from '../scorer';
import type { ValidArtifactTypeCanonical } from '../types';
import {
  expectDirectiveShape,
  expectDocumentArtifactShape,
  expectEmailArtifactShape,
} from '@/test/generated-output-assertions';

function baseWinner(overrides: Partial<ScoredLoop> = {}): ScoredLoop {
  return {
    id: 'w1',
    type: 'commitment',
    title: 'ACME contract renewal — finance approval',
    content: '',
    suggestedActionType: 'send_message',
    matchedGoal: null,
    score: 1,
    breakdown: {} as ScoredLoop['breakdown'],
    relatedSignals: [],
    sourceSignals: [],
    relationshipContext: 'Thread with approver@acmecorp.io',
    confidence_prior: 72,
    ...overrides,
  };
}

describe('buildDecisionEnforcedFallbackPayload', () => {
  it('send_message repair directive cites recipient + concrete ask, not accountable-owner boilerplate', () => {
    const payload = buildDecisionEnforcedFallbackPayload({
      winner: baseWinner(),
      actionType: 'send_message' as ValidArtifactTypeCanonical,
      candidateDueDate: '2026-04-08',
      causalDiagnosis: { why_exists_now: 'Deadline pressure', mechanism: 'Implicit ownership' },
      userEmails: new Set(['owner@me.com']),
      userPromptNames: { user_full_name: 'Test User', user_first_name: 'Test' },
    });
    expect(payload).not.toBeNull();
    const directive = expectDirectiveShape(payload!.directive, {
      minLength: 40,
      requiredRegexes: [/email/i, /can you/i, /\d{4}-\d{2}-\d{2}/],
    });
    expect(directive.toLowerCase()).not.toMatch(
      /send a decision request that secures one accountable owner/,
    );
    expectEmailArtifactShape(payload!.artifact, {
      expectedRecipient: 'approver@acmecorp.io',
      minSubjectLength: 12,
      minBodyLength: 60,
      requireQuestion: true,
      bodyRequiredRegexes: [/can you/i, /\d{4}-\d{2}-\d{2}/],
    });
  });

  it('write_document repair directive names the decision topic, not generic publish line', () => {
    const payload = buildDecisionEnforcedFallbackPayload({
      winner: baseWinner({ title: 'Legal review blocking vendor renewal' }),
      actionType: 'write_document' as ValidArtifactTypeCanonical,
      candidateDueDate: '2026-04-09',
      causalDiagnosis: { why_exists_now: 'x', mechanism: 'y' },
      userPromptNames: { user_full_name: 'Test User', user_first_name: 'Test' },
    });
    expect(payload).not.toBeNull();
    const directive = expectDirectiveShape(payload!.directive, {
      minLength: 32,
      requiredRegexes: [/legal review|vendor renewal/i, /\d{4}-\d{2}-\d{2}/],
    });
    expect(directive.toLowerCase()).not.toMatch(
      /^publish a decision memo that locks owner accountability/i,
    );
    expectDocumentArtifactShape(payload!.artifact, {
      minTitleLength: 12,
      minLength: 60,
      requiredRegexes: [/decision required/i],
    });
  });

  it('uses hunt grounded recipient allowlist when summaries omit the external email', () => {
    const payload = buildDecisionEnforcedFallbackPayload({
      winner: baseWinner({
        id: 'hunt_ignored_hello_deako_com',
        type: 'hunt',
        title: 'Inbound email unanswered 9+ days — Deako',
        content: '3 inbound emails from same sender in 30 days — zero replies synced',
        suggestedActionType: 'send_message',
        relationshipContext: null,
        relatedSignals: ['3 inbound emails from same sender in 30 days — zero replies synced'],
        sourceSignals: [
          {
            kind: 'signal',
            id: 'sig-1',
            source: 'gmail',
            summary: '3 inbound emails from same sender in 30 days — zero replies synced',
          },
        ],
      }),
      actionType: 'send_message' as ValidArtifactTypeCanonical,
      candidateDueDate: null,
      candidateGoal: null,
      causalDiagnosis: {
        why_exists_now: 'Three unanswered Deako emails are still sitting open.',
        mechanism: 'The thread stayed open without a closing yes/no response.',
      },
      huntRecipientAllowlist: ['hello@deako.com'],
      userEmails: new Set(['owner@me.com']),
      userPromptNames: { user_full_name: 'Brandon Kapp', user_first_name: 'Brandon' },
    });

    expect(payload).not.toBeNull();
    expect(payload!.artifact_type).toBe('send_message');
    expectDirectiveShape(payload!.directive, {
      minLength: 30,
      requiredRegexes: [/email/i, /\bhello\b/i, /\d{4}-\d{2}-\d{2}/],
    });
    expectEmailArtifactShape(payload!.artifact, {
      expectedRecipient: 'hello@deako.com',
      minSubjectLength: 12,
      minBodyLength: 60,
      requireQuestion: true,
    });

    const issues = getDecisionEnforcementIssues({
      actionType: 'send_message',
      directiveText: payload!.directive,
      reason: payload!.why_now,
      artifact: payload!.artifact,
    });
    expect(issues.filter((issue) => issue.startsWith('decision_enforcement:'))).toEqual([]);
  });

  it('repairs the MAS3 behavioral-pattern blocker into a long-horizon internal execution brief', () => {
    const payload = buildDecisionEnforcedFallbackPayload({
      winner: baseWinner({
        id: 'behavioral-mas3',
        type: 'discrepancy',
        suggestedActionType: 'write_document',
        discrepancyClass: 'behavioral_pattern',
        title: "Committed to 'Waiting on MAS3 (HCA) hiring decision' 11 days ago — no activity since",
        content: "Committed to 'Waiting on MAS3 (HCA) hiring decision' 11 days ago — no activity since",
        matchedGoal: {
          text: 'Land MAS3 Management Analyst Supervisor position at HCA and establish 12-month tenure with clean supervisor reference',
          priority: 1,
          category: 'career',
        },
      }),
      actionType: 'write_document' as ValidArtifactTypeCanonical,
      candidateDueDate: null,
      candidateGoal: 'Land MAS3 Management Analyst Supervisor position at HCA and establish 12-month tenure with clean supervisor reference',
      causalDiagnosis: {
        why_exists_now: 'Repeated follow-ups are not producing a real yes/no.',
        mechanism: 'Thread stayed open without a closing move.',
      },
      userPromptNames: { user_full_name: 'Brandon Kapp', user_first_name: 'Brandon' },
    });

    expect(payload).not.toBeNull();
    expect(payload!.artifact_type).toBe('write_document');
    expectDirectiveShape(payload!.directive, {
      minLength: 40,
      requiredRegexes: [/reopen/i, /next-step signal/i],
    });
    expectDocumentArtifactShape(payload!.artifact, {
      minTitleLength: 16,
      minLength: 220,
      minParagraphs: 6,
      requiredTerms: ['MAS3', 'HCA'],
      requiredRegexes: [
        /Execution move:/i,
        /Why this beats the alternatives:/i,
        /Deprioritize:/i,
        /Reopen trigger:/i,
      ],
    });

    const issues = getDecisionEnforcementIssues({
      actionType: 'write_document',
      directiveText: payload!.directive,
      reason: payload!.why_now,
      artifact: payload!.artifact,
      discrepancyClass: 'behavioral_pattern',
      matchedGoalCategory: 'career',
    });
    expect(issues.filter((issue) => issue.startsWith('decision_enforcement:'))).toEqual([]);
  });
});
