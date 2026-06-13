/**
 * Hidden-op detector — the savant layer.
 *
 * The Right Now brain ranks by recency and volume, so a stream that is 95% automated
 * noise (GitHub 604 notifications, Slack 118, LinkedIn ~190, Indeed/Handshake job
 * alerts) buries the one quiet, consequential signal. The clearest example in real
 * data: a single calendar event "First day of work at CWU" three days out — the most
 * consequential thing in the user's week — sitting between "Put Trash Can Out" and
 * "Bible study", invisible because it has a volume of one.
 *
 * The thesis, stated as math: **consequence is inverse to volume.** The thing that
 * matters most is usually the thing with the least traffic defending it. This module
 * scores every dated signal by
 *
 *     score = 100 · imminence · ( wD·domain + wR·rarity + wN·novelty )
 *
 * and returns the highest-consequence buried items — independent of the user's
 * (possibly stale) goals and independent of the calendar's loudest events.
 *
 *  - imminence : how soon the obligation lands (a multiplier — near-term boosts, far
 *                or undated damps but never zeroes a high-consequence item).
 *  - domain    : life-weight of the obligation (a new job's first day ≫ a trash day),
 *                from a deterministic lexicon over the obligation text.
 *  - rarity    : anti-volume. A low-traffic sender/topic is more likely to be the
 *                signal; high-volume automated senders are damped toward the floor.
 *  - novelty   : a one-off beats a weekly recurrence (trash, standing meetings).
 *
 * Deterministic, no LLM, free, unit-testable.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Blend weights for the consequence base (sum = 1.0). Domain dominates; rarity + novelty break ties. */
const W_DOMAIN = 0.45;
const W_RARITY = 0.3;
const W_NOVELTY = 0.25;

/** One normalized signal fact the detector reasons over. */
export interface HiddenOpInput {
  id: string;
  /** outlook, gmail, outlook_calendar, drive, ... */
  source: string | null | undefined;
  /** Sender / calendar owner. Used for anti-volume + automated-noise damping. */
  author: string | null | undefined;
  /** When the signal arrived (ISO). */
  occurredAtIso: string | null | undefined;
  /** email_received, calendar_event, ... */
  type?: string | null;
  /** The obligation's own date (ISO), parsed from extracted_dates[].due, if any. */
  dueIso?: string | null;
  /** The obligation text (extracted_dates[].description or a subject). The detector reads this. */
  description?: string | null;
}

export interface HiddenOp {
  id: string;
  /** 0–100 consequence score. Higher = more deserving of being THE thing surfaced now. */
  score: number;
  /** The classified life-domain. */
  domain: HiddenOpDomain;
  /** Days until the obligation (negative = past). null when undated. */
  daysUntil: number | null;
  description: string;
  author: string | null;
  dueIso: string | null;
  /** Human "why this, why now" line for the card. */
  why: string;
  axes: { imminence: number; domain: number; rarity: number; novelty: number };
}

export type HiddenOpDomain =
  | 'work_transition'
  | 'legal_gov'
  | 'money'
  | 'medical'
  | 'family_baby'
  | 'travel'
  | 'social_faith'
  | 'chore'
  | 'unknown';

/** Life-weight per domain. A new job's first day ≫ a recycling reminder. */
const DOMAIN_WEIGHT: Record<HiddenOpDomain, number> = {
  work_transition: 1.0,
  legal_gov: 0.9,
  money: 0.8,
  medical: 0.7,
  family_baby: 0.7,
  travel: 0.4,
  unknown: 0.35,
  social_faith: 0.25,
  chore: 0.1,
};

/** Ordered most-specific-first; first match wins. */
const DOMAIN_PATTERNS: Array<[HiddenOpDomain, RegExp]> = [
  ['work_transition', /\b(first day|start date|starts?\s+(?:work|on|at)|new job|onboard\w*|orientation|day one|offer letter|accepted? (?:the )?(?:offer|position|role)|begin\w* (?:work|employment))\b/i],
  ['legal_gov', /\b(court|hearing|subpoena|jury|irs|tax(?:es)?|audit|deadline to file|waiver|appeal|claim|deposition|filing|notarize|dmv|passport|renewal)\b/i],
  ['money', /\b(payment|autopay|invoice|bill(?:ing)?|overdraft|overdue|balance due|past due|deposit|withdraw\w*|wire|payroll|paycheck|refund|reimburse\w*|statement)\b|\$\s?\d/i],
  ['medical', /\b(surgery|hospital|er visit|prescription|refill|pharmacy|doctor|physician|appointment|counsel\w*|therapy|lab results|vaccine|carenet|ob\b|obgyn|ultrasound)\b/i],
  ['family_baby', /\b(baby|newborn|infant|midwife|matern\w*|meal ?train|chicken enchiladas|provide a meal|diaper|pediatric|child ?care|babysit\w*)\b/i],
  ['travel', /\b(flight|hotel|reservation|booking|check-?in|itinerary|boarding|onekeycash|airbnb|rental car)\b/i],
  ['social_faith', /\b(bible study|church|small group|life group|momco|fellowship|service|worship|game night|birthday party)\b/i],
  ['chore', /\b(trash|recycl\w*|grocery|groceries|haircut|pickup|pick up the|laundry|lawn|mow|dishes|clean the|vacuum)\b/i],
];

/** High-volume automated senders whose individual messages are almost never the op. */
const NOISE_SENDER = /\b(github\.com|slack\.com|linkedin\.com|indeed\.com|joinhandshake|mercor\.com|micro1\.ai|getsentry|sentry\.io|vercel\.com|governmentjobs|notifications?@|no-?reply|donotreply|do-?not-?reply|noreply|jobs?-|alerts?@|updates?-|invitations?@|shipment-tracking|order-update|account-update)\b/i;

export interface DetectHiddenOpsOptions {
  /** Evaluation clock; defaults to now. Pass explicitly in tests. */
  nowIso?: string;
  /** How many ops to return (ranked). Default 5. */
  limit?: number;
}

function parseTime(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

export function classifyDomain(text: string | null | undefined): HiddenOpDomain {
  if (!text) return 'unknown';
  for (const [domain, pattern] of DOMAIN_PATTERNS) {
    if (pattern.test(text)) return domain;
  }
  return 'unknown';
}

/** Imminence multiplier (0.25–1.2). Near-term boosts; far/undated damps; long-past nearly moot. */
function imminenceMultiplier(daysUntil: number | null): number {
  if (daysUntil === null) return 0.5; // undated — can't time it, but don't kill it
  if (daysUntil < 0) {
    const overdue = -daysUntil;
    if (overdue <= 2) return 0.7; // just lapsed — may still need a response
    if (overdue <= 7) return 0.4;
    return 0.15; // long past — almost certainly handled
  }
  if (daysUntil <= 1) return 1.2;
  if (daysUntil <= 3) return 1.15;
  if (daysUntil <= 7) return 0.95;
  if (daysUntil <= 14) return 0.7;
  if (daysUntil <= 30) return 0.45;
  return 0.3;
}

/** Normalize an author for volume counting + noise classification. */
function normAuthor(author: string | null | undefined): string {
  if (!author) return '';
  const m = author.match(/<([^>]+)>/); // "Name <email>" → email
  return (m ? m[1] : author).trim().toLowerCase();
}

/** A normalized obligation key for recurrence detection (strip dates/numbers). */
function recurrenceKey(description: string | null | undefined): string {
  return (description ?? '')
    .toLowerCase()
    .replace(/[0-9]/g, '')
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 6)
    .join(' ');
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function buildWhy(domain: HiddenOpDomain, daysUntil: number | null, description: string): string {
  const when =
    daysUntil === null
      ? 'no date set'
      : daysUntil < 0
        ? `${Math.abs(Math.round(daysUntil))}d ago`
        : daysUntil < 1
          ? 'today'
          : daysUntil < 2
            ? 'tomorrow'
            : `in ${Math.round(daysUntil)} days`;
  const lead: Record<HiddenOpDomain, string> = {
    work_transition: 'Career pivot',
    legal_gov: 'Legal/government deadline',
    money: 'Money moving',
    medical: 'Health',
    family_baby: 'Family',
    travel: 'Travel',
    social_faith: 'Commitment',
    chore: 'Routine',
    unknown: 'Buried item',
  };
  return `${lead[domain]} — "${description.trim().slice(0, 90)}" (${when}). Quiet signal, high consequence.`;
}

/**
 * Rank recent signals by hidden-op consequence and return the top items.
 * `signals` should be the recent window (e.g. last 30 days); volume is computed over it.
 */
export function detectHiddenOps(
  signals: HiddenOpInput[],
  options: DetectHiddenOpsOptions = {},
): HiddenOp[] {
  const nowMs = parseTime(options.nowIso) ?? Date.now();
  const limit = options.limit ?? 5;

  // Anti-volume: count signals per sender, and recurrences per obligation, across the window.
  const volumeByAuthor = new Map<string, number>();
  const recurrenceCount = new Map<string, number>();
  for (const s of signals) {
    const a = normAuthor(s.author);
    if (a) volumeByAuthor.set(a, (volumeByAuthor.get(a) ?? 0) + 1);
    const rk = recurrenceKey(s.description);
    if (rk) recurrenceCount.set(rk, (recurrenceCount.get(rk) ?? 0) + 1);
  }

  const ops: HiddenOp[] = [];

  for (const s of signals) {
    const description = (s.description ?? '').trim();
    if (!description) continue; // nothing to reason about

    const dueMs = parseTime(s.dueIso);
    const daysUntil = dueMs === null ? null : (dueMs - nowMs) / DAY_MS;

    const domain = classifyDomain(description);
    const domainW = DOMAIN_WEIGHT[domain];

    // Rarity (anti-volume). Self-authored calendar entries are curated, not spam, so they
    // get a higher floor and are judged on domain/novelty rather than punished for volume.
    const author = normAuthor(s.author);
    const isCalendar = (s.source ?? '').includes('calendar') || s.type === 'calendar_event';
    const volume = volumeByAuthor.get(author) ?? 1;
    let rarity: number;
    if (isCalendar) {
      rarity = 0.6; // own calendar — neutral; domain + novelty decide
    } else if (NOISE_SENDER.test(s.author ?? '') || NOISE_SENDER.test(author)) {
      rarity = clamp(0.25 - Math.log10(volume) / 8, 0.05, 0.25); // automated noise → floor
    } else {
      rarity = clamp(1 - Math.log10(volume) / 2, 0.2, 1); // v=1→1.0, v=10→0.5, v=100→0.2
    }

    // Novelty: a one-off beats a weekly recurrence (trash day, standing meeting).
    const rk = recurrenceKey(description);
    const recurs = recurrenceCount.get(rk) ?? 1;
    const novelty = recurs >= 4 ? 0.25 : recurs >= 2 ? 0.6 : 1.0;

    const imminence = imminenceMultiplier(daysUntil);
    const base = W_DOMAIN * domainW + W_RARITY * rarity + W_NOVELTY * novelty;
    const score = Math.round(clamp(100 * base * imminence, 0, 100));

    ops.push({
      id: s.id,
      score,
      domain,
      daysUntil,
      description,
      author: s.author ?? null,
      dueIso: s.dueIso ?? null,
      why: buildWhy(domain, daysUntil, description),
      axes: { imminence, domain: domainW, rarity, novelty },
    });
  }

  ops.sort((a, b) => b.score - a.score);
  return ops.slice(0, limit);
}
