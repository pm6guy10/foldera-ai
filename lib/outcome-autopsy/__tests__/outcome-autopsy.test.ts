import { describe, expect, it } from 'vitest';

import {
  buildOutcomeAutopsyArtifact,
  type OutcomeAutopsyInput,
} from '../outcome-autopsy';

const cwuFixture: OutcomeAutopsyInput = {
  goals: [
    {
      id: 'goal-job-stability',
      goal_text: 'Maintain family and household stability through job transition',
      goal_category: 'career',
      status: 'active',
      priority: 5,
      created_at: '2026-04-01T00:00:00.000Z',
      updated_at: '2026-05-01T00:00:00.000Z',
    },
  ],
  actions: [
    {
      id: 'action-cwu-follow-up',
      directive_text: 'Send the Access Specialist follow-up to Kendall with concrete availability.',
      action_type: 'send_message',
      status: 'executed',
      generated_at: '2026-04-23T15:30:00.000Z',
      reason: 'CWU had called, and the next useful move was to answer with availability.',
      evidence: [{ type: 'signal', description: 'Kendall Smart / CWU Access Specialist role' }],
      execution_result: { saved: true },
      artifact: {
        type: 'email',
        subject: 'Access Specialist role',
        body: 'I am still interested and available tomorrow or next week.',
      },
    },
  ],
  commitments: [
    {
      id: 'commit-connect',
      description: 'Connect to discuss the Access Specialist role',
      category: 'schedule_meeting',
      status: 'fulfilled',
      made_at: '2026-04-23T16:27:14.000Z',
      due_at: '2026-04-24T00:00:00.000Z',
      source_id: 'sig-cwu-follow-up',
    },
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
      status: 'active',
      made_at: '2026-05-01T01:50:54.000Z',
      due_at: '2026-05-07T20:00:00.000Z',
      source_id: 'sig-cwu-second-interview',
    },
  ],
  signals: [
    {
      id: 'sig-generic-newsletter',
      source: 'outlook',
      type: 'email_received',
      author: 'jobs@example.com',
      occurred_at: '2026-04-22T12:00:00.000Z',
      content: 'Generic weekly job-search newsletter with broad interview tips.',
    },
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
  feedback: [],
  patternMetrics: [
    {
      id: 'metric-send',
      pattern_hash: 'send_message:career',
      category: 'send_message',
      domain: 'career',
      total_activations: 4,
      successful_outcomes: 2,
      failed_outcomes: 1,
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

describe('Outcome Autopsy artifact', () => {
  it('reverse-engineers the CWU Access Specialist offer without overclaiming causality', () => {
    const artifact = buildOutcomeAutopsyArtifact(cwuFixture, {
      query: 'CWU Access Specialist',
      now: '2026-05-15T12:00:00.000Z',
    });

    expect(artifact).not.toBeNull();
    expect(artifact?.goal.text).toContain('job transition');
    expect(artifact?.final_outcome).toMatch(/offer received and accepted/i);
    expect(artifact?.outcome_details?.map((detail) => `${detail.label}: ${detail.value}`)).toEqual(
      expect.arrayContaining([
        'Offer date: 2026-05-14',
        'Salary: $46,000',
        'Tentative start: 2026-06-16',
      ]),
    );
    expect(artifact?.causality.label).toBe('Inferred, not proven');
    expect(artifact?.causality.explanation).toMatch(/after-action inference/i);

    const classifications = artifact?.timeline.flatMap((item) => item.classifications) ?? [];
    expect(classifications).toContain('positive_momentum');
    expect(classifications).toContain('conversion_signal');
    expect(classifications).toContain('outcome_confirmed');

    expect(artifact?.strongest_positive_signals.map((signal) => signal.id)).toEqual(
      expect.arrayContaining(['sig-cwu-follow-up', 'sig-cwu-first-interview']),
    );
    expect(artifact?.strongest_positive_signals.map((signal) => signal.id)).not.toContain(
      'sig-generic-newsletter',
    );
    expect(artifact?.generic_events.map((signal) => signal.id)).toContain('sig-generic-newsletter');
    expect(artifact?.high_signal_artifacts?.map((item) => item.id)).toContain('second_round_prompt');
    expect(artifact?.high_signal_artifacts?.find((item) => item.id === 'redacted_case_packet')).toMatchObject({
      sensitivity: 'third_party_sensitive',
    });
    expect(artifact?.evidence_vs_inference?.inferred.join(' ')).toMatch(/realistic work sample/i);
    expect(artifact?.evidence_vs_inference?.not_used_as_proof.join(' ')).toMatch(/raw third-party/i);

    const serialized = JSON.stringify(artifact).toLowerCase();
    expect(serialized).not.toContain('probability');
    expect(serialized).not.toMatch(/\b\d+%/);
    expect(serialized).not.toMatch(/\bcaused\b/);
    expect(serialized).not.toMatch(/\b(pots|autism|ehlers|myalgic|ptsd)\b/);
  });

  it('produces repeatable playbook guidance from decisive actions and risks', () => {
    const artifact = buildOutcomeAutopsyArtifact(cwuFixture, {
      query: 'CWU Access Specialist',
      now: '2026-05-15T12:00:00.000Z',
    });

    expect(artifact?.decisive_actions.map((action) => action.id)).toContain('action-cwu-follow-up');
    expect(artifact?.strongest_risks.join(' ')).toMatch(/missed|delay|stale|silence/i);
    expect(artifact?.what_worked.join(' ')).toMatch(/judgment-heavy service coordination/i);
    expect(artifact?.what_to_repeat.join(' ')).toMatch(/work sample/i);
    expect(artifact?.what_to_avoid_next_time.join(' ')).toMatch(/generic/i);
    expect(artifact?.future_roles_to_prioritize).toContain('Access or disability coordination');
    expect(artifact?.future_roles_to_skip).toContain('Pure call center roles');
    expect(artifact?.reusable_playbook.title).toMatch(/service coordination conversion/i);
    expect(artifact?.reusable_playbook.steps.join(' ')).toMatch(/case prompt or presentation/i);
  });

  it('keeps weak term matches and unrelated confirmed outcomes out of the autopsy', () => {
    const pollutedFixture: OutcomeAutopsyInput = {
      ...cwuFixture,
      actions: [
        ...cwuFixture.actions,
        {
          id: 'action-unrelated-no-safe-move',
          directive_text: 'Nothing cleared the bar for safe autonomous action.',
          action_type: 'do_nothing',
          status: 'skipped',
          generated_at: '2026-05-10T15:30:00.000Z',
          reason: 'No safe access-related Specialist move cleared the quality gate.',
        },
        {
          id: 'action-unrelated-reference-risk',
          directive_text: 'onboarding@resend.dev has been silent while interviews are scheduled.',
          action_type: 'write_document',
          status: 'skipped',
          generated_at: '2026-05-01T15:30:00.000Z',
          reason: 'CWU interview #2 is approaching, but the action is about a separate relationship.',
          artifact: {
            title: 'Reference risk map',
            content: 'Active interviews include CWU interview #2, but this document is about Resend.',
          },
        },
      ],
      commitments: [
        ...cwuFixture.commitments,
        {
          id: 'commit-unrelated-specialist',
          description: 'Senior OCM Specialist interview for DSHS',
          category: 'attend_participate',
          status: 'fulfilled',
          made_at: '2026-05-03T18:00:00.000Z',
          due_at: '2026-05-04T18:00:00.000Z',
          source_id: 'sig-unrelated-specialist',
        },
      ],
      signals: [
        ...cwuFixture.signals,
        {
          id: 'sig-unrelated-specialist',
          source: 'outlook_calendar',
          type: 'calendar_event',
          author: 'b-kapp@outlook.com',
          occurred_at: '2026-05-04T18:00:00.000Z',
          content: '[Calendar event: Senior OCM Specialist interview for DSHS]',
        },
        {
          id: 'sig-unrelated-confirmed-worked',
          source: 'foldera',
          source_id: 'action-esb-prep',
          type: 'action_outcome',
          outcome_label: 'CONFIRMED_WORKED',
          occurred_at: '2026-05-02T18:00:00.000Z',
          content: 'User confirmed the ESB Technician prep sheet worked.',
        },
      ],
    };

    const artifact = buildOutcomeAutopsyArtifact(pollutedFixture, {
      query: 'CWU Access Specialist',
      now: '2026-05-15T12:00:00.000Z',
    });

    expect(artifact?.causality.label).toBe('Inferred, not proven');
    expect(artifact?.timeline.map((item) => item.id)).not.toContain('commit-unrelated-specialist');
    expect(artifact?.timeline.map((item) => item.id)).not.toContain('sig-unrelated-specialist');
    expect(artifact?.strongest_positive_signals.map((signal) => signal.id)).not.toContain(
      'sig-unrelated-confirmed-worked',
    );
    expect(artifact?.decisive_actions.map((action) => action.id)).not.toContain(
      'action-unrelated-no-safe-move',
    );
    expect(artifact?.timeline.map((item) => item.id)).not.toContain(
      'action-unrelated-reference-risk',
    );
  });
});
