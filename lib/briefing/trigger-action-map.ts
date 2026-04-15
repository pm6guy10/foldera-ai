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
 * Keys match `DiscrepancyClass` in discrepancy-detector.ts.
 */
export const TRIGGER_ACTION_MAP: Record<DiscrepancyClass, TriggerActionRule> = {
  // --- RELATIONSHIP_TEMPERATURE_DROP → send_message ---
  decay: {
    primary_action: 'send_message',
    artifact_shape: 'email',
    required_elements: ['explicit_ask', 'trigger_delta_reference', 'concrete_last_interaction'],
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

  // --- Cross-source (calendar / drive / conversation) ---
  preparation_gap: {
    primary_action: 'send_message',
    artifact_shape: 'email',
    required_elements: ['explicit_ask', 'time_pressure', 'trigger_delta_reference'],
    banned_phrases: [...COMMON_BANNED],
  },
  meeting_open_thread: {
    primary_action: 'send_message',
    artifact_shape: 'email',
    required_elements: ['explicit_ask', 'time_pressure', 'trigger_delta_reference', 'consequence'],
    banned_phrases: [...COMMON_BANNED],
  },
  schedule_conflict: {
    primary_action: 'write_document',
    artifact_shape: 'document',
    required_elements: ['explicit_ask', 'time_pressure', 'trigger_delta_reference', 'forcing_function', 'consequence'],
    banned_phrases: [...COMMON_BANNED],
  },
  stale_document: {
    primary_action: 'write_document',
    artifact_shape: 'document',
    required_elements: ['explicit_ask', 'trigger_delta_reference', 'forcing_function'],
    banned_phrases: [...COMMON_BANNED, 'when you get a chance', 'no rush'],
  },
  document_followup_gap: {
    primary_action: 'send_message',
    artifact_shape: 'email',
    required_elements: ['explicit_ask', 'trigger_delta_reference', 'time_pressure'],
    banned_phrases: [...COMMON_BANNED],
  },
  unresolved_intent: {
    primary_action: 'make_decision',
    artifact_shape: 'document',
    required_elements: ['explicit_ask', 'trigger_delta_reference', 'forcing_function'],
    banned_phrases: [...COMMON_BANNED, 'consider', 'you might want to', 'perhaps'],
  },
  convergence: {
    primary_action: 'send_message',
    artifact_shape: 'email',
    required_elements: ['explicit_ask', 'trigger_delta_reference', 'time_pressure'],
    banned_phrases: [...COMMON_BANNED],
  },
  // Cross-contact pattern awareness → always write_document.
  // The system surfaced a pattern ABOUT the user's situation, not a signal
  // that a specific external person needs to be contacted. An email to one of
  // the listed contacts would be context-free and potentially inappropriate.
  // The artifact should be a synthesized insight + action plan for the user.
  // Cross-contact pattern awareness → always write_document.
  // The system surfaced a pattern ABOUT the user's situation, not a signal
  // that a specific external person needs to be contacted. An email to one of
  // the listed contacts would be context-free and potentially inappropriate.
  // The artifact should be a synthesized insight + action plan for the user.
  behavioral_pattern: {
    primary_action: 'write_document',
    artifact_shape: 'document',
    required_elements: [
      'explicit_ask',
      'trigger_delta_reference',
      'forcing_function',
    ],
    banned_phrases: [...COMMON_BANNED, 'consider', 'you might want to', 'perhaps'],
  },
};

// ---------------------------------------------------------------------------
// Resolve: given a discrepancy class + context, return the locked action
// ---------------------------------------------------------------------------

/**
 * Trigger classes that MUST have a real recipient.
 * Without one, write_document degenerates to a self-directed memo (sludge).
 * These fall back to do_nothing instead of write_document.
 */
const RECIPIENT_REQUIRED_CLASSES: ReadonlySet<DiscrepancyClass> = new Set([
  'decay',
  'drift',
  'goal_velocity_mismatch',
]);

/**
 * Resolve the deterministic action for a trigger class.
 * For send_message triggers: falls back to write_document if no recipient,
 * EXCEPT for recipient-required classes which fall back to do_nothing.
 */
export function resolveTriggerAction(
  triggerClass: DiscrepancyClass,
  hasRecipient: boolean,
): ActionType {
  const rule = TRIGGER_ACTION_MAP[triggerClass];
  if (rule.primary_action === 'send_message' && !hasRecipient) {
    // Recipient-required send triggers without a recipient = no external action possible = do_nothing.
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

function formatEvidenceForTriggerContext(evidenceJson: string): string {
  const raw = evidenceJson.trim();
  if (!raw) return '';
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

/** One-line summary when discrepancy evidence JSON encodes delta metrics (e.g. DeltaMetric). */
function summarizeEvidenceDelta(evidenceJson: string | null | undefined): string | null {
  const raw = evidenceJson?.trim();
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (typeof o.delta_pct !== 'number' || !Number.isFinite(o.delta_pct)) return null;
    const baseline = typeof o.baseline === 'string' ? o.baseline : 'n/a';
    const current = typeof o.current === 'string' ? o.current : 'n/a';
    const tf = typeof o.timeframe === 'string' ? o.timeframe : '';
    return `EVIDENCE_DELTA: baseline=${baseline}, current=${current}, delta_pct=${o.delta_pct}${tf ? `, timeframe=${tf}` : ''}`;
  } catch {
    return null;
  }
}

/**
 * True when user-facing copy looks like scorer/trigger pipeline notation was pasted in.
 * Used for decay reconnect emails where the model used to echo "8 → 0", "/14d", "~0.2", etc.
 */
export function artifactContainsDecayPipelineLeak(text: string): boolean {
  const t = text;
  if (/\b\d+\s*interactions?\s+total\b/i.test(t)) return true;
  if (/\/\d+d\b/i.test(t)) return true;
  if (/~\s*\d+\.\d+/i.test(t)) return true;
  if (/\d+\s*→\s*\d+/.test(t)) return true;
  if (/→\s*0\b/.test(t)) return true;
  if (/\(silence after \d+/i.test(t)) return true;
  if (/with \d+\s*→/i.test(t)) return true;
  if (/\bvelocity_ratio\s*=/i.test(t)) return true;
  return false;
}

const DECAY_NATURAL_THEME_RE =
  /(silence|quiet|reconnect|reach out|touch base|heard from|catch up|follow up|last (?:time|note|email|thread|message|conversation)|while\s+since|months?\s+without|days?\s+without|haven'?t\s+heard)/i;

export interface BuildTriggerContextOptions {
  /** Discrepancy detector JSON delta metrics (e.g. DeltaMetric). */
  evidenceJson?: string | null;
}

/**
 * Build the TRIGGER_CONTEXT prompt block injected into the generator.
 * This is the first thing the LLM sees about the candidate — it MUST
 * use type + delta + why_now in the first 2 sentences of the artifact.
 */
export function buildTriggerContextBlock(
  triggerClass: DiscrepancyClass,
  trigger: TriggerMetadata,
  options?: BuildTriggerContextOptions,
): string {
  const rule = TRIGGER_ACTION_MAP[triggerClass];
  const evidenceBlock =
    options?.evidenceJson?.trim() ?
      [
        `  delta_metrics (structured evidence):`,
        ...formatEvidenceForTriggerContext(options.evidenceJson).split('\n').map((l) => `    ${l}`),
      ]
    : [];
  const deltaSummary = summarizeEvidenceDelta(options?.evidenceJson ?? null);
  const deltaSummaryLines = deltaSummary ? [`  ${deltaSummary}`] : [];

  // Decay: silence is the signal — do not demand deadline/consequence language that
  // forces generic "catch up" copy. Specific last-thread + why-now + ask instead.
  if (triggerClass === 'decay' && rule.artifact_shape === 'email') {
    return [
      `TRIGGER_CONTEXT (relationship decay — INTERNAL LINES BELOW ARE FOR REASONING ONLY):`,
      `  Do NOT paste baseline/current/delta/timeframe lines, interaction counts, "/Nd" rates, "~0.x" values, arrows (→), or the word "baseline" into the email subject or body.`,
      `  Translate stakes into normal human language (last thread, topic, silence, awkwardness, goal risk). The recipient must not see pipeline metrics.`,
      `  type: decay`,
      `  baseline: ${trigger.baseline_state}`,
      `  current: ${trigger.current_state}`,
      `  delta: ${trigger.delta}`,
      `  timeframe: ${trigger.timeframe}`,
      `timeframe: ${trigger.timeframe}`,
      `  why_now: ${trigger.why_now}`,
      `  outcome_class: ${trigger.outcome_class}`,
      `  locked_action: ${rule.primary_action}`,
      `  artifact_shape: email`,
      ...evidenceBlock,
      ...deltaSummaryLines,
      ``,
      `DECAY_RECONNECTION_RULE:`,
      `Do not write "it's been a while", "been a while", "just checking in", or generic check-in language.`,
      `The email must reference:`,
      `  — Something specific from your last interaction with this person (subject, topic, or thread from context above).`,
      `  — A concrete reason this reconnection matters NOW (use the human meaning of why_now — stalled thread, relationship cooling, goal at risk — not a recap of the internal delta line).`,
      `  — A specific ask or topic that matches what this person can actually help with (their role, past thread, or linked goal).`,
      `If you cannot find specific context in the prompt to satisfy all three, output do_nothing. Generic reconnection emails are worse than no email.`,
      ``,
      `TRIGGER RULES (decay):`,
      `1. Open with a concrete callback to the last interaction — not a vague preamble.`,
      `2. Tie the ask to the relationship situation (silence, last topic, why it matters now) using only natural language — zero internal metrics.`,
      `3. One clear ask; no filler closings.`,
      `4. Banned phrases: ${rule.banned_phrases.map(p => `"${p}"`).join(', ')}`,
    ].join('\n');
  }

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
    `  timeframe: ${trigger.timeframe}`,
    `timeframe: ${trigger.timeframe}`,
    `  why_now: ${trigger.why_now}`,
    `  outcome_class: ${trigger.outcome_class}`,
    `  locked_action: ${rule.primary_action}`,
    `  artifact_shape: ${rule.artifact_shape}`,
    ...evidenceBlock,
    ...deltaSummaryLines,
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
  const normArtifact =
    artifactAction === 'schedule_block' ? 'schedule' : artifactAction;
  const actionOk =
    normArtifact === expectedAction ||
    (expectedAction === 'send_message' &&
      normArtifact === 'write_document' &&
      !RECIPIENT_REQUIRED_CLASSES.has(triggerClass)) ||
    (expectedAction === 'make_decision' && normArtifact === 'write_document') ||
    (expectedAction === 'schedule' && (normArtifact === 'schedule' || artifactAction === 'schedule_block')) ||
    (triggerClass === 'unresolved_intent' &&
      (normArtifact === 'schedule' || artifactAction === 'schedule_block' || normArtifact === 'send_message'));
  if (!actionOk) {
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

  // 4. Delta / theme reference (decay: natural relationship theme only — do not require echoing delta tokens)
  if (triggerClass === 'decay') {
    if (artifactContainsDecayPipelineLeak(artifactText)) {
      violations.push('decay_pipeline_metric_echo: artifact contains internal metric notation');
    }
    if (!DECAY_NATURAL_THEME_RE.test(artifactText)) {
      violations.push('missing_relationship_decay_theme: artifact should reflect silence, last thread, or reconnection in plain language');
    }
  } else {
    const deltaTerms = extractKeyTerms(trigger.delta);
    const deltaHit = deltaTerms.some(term => lower.includes(term.toLowerCase()));
    if (!deltaHit && deltaTerms.length > 0) {
      violations.push(`missing_delta_reference: artifact does not reference the trigger delta`);
    }
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
