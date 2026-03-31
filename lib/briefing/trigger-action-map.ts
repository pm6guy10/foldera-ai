/**
 * Trigger → Action Lock
 * =====================
 * Each trigger type maps to exactly ONE primary action_type and artifact shape.
 * No branching. No "consider." No options.
 *
 * The generator RENDERS this mapping. It does not choose.
 */

import type { ActionType } from './types';
import type { DiscrepancyClass, TriggerMetadata } from './discrepancy-detector';

// ---------------------------------------------------------------------------
// Mapping table — one entry per discrepancy class
// ---------------------------------------------------------------------------

export interface TriggerActionRule {
  /** Primary action_type — deterministic, no fallback */
  primary_action: ActionType;
  /** Artifact shape the generator must produce */
  artifact_shape: 'email' | 'document';
  /** What the artifact MUST contain */
  required_elements: readonly string[];
  /** Phrases banned from this trigger's artifact */
  banned_phrases: readonly string[];
}

const COMMON_BANNED = [
  'just checking in',
  'hope this finds you well',
  'touching base',
  'circle back',
  'follow up on our last',
  'wanted to reach out',
  'hope you are doing well',
  'I hope all is well',
] as const;

/**
 * Deterministic mapping: trigger class → action rule.
 *
 * RESPONSE_VELOCITY_COLLAPSE = engagement_collapse
 * MOMENTUM_BREAK             = relationship_dropout
 * DECISION_WINDOW_MISSED     = deadline_staleness
 * GOAL_BEHAVIOR_DIVERGENCE   = drift, goal_velocity_mismatch
 * RELATIONSHIP_TEMPERATURE_DROP = decay, risk
 * ARTIFACT_STALL             = exposure, avoidance
 */
export const TRIGGER_ACTION_MAP: Record<DiscrepancyClass, TriggerActionRule> = {
  // --- RELATIONSHIP_TEMPERATURE_DROP → send_message ---
  decay: {
    primary_action: 'send_message',
    artifact_shape: 'email',
    required_elements: ['explicit_ask', 'time_pressure', 'trigger_delta_reference'],
    banned_phrases: [...COMMON_BANNED],
  },
  risk: {
    primary_action: 'send_message',
    artifact_shape: 'email',
    required_elements: ['explicit_ask', 'time_pressure', 'trigger_delta_reference'],
    banned_phrases: [...COMMON_BANNED],
  },

  // --- RESPONSE_VELOCITY_COLLAPSE → send_message ---
  engagement_collapse: {
    primary_action: 'send_message',
    artifact_shape: 'email',
    required_elements: ['explicit_ask', 'time_pressure', 'trigger_delta_reference'],
    banned_phrases: [...COMMON_BANNED],
  },

  // --- MOMENTUM_BREAK → send_message ---
  relationship_dropout: {
    primary_action: 'send_message',
    artifact_shape: 'email',
    required_elements: ['explicit_ask', 'time_pressure', 'trigger_delta_reference'],
    banned_phrases: [...COMMON_BANNED],
  },

  // --- DECISION_WINDOW_MISSED → send_message (has recipient) OR write_document ---
  deadline_staleness: {
    primary_action: 'send_message',
    artifact_shape: 'email',
    required_elements: ['explicit_ask', 'time_pressure', 'trigger_delta_reference', 'consequence'],
    banned_phrases: [...COMMON_BANNED],
  },

  // --- GOAL_BEHAVIOR_DIVERGENCE → send_message ---
  // Internal drift MUST produce an external action (email to someone who can
  // move the goal forward). A self-directed memo is sludge — it changes nothing.
  // If no recipient exists, resolveTriggerAction returns do_nothing.
  drift: {
    primary_action: 'send_message',
    artifact_shape: 'email',
    required_elements: ['explicit_ask', 'trigger_delta_reference', 'forcing_function'],
    banned_phrases: [...COMMON_BANNED, 'consider', 'you might want to', 'perhaps'],
  },
  goal_velocity_mismatch: {
    primary_action: 'send_message',
    artifact_shape: 'email',
    required_elements: ['explicit_ask', 'trigger_delta_reference', 'forcing_function'],
    banned_phrases: [...COMMON_BANNED, 'consider', 'you might want to', 'perhaps'],
  },

  // --- ARTIFACT_STALL → write_document ---
  exposure: {
    primary_action: 'write_document',
    artifact_shape: 'document',
    required_elements: ['explicit_ask', 'time_pressure', 'trigger_delta_reference', 'consequence'],
    banned_phrases: [...COMMON_BANNED],
  },
  avoidance: {
    primary_action: 'write_document',
    artifact_shape: 'document',
    required_elements: ['explicit_ask', 'trigger_delta_reference', 'forcing_function'],
    banned_phrases: [...COMMON_BANNED, 'when you get a chance', 'no rush'],
  },
};

// ---------------------------------------------------------------------------
// Resolve: given a discrepancy class + context, return the locked action
// ---------------------------------------------------------------------------

/**
 * Internal-drift classes that MUST have a real recipient.
 * Without one, write_document degenerates to a self-directed memo (sludge).
 * These fall back to do_nothing instead of write_document.
 */
const RECIPIENT_REQUIRED_CLASSES: ReadonlySet<DiscrepancyClass> = new Set([
  'drift',
  'goal_velocity_mismatch',
]);

/**
 * Resolve the deterministic action for a trigger class.
 * For send_message triggers: falls back to write_document if no recipient,
 * EXCEPT for internal-drift classes which fall back to do_nothing.
 */
export function resolveTriggerAction(
  triggerClass: DiscrepancyClass,
  hasRecipient: boolean,
): ActionType {
  const rule = TRIGGER_ACTION_MAP[triggerClass];
  if (rule.primary_action === 'send_message' && !hasRecipient) {
    // Internal drift without a recipient = no external action possible = do_nothing.
    // A self-directed document artifact for these classes is sludge.
    if (RECIPIENT_REQUIRED_CLASSES.has(triggerClass)) {
      return 'do_nothing';
    }
    return 'write_document';
  }
  return rule.primary_action;
}

// ---------------------------------------------------------------------------
// Build TRIGGER_CONTEXT prompt section from TriggerMetadata
// ---------------------------------------------------------------------------

/**
 * Build the TRIGGER_CONTEXT prompt block injected into the generator.
 * This is the first thing the LLM sees about the candidate — it MUST
 * use type + delta + why_now in the first 2 sentences of the artifact.
 */
export function buildTriggerContextBlock(
  triggerClass: DiscrepancyClass,
  trigger: TriggerMetadata,
): string {
  const rule = TRIGGER_ACTION_MAP[triggerClass];

  const documentRules = rule.artifact_shape === 'document' ? [
    `6. DOCUMENT MUST END with a NEXT_ACTION section in this exact format:`,
    `   NEXT_ACTION: [one specific action] by [specific deadline]. Owner: [named person or "you"].`,
    `   This section is mandatory. A document without it fails validation.`,
    `7. Do NOT start with "INSIGHT:", "WHY NOW:", or any pipeline label. Start with the situation directly.`,
  ] : [];

  const emailRules = rule.artifact_shape === 'email' ? [
    `6. EMAIL body MUST name the specific decision or action in the first sentence — not "the decision" but WHAT decision.`,
    `7. Consequence MUST name the specific outcome that breaks if not resolved — not "timeline slips" but WHICH timeline and WHAT slips.`,
  ] : [];

  return [
    `TRIGGER_CONTEXT (MANDATORY — use in first 2 sentences of artifact):`,
    `  type: ${triggerClass}`,
    `  baseline: ${trigger.baseline_state}`,
    `  current: ${trigger.current_state}`,
    `  delta: ${trigger.delta}`,
    `  why_now: ${trigger.why_now}`,
    `  outcome_class: ${trigger.outcome_class}`,
    `  locked_action: ${rule.primary_action}`,
    `  artifact_shape: ${rule.artifact_shape}`,
    ``,
    `TRIGGER RULES:`,
    `1. Your artifact MUST reference the delta explicitly (${trigger.delta}).`,
    `2. Your artifact MUST include a forcing function: a yes/no, a specific deadline with a named owner, or an approval gate.`,
    `3. Your artifact MUST NOT be self-addressed. It must target another person or produce a decision the user acts on externally.`,
    `4. Your artifact MUST include time pressure derived from the trigger.`,
    `5. Banned phrases for this trigger: ${rule.banned_phrases.map(p => `"${p}"`).join(', ')}`,
    ...documentRules,
    ...emailRules,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Post-generation validation: does the artifact satisfy the trigger contract?
// ---------------------------------------------------------------------------

export interface TriggerValidationResult {
  pass: boolean;
  violations: string[];
}

/**
 * Validate a generated artifact against its trigger's action lock contract.
 * Returns violations. Empty = PASS.
 */
export function validateTriggerArtifact(
  triggerClass: DiscrepancyClass,
  trigger: TriggerMetadata,
  artifactText: string,
  artifactAction: string,
  targetEntity: string | null,
): TriggerValidationResult {
  const rule = TRIGGER_ACTION_MAP[triggerClass];
  const violations: string[] = [];
  const lower = artifactText.toLowerCase();

  // 1. Action type must match locked action (or write_document fallback for send_message without recipient)
  const expectedAction = rule.primary_action;
  if (artifactAction !== expectedAction && !(expectedAction === 'send_message' && artifactAction === 'write_document')) {
    violations.push(`action_mismatch: expected ${expectedAction}, got ${artifactAction}`);
  }

  // 2. Must not contain banned phrases
  for (const phrase of rule.banned_phrases) {
    if (lower.includes(phrase.toLowerCase())) {
      violations.push(`banned_phrase: "${phrase}"`);
    }
  }

  // 3. Must not be self-addressed (artifact "to" field = user themselves)
  // This is checked by the caller who knows the user's identity

  // 4. Must reference the trigger delta (at least part of it)
  // Extract key terms from the delta for fuzzy matching
  const deltaTerms = extractKeyTerms(trigger.delta);
  const deltaHit = deltaTerms.some(term => lower.includes(term.toLowerCase()));
  if (!deltaHit && deltaTerms.length > 0) {
    violations.push(`missing_delta_reference: artifact does not reference the trigger delta`);
  }

  // 5. Must contain an explicit ask (question mark, imperative, or decision point)
  const hasExplicitAsk = /\?/.test(artifactText) ||
    /\b(please|can you|would you|let me know|confirm|decide|approve|schedule|reply)\b/i.test(artifactText);
  if (!hasExplicitAsk) {
    violations.push(`missing_explicit_ask: no question, imperative, or decision point found`);
  }

  return {
    pass: violations.length === 0,
    violations,
  };
}

/** Extract meaningful terms from a delta string for fuzzy matching */
function extractKeyTerms(delta: string): string[] {
  // Remove common filler words and extract meaningful tokens
  const tokens = delta
    .replace(/[→%()]/g, ' ')
    .split(/[\s,]+/)
    .filter(t => t.length > 3)
    .filter(t => !['from', 'with', 'the', 'and', 'for', 'that', 'this', 'after', 'into', 'zero', 'drop', 'days'].includes(t.toLowerCase()));
  return tokens.slice(0, 5);
}
