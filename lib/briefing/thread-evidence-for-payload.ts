/**
 * Thread evidence for DecisionPayload `no_thread_no_outcome` gate.
 * Aligns hydrated supporting_signals with scorer winner.sourceSignals so
 * candidates are not blocked when evidence fetch is empty but the scorer
 * already attached past-dated signal refs.
 */

export function filterPastSupportingSignals(
  supporting: ReadonlyArray<{ occurred_at: string }> | undefined,
  nowMs: number = Date.now(),
): Array<{ occurred_at: string }> {
  return (supporting ?? []).filter((s) => {
    const t = new Date(s.occurred_at).getTime();
    return !Number.isNaN(t) && t <= nowMs;
  });
}

export function hasPastWinnerSourceSignals(
  sourceSignals: ReadonlyArray<{ occurredAt?: string }> | undefined,
  nowMs: number = Date.now(),
): boolean {
  for (const s of sourceSignals ?? []) {
    if (!s.occurredAt) continue;
    const t = new Date(s.occurredAt).getTime();
    if (!Number.isNaN(t) && t <= nowMs) return true;
  }
  return false;
}

/** True when the no_thread_no_outcome hard block should be applied (caller adds blocking_reason). */
export function needsNoThreadNoOutcomeBlock(
  winnerType: string,
  hasRealThread: boolean,
  tiedToOutcome: boolean,
): boolean {
  if (winnerType === 'discrepancy') return false;
  if (tiedToOutcome) return false;
  return !hasRealThread;
}
