/**
 * Detect triage / chore-list artifacts for discrepancy winners (finished-work gate).
 */

/** Numbered or bulleted lines that are chores, not drafted work. */
const CHORE_LINE_START =
  /^\s*(?:\d+[\).\]]\s*|[*•-]\s*)(Complete|Schedule|Review|Check|Pay|Submit|Fill|Verify|Assess|Call|Email|Log\s+in|Consider\s+completing|Follow\s+up\s+on)\b/i;

const TRIAGE_HEADER_RE =
  /\b(suggested approach|action items|items to complete|next steps to take|your next steps|to-?do list|triage list)\s*:/i;

function countChoreStarterLines(text: string): number {
  let n = 0;
  for (const line of text.split('\n')) {
    if (CHORE_LINE_START.test(line)) n++;
  }
  return n;
}

/**
 * True when combined directive + reason + artifact text looks like a checklist / triage
 * instead of finished copy-paste-ready work.
 */
export function looksLikeDiscrepancyTriageOrChoreList(combinedText: string): boolean {
  const t = combinedText.trim();
  if (t.length < 40) return false;

  const choreLines = countChoreStarterLines(t);
  if (choreLines >= 2) return true;

  if (TRIAGE_HEADER_RE.test(t) && choreLines >= 1) return true;

  return false;
}
