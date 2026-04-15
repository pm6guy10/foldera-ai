/**
 * Canonical public site origin for metadata, sitemap, and fallbacks.
 * Normalizes legacy `https://www.foldera.ai` in NEXT_PUBLIC_BASE_URL to apex.
 */
export function resolveCanonicalSiteOrigin(): string {
  const trimmed = (process.env.NEXT_PUBLIC_BASE_URL || 'https://foldera.ai').replace(/\/$/, '');
  if (/^https:\/\/www\.foldera\.ai$/i.test(trimmed)) return 'https://foldera.ai';
  return trimmed;
}
