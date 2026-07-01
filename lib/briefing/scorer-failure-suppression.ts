/**
 * Scorer-level memory for candidates that already failed generator gates
 * (duplicate similarity, usefulness, stale dates, loop guard, etc.).
 * Action-layer suppression alone lets the same signal/entity win every run.
 */

import type { SupabaseClient } from '@/lib/db/client';
import type { GenerationCandidateSource } from '@/lib/briefing/types';

const MS_DAY = 24 * 60 * 60 * 1000;

/**
 * Stable classifier for "why does this judgment exist" — shared by the generator (to
 * stamp a winning directive's mechanism) and the scorer's judgment-suppression pipeline
 * (to classify a fresh candidate the same way, so dismissed and future judgments compare
 * on equal footing). Defined here, not in generator.ts, so the scorer can use it without
 * an import cycle (generator.ts already imports from scorer.ts).
 */
export type CausalMechanismClass =
  | 'unowned_dependency'
  | 'timing_asymmetry'
  | 'avoidance_pattern'
  | 'relationship_cooling'
  | 'contradiction_drift'
  | 'hidden_approval_blocker'
  | 'general';

export function classifyCausalMechanism(text: string): CausalMechanismClass {
  const lower = text.toLowerCase();
  if (/\b(approval|approver|sign[-\s]?off|final decision|gatekeeper)\b/.test(lower)) {
    return 'hidden_approval_blocker';
  }
  if (/\b(owner|ownership|accountable|dependency|blocked|blocker|handoff)\b/.test(lower)) {
    return 'unowned_dependency';
  }
  if (/\b(avoidance|no reply|no-response|defer|deferred|stalled thread|silence)\b/.test(lower)) {
    return 'avoidance_pattern';
  }
  if (/\b(contradiction|mismatch|drift|says|stated goal|goal vs|inconsistent)\b/.test(lower)) {
    return 'contradiction_drift';
  }
  if (/\b(deadline|due|timing|window|cutoff|late|slip)\b/.test(lower)) {
    return 'timing_asymmetry';
  }
  if (/\b(relationship|cooling|reciprocity|asymmetric effort|unanswered)\b/.test(lower)) {
    return 'relationship_cooling';
  }
  return 'general';
}

/** Default lookback for gate/duplicate failures (matches product spec). */
export const FAILURE_SUPPRESSION_WINDOW_DAYS = 7;

/** After a user skips a real directive (`generation_log.outcome === 'selected'`), suppress the same scorer keys briefly so the same signal does not win every run. Shorter than failure memory so topics can resurface. */
export const USER_SKIP_SUPPRESSION_WINDOW_MS = 48 * 60 * 60 * 1000;

const FAILURE_REASON_PATTERN =
  /duplicate_|usefulness:|llm_failed:|trigger_lock:|ungrounded_currency|artifact_quality:|transactional_sender_decision_pressure|relationship_silence_artifact|all_candidates_blocked|Selected candidate blocked|stale_date_in_directive|GENERATION_LOOP_DETECTED/i;

const MONTH_NAME_TO_INDEX: Record<string, number> = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
};

function keyForSource(kind: string | undefined, id: string | undefined): string | null {
  if (!id) return null;
  if (kind === 'signal') return `signal:${id}`;
  if (kind === 'commitment') return `commitment:${id}`;
  if (kind === 'relationship' || kind === 'emergent' || kind === 'compound') return `entity:${id}`;
  return null;
}

/** Keys derived from generation_log.candidateDiscovery (selected / first candidate). */
export function extractSuppressionKeysFromExecutionResult(
  executionResult: unknown,
): string[] {
  const er = executionResult && typeof executionResult === 'object'
    ? (executionResult as Record<string, unknown>)
    : null;
  if (!er) return [];

  const keys = new Set<string>();
  if (Array.isArray(er.loop_suppression_keys)) {
    for (const x of er.loop_suppression_keys) {
      if (typeof x === 'string' && x.trim()) keys.add(x.trim());
    }
  }

  const genLog = er.generation_log as Record<string, unknown> | undefined;
  const discovery = genLog?.candidateDiscovery as Record<string, unknown> | undefined;
  const topCandidates = discovery?.topCandidates as Array<Record<string, unknown>> | undefined;
  const selected =
    topCandidates?.find((c) => c.decision === 'selected') ?? topCandidates?.[0];
  const sourceSignals = selected?.sourceSignals as Array<Record<string, unknown>> | undefined;
  for (const s of sourceSignals ?? []) {
    const k = keyForSource(s.kind as string | undefined, s.id as string | undefined);
    if (k) keys.add(k);
  }
  return [...keys];
}

function generationLogOutcomeSelected(executionResult: Record<string, unknown> | null): boolean {
  if (!executionResult) return false;
  const genLog = executionResult.generation_log as Record<string, unknown> | undefined;
  return genLog?.outcome === 'selected';
}

function generationLogIndicatesFailure(executionResult: Record<string, unknown>): boolean {
  const genLog = executionResult.generation_log as Record<string, unknown> | undefined;
  if (!genLog) return false;

  if (genLog.outcome === 'no_send') {
    const reasons = (genLog.candidateFailureReasons as unknown[]) ?? [];
    const reasonStr = reasons.map((r) => String(r)).join(' ');
    if (FAILURE_REASON_PATTERN.test(reasonStr)) return true;
    if (typeof genLog.reason === 'string' && FAILURE_REASON_PATTERN.test(genLog.reason)) return true;
  }

  const oc = executionResult.original_candidate as Record<string, unknown> | undefined;
  if (typeof oc?.blocked_by === 'string' && FAILURE_REASON_PATTERN.test(oc.blocked_by)) return true;

  return false;
}

/**
 * User tapped Skip on a generated directive (not a no-send / gate failure row).
 * Only used when {@link rowContributesFailureSuppression} is false for the same row.
 */
export function rowContributesUserSkipSuppression(
  status: string,
  executionResult: Record<string, unknown> | null,
): boolean {
  if (status !== 'skipped' || !executionResult) return false;
  return generationLogOutcomeSelected(executionResult);
}

function rowContributesFailureSuppression(
  status: string,
  actionType: string,
  executionResult: Record<string, unknown> | null,
): boolean {
  if (!executionResult) return false;

  const untilRaw = executionResult.loop_suppression_until;
  if (
    status === 'skipped' &&
    Array.isArray(executionResult.loop_suppression_keys) &&
    typeof untilRaw === 'string'
  ) {
    const untilMs = new Date(untilRaw).getTime();
    if (Number.isFinite(untilMs) && Date.now() < untilMs) return true;
  }

  if (!['skipped', 'draft_rejected', 'rejected'].includes(status)) return false;
  if (actionType !== 'do_nothing') return false;
  return generationLogIndicatesFailure(executionResult);
}

function ttlMsForRow(executionResult: Record<string, unknown>, generatedAtMs: number): number {
  const genLog = executionResult.generation_log as Record<string, unknown> | undefined;
  const reasons = (genLog?.candidateFailureReasons as unknown[]) ?? [];
  const reasonStr = reasons.map((r) => String(r)).join(' ');
  if (/stale_date_in_directive/i.test(reasonStr)) return 2 * MS_DAY;
  return FAILURE_SUPPRESSION_WINDOW_DAYS * MS_DAY;
}

/**
 * Lowercase and strip punctuation for identical-directive loop detection.
 */
export function normalizeDirectiveForLoopDetection(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Persisted directives examined for identical-normalized loop (newest first). */
export const GENERATION_LOOP_DETECTION_WINDOW = 12;
/** Minimum occurrences of the same normalized directive within the window to treat as a loop. */
export const GENERATION_LOOP_MIN_REPEATS = 3;

/** Normalized directive must be at least this long to count toward loop detection (noise guard). */
export const LOOP_DIRECTIVE_MIN_NORMALIZED_LEN = 16;

/**
 * Pure evaluation of identical-directive loops on persisted funnel rows (newest first).
 * Mirrors `detectPersistedDirectiveContentLoop` in `daily-brief-generate` after the DB
 * returns only approval-funnel statuses (excludes `do_nothing` tombstones and `skipped`).
 */
export function evaluatePersistedDirectiveContentLoopFromRows(
  rowsNewestFirst: readonly { directive_text?: string; execution_result?: unknown }[],
  minNormalizedLen: number = LOOP_DIRECTIVE_MIN_NORMALIZED_LEN,
): { isLoop: false } | { isLoop: true; keys: string[]; dominantNorm: string } {
  const windowRows = rowsNewestFirst.slice(0, GENERATION_LOOP_DETECTION_WINDOW);
  if (windowRows.length < GENERATION_LOOP_MIN_REPEATS) return { isLoop: false };

  const texts = windowRows.map((r) => String(r.directive_text ?? ''));
  const loop = detectDominantNormalizedDirectiveLoop(texts, minNormalizedLen);
  if (!loop.isLoop) return { isLoop: false };

  const keys = new Set<string>();
  for (const r of windowRows) {
    const dt = String(r.directive_text ?? '');
    const n = normalizeDirectiveForLoopDetection(dt);
    if (n !== loop.dominantNorm) continue;
    for (const k of extractSuppressionKeysFromExecutionResult(r.execution_result)) {
      keys.add(k);
    }
  }
  return { isLoop: true, keys: [...keys], dominantNorm: loop.dominantNorm };
}

/**
 * True when at least `GENERATION_LOOP_MIN_REPEATS` rows in the first `GENERATION_LOOP_DETECTION_WINDOW`
 * entries share the same normalized directive text (and that text is long enough).
 */
export function detectDominantNormalizedDirectiveLoop(
  directiveTextsNewestFirst: readonly string[],
  minNormalizedLen: number,
): { isLoop: false } | { isLoop: true; dominantNorm: string } {
  const window = directiveTextsNewestFirst.slice(0, GENERATION_LOOP_DETECTION_WINDOW);
  if (window.length < GENERATION_LOOP_MIN_REPEATS) return { isLoop: false };
  const counts = new Map<string, number>();
  for (const dt of window) {
    const n = normalizeDirectiveForLoopDetection(String(dt ?? ''));
    if (!n || n.length < minNormalizedLen) continue;
    counts.set(n, (counts.get(n) ?? 0) + 1);
  }
  for (const [norm, c] of counts) {
    if (c >= GENERATION_LOOP_MIN_REPEATS) return { isLoop: true, dominantNorm: norm };
  }
  return { isLoop: false };
}

function startOfUtcDayMs(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Action-forward fields scanned for stale deadline dates.
 * Only `directive` and `why_now` are included — these are the only fields where the LLM
 * should write forward-looking action deadlines. `evidence` and `insight` are historical
 * context by design and will naturally contain past reference dates that are not stale deadlines.
 */
export function userFacingStaleDateScanText(payload: {
  directive?: unknown;
  why_now?: unknown;
  evidence?: unknown;
  insight?: unknown;
}): string {
  const parts: string[] = [];
  for (const key of ['directive', 'why_now'] as const) {
    const v = payload[key];
    if (typeof v === 'string' && v.trim()) parts.push(v);
  }
  return parts.join('\n');
}

/**
 * Detect ISO dates (20xx-xx-xx), slash dates (20xx/mm/dd), or "Month D" / "Month D, YYYY"
 * in user-facing text that are strictly more than `pastDaysGrace` full UTC days before today.
 */
export function directiveHasStalePastDates(
  directiveText: string,
  now: Date = new Date(),
  pastDaysGrace = 3,
): { stale: boolean; matches: string[] } {
  const matches: string[] = [];
  const cutoff = startOfUtcDayMs(now) - pastDaysGrace * MS_DAY;

  const isoRe = /\b20\d{2}-\d{2}-\d{2}\b/g;
  let m: RegExpExecArray | null;
  while ((m = isoRe.exec(directiveText)) !== null) {
    matches.push(m[0]);
    const t = new Date(`${m[0]}T12:00:00.000Z`).getTime();
    if (Number.isFinite(t) && t < cutoff) {
      return { stale: true, matches: [...new Set(matches)] };
    }
  }

  const slashIsoRe = /\b20\d{2}\/\d{2}\/\d{2}\b/g;
  slashIsoRe.lastIndex = 0;
  while ((m = slashIsoRe.exec(directiveText)) !== null) {
    matches.push(m[0]);
    const segs = m[0].split('/');
    const y = parseInt(segs[0]!, 10);
    const mo = parseInt(segs[1]!, 10);
    const d = parseInt(segs[2]!, 10);
    if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d) || mo < 1 || mo > 12 || d < 1 || d > 31) {
      continue;
    }
    const t = Date.UTC(y, mo - 1, d, 12, 0, 0, 0);
    if (Number.isFinite(t) && t < cutoff) {
      return { stale: true, matches: [...new Set(matches)] };
    }
  }

  const monthRe =
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:,?\s*(20\d{2}))?\b/gi;
  monthRe.lastIndex = 0;
  while ((m = monthRe.exec(directiveText)) !== null) {
    const monthName = m[1];
    const day = parseInt(m[2], 10);
    const yearOpt = m[3] ? parseInt(m[3], 10) : undefined;
    const mi = MONTH_NAME_TO_INDEX[monthName.toLowerCase()];
    if (mi === undefined || !Number.isFinite(day)) continue;
    const y = yearOpt ?? now.getUTCFullYear();
    const t = Date.UTC(y, mi, day, 12, 0, 0, 0);
    matches.push(m[0]);
    if (Number.isFinite(t) && t < cutoff) {
      return { stale: true, matches: [...new Set(matches)] };
    }
  }

  return { stale: false, matches: [] };
}

export function rawScorerCandidateMatchesFailureSuppression(
  candidate: {
    id: string;
    type: 'commitment' | 'signal' | 'relationship';
    sourceSignals: GenerationCandidateSource[];
  },
  activeKeys: Set<string>,
): boolean {
  if (candidate.type === 'signal' && activeKeys.has(`signal:${candidate.id}`)) return true;
  if (candidate.type === 'relationship' && activeKeys.has(`entity:${candidate.id}`)) return true;
  if (candidate.type === 'commitment' && activeKeys.has(`commitment:${candidate.id}`)) return true;

  for (const ss of candidate.sourceSignals) {
    const k = keyForSource(ss.kind, ss.id);
    if (k && activeKeys.has(k)) return true;
  }
  return false;
}

/** Hunt / post-score loops use the same sourceSignals shape. */
export function scoredLoopMatchesFailureSuppression(
  loop: { id: string; type: string; sourceSignals: GenerationCandidateSource[] },
  activeKeys: Set<string>,
): boolean {
  if (loop.type === 'signal' && activeKeys.has(`signal:${loop.id}`)) return true;
  if (loop.type === 'relationship' && activeKeys.has(`entity:${loop.id}`)) return true;
  if (loop.type === 'commitment' && activeKeys.has(`commitment:${loop.id}`)) return true;
  if (loop.type === 'hunt') {
    for (const ss of loop.sourceSignals) {
      const k = keyForSource(ss.kind, ss.id);
      if (k && activeKeys.has(k)) return true;
    }
  }
  for (const ss of loop.sourceSignals) {
    const k = keyForSource(ss.kind, ss.id);
    if (k && activeKeys.has(k)) return true;
  }
  return false;
}

/**
 * Load active suppression keys from recent tkg_actions rows that recorded
 * generator failures or explicit loop guards.
 */
export async function collectActiveFailureSuppressionKeys(
  supabase: SupabaseClient,
  userId: string,
  options?: { mergeKeys?: Set<string>; mergeTtlMs?: number },
): Promise<Set<string>> {
  const windowStart = new Date(
    Date.now() - FAILURE_SUPPRESSION_WINDOW_DAYS * MS_DAY,
  ).toISOString();

  const { data: rows, error } = await supabase
    .from('tkg_actions')
    .select('generated_at, status, action_type, execution_result')
    .eq('user_id', userId)
    .gte('generated_at', windowStart)
    .order('generated_at', { ascending: false })
    .limit(100);

  if (error) {
    console.warn('[failure-suppression] query failed:', error.message);
    return new Set(options?.mergeKeys ?? []);
  }

  const bestExpiryByKey = new Map<string, number>();
  const now = Date.now();

  for (const row of rows ?? []) {
    const er =
      row.execution_result && typeof row.execution_result === 'object'
        ? (row.execution_result as Record<string, unknown>)
        : null;
    const status = String(row.status ?? '');
    const actionType = String(row.action_type ?? '');
    const generatedAtMs = new Date(String(row.generated_at ?? 0)).getTime();
    if (!Number.isFinite(generatedAtMs)) continue;

    const contributesFailure = rowContributesFailureSuppression(status, actionType, er);
    const contributesUserSkip =
      !contributesFailure && rowContributesUserSkipSuppression(status, er);
    if (!contributesFailure && !contributesUserSkip) continue;

    const keys = extractSuppressionKeysFromExecutionResult(er);
    if (keys.length === 0) continue;

    let expiresAtMs: number;
    if (contributesUserSkip) {
      expiresAtMs = generatedAtMs + USER_SKIP_SUPPRESSION_WINDOW_MS;
    } else {
      const untilRaw = er?.loop_suppression_until;
      if (typeof untilRaw === 'string' && Array.isArray(er?.loop_suppression_keys)) {
        const u = new Date(untilRaw).getTime();
        expiresAtMs = Number.isFinite(u) ? u : generatedAtMs + ttlMsForRow(er!, generatedAtMs);
      } else {
        expiresAtMs = generatedAtMs + ttlMsForRow(er ?? {}, generatedAtMs);
      }
    }

    for (const key of keys) {
      const prev = bestExpiryByKey.get(key) ?? 0;
      if (expiresAtMs > prev) bestExpiryByKey.set(key, expiresAtMs);
    }
  }

  const active = new Set<string>();
  for (const [key, exp] of bestExpiryByKey) {
    if (exp > now) active.add(key);
  }

  if (options?.mergeKeys) {
    for (const k of options.mergeKeys) active.add(k);
  }

  return active;
}

// ---------------------------------------------------------------------------
// Judgment suppression (issue #592 dismissal ratchet)
//
// Distinct from the failure-suppression pipeline above: that pipeline is a hard
// filter for generator-gate failures and exact-row duplicate loops. This one reads
// the *reason a human gave* for dismissing a real, valid directive and demotes (never
// hard-drops) future candidates that share the same judgment — "suppress the
// judgment, not the row." A dismissal in March must not make a July recurrence
// invisible, so this is consumed as a score multiplier, not a filter.
// ---------------------------------------------------------------------------

export type DismissalReasonClass = 'not_now' | 'never' | 'wrong_framing' | 'already_done';

/** How long a dismissal keeps dampening matching future candidates, by reason given. */
const DISMISSAL_DECAY_MS: Record<DismissalReasonClass, number> = {
  not_now: 3 * MS_DAY,
  wrong_framing: 10 * MS_DAY,
  already_done: 21 * MS_DAY,
  never: 90 * MS_DAY,
};

/** Score-multiplier floor per reason — candidates survive, never hit zero. */
const DISMISSAL_FLOOR_MULTIPLIER: Record<DismissalReasonClass, number> = {
  not_now: 0.6,
  wrong_framing: 0.4,
  already_done: 0.25,
  never: 0.1,
};

/** Bounds how far back `collectActiveJudgmentSuppressionEntries` looks (longest decay tier). */
export const JUDGMENT_SUPPRESSION_WINDOW_DAYS = 90;

/** Conservative fallback for rows skipped before `execution_result.dismissal` existed — no `never` tier, since that's a new explicit signal only the one-tap reason UI sets. */
const LEGACY_SKIP_REASON_TO_DISMISSAL_REASON: Partial<Record<string, DismissalReasonClass>> = {
  not_relevant: 'wrong_framing',
  wrong_approach: 'wrong_framing',
  already_handled: 'already_done',
};

export type JudgmentSuppressionEntry = {
  expiresAtMs: number;
  reason: DismissalReasonClass;
  feedbackWeight: number | null;
};

/**
 * Reads the judgment behind a skipped row: prefers the rich `execution_result.dismissal`
 * block written by the one-tap reason UI, falls back to `execution_result.inspection.mechanism_class`
 * + the legacy `skip_reason` enum for rows skipped before this shipped. Returns null when there's
 * no mechanism to key suppression on at all (nothing to demote against).
 */
export function extractDismissalFromExecutionResult(
  executionResult: unknown,
  skipReason?: string | null,
): { reason: DismissalReasonClass; mechanismClass: string | null; topicKey: string | null } | null {
  const er = executionResult && typeof executionResult === 'object'
    ? (executionResult as Record<string, unknown>)
    : null;
  const dismissal = er?.dismissal as Record<string, unknown> | undefined;
  const inspection = er?.inspection as Record<string, unknown> | undefined;

  const mechanismClass =
    typeof dismissal?.mechanism_class === 'string'
      ? dismissal.mechanism_class
      : typeof inspection?.mechanism_class === 'string'
        ? inspection.mechanism_class
        : null;
  const topicKey =
    typeof dismissal?.topic_key === 'string'
      ? dismissal.topic_key
      : typeof inspection?.topic_key === 'string'
        ? inspection.topic_key
        : null;

  const DISMISSAL_REASON_VALUES: readonly string[] = ['not_now', 'never', 'wrong_framing', 'already_done'];
  if (typeof dismissal?.reason === 'string' && DISMISSAL_REASON_VALUES.includes(dismissal.reason)) {
    return { reason: dismissal.reason as DismissalReasonClass, mechanismClass, topicKey };
  }

  if (!mechanismClass) return null;
  const legacyReason = skipReason ? LEGACY_SKIP_REASON_TO_DISMISSAL_REASON[skipReason] : undefined;
  return { reason: legacyReason ?? 'not_now', mechanismClass, topicKey };
}

/**
 * Loads active judgment-suppression entries from recently skipped `tkg_actions` rows,
 * keyed by `mechanismClass[:topicKey]` (precise when a topic key exists, broader fallback
 * otherwise — mirrors the existing `getSuppressedCandidateKeys` exact/wildcard pattern).
 * Each key keeps whichever row gives it the furthest-future expiry.
 */
export async function collectActiveJudgmentSuppressionEntries(
  supabase: SupabaseClient,
  userId: string,
): Promise<Map<string, JudgmentSuppressionEntry>> {
  const windowStart = new Date(Date.now() - JUDGMENT_SUPPRESSION_WINDOW_DAYS * MS_DAY).toISOString();

  const { data: rows, error } = await supabase
    .from('tkg_actions')
    .select('generated_at, skip_reason, feedback_weight, execution_result')
    .eq('user_id', userId)
    .eq('status', 'skipped')
    .gte('generated_at', windowStart)
    .order('generated_at', { ascending: false })
    .limit(200);

  if (error) {
    console.warn('[judgment-suppression] query failed:', error.message);
    return new Map();
  }

  const now = Date.now();
  const entries = new Map<string, JudgmentSuppressionEntry>();

  for (const row of rows ?? []) {
    const generatedAtMs = new Date(String(row.generated_at ?? 0)).getTime();
    if (!Number.isFinite(generatedAtMs)) continue;

    const dismissal = extractDismissalFromExecutionResult(row.execution_result, row.skip_reason as string | null);
    if (!dismissal || !dismissal.mechanismClass) continue;

    const expiresAtMs = generatedAtMs + DISMISSAL_DECAY_MS[dismissal.reason];
    if (expiresAtMs <= now) continue;

    const key = dismissal.topicKey ? `${dismissal.mechanismClass}:${dismissal.topicKey}` : dismissal.mechanismClass;
    const feedbackWeight = typeof row.feedback_weight === 'number' ? row.feedback_weight : null;

    const existing = entries.get(key);
    if (!existing || expiresAtMs > existing.expiresAtMs) {
      entries.set(key, { expiresAtMs, reason: dismissal.reason, feedbackWeight });
    }
  }

  return entries;
}

/**
 * Score multiplier (never a hard filter) for a candidate sharing a suppressed judgment.
 * Prefers the precise `mechanismClass:topicKey` entry, falls back to the broader
 * `mechanismClass`-only entry. A non-negative `feedback_weight` (not produced by the skip
 * path today, but a future reconciliation/forgiveness signal) lifts the dampening entirely.
 */
export function judgmentSuppressionMultiplierForCandidate(
  mechanismClass: string | null,
  topicKey: string | null,
  entries: Map<string, JudgmentSuppressionEntry>,
): number {
  if (!mechanismClass || entries.size === 0) return 1;

  const preciseKey = topicKey ? `${mechanismClass}:${topicKey}` : null;
  const entry = (preciseKey ? entries.get(preciseKey) : undefined) ?? entries.get(mechanismClass);
  if (!entry) return 1;
  if (entry.feedbackWeight !== null && entry.feedbackWeight >= 0) return 1;

  return DISMISSAL_FLOOR_MULTIPLIER[entry.reason];
}
