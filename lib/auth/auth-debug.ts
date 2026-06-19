/**
 * Verbose auth tracing logs emails and user IDs, which must never reach
 * production logs. Route all such traces through authDebugLog: it is opt-in via
 * FOLDERA_DEBUG_AUTH=true and reads the flag at call time (never at module load,
 * per the repo's env-access rule). Genuine error/warn diagnostics stay on
 * console.error/console.warn — but should not embed PII.
 */
export function authDebugLog(...args: unknown[]): void {
  if (process.env.FOLDERA_DEBUG_AUTH === 'true') {
    console.log(...args);
  }
}
