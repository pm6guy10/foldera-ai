import { OWNER_USER_ID } from '@/lib/auth/constants';
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

// TODO: These constraints are time-bound to the MAS3 hiring window.
// After MAS3 resolves (hired or rejected), remove this entire block
// and replace with DB-driven constraints from tkg_goals.

const STALE_CONSULTING_ERA_PATTERNS: ConstraintPattern[] = [
  {
    code: 'stale_consulting_era',
    message: 'consulting-era context is stale for the current daily brief window',
    pattern: /\b(kapp advisory|bloomreach|justworks|storytelling engine|visual disconnect|category lockout|kayna|paty)\b/i,
  },
];

const OWNER_MAS3_CONSTRAINTS: PinnedBriefConstraints = {
  id: 'owner_mas3_window',
  promptLines: [
    'MAS3 / state-government path is the primary lane.',
    'Foldera is a legitimate build project and can appear in directives.',
    'Never propose consulting, fractional work, revenue bridges, Mercor outreach, or client-acquisition fallback plans.',
    'The Functional Program Analyst 3 (HCBM Contracts Analyst) position has been explicitly rejected. Never generate directives about FPA3, HCBM, or that application.',
    'Do not reopen locked decisions like MAS3 vs Foldera, MAS3 vs backup applications, or other already-closed priority calls.',
    'Decision directives must lead with the recommendation, not ask whether to choose between options.',
    'If no directive obeys these constraints, fail validation and send nothing.',
  ],
  pinnedGoals: [
    {
      goal_text: 'Protect the MAS3 / state-government path as the primary focus until that hiring window resolves.',
      priority: 5,
      goal_category: 'career',
    },
  ],
  suppressReflectivePatterns: true,
  candidatePatterns: [
    ...STALE_CONSULTING_ERA_PATTERNS,
    {
      code: 'fpa3_rejected',
      message: 'FPA3 / Functional Program Analyst 3 / HCBM Contracts Analyst position was explicitly rejected by the user',
      pattern: /\b(functional program analyst\s*3|fpa\s*3|hcbm\s*contracts?\s*analyst)\b/i,
    },
    {
      code: 'consulting_bridge',
      message: 'consulting and revenue-bridge directives are forbidden in the MAS3 window',
      pattern: /\b(consulting|fractional|mercor|client acquisition|contract opportunit(?:y|ies)|revenue bridge|financial bridge)\b/i,
    },
    {
      code: 'mas3_relitigation',
      message: 'MAS3-vs-overflow priorities are already locked and must not be re-litigated',
      pattern: /\b(decide|decision|choose|whether|reconsider|revisit|abandon|pivot|document your decision)\b[\s\S]{0,120}\b(mas3|state[- ]government)\b[\s\S]{0,120}\b(foldera|consulting|client acquisition|paying users|backup application|revenue)\b/i,
    },
    {
      code: 'mas3_contingency_relitigation',
      message: 'MAS3 contingency-planning directives reopen a locked decision window',
      pattern: /\b(assuming|assume|if)\s+mas3\s+(does(?:n't| not)|will(?:n't| not))\s+(materialize|happen|land)\b/i,
    },
    {
      code: 'goal_rewrite_relitigation',
      message: 'goal-rewrite directives relitigate an already locked priority frame',
      pattern: /\b(update|change|rewrite|align)\s+your\s+(stated\s+)?(top\s+)?goal\b/i,
    },
  ],
  directivePatterns: [
    ...STALE_CONSULTING_ERA_PATTERNS,
    {
      code: 'fpa3_rejected',
      message: 'directive references FPA3 / Functional Program Analyst 3, a position the user explicitly rejected',
      pattern: /\b(functional program analyst\s*3|fpa\s*3|hcbm\s*contracts?\s*analyst)\b/i,
    },
    {
      code: 'consulting_bridge',
      message: 'directive proposes a forbidden consulting or revenue-bridge path',
      pattern: /\b(consulting|fractional|mercor|client acquisition|contract opportunit(?:y|ies)|revenue bridge|financial bridge)\b/i,
    },
    {
      code: 'mas3_relitigation',
      message: 'directive reopens a locked MAS3-vs-overflow decision',
      pattern: /\b(decide whether|whether to|reconsider|revisit|abandon|pivot|document your decision)\b[\s\S]{0,120}\b(mas3|state[- ]government)\b/i,
    },
    {
      code: 'decision_menu',
      message: 'directive is phrased as an unresolved decision menu instead of one concrete recommendation',
      pattern: /\b(decide whether|whether to)\b/i,
    },
    {
      code: 'goal_rewrite_relitigation',
      message: 'directive asks to rewrite goals instead of executing within the locked MAS3 frame',
      pattern: /\b(update|change|rewrite|align)\s+your\s+(stated\s+)?(top\s+)?goal\b/i,
    },
  ],
};

/** Per-user pinned brief rules. Extend this map or move to DB when more accounts need pinned briefs. */
const PINNED_BRIEF_FOR_USER: Readonly<Partial<Record<string, PinnedBriefConstraints>>> = {
  [OWNER_USER_ID]: OWNER_MAS3_CONSTRAINTS,
};

function getPinnedConstraints(userId: string): PinnedBriefConstraints | null {
  return PINNED_BRIEF_FOR_USER[userId] ?? null;
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
  if (input.actionType === 'make_decision' && /\bor\b/i.test(input.directive) && /\bmas3\b/i.test(combined)) {
    violations.push({
      code: 'decision_menu',
      message: 'decision directive presents a choice menu instead of a locked recommendation',
    });
  }

  return uniqueByCode(violations);
}
