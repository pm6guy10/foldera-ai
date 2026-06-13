/**
 * Deterministic commitment risk + due resolution.
 *
 * The Right Now card ranks open commitments to choose one next move. Historically
 * every commitment was written with `risk_score: 0` and `due_confidence` defaulted
 * to 0.5, so the scorer had no signal to differentiate a $21.66 payment from a
 * six-month-stale "Attend Office Hours" calendar dupe. This module computes those
 * fields from facts already known at write time — no LLM, no network, fully
 * deterministic so it is free and unit-testable.
 *
 * Factors:
 * - category weight: money/document/decision/approval work ranks far above
 *   calendar attendance and scheduling chatter.
 * - direction: a commitment the user owes (promisor = self) outranks one the user
 *   is merely waiting on, because the user's own action is the unblock.
 * - money: an explicit dollar amount in the description is a hard stakes signal.
 * - timing: an imminent or recently-lapsed deadline raises risk; a deadline months
 *   in the past collapses it (the obligation is almost certainly moot), which is
 *   what finally drowns the stale calendar rows.
 */

const CATEGORY_BASE: Record<string, number> = {
  payment_financial: 40,
  deliver_document: 38,
  review_approve: 36,
  make_decision: 34,
  follow_up: 24,
  provide_information: 22,
  other: 18,
  schedule_meeting: 14,
  attend_participate: 8,
};

const DEFAULT_CATEGORY_BASE = 18;

/** Categories where an undated obligation still implies "act within a week". */
const IMPLIED_DUE_DAYS: Record<string, number> = {
  payment_financial: 7,
  deliver_document: 7,
  review_approve: 7,
  make_decision: 7,
  follow_up: 14,
};

const DAY_MS = 24 * 60 * 60 * 1000;

export interface CommitmentRiskInput {
  category: string | null | undefined;
  description: string | null | undefined;
  /** Explicit due date (ISO) if the source named one, else null. */
  dueAt: string | null | undefined;
  /** True when the user is the promisor — they owe this. */
  promisorIsSelf: boolean;
  /** True when the user is the promisee — someone owes them. */
  promiseeIsSelf: boolean;
  /** When the commitment was made/created (ISO); used for staleness + implied due. */
  madeAtIso?: string | null;
  /** Evaluation clock; defaults to now. Pass explicitly in tests. */
  nowIso?: string;
}

export interface CommitmentRiskResult {
  /** 0–100 integer. Higher = more deserving of one intervention right now. */
  risk_score: number;
  /** 0–1. Honest confidence in the due date (low, not a misleading 0.5, when unknown). */
  due_confidence: number;
  /** Derived deadline for undated-but-actionable categories, else null. */
  implied_due_at: string | null;
}

function parseTime(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

function hasDollarAmount(description: string | null | undefined): boolean {
  if (!description) return false;
  // $21.66, $1,200, $ 50 — a currency-prefixed number.
  return /\$\s?\d[\d,]*(\.\d+)?/.test(description);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Timing contribution. An imminent or freshly-lapsed deadline is urgent; one
 * long past is almost certainly moot and is pushed negative so stale calendar
 * rows fall out of contention regardless of their category.
 */
function timingScore(dueMs: number | null, nowMs: number): number {
  if (dueMs === null) return 0;
  const deltaDays = (dueMs - nowMs) / DAY_MS;

  if (deltaDays >= 0) {
    // Future deadline: closer is more urgent.
    if (deltaDays <= 3) return 20;
    if (deltaDays <= 7) return 12;
    if (deltaDays <= 30) return 6;
    return 2;
  }

  // Overdue: recently lapsed is urgent; long-lapsed is treated as stale/moot.
  const overdueDays = -deltaDays;
  if (overdueDays <= 30) return 18;
  if (overdueDays <= 90) return 4;
  return -25;
}

/** Direction contribution: what the user owes outranks what they await. */
function directionScore(promisorIsSelf: boolean, promiseeIsSelf: boolean): number {
  if (promisorIsSelf && !promiseeIsSelf) return 20; // user owes someone → their move unblocks
  if (promiseeIsSelf && !promisorIsSelf) return 8; // user is waiting → lower agency
  return 12; // self↔self / unknown
}

/**
 * Gentle staleness decay for undated commitments so a months-old undated row
 * loses to a fresh one, without erasing genuinely high-value undated work.
 */
function undatedStalenessScore(madeMs: number | null, nowMs: number): number {
  if (madeMs === null) return 0;
  const ageDays = (nowMs - madeMs) / DAY_MS;
  if (ageDays <= 7) return 4;
  if (ageDays <= 30) return 0;
  if (ageDays <= 90) return -4;
  return -8;
}

export function computeCommitmentRisk(input: CommitmentRiskInput): CommitmentRiskResult {
  const nowMs = parseTime(input.nowIso) ?? Date.now();
  const category = (input.category ?? 'other').trim() || 'other';
  const base = CATEGORY_BASE[category] ?? DEFAULT_CATEGORY_BASE;

  const dueMs = parseTime(input.dueAt);
  const madeMs = parseTime(input.madeAtIso);

  // Resolve an implied deadline for undated-but-actionable categories.
  let impliedDueAt: string | null = null;
  if (dueMs === null && madeMs !== null && IMPLIED_DUE_DAYS[category] !== undefined) {
    impliedDueAt = new Date(madeMs + IMPLIED_DUE_DAYS[category] * DAY_MS).toISOString();
  }

  const effectiveDueMs = dueMs ?? parseTime(impliedDueAt);

  let score = base;
  score += directionScore(input.promisorIsSelf, input.promiseeIsSelf);
  if (hasDollarAmount(input.description)) score += 15;
  score += timingScore(effectiveDueMs, nowMs);
  if (dueMs === null) score += undatedStalenessScore(madeMs, nowMs);

  const risk_score = Math.round(clamp(score, 0, 100));

  // Honest confidence: explicit date is trusted; implied is a guess; nothing is low.
  let due_confidence: number;
  if (dueMs !== null) due_confidence = 0.9;
  else if (impliedDueAt !== null) due_confidence = 0.6;
  else due_confidence = 0.2;

  return { risk_score, due_confidence, implied_due_at: impliedDueAt };
}
