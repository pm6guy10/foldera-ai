/**
 * Per-goal diagnostic lenses for the conviction engine user prompt.
 * Keeps domain framing out of the static SYSTEM_PROMPT bulk.
 */

const LENS_BY_CATEGORY: Record<string, string> = {
  career:
    'Career lens — prioritize process windows (applications, interviews, networking cadence), momentum versus stall, and whether visible activity is producing forward motion or a single bottleneck is blocking several threads.',
  financial:
    'Financial lens — prioritize compounding delay (small unpaid loops becoming costly), deadline-driven loss, and explicit dates or amounts grounded in signals.',
  relationship:
    'Relationship lens — interpret patterns from observable behavior only: reply velocity, reciprocity, silence versus prior baseline. Do not claim to know others’ internal motives; stay with interaction patterns and what they imply for the user’s next move.',
  health:
    'Health lens — focus on scheduling consistency and follow-through versus stated intent. Stay non-clinical: logistics, appointments, routines — no diagnoses or medical advice.',
  project:
    'Project lens — single-bottleneck framing: one main constraint; distinguish motion (activity) from progress (outcomes).',
  other:
    'General lens — apply observation versus diagnosis: state what changed, hypothesize a testable mechanism (deferred decision, uncertainty blocking reply, window closing), and tie urgency to dates or consequences in the signals.',
};

export function buildDiagnosticLensBlock(goalCategory: string | null | undefined): string | null {
  const key = (goalCategory ?? '').toLowerCase().trim();
  const text = LENS_BY_CATEGORY[key] ?? LENS_BY_CATEGORY.other;
  return text || null;
}

/** Narrow phrase bans — avoid flaky NLP; only obvious generic mechanisms. */
const VAGUE_MECHANISM_RULES: { re: RegExp; code: string }[] = [
  { re: /\buser is busy\b/i, code: 'causal_diagnosis:vague_mechanism_generic_busy' },
  { re: /\b(you are|they are|user is)\s+too\s+busy\b/i, code: 'causal_diagnosis:vague_mechanism_generic_busy' },
  { re: /\bnot enough time\b/i, code: 'causal_diagnosis:vague_mechanism_time' },
  { re: /\blacks?\s+time\b/i, code: 'causal_diagnosis:vague_mechanism_time' },
  { re: /\bout of time\b/i, code: 'causal_diagnosis:vague_mechanism_time' },
  { re: /\bneeds?\s+to\s+prioritize\b/i, code: 'causal_diagnosis:vague_mechanism_prioritize' },
  { re: /\bshould\s+prioritize\b/i, code: 'causal_diagnosis:vague_mechanism_prioritize' },
  { re: /\btime\s+management\b/i, code: 'causal_diagnosis:vague_mechanism_time_management' },
  { re: /\boverwhelmed\b.*\b(workload|inbox|email)\b/i, code: 'causal_diagnosis:vague_mechanism_overwhelmed' },
];

/**
 * Returns high-precision validation issue codes when mechanism is a generic filler.
 */
export function getVagueMechanismIssues(mechanism: string): string[] {
  const m = mechanism.trim();
  if (!m) return [];
  const issues: string[] = [];
  for (const { re, code } of VAGUE_MECHANISM_RULES) {
    if (re.test(m)) {
      issues.push(code);
    }
  }
  return [...new Set(issues)];
}
