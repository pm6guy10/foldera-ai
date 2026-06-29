/**
 * The owner's ONE stable objective — stated, never inferred from decayed activity.
 *
 * This is the #567 paradigm correction: a head-to-head on live data (2026-06-29)
 * proved that ranking against this stated objective beats ranking against the
 * stored `tkg_goals` model (which had rotted to 82d-frozen job-hunting goals +
 * n-gram garbage). Single source of truth for both the experiment harness
 * (`lib/experimental/state-move.ts`) and the scorer goal anchor
 * (`lib/briefing/scorer-goal-source.ts`).
 */
export const STABLE_OBJECTIVE =
  'make money / ship Foldera / onboard the first paying non-owner user';
