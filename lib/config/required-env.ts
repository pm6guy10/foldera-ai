/**
 * Production core env — fail fast in instrumentation (Node server) so missing
 * Supabase/auth/crypto config surfaces as a single clear error instead of obscure handler crashes.
 * Does not validate cron-only secrets (CRON_SECRET) or optional connectors (Stripe, Resend, etc.).
 */

const PRODUCTION_CORE_KEYS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'ENCRYPTION_KEY',
  'NEXTAUTH_SECRET',
] as const;

export type ProductionCoreEnvKey = (typeof PRODUCTION_CORE_KEYS)[number];

export function getMissingProductionCoreEnv(): ProductionCoreEnvKey[] {
  return PRODUCTION_CORE_KEYS.filter((key) => !process.env[key]?.trim());
}

/**
 * Call from Node instrumentation when running on Vercel production.
 * Throws with a redacted list of missing variable names only (no values).
 */
export function assertProductionCoreEnvOrThrow(): void {
  if (process.env.VERCEL_ENV !== 'production') return;
  const missing = getMissingProductionCoreEnv();
  if (missing.length === 0) return;
  throw new Error(
    `[required-env] Missing required production environment variables: ${missing.join(', ')}. See CLAUDE.md "Environment Variables Required In Vercel".`,
  );
}
