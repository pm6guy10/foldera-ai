import { describe, expect, it } from 'vitest';

import {
  buildOutcomeAutopsyArtifact,
  type OutcomeAutopsyInput,
} from '@/lib/outcome-autopsy/outcome-autopsy';
import {
  buildOutcomeLearningSnapshot,
  patternMetricRowsForLearning,
} from '../outcome-learning-engine';

const cwuFixture: OutcomeAutopsyInput = {
  goals: [
    {
      id: 'goal-job-stability',
      goal_text: 'Maintain family and household stability through job transition',
      goal_category: 'career',
      status: 'completed',
      priority: 5,
      created_at: '2026-04-01T00:00:00.000Z',
      updated_at: '2026-05-15T00:00:00.000Z',
    },
  ],
  actions: [
    {
      id: 'action-cwu-follow-up',
      directive_text: 'Send the Access Specialist follow-up to Kendall with concrete availability.',
      action_type: 'send_message',
      status: 'executed',
      generated_at: '2026-04-23T15:30:00.000Z',
      approved_at: '2026-04-23T16:20:00.000Z',
      executed_at: '2026-04-23T16:27:14.000Z',
      feedback_weight: 1,
      reason: 'CWU had called, and the next useful move was to answer with availability.',
      evidence: [{ signal_id: 'sig-cwu-follow-up', description: 'Kendall Smart / CWU Access Specialist role' }],
      execution_result: { saved: true, approved_by: 'user' },
      artifact: {
        type: 'email',
        subject: 'Access Specialist role',
        body: 'I am still interested and available tomorrow or next week.',
      },
    },
  ],
  commitments: [
    {
      id: 'commit-first-interview',
      description: 'Interview for Access Specialist role at CWU via Zoom',
      category: 'attend_participate',
      status: 'fulfilled',
      made_at: '2026-04-24T18:00:00.000Z',
      due_at: '2026-04-24T18:00:00.000Z',
      source_id: 'sig-cwu-first-interview',
    },
    {
      id: 'commit-second-interview',
      description: 'CWU interview #2',
      category: 'attend_participate',
      status: 'fulfilled',
      made_at: '2026-05-01T01:50:54.000Z',
      due_at: '2026-05-07T20:00:00.000Z',
      source_id: 'sig-cwu-second-interview',
    },
  ],
  signals: [
    {
      id: 'sig-cwu-follow-up',
      source: 'outlook',
      type: 'email_sent',
      author: 'self',
      occurred_at: '2026-04-23T16:27:14.000Z',
      content:
        'To: Kendall.Smart@cwu.edu\nSubject: Access Specialist role\nBody: I saw your call from last week. I am still interested in learning more and am available tomorrow, or next week.',
    },
    {
      id: 'sig-cwu-first-interview',
      source: 'outlook_calendar',
      type: 'calendar_event',
      author: 'b-kapp@outlook.com',
      occurred_at: '2026-04-24T18:00:00.000Z',
      content:
        '[Calendar event: Access Specialist role CWU]\nAttached below is the zoom link for our interview tomorrow at 11am.',
    },
    {
      id: 'sig-cwu-second-interview',
      source: 'outlook_calendar',
      type: 'calendar_event',
      author: 'b-kapp@outlook.com',
      occurred_at: '2026-05-07T20:00:00.000Z',
      content: '[Calendar event: CWU interview #2]\nStart: 2026-05-07T20:00:00.0000000',
    },
  ],
  feedback: [
    {
      id: 'feedback-follow-up',
      feedback_type: 'suggested_action',
      was_accurate: true,
      was_important: true,
      user_action: 'used_suggestion',
      rating: 5,
      notes: 'Follow-up was useful and moved the CWU process forward.',
      created_at: '2026-04-23T17:00:00.000Z',
    },
  ],
  patternMetrics: [
    {
      id: 'metric-existing-service',
      pattern_hash: 'outcome_learning:judgment_heavy_service_coordination',
      category: 'judgment_heavy_service_coordination',
      domain: 'career_outcome',
      total_activations: 1,
      successful_outcomes: 1,
      failed_outcomes: 0,
    },
  ],
  entities: [
    {
      id: 'entity-kendall',
      name: 'kendall smart',
      display_name: 'Kendall Smart',
      primary_email: 'Kendall.Smart@cwu.edu',
      company: 'CWU',
      total_interactions: 2,
      trust_class: 'trusted',
    },
  ],
};

describe('Outcome Learning Engine', () => {
  it('builds a privacy-safe evidence packet, feedback ledger, and pattern memory for the CWU outcome', () => {
    const artifact = buildOutcomeAutopsyArtifact(cwuFixture, {
      query: 'CWU Access Specialist',
      now: '2026-05-15T12:00:00.000Z',
    });
    expect(artifact).not.toBeNull();

    const learning = buildOutcomeLearningSnapshot(artifact!, cwuFixture, {
      now: '2026-05-15T12:00:00.000Z',
    });

    expect(learning.what_foldera_learned.outcome).toMatch(/CWU Access Specialist/i);
    expect(learning.what_foldera_learned.what_worked.join(' ')).toMatch(/judgment-heavy service coordination/i);
    expect(learning.what_foldera_learned.what_to_repeat.join(' ')).toMatch(/work sample/i);
    expect(learning.what_foldera_learned.what_to_avoid.join(' ')).toMatch(/DVA|over-negotiate|raw third-party/i);

    expect(learning.evidence_packet.raw_evidence.map((item) => item.artifact_type)).toEqual(
      expect.arrayContaining(['job_description', 'interview_prompt', 'case_packet_redacted', 'offer_letter']),
    );
    expect(
      learning.evidence_packet.raw_evidence.find((item) => item.artifact_type === 'interview_prompt'),
    ).toMatchObject({
      sensitivity_level: 'confidential',
      redaction_status: 'not_needed',
      source_summary: expect.stringMatching(/Access Planning Meeting/i),
    });
    expect(
      learning.evidence_packet.raw_evidence.find((item) => item.artifact_type === 'case_packet_redacted'),
    ).toMatchObject({
      sensitivity_level: 'third_party_sensitive',
      redaction_status: 'redacted',
    });

    expect(learning.outcome_signal_layer.map((signal) => signal.signal_label)).toContain('proof_of_fit');
    expect(learning.outcome_signal_layer).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          signal_label: 'proof_of_fit',
          evidence_artifact_id: 'interview_prompt',
          confidence: 'high',
          causal_status: 'inferred',
        }),
      ]),
    );

    expect(learning.recommendation_feedback_ledger).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action_id: 'action-cwu-follow-up',
          user_response: 'completed',
          outcome_label: 'helped',
          source_signal_ids: expect.arrayContaining(['sig-cwu-follow-up']),
        }),
      ]),
    );

    expect(learning.pattern_memory_updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pattern_key: 'judgment_heavy_service_coordination',
          times_observed: 1,
          times_associated_with_positive_outcome: 1,
          times_associated_with_negative_outcome: 0,
        }),
        expect.objectContaining({
          pattern_key: 'presentation_strength',
          strongest_supporting_signal_ids: expect.arrayContaining(['cwu-seed-realistic-job-simulation']),
        }),
      ]),
    );

    const persistedRows = patternMetricRowsForLearning('user-1', learning);
    expect(persistedRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          user_id: 'user-1',
          pattern_hash: 'outcome_learning:judgment_heavy_service_coordination',
          category: 'judgment_heavy_service_coordination',
          domain: 'career_outcome',
          total_activations: 1,
          successful_outcomes: 1,
          failed_outcomes: 0,
        }),
      ]),
    );

    const serialized = JSON.stringify(learning).toLowerCase();
    expect(serialized).not.toContain('probability');
    expect(serialized).not.toMatch(/\b\d+%/);
    expect(serialized).not.toMatch(/\bcaused\b/);
    expect(serialized).not.toMatch(/\b(pots|autism|ehlers|myalgic|ptsd)\b/);
  });
});
