/**
 * Safe GET targets for the health watchdog (no side effects, no auth required).
 * Pages + lightweight API probes.
 */
export const HEALTH_WATCHDOG_PAGE_PATHS: string[] = [
  '/',
  '/start',
  '/login',
  '/pricing',
  '/blog',
];

export const HEALTH_WATCHDOG_API_PATHS: string[] = [
  '/api/health',
  '/api/auth/session',
  '/api/auth/providers',
];
