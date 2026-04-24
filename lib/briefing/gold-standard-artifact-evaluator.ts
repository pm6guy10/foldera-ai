/**
 * Deterministic gold-standard artifact evaluator.
 *
 * Non-invasive by design: this helper is scoring-only and not wired into
 * production generation or persistence gates yet.
 */

export interface GoldStandardArtifactEvaluationInput {
  artifactText: string;
  situation?: string | null;
  sourceFacts?: string[];
}

export interface GoldStandardArtifactEvaluationResult {
  passes: boolean;
  score: number;
  missing: string[];
  genericFailureReasons: string[];
}

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'your', 'you', 'are', 'was', 'were', 'have', 'has', 'had',
  'will', 'into', 'about', 'after', 'before', 'over', 'under', 'they', 'their', 'there', 'then', 'than', 'them',
]);

const GENERIC_ADVICE_PATTERN =
  /\b(you should|it may help|try to|best practice|generally|in general|one approach|it might be useful|consider)\b/i;

const HOMEWORK_PATTERN = /\b(consider|prepare|review)\b/i;

const CHECKLIST_PATTERN =
  /(?:^|\n)\s*(?:\d+[\).]|[-*])\s+/m;

const HIDDEN_LEVERAGE_PATTERN =
  /\b(hidden leverage|leverage point|bottleneck|root cause|unlock|single move|constraint that matters)\b/i;

const FINISHED_WORK_PATTERN =
  /\b(final draft|send this|copy\/paste|subject:|body:|packet|as-is)\b/i;

function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 4 && !STOP_WORDS.has(token));
}

function hasSituationAnchor(artifactText: string, situation?: string | null): boolean {
  if (!situation || situation.trim().length === 0) return false;
  const artifactLower = artifactText.toLowerCase();
  const situationTokens = tokenize(situation);
  if (situationTokens.length === 0) return false;
  return situationTokens.some((token) => artifactLower.includes(token));
}

function hasSourceFactAnchor(artifactText: string, sourceFacts?: string[]): boolean {
  if (!Array.isArray(sourceFacts) || sourceFacts.length === 0) return false;
  const artifactLower = artifactText.toLowerCase();
  return sourceFacts.some((fact) => {
    const cleanFact = fact.trim().toLowerCase();
    if (!cleanFact) return false;
    if (cleanFact.length >= 10 && artifactLower.includes(cleanFact)) {
      return true;
    }
    const factTokens = tokenize(cleanFact);
    return factTokens.length > 0 && factTokens.every((token) => artifactLower.includes(token));
  });
}

export function evaluateGoldStandardArtifact(
  input: GoldStandardArtifactEvaluationInput,
): GoldStandardArtifactEvaluationResult {
  const artifactText = input.artifactText.trim();
  const genericFailureReasons: string[] = [];

  if (GENERIC_ADVICE_PATTERN.test(artifactText)) {
    genericFailureReasons.push('generic_advice');
  }

  if (HOMEWORK_PATTERN.test(artifactText)) {
    genericFailureReasons.push('homework_language');
  }

  if (CHECKLIST_PATTERN.test(artifactText) && !FINISHED_WORK_PATTERN.test(artifactText)) {
    genericFailureReasons.push('checklist_instead_of_finished_asset');
  }

  if (!HIDDEN_LEVERAGE_PATTERN.test(artifactText)) {
    genericFailureReasons.push('user_must_figure_out_angle');
  }

  if (genericFailureReasons.length >= 2) {
    genericFailureReasons.push('generic_chatbot_quality');
  }

  const missing: string[] = [];

  if (!hasSituationAnchor(artifactText, input.situation)) {
    missing.push('names_real_situation');
  }

  if (!hasSourceFactAnchor(artifactText, input.sourceFacts)) {
    missing.push('uses_real_source_facts');
  }

  if (!HIDDEN_LEVERAGE_PATTERN.test(artifactText)) {
    missing.push('identifies_hidden_leverage_point');
  }

  if (!FINISHED_WORK_PATTERN.test(artifactText)) {
    missing.push('produces_usable_finished_work');
  }

  if (HOMEWORK_PATTERN.test(artifactText) || CHECKLIST_PATTERN.test(artifactText)) {
    missing.push('reduces_cognitive_load_immediately');
  }

  if (missing.length > 0 || genericFailureReasons.length > 0) {
    missing.push('paid_worthy_delta');
  }

  const uniqueMissing = [...new Set(missing)];
  const uniqueGenericFailures = [...new Set(genericFailureReasons)];

  const score = Math.max(0, 100 - uniqueMissing.length * 12 - uniqueGenericFailures.length * 10);
  const passes = uniqueMissing.length === 0 && uniqueGenericFailures.length === 0 && score >= 80;

  return {
    passes,
    score,
    missing: uniqueMissing,
    genericFailureReasons: uniqueGenericFailures,
  };
}
