import type { ActionType, ConvictionArtifact, ConvictionDirective } from './types';

export interface BriefGoalRow {
  goal_text: string;
  priority: number;
  goal_category: string;
}

export interface ConstraintViolation {
  code: string;
  message: string;
}

interface ConstraintPattern {
  code: string;
  message: string;
  pattern: RegExp;
}

interface PinnedBriefConstraints {
  id: string;
  promptLines: string[];
  pinnedGoals: BriefGoalRow[];
  suppressReflectivePatterns: boolean;
  candidatePatterns: ConstraintPattern[];
  directivePatterns: ConstraintPattern[];
}

// ---------------------------------------------------------------------------
// Global constraints — apply to ALL users, not just the owner
// ---------------------------------------------------------------------------

const SYSTEM_INTROSPECTION_PATTERNS: ConstraintPattern[] = [
  {
    code: 'system_introspection',
    message: 'directive is about Foldera system health, pipeline metrics, or internal infrastructure — not user-serving',
    pattern: /\b(tkg_signals?|tkg_actions?|tkg_patterns?|signal\s*(?:spike|count|backlog|processing)|unprocessed\s*(?:count|signal)|orchestrator|data\s*pipeline|sync\s*(?:health|error|failure|status)|signal\s*processing\s*stall)/i,
  },
  {
    code: 'system_introspection',
    message: 'directive recommends investigating Foldera infrastructure instead of serving the user',
    pattern: /\b(investigate|debug|diagnose|fix|check\s*(?:why|what))\b[\s\S]{0,80}\b(signal|sync|pipeline|cron|processing|orchestrat|api\s*failure|infrastructure|foldera\s*(?:system|health|error|log))/i,
  },
  {
    code: 'system_introspection',
    message: 'directive references internal system metrics that should never reach the user',
    pattern: /\b(229[- ]signal|signal\s*spike|processing\s*count|decrypt\s*(?:fail|error)|token\s*(?:refresh|expir)|cron\s*(?:job|run|fail)|api\s*(?:usage|spend|rate\s*limit))\b/i,
  },
];

const CONSULTING_DECISION_PATTERNS: ConstraintPattern[] = [
  {
    code: 'consulting_decision_frame',
    message: 'directive asks the user whether to act instead of presenting a real decision with tradeoffs — this is consulting, not a valid decision frame',
    pattern: /\b(should you|consider whether|decide if|evaluate whether|would it be worth|might you want to|have you considered)\b/i,
  },
  {
    code: 'consulting_decision_frame',
    message: 'directive uses imperative coaching language — telling the user what to do rather than presenting a finished artifact',
    pattern: /\b(stop creating|stop doing|pause all|focus exclusively on|focus energy on|requires intervention|intervention required)\b/i,
  },
];

const GLOBAL_CANDIDATE_PATTERNS: ConstraintPattern[] = [
  ...SYSTEM_INTROSPECTION_PATTERNS,
  ...CONSULTING_DECISION_PATTERNS,
];

const GLOBAL_DIRECTIVE_PATTERNS: ConstraintPattern[] = [
  ...SYSTEM_INTROSPECTION_PATTERNS,
  ...CONSULTING_DECISION_PATTERNS,
];

/** Per-user pinned prompts/goals (none in code). User-scoped rows (e.g. tkg_goals, tkg_constraints) apply per account via RLS. */
function getPinnedConstraints(_userId: string): PinnedBriefConstraints | null {
  return null;
}

function uniqueByCode(violations: ConstraintViolation[]): ConstraintViolation[] {
  const seen = new Set<string>();
  return violations.filter((violation) => {
    if (seen.has(violation.code)) return false;
    seen.add(violation.code);
    return true;
  });
}

function collectViolations(text: string, patterns: ConstraintPattern[]): ConstraintViolation[] {
  if (!text.trim()) return [];
  return uniqueByCode(
    patterns
      .filter(({ pattern }) => pattern.test(text))
      .map(({ code, message }) => ({ code, message })),
  );
}

function stringifyArtifact(artifact: ConvictionArtifact | Record<string, unknown> | null): string {
  if (!artifact) return '';
  try {
    return JSON.stringify(artifact);
  } catch {
    return '';
  }
}

export function applyPinnedGoals(
  userId: string,
  goals: Array<{ goal_text: string; priority: number; goal_category: string }>,
): BriefGoalRow[] {
  const constraints = getPinnedConstraints(userId);
  if (!constraints) return goals;

  const merged = [...goals];
  for (const goal of constraints.pinnedGoals) {
    const alreadyPresent = merged.some((candidate) => candidate.goal_text === goal.goal_text);
    if (!alreadyPresent) {
      merged.unshift(goal);
    }
  }

  return merged.sort((a, b) => b.priority - a.priority);
}

export function getPinnedConstraintPrompt(userId: string): string | null {
  const constraints = getPinnedConstraints(userId);
  if (!constraints) return null;
  return constraints.promptLines.map((line) => `- ${line}`).join('\n');
}

export function shouldSuppressReflectivePatterns(userId: string): boolean {
  return getPinnedConstraints(userId)?.suppressReflectivePatterns === true;
}

export function getCandidateConstraintViolations(userId: string, text: string): ConstraintViolation[] {
  const globalViolations = collectViolations(text, GLOBAL_CANDIDATE_PATTERNS);
  const constraints = getPinnedConstraints(userId);
  if (!constraints) return uniqueByCode(globalViolations);
  return uniqueByCode([...globalViolations, ...collectViolations(text, constraints.candidatePatterns)]);
}

export function getDirectiveConstraintViolations(input: {
  userId: string;
  directive: string;
  reason?: string;
  evidence?: Array<Pick<ConvictionDirective['evidence'][number], 'description'>>;
  artifact?: ConvictionArtifact | Record<string, unknown> | null;
  actionType?: ActionType;
}): ConstraintViolation[] {
  const combined = [
    input.directive,
    input.reason ?? '',
    ...(input.evidence ?? []).map((item) => item.description ?? ''),
    stringifyArtifact(input.artifact ?? null),
  ].join('\n');

  // Global constraints apply to all users
  const globalViolations = collectViolations(combined, GLOBAL_DIRECTIVE_PATTERNS);

  const constraints = getPinnedConstraints(input.userId);
  if (!constraints) return uniqueByCode(globalViolations);

  const directiveOnlyPatterns = constraints.directivePatterns.filter((pattern) => pattern.code === 'decision_menu');
  const combinedPatterns = constraints.directivePatterns.filter((pattern) => pattern.code !== 'decision_menu');
  const violations = [
    ...globalViolations,
    ...collectViolations(combined, combinedPatterns),
    ...collectViolations(input.directive, directiveOnlyPatterns),
  ];

  return uniqueByCode(violations);
}
