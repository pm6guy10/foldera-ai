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
