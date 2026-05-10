import { describe, expect, it } from 'vitest';

import {
  evaluateCandidateArtifactability,
  selectArtifactTasteExamples,
} from '../artifact-taste-pack';
import { selectRankedCandidates } from '../generator';
import type { ScoredLoop } from '../scorer';

const now = new Date('2026-05-05T16:00:00.000Z');

function baseBreakdown() {
  return {
    stakes: 3,
    urgency: 3,
    freshness: 3,
    tractability: 3,
  };
}

function signal(summary: string, occurredAt = now.toISOString()) {
  return {
    id: `signal-${summary.slice(0, 12)}`,
    summary,
    occurredAt,
  };
}

function makeCandidate(partial: Partial<ScoredLoop> & Pick<ScoredLoop, 'id' | 'title'>): ScoredLoop {
  return {
    id: partial.id,
    type: partial.type ?? 'commitment',
    title: partial.title,
    content: partial.content ?? partial.title,
    score: partial.score ?? 1,
    breakdown: partial.breakdown ?? baseBreakdown(),
    suggestedActionType: partial.suggestedActionType ?? 'write_document',
    sourceSignals: partial.sourceSignals ?? [signal(partial.title)],
    relatedSignals: partial.relatedSignals ?? [],
    relationshipContext: partial.relationshipContext,
    matchedGoal: partial.matchedGoal,
    ...partial,
  } as ScoredLoop;
}

describe('positive winner contract', () => {
  it('routes interview/admin candidates to the shared taste pack instead of test-only examples', () => {
    const selection = selectArtifactTasteExamples({
      actionType: 'write_document',
      title: 'CWU interview #2 ESB Tech role-fit packet',
      content: 'Build a concrete ESB/MAS3 interview prep packet from the current evidence.',
    });

    expect(selection.family).toBe('interview_role_fit_packet');
    expect(selection.good.map((example) => example.id)).toContain('good_es_benefits_role_fit_packet');
    expect(selection.bad.map((example) => example.id)).toContain('bad_interview_star_homework_packet');
    expect(selection.promptGuidance).toContain('Do not copy literal names');
    expect(selection.promptGuidance).not.toContain('Darlene Craig');
    expect(selection.promptGuidance).not.toContain('ProviderOne at HCA for five years');
  });

  it('prevents transactional relationship-risk winners from beating viable command-center artifacts', () => {
    const resendRisk = makeCandidate({
      id: 'resend-relationship-risk',
      type: 'discrepancy',
      title: 'Relationship risk: onboarding@resend.dev has gone silent',
      content:
        'Write a Resend relationship status and interview decision map because onboarding@resend.dev has not replied in 36 days.',
      score: 999,
      breakdown: { stakes: 5, urgency: 5, freshness: 5, tractability: 5 },
      suggestedActionType: 'write_document',
      relationshipContext: 'Entity: onboarding@resend.dev\nEmail: onboarding@resend.dev',
      sourceSignals: [
        signal('Resend onboarding email receipt with no human relationship facts.'),
      ],
    });

    const cwuInterview = makeCandidate({
      id: 'cwu-interview-role-fit',
      type: 'commitment',
      title: 'CWU interview #2 role-fit packet due Thursday',
      content:
        'Build a role-fit packet for the CWU interview #2 using ESB, MAS3, ProviderOne, MEDS, and current calendar evidence.',
      score: 1.7,
      suggestedActionType: 'write_document',
      matchedGoal: {
        id: 'career-goal',
        text: 'Win the CWU/ESB/MAS3 interview loop.',
        priority: 1,
      },
      sourceSignals: [
        signal('CWU interview #2 is scheduled this week and needs ESB/MAS3 role-fit prep.'),
        signal('ProviderOne, MEDS, and calendar details are present for interview evidence.'),
      ],
    });

    const result = selectRankedCandidates(
      [resendRisk, cwuInterview],
      { approvedRecently: [] },
      { now },
    );

    expect(result.ranked[0].candidate.id).toBe('cwu-interview-role-fit');
    expect(result.ranked.find((entry) => entry.candidate.id === 'resend-relationship-risk')?.disqualified).toBe(true);
    expect(result.competitionContext).toContain('ARTIFACT_TASTE_RAILS');
    expect(result.winnerQualityTrace?.positive_winner_contract.selected_tier).toBe('tier_1');
    expect(result.winnerQualityTrace?.good_candidate_blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          candidate_id: 'resend-relationship-risk',
          blockers: expect.arrayContaining(['transactional_sender_candidate']),
        }),
      ]),
    );
  });

  it('classifies stale generic prep and missing recipient facts before model attempts', () => {
    const stalePrep = makeCandidate({
      id: 'stale-generic-prep',
      title: 'Generic interview prep reminder',
      content: 'Prepare STAR answers sometime soon for an old interview note.',
      suggestedActionType: 'write_document',
      sourceSignals: [
        signal('Old interview prep note without current schedule fields.', '2026-04-01T16:00:00.000Z'),
      ],
    });

    const missingRecipient = makeCandidate({
      id: 'missing-recipient-follow-up',
      title: 'Follow up with the hiring team',
      content: 'Draft a follow-up email, but the source facts do not identify a recipient.',
      suggestedActionType: 'send_message',
      relationshipContext: 'Hiring team',
      sourceSignals: [signal('Hiring team was mentioned without a grounded address or thread.')],
    });

    expect(evaluateCandidateArtifactability(stalePrep, { now }).blockers).toEqual(
      expect.arrayContaining(['stale_evidence_over_14d', 'generic_prep_shape_risk']),
    );
    expect(evaluateCandidateArtifactability(missingRecipient, { now }).blockers).toEqual(
      expect.arrayContaining(['missing_grounded_recipient_for_send_message']),
    );
  });

  it('blocks weak goal drift, thin interview packets, and fake calendar conflicts before they count as viable winners', () => {
    const goalDrift = makeCandidate({
      id: 'goal-drift-weak',
      type: 'discrepancy',
      title: 'Goal drift: Build Foldera into a revenue-generating product.',
      content: 'Build Foldera into a revenue-generating product.',
      suggestedActionType: 'make_decision',
      matchedGoal: {
        id: 'goal-foldera',
        text: 'Build Foldera into a revenue-generating product.',
        priority: 1,
      },
      sourceSignals: [],
      relatedSignals: [],
    });

    const thinInterview = makeCandidate({
      id: 'thin-cwu',
      type: 'discrepancy',
      title: 'Deadline closing: CWU interview #2',
      content: 'Build the finished CWU interview role-fit packet.',
      suggestedActionType: 'write_document',
      sourceSignals: [],
      relatedSignals: ['CWU interview #2'],
    });

    const fakeCalendarConflict = makeCandidate({
      id: 'calendar-gap-only',
      type: 'hunt',
      title: 'Commitment due 2026-05-13 with no matching calendar block',
      content:
        'Commitment due 2026-05-13 with no matching calendar block. Commitment id 41a7: Virtual event to announce new Developer Platform primitives and capabilities. Nearest calendar event keyword overlap with commitment was only 0.',
      suggestedActionType: 'schedule',
      sourceSignals: [],
      relatedSignals: [
        'Commitment due 2026-05-13 with no matching calendar block',
        'Commitment id 41a7: Virtual event to announce new Developer Platform primitives and capabilities',
        'Nearest calendar event (by time): "Metadata only" — keyword overlap with commitment was only 0',
      ],
    });

    expect(evaluateCandidateArtifactability(goalDrift, { now }).blockers).toContain('missing_current_artifact_anchor');
    expect(evaluateCandidateArtifactability(thinInterview, { now }).blockers).toContain('missing_role_fit_source_bundle');
    expect(evaluateCandidateArtifactability(fakeCalendarConflict, { now }).blockers).toContain('missing_schedule_resolution_context');
  });

  it('blocks low-value platform invites and calendar-gap invites without a direct dependency fact', () => {
    const notionExposure = makeCandidate({
      id: 'notion-platform-exposure',
      type: 'discrepancy',
      discrepancyClass: 'exposure',
      title: 'Commitment due in 3d: Virtual event to announce new Developer Platform primitives',
      content:
        'You committed to "Virtual event to announce new Developer Platform primitives and capabilities" and it is due in 3 days. No execution artifact exists yet.',
      score: 25,
      suggestedActionType: 'write_document',
      matchedGoal: {
        id: 'goal-foldera',
        text: 'Build Foldera into a revenue-generating product. First paid user, then scale to replace employment income.',
        priority: 1,
        category: 'project',
      },
      sourceSignals: [
        signal('Source Email: Notion Developer Platform event invite for May 13.'),
      ],
      relatedSignals: [
        'notify@updates.notion.so sent the invite for May 13.',
      ],
    });

    const notionCalendarGap = makeCandidate({
      id: 'notion-calendar-gap',
      type: 'hunt',
      title: 'Commitment due 2026-05-13 with no matching calendar block',
      content:
        'Commitment due 2026-05-13 with no matching calendar block. Commitment id 41a7: Virtual event to announce new Developer Platform primitives and capabilities. Nearest calendar event keyword overlap with commitment was only 0.',
      score: 24,
      suggestedActionType: 'schedule',
      sourceSignals: [signal('Source Email: Notion Developer Platform event invite for May 13.')],
      relatedSignals: [
        'Commitment due 2026-05-13 with no matching calendar block',
        'Commitment id 41a7: Virtual event to announce new Developer Platform primitives and capabilities',
      ],
    });

    const notionExposureReceipt = evaluateCandidateArtifactability(notionExposure, { now });
    const notionCalendarGapReceipt = evaluateCandidateArtifactability(notionCalendarGap, { now });

    expect(notionExposureReceipt.context_smart).toBe(true);
    expect(notionExposureReceipt.changes_next_move).toBe(false);
    expect(notionExposureReceipt.source_authority).toBe('spam_or_promotional');
    expect(notionExposureReceipt.blockers).toEqual(
      expect.arrayContaining([
        'low_authority_event_invite_suppressed',
        'changes_next_move_required',
        'low_value_event_invite_without_dependency',
      ]),
    );
    expect(notionExposureReceipt.suppression_receipt).toEqual({
      reason: 'low_authority_event_invite',
      source_authority: 'spam_or_promotional',
      user_visible: false,
      action_taken: 'suppressed_or_archived_if_allowed',
    });
    expect(notionCalendarGapReceipt.blockers).toEqual(
      expect.arrayContaining([
        'low_authority_event_invite_suppressed',
        'changes_next_move_required',
        'low_value_event_invite_without_dependency',
      ]),
    );

    const result = selectRankedCandidates(
      [notionExposure, notionCalendarGap],
      { approvedRecently: [] },
      { now },
    );

    expect(result.ranked.every((entry) => entry.disqualified)).toBe(true);
    expect(result.winnerQualityTrace?.positive_winner_contract.verdict).toBe('all_candidates_blocked');
    expect(result.winnerQualityTrace?.good_candidate_blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          candidate_id: 'notion-platform-exposure',
          blockers: expect.arrayContaining([
            'low_authority_event_invite_suppressed',
            'changes_next_move_required',
          ]),
        }),
      ]),
    );
  });

  it('does not let stale interview-status decay masquerade as a current role-fit packet', () => {
    const staleInterviewStatus = makeCandidate({
      id: 'accepted-macsc-stale-status',
      type: 'discrepancy',
      title: "Committed to 'Accepted MACSC MAS3 Interview' 19 days ago — no activity since",
      content: 'Stop holding live bandwidth open for Accepted MACSC MAS3 Interview.',
      score: 50,
      suggestedActionType: 'write_document',
      sourceSignals: [],
      relatedSignals: ['Accepted MACSC MAS3 Interview'],
    });

    const currentCwu = makeCandidate({
      id: 'cwu-current-interview',
      type: 'discrepancy',
      title: 'Commitment due in 2d: CWU interview #2',
      content: 'Create the finished CWU interview role-fit packet using current ESB/MAS3/MEDS evidence.',
      score: 2,
      suggestedActionType: 'write_document',
      sourceSignals: [],
      relatedSignals: ['CWU interview #2', 'ESB/MAS3/MEDS evidence'],
    });

    const staleReceipt = evaluateCandidateArtifactability(staleInterviewStatus, { now });
    expect(staleReceipt.blockers).toContain('stale_status_without_current_artifact_facts');

    const result = selectRankedCandidates(
      [staleInterviewStatus, currentCwu],
      { approvedRecently: [] },
      { now },
    );
    expect(result.ranked[0].candidate.id).toBe('cwu-current-interview');
    expect(result.ranked.find((entry) => entry.candidate.id === 'accepted-macsc-stale-status')?.disqualified).toBe(true);
  });

  it('replays three owner-shaped days as useful artifact or precise no-safe-artifact trace', () => {
    const snapshots = [
      {
        label: 'resend risk plus cwu',
        expectedWinner: 'cwu-day-1',
        candidates: [
          makeCandidate({
            id: 'resend-day-1',
            type: 'discrepancy',
            title: 'High-value relationship at risk: onboarding@resend.dev',
            content: 'onboarding@resend.dev has been silent for 36 days.',
            score: 999,
            suggestedActionType: 'send_message',
            relationshipContext: 'onboarding@resend.dev',
            sourceSignals: [signal('onboarding@resend.dev: 20 interactions, silent 36 days')],
          }),
          makeCandidate({
            id: 'cwu-day-1',
            type: 'discrepancy',
            title: 'Deadline closing: CWU interview #2',
            content: 'Build the finished CWU interview role-fit packet.',
            score: 2,
            suggestedActionType: 'write_document',
            relatedSignals: ['CWU interview #2', 'ESB/MAS3/MEDS'],
          }),
        ],
      },
      {
        label: 'stale macsc plus cwu',
        expectedWinner: 'cwu-day-2',
        candidates: [
          makeCandidate({
            id: 'macsc-day-2',
            type: 'discrepancy',
            title: "Committed to 'Accepted MACSC MAS3 Interview' 19 days ago — no activity since",
            content: 'Stop holding live bandwidth open for Accepted MACSC MAS3 Interview.',
            score: 50,
            suggestedActionType: 'write_document',
            sourceSignals: [],
            relatedSignals: ['Accepted MACSC MAS3 Interview'],
          }),
          makeCandidate({
            id: 'cwu-day-2',
            type: 'discrepancy',
            title: 'Commitment due in 2d: CWU interview #2',
            content: 'Build the finished CWU role-fit packet from ESB/MAS3/MEDS evidence.',
            score: 2,
            suggestedActionType: 'write_document',
            sourceSignals: [],
            relatedSignals: ['CWU interview #2', 'ESB/MAS3/MEDS'],
          }),
        ],
      },
      {
        label: 'only unsafe stale/risk',
        expectedWinner: null,
        candidates: [
          makeCandidate({
            id: 'resend-day-3',
            type: 'discrepancy',
            title: 'Relationship risk: onboarding@resend.dev has gone silent',
            content: 'onboarding@resend.dev has not replied in 36 days.',
            score: 999,
            suggestedActionType: 'send_message',
            relationshipContext: 'onboarding@resend.dev',
            sourceSignals: [signal('onboarding@resend.dev: 20 interactions, silent 36 days')],
          }),
          makeCandidate({
            id: 'generic-day-3',
            title: 'Generic interview prep reminder',
            content: 'Prepare STAR answers from an old interview note.',
            score: 2,
            suggestedActionType: 'write_document',
            sourceSignals: [signal('Old interview note.', '2026-04-01T16:00:00.000Z')],
          }),
        ],
      },
    ];

    for (const snapshot of snapshots) {
      const result = selectRankedCandidates(
        snapshot.candidates,
        { approvedRecently: [] },
        { now },
      );
      const winner = result.ranked.find((entry) => !entry.disqualified)?.candidate.id ?? null;
      expect(winner, snapshot.label).toBe(snapshot.expectedWinner);
      if (!snapshot.expectedWinner) {
        expect(result.winnerQualityTrace?.positive_winner_contract.verdict).toBe('all_candidates_blocked');
      }
    }
  });

  it('returns no safe artifact when every remaining candidate is weak, thin, or missing current context', () => {
    const result = selectRankedCandidates(
      [
        makeCandidate({
          id: 'goal-drift-weak',
          type: 'discrepancy',
          title: 'Goal drift: Build Foldera into a revenue-generating product.',
          content: 'Build Foldera into a revenue-generating product.',
          score: 999,
          suggestedActionType: 'make_decision',
          matchedGoal: {
            id: 'goal-foldera',
            text: 'Build Foldera into a revenue-generating product.',
            priority: 1,
          },
          sourceSignals: [],
          relatedSignals: [],
        }),
        makeCandidate({
          id: 'thin-cwu',
          type: 'discrepancy',
          title: 'Deadline closing: CWU interview #2',
          content: 'Build the finished CWU interview role-fit packet.',
          score: 998,
          suggestedActionType: 'write_document',
          sourceSignals: [],
          relatedSignals: ['CWU interview #2'],
        }),
        makeCandidate({
          id: 'calendar-gap-only',
          type: 'hunt',
          title: 'Commitment due 2026-05-13 with no matching calendar block',
          content:
            'Commitment due 2026-05-13 with no matching calendar block. Commitment id 41a7: Virtual event to announce new Developer Platform primitives and capabilities. Nearest calendar event keyword overlap with commitment was only 0.',
          score: 997,
          suggestedActionType: 'schedule',
          sourceSignals: [],
          relatedSignals: [
            'Commitment due 2026-05-13 with no matching calendar block',
            'Commitment id 41a7: Virtual event to announce new Developer Platform primitives and capabilities',
            'Nearest calendar event (by time): "Metadata only" — keyword overlap with commitment was only 0',
          ],
        }),
      ],
      { approvedRecently: [] },
      { now },
    );

    expect(result.ranked.every((entry) => entry.disqualified)).toBe(true);
    expect(result.winnerQualityTrace?.positive_winner_contract.verdict).toBe('all_candidates_blocked');
  });
});
