/**
 * Entity attention salience (living graph v1)
 * Stored at tkg_entities.patterns.attention — JSONB alongside bx_stats.
 */

import type { DiscrepancyClass } from '@/lib/briefing/discrepancy-detector';

export const ENTITY_ATTENTION_VERSION = 1;

export const SALIENCE_MIN = 0.05;
export const SALIENCE_MAX = 1.0;
export const DEFAULT_SALIENCE = 0.5;

/** Per-day multiplicative decay factor (salience *= this^days). ~half-life ~23d. */
export const ATTENTION_DECAY_PER_DAY = 0.97;

/** Reinforcement deltas (clamped into [SALIENCE_MIN, SALIENCE_MAX]). */
export const REINFORCE_DELTA_EXECUTED = 0.12;
export const REINFORCE_DELTA_SKIPPED = -0.08;
export const REINFORCE_DELTA_FAILED = -0.04;

/** Scorer: multiplier = lerp(MULTIPLIER_MIN, MULTIPLIER_MAX, normalized effective salience). */
export const SALIENCE_MULTIPLIER_MIN = 0.85;
export const SALIENCE_MULTIPLIER_MAX = 1.15;

/** Cap raw salience before multiplier when trust_class is noisy. */
export const SALIENCE_CAP_TRANSACTIONAL_JUNK = 0.35;

export const DISCREPANCY_SILENCE_SALIENCE_EXEMPT: ReadonlySet<DiscrepancyClass> = new Set([
  'decay',
  'risk',
  'avoidance',
]);

export interface EntityAttentionState {
  version: number;
  salience: number;
  last_reinforced_at: string;
  last_decay_at?: string;
  reinforce_count?: number;
  /** Idempotency: last action whose terminal outcome was applied to salience. */
  last_terminal_attention_action_id?: string;
}

export interface EntitySalienceRow {
  id: string;
  name: string;
  patterns: unknown;
  trust_class: string | null;
  primary_email?: string | null;
  emails?: unknown;
}

export interface ScoringCandidateRef {
  id: string;
  type: string;
  entityName?: string;
  discrepancyClass?: DiscrepancyClass;
}

export function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    s.trim(),
  );
}

export function clampSalience(n: number): number {
  if (Number.isNaN(n) || !Number.isFinite(n)) return DEFAULT_SALIENCE;
  return Math.min(SALIENCE_MAX, Math.max(SALIENCE_MIN, n));
}

export function normalizeEntityNameKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9\s@._+-]/gi, '');
}

/**
 * Cap effective salience used for scoring multiplier (transactional/junk stay weak).
 */
export function capSalienceForTrustClass(salience: number, trustClass: string | null | undefined): number {
  const t = (trustClass ?? '').toLowerCase();
  if (t === 'transactional' || t === 'junk') {
    return Math.min(salience, SALIENCE_CAP_TRANSACTIONAL_JUNK);
  }
  return salience;
}

export function parseAttentionFromPatterns(patterns: unknown): EntityAttentionState | null {
  if (!patterns || typeof patterns !== 'object') return null;
  const raw = (patterns as Record<string, unknown>).attention;
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const salience = typeof o.salience === 'number' ? o.salience : DEFAULT_SALIENCE;
  const lastReinforced =
    typeof o.last_reinforced_at === 'string' ? o.last_reinforced_at : new Date(0).toISOString();
  const lastDecay = typeof o.last_decay_at === 'string' ? o.last_decay_at : undefined;
  const reinforceCount = typeof o.reinforce_count === 'number' ? o.reinforce_count : undefined;
  const lastAct =
    typeof o.last_terminal_attention_action_id === 'string'
      ? o.last_terminal_attention_action_id
      : undefined;
  const version = typeof o.version === 'number' ? o.version : ENTITY_ATTENTION_VERSION;

  return {
    version,
    salience: clampSalience(salience),
    last_reinforced_at: lastReinforced,
    last_decay_at: lastDecay,
    reinforce_count: reinforceCount,
    last_terminal_attention_action_id: lastAct,
  };
}

export function defaultAttention(nowIso: string): EntityAttentionState {
  return {
    version: ENTITY_ATTENTION_VERSION,
    salience: DEFAULT_SALIENCE,
    last_reinforced_at: nowIso,
    reinforce_count: 0,
  };
}

export function mergeAttentionIntoPatterns(
  patterns: Record<string, unknown> | null | undefined,
  attention: EntityAttentionState,
): Record<string, unknown> {
  const base = patterns && typeof patterns === 'object' ? { ...patterns } : {};
  return { ...base, attention: { ...attention } };
}

export type AttentionReinforceOutcome = 'executed' | 'skipped' | 'failed';

export function reinforceAttentionState(
  prev: EntityAttentionState | null,
  outcome: AttentionReinforceOutcome,
  actionId: string,
  nowIso: string,
): EntityAttentionState {
  const current = prev ?? defaultAttention(nowIso);
  if (current.last_terminal_attention_action_id === actionId) {
    return current;
  }

  let delta = 0;
  if (outcome === 'executed') delta = REINFORCE_DELTA_EXECUTED;
  else if (outcome === 'skipped') delta = REINFORCE_DELTA_SKIPPED;
  else delta = REINFORCE_DELTA_FAILED;

  const salience = clampSalience(current.salience + delta);
  return {
    ...current,
    version: ENTITY_ATTENTION_VERSION,
    salience,
    last_reinforced_at: nowIso,
    last_terminal_attention_action_id: actionId,
    reinforce_count: (current.reinforce_count ?? 0) + 1,
  };
}

/** Whole calendar days between two ISO timestamps (UTC date boundaries). */
export function wholeUtcDaysBetween(earlierIso: string, laterIso: string): number {
  const a = new Date(earlierIso).getTime();
  const b = new Date(laterIso).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b <= a) return 0;
  return Math.floor((b - a) / (24 * 60 * 60 * 1000));
}

/**
 * Apply multiplicative decay since last_decay_at (or last_reinforced_at if never decayed).
 */
export function applyAttentionDecay(attention: EntityAttentionState, nowIso: string): EntityAttentionState {
  const ref = attention.last_decay_at ?? attention.last_reinforced_at;
  const days = wholeUtcDaysBetween(ref, nowIso);
  if (days <= 0) {
    return { ...attention, last_decay_at: nowIso };
  }
  let salience = attention.salience * Math.pow(ATTENTION_DECAY_PER_DAY, days);
  salience = clampSalience(salience);
  return {
    ...attention,
    salience,
    last_decay_at: nowIso,
    version: ENTITY_ATTENTION_VERSION,
  };
}

export function scoreMultiplierFromEffectiveSalience(effectiveSalience: number): number {
  const e = clampSalience(effectiveSalience);
  const t = (e - SALIENCE_MIN) / (SALIENCE_MAX - SALIENCE_MIN);
  return SALIENCE_MULTIPLIER_MIN + t * (SALIENCE_MULTIPLIER_MAX - SALIENCE_MULTIPLIER_MIN);
}

export function resolveScoringCandidateEntityId(
  rows: EntitySalienceRow[],
  candidate: ScoringCandidateRef,
): string | null {
  const byId = new Map(rows.map((r) => [r.id, r]));
  if (isUuid(candidate.id) && byId.has(candidate.id)) {
    return candidate.id;
  }
  if (candidate.entityName && candidate.entityName.trim()) {
    const key = normalizeEntityNameKey(candidate.entityName);
    if (!key) return null;
    const hit = rows.find((r) => normalizeEntityNameKey(r.name) === key);
    return hit?.id ?? null;
  }
  return null;
}

export interface LivingGraphMultiplierResult {
  multiplier: number;
  entity_id: string | null;
  raw_salience: number | null;
  effective_salience: number | null;
  exempt_reason: string | null;
}

export function computeLivingGraphMultiplier(
  rows: EntitySalienceRow[],
  candidate: ScoringCandidateRef,
): LivingGraphMultiplierResult {
  if (candidate.type === 'discrepancy' && candidate.discrepancyClass) {
    if (DISCREPANCY_SILENCE_SALIENCE_EXEMPT.has(candidate.discrepancyClass)) {
      return {
        multiplier: 1.0,
        entity_id: null,
        raw_salience: null,
        effective_salience: null,
        exempt_reason: 'discrepancy_silence_evidence',
      };
    }
  }

  const entityId = resolveScoringCandidateEntityId(rows, candidate);
  if (!entityId) {
    return {
      multiplier: 1.0,
      entity_id: null,
      raw_salience: null,
      effective_salience: null,
      exempt_reason: 'no_resolved_entity',
    };
  }

  const row = rows.find((r) => r.id === entityId);
  if (!row) {
    return {
      multiplier: 1.0,
      entity_id: entityId,
      raw_salience: null,
      effective_salience: null,
      exempt_reason: 'entity_row_missing',
    };
  }

  const parsed = parseAttentionFromPatterns(row.patterns);
  const raw = parsed?.salience ?? DEFAULT_SALIENCE;
  const effective = capSalienceForTrustClass(raw, row.trust_class);
  return {
    multiplier: scoreMultiplierFromEffectiveSalience(effective),
    entity_id: entityId,
    raw_salience: raw,
    effective_salience: effective,
    exempt_reason: null,
  };
}
