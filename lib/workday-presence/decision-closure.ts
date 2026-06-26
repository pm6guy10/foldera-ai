/**
 * Decision-closure card lines — the override-killer.
 *
 * Trust here is not certainty; it is closure: "I've seen enough to stop reopening
 * this decision." A user re-checks (overrides) when the implicit permission — "if
 * something important existed, it would already be surfaced here" — breaks. The
 * single biggest break is COVERAGE DOUBT ("did it even see the thing I'm worried
 * about?"), which makes people re-check even a correct card. So the card proves it
 * surveyed the field and this one still wins — WITHOUT displaying the field, because
 * a visible list re-triggers the comparison behavior we are trying to collapse.
 *
 * A CONTINUITY line answers "what changed since last time" so a shifted claim does
 * not read as a fresh, untrustworthy guess (instability is the other override cause).
 *
 * These are coverage-ASSURANCE, not coverage-DISPLAY: one quiet line each, never a
 * stack, never a score list. Pure functions — no I/O, no model calls. The whole point
 * is that this stays minimal rendering constraint, not autonomy infrastructure.
 */

/** Identity of the single claim, used to decide continuity vs. a genuine shift. */
export type ClaimIdentity = {
  /** Stable key for the underlying claim (commitment id, thread id, goal id…). */
  key: string | null;
  /** Human label for the prior claim, used only when announcing a shift. */
  label?: string | null;
};

/**
 * Coverage-assurance: "Checked N other open loops — none outranks this." Proves the
 * field was surveyed without showing it. Returns null when there was no real field to
 * survey (a single candidate, or an unknown count) — asserting coverage we did not do
 * would manufacture false authority, which erodes trust faster than silence.
 */
export function buildCoverageLine(consideredCount: number): string | null {
  if (!Number.isFinite(consideredCount) || consideredCount <= 0) return null;
  const loops =
    consideredCount === 1 ? '1 other open loop' : `${consideredCount} other open loops`;
  return `Checked ${loops} — none outranks this right now.`;
}

/**
 * Continuity: answers "is this the same call as last time, or did it move?" so a
 * changed claim reads as a maintained line of judgment, not a fresh guess.
 *
 * - No prior claim → null (first claim has nothing to be continuous with; stay quiet
 *   rather than narrate "this is new").
 * - Same underlying claim → "Still the top priority since last time."
 * - Different claim → name what was displaced, honestly. We do NOT fabricate *why* it
 *   moved (that needs a real delta model); v1 states the shift, not an invented cause.
 */
export function buildContinuityLine(
  prior: ClaimIdentity | null,
  current: ClaimIdentity,
): string | null {
  const priorKey = prior?.key?.trim() || null;
  if (!priorKey) return null;

  const currentKey = current.key?.trim() || null;
  if (currentKey && currentKey === priorKey) {
    return 'Still the top priority since last time.';
  }

  const priorLabel = (prior?.label ?? '').trim();
  return priorLabel
    ? `New top priority — "${priorLabel}" is no longer the most urgent.`
    : 'New top priority since last time.';
}
