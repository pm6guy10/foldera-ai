import { describe, expect, it } from 'vitest';
import { buildGateFunnelFromScorerDiagnostics } from '@/lib/observability/pipeline-run';
import type { ScorerDiagnostics } from '@/lib/briefing/scorer';

describe('buildGateFunnelFromScorerDiagnostics', () => {
  it('returns empty scorer marker when diag is null', () => {
    const f = buildGateFunnelFromScorerDiagnostics(null);
    expect(f.scorer_diagnostics).toBeNull();
  });

  it('extracts rejection_filter_entities from entity_reality_gate reasons', () => {
    const diag: ScorerDiagnostics = {
      sourceCounts: {
        commitments_raw: 0,
        commitments_after_dedup: 0,
        signals_raw: 0,
        signals_after_decrypt: 0,
        entities_raw: 0,
        goals_raw: 0,
        goals_after_filter: 0,
      },
      candidatePool: {
        commitment: 0,
        signal: 0,
        relationship: 0,
        relationship_skipped_no_thread: 0,
      },
      filterStages: [
        {
          stage: 'entity_reality_gate',
          before: 5,
          after: 2,
          dropped: [
            {
              candidateId: 'a',
              type: 'signal',
              title: 't',
              stage: 'entity_reality_gate',
              reason: 'fake person (entity: Reference)',
            },
          ],
        },
      ],
      discrepancies: [],
      convergenceBoosts: [],
      survivors: [],
      finalWinner: null,
      finalOutcome: 'zero_candidates_early',
    };
    const f = buildGateFunnelFromScorerDiagnostics(diag);
    expect(f.rejection_filter_entities).toEqual(['Reference']);
  });

  it('persists bounded discrepancy observability when scorer diagnostics include detector + pool + drops', () => {
    const diag: ScorerDiagnostics = {
      sourceCounts: {
        commitments_raw: 0,
        commitments_after_dedup: 0,
        signals_raw: 0,
        signals_after_decrypt: 0,
        entities_raw: 0,
        goals_raw: 0,
        goals_after_filter: 0,
      },
      candidatePool: {
        commitment: 0,
        signal: 0,
        relationship: 0,
        relationship_skipped_no_thread: 0,
      },
      filterStages: [
        {
          stage: 'lifecycle_gate',
          before: 3,
          after: 2,
          dropped: [
            {
              candidateId: 'd1',
              type: 'discrepancy',
              title: 't',
              stage: 'lifecycle_gate',
              reason: 'blocked',
            },
          ],
        },
        {
          stage: 'ranking_invariants',
          before: 2,
          after: 1,
          dropped: [
            {
              candidateId: 'd2',
              type: 'discrepancy',
              title: 't2',
              stage: 'ranking_invariants',
              reason: 'hard',
            },
          ],
        },
      ],
      discrepancies: [
        {
          id: 'x',
          class: 'schedule_conflict',
          title: 'Calendar overlap',
          score: 0.42,
          stakes: 4,
          urgency: 0.8,
          actionType: 'write_document',
        },
      ],
      discrepancyDetectorSummary: {
        count: 2,
        classes: ['schedule_conflict', 'stale_drive_document'],
        preview: [
          {
            class: 'schedule_conflict',
            action_type: 'write_document',
            stakes: 4,
            urgency: 0.8,
            title: 'Calendar overlap',
          },
          {
            class: 'stale_drive_document',
            action_type: 'write_document',
            stakes: 3,
            urgency: 0.5,
            title: 'Old doc',
          },
        ],
      },
      discrepancyInjectionSkips: { locked_contact: 1, failure_suppression: 0 },
      insightDiscrepanciesScored: 1,
      convergenceBoosts: [],
      survivors: [
        {
          candidateId: 'd3',
          type: 'discrepancy',
          title: 'Still alive',
          score: 0.9,
          breakdown: {} as ScorerDiagnostics['survivors'][0]['breakdown'],
          matchedGoal: null,
          invariantReasons: [],
          discrepancyClass: 'decay',
        },
      ],
      finalWinner: null,
      finalOutcome: 'no_valid_action',
    };

    const f = buildGateFunnelFromScorerDiagnostics(diag);
    expect(f.discrepancy_count).toBe(2);
    expect(f.discrepancy_classes).toEqual(['schedule_conflict', 'stale_drive_document']);
    expect(f.discrepancy_structural_injected_count).toBe(1);
    expect(f.discrepancy_insight_scored_count).toBe(1);
    expect(f.discrepancy_skipped_pre_pool).toEqual({ locked_contact: 1, failure_suppression: 0 });
    expect(f.discrepancy_survivor_count).toBe(1);
    expect(f.has_discrepancy_survivor).toBe(true);
    expect(f.discrepancy_drops_by_stage).toEqual({
      lifecycle_gate: 1,
      ranking_invariants: 1,
    });
    const prev = f.discrepancy_candidates_preview as Array<{ class: string; action_type: string }>;
    expect(prev[0]?.class).toBe('schedule_conflict');
    expect(prev[0]?.action_type).toBe('write_document');
  });

  it('uses detector-only preview when nothing reached the injected pool', () => {
    const diag: ScorerDiagnostics = {
      sourceCounts: {
        commitments_raw: 0,
        commitments_after_dedup: 0,
        signals_raw: 0,
        signals_after_decrypt: 0,
        entities_raw: 0,
        goals_raw: 0,
        goals_after_filter: 0,
      },
      candidatePool: {
        commitment: 0,
        signal: 0,
        relationship: 0,
        relationship_skipped_no_thread: 0,
      },
      filterStages: [],
      discrepancies: [],
      discrepancyDetectorSummary: {
        count: 1,
        classes: ['drift'],
        preview: [
          {
            class: 'drift',
            action_type: 'make_decision',
            stakes: 2,
            urgency: 0.3,
            title: 'Drift signal',
          },
        ],
      },
      convergenceBoosts: [],
      survivors: [],
      finalWinner: null,
      finalOutcome: 'no_valid_action',
    };
    const f = buildGateFunnelFromScorerDiagnostics(diag);
    const prev = f.discrepancy_candidates_preview as Array<{ class: string; score: number | null }>;
    expect(prev[0]?.class).toBe('drift');
    expect(prev[0]?.score).toBeNull();
  });
});
