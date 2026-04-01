import type { ConvictionDirective } from './types';

/**
 * Resolves discrepancy class for gates when `directive.discrepancyClass` or the
 * discovery log omits it. Calendar conflict ids: `discrepancy_conflict_<id>_<id>`.
 */
export function effectiveDiscrepancyClassForGates(directive: ConvictionDirective): string | null {
  if (directive.discrepancyClass) return directive.discrepancyClass;
  const top = directive.generationLog?.candidateDiscovery?.topCandidates?.[0];
  if (top?.discrepancyClass) return top.discrepancyClass;
  if (
    top?.candidateType === 'discrepancy' &&
    typeof top.id === 'string' &&
    top.id.startsWith('discrepancy_conflict_')
  ) {
    return 'schedule_conflict';
  }
  return null;
}
