// The cost lever for event-driven (push) delivery.
//
// A provider push fires the webhook the instant ANYTHING changes — a new email, a
// calendar tweak, a file touched, an automated receipt, a marketing blast. Running the
// expensive brain (generateDirective + artifact, real LLM spend) on every one of those
// would make cost scale with inbound volume. This gate runs FIRST, in plain code, for $0,
// and decides whether a change is material enough to justify spending the brain.
//
// Deliberately conservative-cheap: it does NOT try to judge importance (that's the bottom
// gate's job, downstream, after the brain runs). It only asks "did something the brain
// could plausibly act on actually arrive?" Drive-only file touches are NOT material here —
// the trigger-runner's adaptSignalToFreshEvent ignores Drive sources anyway, so spending
// the brain on them is pure waste. New inbound mail or calendar changes ARE material.
//
// The HEARTBEAT path (the throttled daily cron) deliberately bypasses this gate: once a day
// we want to evaluate the whole commitment pool for completeness (time-based lapsing
// commitments have no inbound signal). Cheap because it is once. The PUSH path, which can
// fire many times an hour, is where this gate earns its keep.

export interface SyncDelta {
  gmail: number;
  calendar: number;
  drive: number;
}

export interface MaterialityVerdict {
  material: boolean;
  reason: string;
}

/**
 * Decide whether a freshly-synced delta warrants spending the brain on a PUSH event.
 * Pure, synchronous, no network — the free pre-filter before any LLM call.
 */
export function isMaterialChange(delta: SyncDelta): MaterialityVerdict {
  const inbound = delta.gmail + delta.calendar;
  if (inbound > 0) {
    return {
      material: true,
      reason: `material: ${delta.gmail} mail + ${delta.calendar} calendar signal(s) arrived`,
    };
  }
  if (delta.drive > 0) {
    return {
      material: false,
      reason: `immaterial: ${delta.drive} Drive-only signal(s) — not actionable by the trigger path, skipping brain`,
    };
  }
  return { material: false, reason: 'immaterial: no new signals in delta' };
}
