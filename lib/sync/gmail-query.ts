const MS_HOUR = 3600000;
const MS_DAY = 86400000;

/**
 * Calendar date string for Gmail `after:` / `before:` (yyyy/mm/dd).
 * Note: Gmail interprets these dates in the **mailbox timezone**, not UTC. For incremental
 * `messages.list` sync, prefer {@link gmailNewerThanClause} so the window tracks `sinceMs`
 * without “future local day” empty results.
 */
export function gmailSearchAfterDateClause(sinceMs: number): string {
  const d = new Date(sinceMs);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}/${mo}/${day}`;
}

/**
 * Relative `newer_than:` clause for incremental sync (interpreted by Gmail from “now”).
 * Covers the elapsed window since `last_synced_at` with a minimum of 1h so sub-hour syncs
 * still list recent mail. Avoids empty `after:yyyy/mm/dd` when UTC calendar day is ahead of
 * the account’s local date.
 */
export function gmailNewerThanClause(sinceMs: number, nowMs: number = Date.now()): string {
  const diffMs = Math.max(0, nowMs - sinceMs);
  if (diffMs < MS_HOUR) return 'newer_than:1h';
  const hours = Math.ceil(diffMs / MS_HOUR);
  if (hours <= 24 * 7) return `newer_than:${hours}h`;
  const days = Math.ceil(diffMs / MS_DAY);
  if (days < 365) return `newer_than:${Math.max(1, days)}d`;
  const years = Math.ceil(diffMs / (365 * MS_DAY));
  return `newer_than:${Math.min(Math.max(1, years), 3)}y`;
}

const GMAIL_BASE_FILTERS = '-in:spam -in:trash';

/**
 * Full `q` string for Gmail `users.messages.list`.
 * Default (excludePromotions false): Primary + Promotions + other tabs — avoids empty incremental
 * sync when Gmail routes most mail to Promotions. Noise is handled in extraction / junk paths.
 * Set `GMAIL_SYNC_EXCLUDE_PROMOTIONS=true` to restore strict `-category:promotions` if needed.
 */
export function buildGmailMessagesListQuery(
  afterDate: string,
  options?: { excludePromotions?: boolean },
): string {
  const base = `after:${afterDate} ${GMAIL_BASE_FILTERS}`;
  if (options?.excludePromotions) {
    return `${base} -category:promotions`;
  }
  return base;
}

/** Incremental Gmail list query: time window from `sinceMs` to now via `newer_than:`. */
export function buildGmailIncrementalListQuery(
  sinceMs: number,
  nowMs?: number,
  options?: { excludePromotions?: boolean },
): string {
  const nt = gmailNewerThanClause(sinceMs, nowMs ?? Date.now());
  const base = `${nt} ${GMAIL_BASE_FILTERS}`;
  if (options?.excludePromotions) {
    return `${base} -category:promotions`;
  }
  return base;
}

/** Dry-run helper: both query variants for the same incremental window (no API calls). */
export function gmailIngestQueryPairDry(sinceMs: number): {
  afterDate: string;
  inclusiveOfPromotionsTab: { q: string };
  strictExcludePromotions: { q: string };
} {
  const afterDate = gmailSearchAfterDateClause(sinceMs);
  return {
    afterDate,
    inclusiveOfPromotionsTab: { q: buildGmailMessagesListQuery(afterDate, { excludePromotions: false }) },
    strictExcludePromotions: { q: buildGmailMessagesListQuery(afterDate, { excludePromotions: true }) },
  };
}
