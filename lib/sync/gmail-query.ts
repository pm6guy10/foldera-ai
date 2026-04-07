/**
 * Gmail `messages.list` query operator `after:` expects a calendar date (yyyy/mm/dd in UTC),
 * not a Unix timestamp. Using epoch seconds yielded empty incremental lists while sync still
 * advanced `last_synced_at`.
 */
export function gmailSearchAfterDateClause(sinceMs: number): string {
  const d = new Date(sinceMs);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}/${mo}/${day}`;
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
