import { describe, expect, it } from 'vitest';
import { buildDecisionEnforcedFallbackPayload } from '../generator';
import type { ScoredLoop } from '../scorer';
import type { ValidArtifactTypeCanonical } from '../types';

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
    expect(payload!.directive.toLowerCase()).not.toMatch(
      /send a decision request that secures one accountable owner/,
    );
    expect(payload!.directive).toMatch(/email approver:/i);
    expect(payload!.directive).toMatch(/can you/i);
    expect(payload!.artifact.body).toMatch(/can you/i);
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
    expect(payload!.directive.toLowerCase()).toMatch(/legal review|vendor renewal/);
    expect(payload!.directive.toLowerCase()).not.toMatch(
      /^publish a decision memo that locks owner accountability/i,
    );
    expect(payload!.artifact.content.toLowerCase()).toMatch(/decision required/);
  });
});
