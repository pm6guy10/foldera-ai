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
});
