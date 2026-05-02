/**
 * Scorer-level memory for candidates that already failed generator gates
 * (duplicate similarity, usefulness, stale dates, loop guard, etc.).
 * Action-layer suppression alone lets the same signal/entity win every run.
 */

import type { SupabaseClient } from '@/lib/db/client';
import type { GenerationCandidateSource } from '@/lib/briefing/types';

const MS_DAY = 24 * 60 * 60 * 1000;

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
