type MaybeString = string | null | undefined;

export const DUPLICATE_REPEAT_THRESHOLD = 3;
export const ACTIVE_DUPLICATE_GROWTH_WINDOW_MS = 6 * 60 * 60 * 1000;

export type RepeatedDirectiveHealthStatus =
  | 'clear'
  | 'historical_backlog'
  | 'active_regression';

export interface RepeatedDirectiveHealthRow {
  directive_text?: MaybeString;
  generated_at?: MaybeString;
  reason?: MaybeString;
  protective_duplicate_block?: boolean | null | undefined;
}

export interface RepeatedDirectiveHealthSummary {
  status: RepeatedDirectiveHealthStatus;
  maxCopies: number;
  dominantShapeKey: string | null;
  dominantLatestGeneratedAt: string | null;
  latestRowGeneratedAt: string | null;
  latestRowProtectedDuplicateBlock: boolean;
}

type ProofLikeResult = {
  code?: string | null | undefined;
  detail?: MaybeString;
  meta?: Record<string, unknown> | null | undefined;
};

export interface ProofOutcomeAssessment {
  accepted: boolean;
  reason: string;
}

function shapeKeyFromDirectiveText(text: MaybeString): string {
  return String(text ?? '').slice(0, 400);
}

function safeMs(iso: MaybeString): number {
  const ms = new Date(String(iso ?? '')).getTime();
  return Number.isFinite(ms) ? ms : Number.NEGATIVE_INFINITY;
}

export function hasDuplicateSuppressionSignal(text: MaybeString): boolean {
  return /duplicate_\d+pct_similar|duplicate_100pct_similar/i.test(String(text ?? ''));
}

export function isProtectiveDuplicateNoSend(result: Pick<ProofLikeResult, 'detail' | 'meta'>): boolean {
  if (result.meta?.protective_duplicate_block === true) return true;
  return hasDuplicateSuppressionSignal(result.detail);
}

export function assessProofOutcome(result: ProofLikeResult | null | undefined): ProofOutcomeAssessment {
  const code = result?.code ?? null;
  if (code === 'pending_approval_persisted') {
    return {
      accepted: true,
      reason: 'pending_approval_persisted',
    };
  }
  if (code === 'no_send_persisted' && isProtectiveDuplicateNoSend(result ?? {})) {
    return {
      accepted: true,
      reason: 'no_send_persisted:protective_duplicate_block',
    };
  }
  return {
    accepted: false,
    reason: String(code ?? 'missing_result'),
  };
}

export function summarizeRepeatedDirectiveHealth(
  rows: RepeatedDirectiveHealthRow[],
  now = Date.now(),
): RepeatedDirectiveHealthSummary {
  const counts = new Map<string, { count: number; latestMs: number; latestIso: string | null }>();
  let latestRow: RepeatedDirectiveHealthRow | null = null;
  let latestRowMs = Number.NEGATIVE_INFINITY;

  for (const row of rows) {
    const key = shapeKeyFromDirectiveText(row.directive_text);
    const rowMs = safeMs(row.generated_at);
    if (rowMs > latestRowMs) {
      latestRowMs = rowMs;
      latestRow = row;
    }

    const entry = counts.get(key) ?? { count: 0, latestMs: Number.NEGATIVE_INFINITY, latestIso: null };
    entry.count += 1;
    if (rowMs > entry.latestMs) {
      entry.latestMs = rowMs;
      entry.latestIso = typeof row.generated_at === 'string' ? row.generated_at : null;
    }
    counts.set(key, entry);
  }

  let dominantShapeKey: string | null = null;
  let maxCopies = 0;
  let dominantLatestMs = Number.NEGATIVE_INFINITY;
  let dominantLatestGeneratedAt: string | null = null;

  for (const [key, entry] of counts.entries()) {
    if (
      entry.count > maxCopies ||
      (entry.count === maxCopies && entry.latestMs > dominantLatestMs)
    ) {
      dominantShapeKey = key;
      maxCopies = entry.count;
      dominantLatestMs = entry.latestMs;
      dominantLatestGeneratedAt = entry.latestIso;
    }
  }

  const latestRowProtectedDuplicateBlock = latestRow
    ? Boolean(latestRow.protective_duplicate_block) ||
      hasDuplicateSuppressionSignal(latestRow.reason)
    : false;

  if (maxCopies < DUPLICATE_REPEAT_THRESHOLD) {
    return {
      status: 'clear',
      maxCopies,
      dominantShapeKey,
      dominantLatestGeneratedAt,
      latestRowGeneratedAt:
        typeof latestRow?.generated_at === 'string' ? latestRow.generated_at : null,
      latestRowProtectedDuplicateBlock,
    };
  }

  const dominantRecentlyGrew =
    Number.isFinite(dominantLatestMs) &&
    now - dominantLatestMs <= ACTIVE_DUPLICATE_GROWTH_WINDOW_MS;

  const status =
    latestRowProtectedDuplicateBlock
      ? 'historical_backlog'
      : dominantRecentlyGrew
        ? 'active_regression'
        : 'historical_backlog';

  return {
    status,
    maxCopies,
    dominantShapeKey,
    dominantLatestGeneratedAt,
    latestRowGeneratedAt:
      typeof latestRow?.generated_at === 'string' ? latestRow.generated_at : null,
    latestRowProtectedDuplicateBlock,
  };
}
