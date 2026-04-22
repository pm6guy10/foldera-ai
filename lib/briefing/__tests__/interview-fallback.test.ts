import { describe, expect, it } from 'vitest';

import {
  buildDecisionEnforcedFallbackPayload,
  getCausalDiagnosisIssues,
  getDecisionEnforcementIssues,
  type CompressedSignal,
} from '../generator';
import type { ScoredLoop } from '../scorer';
import { expectDocumentArtifactShape } from '@/test/generated-output-assertions';

const BASE_BREAKDOWN = {
  stakes: 4,
  urgency: 0.8,
  tractability: 0.75,
  freshness: 1,
  actionTypeRate: 0.25,
  entityPenalty: 0,
};

function makeWinner(overrides: Partial<ScoredLoop>): ScoredLoop {
  return {
    id: overrides.id ?? 'winner-1',
    type: overrides.type ?? 'discrepancy',
    title: overrides.title ?? 'Commitment due in 3d: Interview; Example Role',
    content: overrides.content ?? 'You committed to an interview and no execution artifact exists yet.',
    suggestedActionType: overrides.suggestedActionType ?? 'write_document',
    matchedGoal: overrides.matchedGoal ?? null,
    score: overrides.score ?? 1.4,
    breakdown: overrides.breakdown ?? BASE_BREAKDOWN,
    relatedSignals: overrides.relatedSignals ?? [],
    sourceSignals: overrides.sourceSignals ?? [],
    confidence_prior: overrides.confidence_prior ?? 45,
    discrepancyClass: overrides.discrepancyClass ?? 'exposure',
    trigger: overrides.trigger ?? {
      baseline_state: 'Interview accepted',
      current_state: 'No interview artifact exists',
      delta: 'commitment -> no artifact',
      timeframe: 'within 3 days',
      outcome_class: 'job',
      why_now: 'Interview is already scheduled this week and no role-specific answer exists yet.',
    },
  };
}

function makeDiagnosis() {
  return {
    why_exists_now:
      'The Care Coordinator phone screen is already scheduled for April 15 because Alex Crisler already named the community-based Ellensburg scope in the recruiter thread.',
    mechanism:
      'Without one role-specific answer tied to the community-based, mileage-reimbursed recovery work Alex described, the conversation stays generic and the fit signal weakens.',
  };
}

describe('buildDecisionEnforcedFallbackPayload interview repair', () => {
  it('builds a hiring fit brief when the signals contain real role evidence', () => {
    const winner = makeWinner({
      title: 'Commitment due in 1d: Care Coordinator role interview',
      content:
        'Phone screen for the Care Coordinator role is tomorrow and the thread already contains concrete role details.',
    });
    const supportingSignals: CompressedSignal[] = [
      {
        source: 'outlook',
        occurred_at: '2026-04-14T21:13:57Z',
        entity: 'Alex Crisler',
        direction: 'received',
        summary:
          'Re: Comprehensive Healthcare - Phone Screen. The Care Coordinator role is based in Ellensburg, community-based, meeting clients at meetings and appointments or traveling to their homes for check-in. Mileage is reimbursed, you would not be responsible for transporting clients, and you would be working with them to find community resources to support their recovery.',
      },
      {
        source: 'outlook_calendar',
        occurred_at: '2026-04-15T22:15:00Z',
        entity: 'Alex Crisler',
        direction: 'unknown',
        summary:
          'Appointment scheduled. Date and Time: 04/15/2026 03:15 PM Pacific Location: Comprehensive Healthcare phone screen.',
      },
    ];

    const payload = buildDecisionEnforcedFallbackPayload({
      winner,
      actionType: 'write_document',
      candidateDueDate: '2026-04-15',
      candidateGoal: null,
      causalDiagnosis: makeDiagnosis(),
      supportingSignals,
      userPromptNames: {
        user_full_name: 'Brandon Kapp',
        user_first_name: 'Brandon',
      },
    });

    expect(payload).not.toBeNull();
    expect(payload?.artifact_type).toBe('write_document');
    const artifact = payload?.artifact as Record<string, string>;
    const { title, content } = expectDocumentArtifactShape(artifact, {
      minTitleLength: 20,
      minLength: 180,
      minParagraphs: 1,
      requiredTerms: ['community-based', 'mileage is reimbursed'],
      forbiddenPatterns: [/prep brief/i, /review the website/i, /prepare examples/i],
    });
    expect(`${title}\n${content}`).toMatch(/fit narrative|hiring fit brief/i);

    const decisionIssues = getDecisionEnforcementIssues({
      actionType: 'write_document',
      directiveText: payload?.directive ?? '',
      reason: payload?.why_now ?? '',
      artifact: payload?.artifact ?? null,
      discrepancyClass: winner.discrepancyClass,
    });
    const causalIssues = getCausalDiagnosisIssues({
      actionType: 'write_document',
      directiveText: payload?.directive ?? '',
      reason: payload?.why_now ?? '',
      artifact: payload?.artifact ?? null,
      causalDiagnosis: payload?.causal_diagnosis,
      candidateTitle: winner.title,
      supportingSignals,
    });

    expect(decisionIssues).toEqual([]);
    expect(causalIssues).toEqual([]);
  });

  it('returns null when an interview candidate lacks role-specific evidence', () => {
    const winner = makeWinner({
      title: 'Commitment due in 3d: Interview; DSHS HCLA Developmental Disabilities Case/Resource Manager',
      content:
        'You committed to "Interview; DSHS HCLA Developmental Disabilities Case/Resource Manager" and it is due in 3 days. No execution artifact exists yet.',
    });
    const supportingSignals: CompressedSignal[] = [
      {
        source: 'outlook',
        occurred_at: '2026-04-10T16:02:10Z',
        entity: 'Nicholas Robertson',
        direction: 'received',
        summary:
          'Dear Brandon, you are invited to interview for the DSHS HCLA Developmental Disabilities Case/Resource Manager. Interview slots are reserved on a first-come, first-served basis. Contact nicholas.robertson1@dshs.wa.gov.',
      },
      {
        source: 'outlook',
        occurred_at: '2026-04-10T17:25:45Z',
        entity: null,
        direction: 'received',
        summary:
          'Appointment scheduled. Date and Time: 04/20/2026 11:00 AM Pacific Location: DSHS Microsoft Teams Interview. Job: DSHS HCLA Developmental Disabilities Case/Resource Manager Employer: State of Washington.',
      },
    ];

    const payload = buildDecisionEnforcedFallbackPayload({
      winner,
      actionType: 'write_document',
      candidateDueDate: '2026-04-20',
      candidateGoal: null,
      causalDiagnosis: {
        why_exists_now:
          'The interview is already scheduled for April 20 and no role-specific artifact exists yet.',
        mechanism:
          'The signals confirm timing and logistics but do not include enough role evidence to support a believable answer architecture.',
      },
      supportingSignals,
      userPromptNames: {
        user_full_name: 'Brandon Kapp',
        user_first_name: 'Brandon',
      },
    });

    expect(payload).toBeNull();
  });
});
