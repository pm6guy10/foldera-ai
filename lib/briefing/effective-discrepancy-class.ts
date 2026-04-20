import type { ConvictionDirective } from './types';

/**
 * Resolves discrepancy class for gates when `directive.discrepancyClass` or the
 * discovery log omits it. Calendar conflict ids: `discrepancy_conflict_<id>_<id>`.
 */
export function effectiveDiscrepancyClassForGates(directive: ConvictionDirective): string | null {
  if (directive.discrepancyClass) return directive.discrepancyClass;
  const candidates = directive.generationLog?.candidateDiscovery?.topCandidates ?? [];
  const tracedWinnerId = directive.winnerSelectionTrace?.finalWinnerId ?? null;
  const selected =
    (tracedWinnerId
      ? candidates.find((candidate) => candidate.id === tracedWinnerId)
      : null) ??
    candidates.find((candidate) => candidate.decision === 'selected') ??
    candidates[0];
  if (selected?.discrepancyClass) return selected.discrepancyClass;
  if (
    selected?.candidateType === 'discrepancy' &&
    typeof selected.id === 'string' &&
    selected.id.startsWith('discrepancy_conflict_')
  ) {
    return 'schedule_conflict';
  }
  return null;
}
