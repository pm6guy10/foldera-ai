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

/** A named runner-up the winner beat, with the scorer's kill classification. */
export type ConvictionRunnerUp = {
  title: string;
  killReason: 'noise' | 'not_now' | 'trap';
};

/**
 * The stated-objective goal rows carry a keyword tail ("Ship Foldera and onboard the
 * first paying customer — launch, demo, signup, …") that exists for matching, not
 * reading. Cut at the first em-dash or paren so the card shows the objective, not
 * the search terms.
 */
export function shortenObjectiveLabel(goalText: string | null | undefined): string | null {
  if (!goalText) return null;
  const cut = goalText.split(/[—(]/, 1)[0]?.trim() ?? '';
  if (!cut) return null;
  return cut.length > 60 ? `${cut.slice(0, 57).trimEnd()}…` : cut;
}

/** Bare internal ids must never render on a card (the #606 lesson). */
const UUID_LIKE_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-/i;

const KILL_REASON_LABELS: Record<ConvictionRunnerUp['killReason'], string> = {
  noise: 'urgent but off-goal',
  not_now: 'important, not today',
  trap: 'low follow-through',
};

/**
 * Conviction: "why this one beat the rest" — the anchor the winner was ranked
 * against plus the strongest displaced alternative, named. One line, one named
 * runner-up; the trailing count carries the rest of the field (still assurance,
 * not display — a full list would re-trigger the comparison behavior).
 *
 * Returns null when the objective anchor or a clean runner-up is missing — the
 * renderer falls back to the plain coverage line rather than fabricating a
 * comparison that did not happen.
 */
export function buildConvictionLine(input: {
  objectiveLabel: string | null;
  runnerUps: ConvictionRunnerUp[];
  candidateCount: number | null;
}): string | null {
  const objective = input.objectiveLabel?.trim();
  if (!objective) return null;

  const runnerUp = input.runnerUps
    .map((r) => ({ ...r, title: r.title.trim() }))
    .find((r) => r.title && !UUID_LIKE_PATTERN.test(r.title));
  if (!runnerUp) return null;

  const title =
    runnerUp.title.length > 60 ? `${runnerUp.title.slice(0, 57).trimEnd()}…` : runnerUp.title;
  const beat = `beat "${title}" (${KILL_REASON_LABELS[runnerUp.killReason]})`;

  const others =
    typeof input.candidateCount === 'number' && Number.isFinite(input.candidateCount)
      ? input.candidateCount - 2 // minus the winner and the named runner-up
      : 0;
  const tail = others === 1 ? ' and 1 other' : others > 1 ? ` and ${others} others` : '';

  return `Ranked against "${objective}" · ${beat}${tail}.`;
}
