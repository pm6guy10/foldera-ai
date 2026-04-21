const PLACEHOLDER_GOAL_SOURCES = new Set([
  'onboarding_bucket',
  'onboarding_marker',
  'system_config',
]);

const CONSTRAINT_NOTE_PREFIX =
  /^(DO NOT|Check |Reference slate|AUTO-SUPPRESSED:|Build Foldera in overflow)/i;

const BEHAVIOR_THEME_PREFIX = /^Inferred from behavior:\s*recurring theme\b/i;
const ROLE_THREAD_PURSUIT_PATTERN =
  /\b(?:land|accept|accepted|await(?:ing)?|waiting on|offer|interview|role|position|job|hire|hiring|start|tenure)\b/i;
const CONCRETE_ROLE_THREAD_PATTERN =
  /\b[A-Z]{2,}\d+[A-Z0-9]*\b|\b(?:at|with)\s+[A-Z][A-Za-z0-9&./-]+\b|\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i;
const STALE_THREAD_COMMITMENT_PATTERN =
  /\b(?:await(?:ing)?|waiting on|hiring decision|job offer|offer decision|start(?:ing)? role|start date|interview decision)\b/i;
const ROLE_DESCRIPTOR_TOKENS = new Set([
  'administrative',
  'analyst',
  'appeals',
  'benefits',
  'case',
  'consultant',
  'coordinator',
  'developmental',
  'manager',
  'program',
  'project',
  'resource',
  'specialist',
  'supervisor',
  'technician',
  'training',
]);
const SIGNAL_MATCH_STOPWORDS = new Set([
  'active',
  'after',
  'analyst',
  'application',
  'before',
  'build',
  'clean',
  'current',
  'decision',
  'establish',
  'goal',
  'hiring',
  'interview',
  'land',
  'offer',
  'position',
  'reference',
  'role',
  'stable',
  'supervisor',
  'tenure',
  'thread',
  'with',
]);

export function isPlaceholderGoalSource(source: string | null | undefined): boolean {
  return PLACEHOLDER_GOAL_SOURCES.has(String(source ?? '').trim());
}

export function isConstraintOrSystemGoalText(goalText: string | null | undefined): boolean {
  const text = String(goalText ?? '').trim();
  if (!text) return false;
  if (text.startsWith('__')) return true;
  return CONSTRAINT_NOTE_PREFIX.test(text);
}

export function isBehaviorThemeGoal(goalText: string | null | undefined, source: string | null | undefined): boolean {
  const text = String(goalText ?? '').trim();
  if (!text) return false;
  if (String(source ?? '').trim() !== 'extracted') return false;
  return BEHAVIOR_THEME_PREFIX.test(text);
}

export function isUsableGoalRow(goal: {
  goal_text?: string | null;
  source?: string | null;
}): boolean {
  const text = String(goal.goal_text ?? '').trim();
  if (!text) return false;
  if (isPlaceholderGoalSource(goal.source)) return false;
  if (isConstraintOrSystemGoalText(text)) return false;
  if (isBehaviorThemeGoal(text, goal.source)) return false;
  return true;
}

function tokenizeForFreshSupport(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 4 && !SIGNAL_MATCH_STOPWORDS.has(token));
}

function extractRoleDescriptorTokens(text: string): string[] {
  return tokenizeForFreshSupport(text).filter((token) => ROLE_DESCRIPTOR_TOKENS.has(token));
}

function getFreshSupportStats(
  text: string,
  authoritySignalTexts: string[],
): {
  maxOverlap: number;
  roleOverlap: number;
} {
  const goalTokens = tokenizeForFreshSupport(text);
  if (goalTokens.length === 0 || authoritySignalTexts.length === 0) {
    return { maxOverlap: 0, roleOverlap: 0 };
  }

  const roleTokens = extractRoleDescriptorTokens(text);
  let maxOverlap = 0;
  let roleOverlap = 0;

  for (const signalText of authoritySignalTexts) {
    const signalTokens = new Set(tokenizeForFreshSupport(signalText));
    if (signalTokens.size === 0) continue;
    const overlap = goalTokens.filter((token) => signalTokens.has(token)).length;
    if (overlap > maxOverlap) {
      maxOverlap = overlap;
    }
    if (roleTokens.length > 0) {
      const matchedRoleTokens = roleTokens.filter((token) => signalTokens.has(token)).length;
      if (matchedRoleTokens > roleOverlap) {
        roleOverlap = matchedRoleTokens;
      }
    }
  }

  return { maxOverlap, roleOverlap };
}

function looksLikeConcreteCareerRoleThread(text: string, goalCategory: string | null | undefined): boolean {
  if (String(goalCategory ?? '').trim() !== 'career') return false;
  if (!ROLE_THREAD_PURSUIT_PATTERN.test(text)) return false;
  return CONCRETE_ROLE_THREAD_PATTERN.test(text);
}

export function getGoalQuarantineReason(
  goal: {
    goal_text?: string | null;
    source?: string | null;
    goal_category?: string | null;
  },
  authoritySignalTexts: string[],
): string | null {
  const text = String(goal.goal_text ?? '').trim();
  if (!text) return 'empty_goal_text';
  if (isPlaceholderGoalSource(goal.source)) return 'placeholder_goal_source';
  if (isConstraintOrSystemGoalText(text)) return 'constraint_or_system_goal';
  if (isBehaviorThemeGoal(text, goal.source)) return 'behavior_theme_pseudo_goal';
  if (!looksLikeConcreteCareerRoleThread(text, goal.goal_category)) return null;

  const support = getFreshSupportStats(text, authoritySignalTexts);
  if (support.maxOverlap < 3) {
    return 'stale_role_thread_no_fresh_grounding';
  }

  const roleTokens = extractRoleDescriptorTokens(text);
  if (roleTokens.length >= 2 && support.roleOverlap === 0 && support.maxOverlap < 4) {
    return 'stale_role_thread_contradicted_by_fresh_interview_signals';
  }

  return null;
}

function parseCommitmentDueMs(commitment: {
  due_at?: string | null;
  implied_due_at?: string | null;
}): number | null {
  const raw = String(commitment.due_at ?? commitment.implied_due_at ?? '').trim();
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

function looksLikeStaleRoleThreadCommitment(text: string): boolean {
  return STALE_THREAD_COMMITMENT_PATTERN.test(text) && CONCRETE_ROLE_THREAD_PATTERN.test(text);
}

export function getCommitmentQuarantineReason(
  commitment: {
    description?: string | null;
    due_at?: string | null;
    implied_due_at?: string | null;
  },
  authoritySignalTexts: string[],
  nowMs: number,
): string | null {
  const description = String(commitment.description ?? '').trim();
  if (!description) return 'empty_commitment_description';

  const dueMs = parseCommitmentDueMs(commitment);
  if (dueMs != null) {
    if (dueMs < nowMs - 365 * 24 * 60 * 60 * 1000) {
      return 'impossible_ancient_due_date';
    }
    if (looksLikeStaleRoleThreadCommitment(description) && dueMs < nowMs - 45 * 24 * 60 * 60 * 1000) {
      return 'stale_timebound_role_thread_commitment';
    }
  }

  if (!looksLikeStaleRoleThreadCommitment(description)) return null;
  const support = getFreshSupportStats(description, authoritySignalTexts);
  if (support.maxOverlap < 3) {
    return 'stale_role_thread_commitment_without_fresh_grounding';
  }
  return null;
}
