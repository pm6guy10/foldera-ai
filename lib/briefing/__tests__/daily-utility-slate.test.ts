import { describe, expect, it } from 'vitest';
import { buildDailyUtilitySlateFromWinnerTruth } from '../daily-utility-slate';

const baseReport = {
  generated_at: '2026-05-06T13:43:52.405Z',
  user_id: 'user-1',
  sync_health: {
    providers: [
      {
        provider: 'google',
        last_synced_at: '2026-05-06T11:04:26.669+00:00',
        age_hours: 3,
        disconnected: false,
        stale: false,
        scoring_effect: 'fresh enough for currentness support',
      },
    ],
    graph: {
      graph_stale: false,
    },
    decrypt_sample_count: 250,
    decrypt_fallback_count: 0,
  },
  current_winner: {
    verdict: 'no_safe_artifact_today',
    title: null,
    tier: null,
    artifact_family: null,
    note: null,
    discrepancy_card: null,
    no_safe_artifact_reason:
      'Selected candidate failed discrepancy-card quality: weak_risk; weak_next_action',
  },
  top_viable_candidates: [],
  blocked_candidates: [
    {
      candidate_id: 'hunt-calgap-1',
      title: 'Commitment due 2026-05-14 with no matching calendar block',
      tier: 'tier_1',
      family: 'calendar_conflict_brief',
      blockers: ['missing_schedule_resolution_context'],
    },
  ],
  graph_drift: [],
  polluted_entities: [],
  three_day_consistency: {
    passes: false,
    days: [],
  },
  action_needed: [
    'Three-day consistency is still broken; inspect recent garbage-regression days before calling the seam dependable.',
  ],
  future_findings: [],
};

describe('Daily Utility Slate', () => {
  it('suppresses speculative calendar-gap candidates with missing schedule context', () => {
    const slate = buildDailyUtilitySlateFromWinnerTruth(baseReport as never);

    expect(slate).not.toBeNull();
    expect(slate?.finished_artifact_verdict).toBe('no_finished_artifact');
    expect(slate?.blocked_but_real).toBeNull();
    expect(slate?.watch_item).toEqual(
      expect.objectContaining({
        title: 'No safe finished action today',
        evidence: expect.arrayContaining([
          'Sources are current enough to trust this no-action verdict.',
        ]),
      }),
    );
    expect(JSON.stringify(slate)).not.toContain('missing_schedule_resolution_context');
    expect(JSON.stringify(slate)).not.toContain('positive_winner_contract');
    expect(JSON.stringify(slate)).not.toContain('Candidate family');
    expect(JSON.stringify(slate)).not.toContain('Priority tier');
  });

  it('prefers concrete command-center blocked candidates over vague goal drift', () => {
    const slate = buildDailyUtilitySlateFromWinnerTruth({
      ...baseReport,
      blocked_candidates: [
        {
          candidate_id: 'goal-drift-1',
          title: 'Goal drift: Build Foldera into a revenue-generating product',
          tier: 'tier_2',
          family: 'other_grounded_artifact',
          blockers: ['missing_current_artifact_anchor'],
        },
        ...baseReport.blocked_candidates,
      ],
    } as never);

    expect(slate?.blocked_but_real).toBeNull();
  });

  it('refuses to create a slate from empty truth with no evidence-backed item', () => {
    const slate = buildDailyUtilitySlateFromWinnerTruth({
      ...baseReport,
      current_winner: {
        ...baseReport.current_winner,
        no_safe_artifact_reason: null,
      },
      blocked_candidates: [],
      action_needed: [],
      sync_health: {
        ...baseReport.sync_health,
        providers: [],
      },
    } as never);

    expect(slate).toBeNull();
  });

  it('caveats stale providers as a watch item instead of fabricating a move', () => {
    const slate = buildDailyUtilitySlateFromWinnerTruth({
      ...baseReport,
      blocked_candidates: [],
      sync_health: {
        ...baseReport.sync_health,
        providers: [
          {
            provider: 'microsoft',
            last_synced_at: '2026-05-03T11:04:26.669+00:00',
            age_hours: 72,
            disconnected: false,
            stale: true,
            scoring_effect: 'context only; cannot create urgency or relationship-silence winners',
          },
        ],
      },
    } as never);

    expect(slate?.watch_item).toEqual(
      expect.objectContaining({
        status: 'watch_item',
        title: 'Microsoft source freshness needs attention',
        no_action_reason:
          'Stale source data can support context, but it cannot safely manufacture urgency.',
      }),
    );
  });

  it('translates no-safe artifact reasons without leaking internal gate codes', () => {
    const slate = buildDailyUtilitySlateFromWinnerTruth({
      ...baseReport,
      blocked_candidates: [],
      current_winner: {
        ...baseReport.current_winner,
        no_safe_artifact_reason:
          'Selected candidate failed discrepancy-card quality: weak_risk; weak_next_action; reminder_without_risk',
      },
    } as never);

    expect(slate?.watch_item).toEqual(
      expect.objectContaining({
        title: 'No safe finished action today',
        evidence: expect.arrayContaining([
          'Why Foldera stopped: The strongest possible action did not prove a concrete consequence. It did not prove one safe next step. It looked like a reminder, not a risk-backed intervention.',
        ]),
      }),
    );
    expect(JSON.stringify(slate)).not.toContain('weak_risk');
    expect(JSON.stringify(slate)).not.toContain('weak_next_action');
    expect(JSON.stringify(slate)).not.toContain('reminder_without_risk');
  });
});
