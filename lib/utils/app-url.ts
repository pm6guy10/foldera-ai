/**
 * The app's own public origin, for building absolute URLs in server code
 * (OAuth redirect URIs, webhook notificationUrls, email links).
 *
 * Priority mirrors the long-standing local copy in lib/cron/connector-health.ts:
 * explicit config first, Vercel's auto URL next, production domain last.
 */
export function resolveAppBaseUrl(): string {
  if (process.env.NEXTAUTH_URL) return process.env.NEXTAUTH_URL.replace(/\/$/, '');
  if (process.env.NEXT_PUBLIC_BASE_URL) return process.env.NEXT_PUBLIC_BASE_URL.replace(/\/$/, '');
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'https://foldera.ai';
}
