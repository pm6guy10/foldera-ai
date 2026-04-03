/**
 * Thread evidence for DecisionPayload `no_thread_no_outcome` gate.
 * Aligns hydrated supporting_signals with scorer winner.sourceSignals so
 * candidates are not blocked when evidence fetch is empty but the scorer
 * already attached past-dated signal refs.
 *
 * AZ-24 slice 2: same union drives evidence freshness (`has_recent_evidence`,
 * DecisionPayload `freshness_state`) so hydrated recent snippets are not ignored
 * when scorer refs are stale or sparse.
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

/**
 * Max timestamp among past-dated supporting rows and sourceSignal refs.
 * Returns 0 when neither side has a valid past ISO time (same “no evidence”
 * shape as pre-union freshness).
 */
export function getNewestEvidenceTimestampMs(
  supporting: ReadonlyArray<{ occurred_at: string }> | undefined,
  sourceSignals: ReadonlyArray<{ occurredAt?: string }> | undefined,
  nowMs: number = Date.now(),
): number {
  let max = 0;
  for (const s of supporting ?? []) {
    const t = new Date(s.occurred_at).getTime();
    if (!Number.isNaN(t) && t <= nowMs) max = Math.max(max, t);
  }
  for (const s of sourceSignals ?? []) {
    if (!s.occurredAt) continue;
    const t = new Date(s.occurredAt).getTime();
    if (!Number.isNaN(t) && t <= nowMs) max = Math.max(max, t);
  }
  return max;
}

/**
 * True when the no_thread_no_outcome hard block should be applied (caller adds blocking_reason).
 *
 * Exempt types:
 * - 'discrepancy': absence of signals IS the structural evidence (decay/risk/drift).
 * - 'relationship': candidate comes from tkg_entities verified interaction history;
 *   that history IS the thread context — blocking on "no current email thread" inverts
 *   the purpose of the reconnect directive.
 */
export function needsNoThreadNoOutcomeBlock(
  winnerType: string,
  hasRealThread: boolean,
  tiedToOutcome: boolean,
): boolean {
  if (winnerType === 'discrepancy') return false;
  if (winnerType === 'relationship') return false;
  if (tiedToOutcome) return false;
  return !hasRealThread;
}
