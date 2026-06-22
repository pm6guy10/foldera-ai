const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  azure_ad: 'Microsoft',
  'azure-ad': 'Microsoft',
  microsoft: 'Microsoft',
  google: 'Google',
  gmail: 'Gmail',
  outlook: 'Outlook',
  google_calendar: 'Google Calendar',
  outlook_calendar: 'Outlook Calendar',
  drive: 'Google Drive',
  onedrive: 'OneDrive',
  assistant_chat: 'Assistant Chat',
};

/**
 * Azure AD federates personal/guest (B2B) accounts under a mangled UPN like
 * `b-kapp_outlook.com#EXT#@tenant.onmicrosoft.com` when Graph `mail` is empty.
 * Recover the real address (`b-kapp@outlook.com`) for display and storage.
 * `#EXT#` match is case-insensitive; clean emails (e.g. Google's) pass through
 * untouched. Returns '' for empty input so callers can apply their own fallback.
 */
export function normalizeMicrosoftAccountEmail(raw: string | null | undefined): string {
  if (!raw) return '';
  const value = raw.trim();
  if (!value) return '';
  const extIdx = value.toLowerCase().indexOf('#ext#');
  if (extIdx === -1) return value;
  const prefix = value.slice(0, extIdx);
  const lastUnderscore = prefix.lastIndexOf('_');
  if (lastUnderscore === -1) return prefix;
  return `${prefix.slice(0, lastUnderscore)}@${prefix.slice(lastUnderscore + 1)}`;
}

/**
 * Decide whether a stored Microsoft account email should be rewritten with the
 * freshly resolved address. `resolved` is the already-normalized, lowercased
 * email from Graph (`normalizeMicrosoftAccountEmail(...).toLowerCase()`).
 *
 * Returns true when:
 *  - the row has no email yet (backfill), or
 *  - the stored value differs from the resolved address — e.g. a stale guest
 *    `#EXT#` UPN that an earlier path persisted raw and the previous
 *    null-only backfill could never correct.
 *
 * Idempotent: equal values return false, so a healthy row is never rewritten.
 * Empty `resolved` returns false so a failed Graph lookup never wipes the email.
 */
export function shouldUpdateStoredMicrosoftEmail(
  stored: string | null | undefined,
  resolved: string,
): boolean {
  if (!resolved) return false;
  return (stored ?? '').trim().toLowerCase() !== resolved;
}

export function providerDisplayName(provider: string | null | undefined): string {
  if (!provider) return 'Unknown source';
  const normalized = provider.trim().toLowerCase();
  if (!normalized) return 'Unknown source';

  const mapped = PROVIDER_DISPLAY_NAMES[normalized];
  if (mapped) return mapped;

  return normalized
    .replace(/[_-]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ');
}

export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return 'No signal yet';
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return 'No signal yet';

  const minutes = Math.max(0, Math.floor((Date.now() - ts) / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
