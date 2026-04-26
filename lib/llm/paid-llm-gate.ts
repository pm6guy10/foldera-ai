import {
  isAllowProdPaidLlmEnabled,
  isProdDefaultPipelineDryRunEnabled,
  isVercelProduction,
} from '@/lib/config/prelaunch-spend';

/**
 * Global fail-closed gate for Anthropic (paid) model traffic.
 *
 * Runtime allowance must align with the production spend-policy contract:
 * - local / preview / non-prod: explicit `ALLOW_PAID_LLM=true`
 * - Vercel production with default dry-run enabled: explicit `ALLOW_PROD_PAID_LLM=true`
 * - legacy Vercel production (no default dry-run): paid LLM is the expected live path
 *
 * Vitest sets `process.env.VITEST === 'true'` and resolves `@anthropic-ai/sdk` to
 * `test/stubs/anthropic-sdk-vitest.ts` (no HTTP). In that case this gate returns
 * true so `assertPaidLlmAllowed` can exercise real call sites without spending.
 */

export class PaidLlmDisabledError extends Error {
  constructor(public readonly scope: string) {
    super(
      `Paid LLM disabled (scope=${scope}). Set environment variable ALLOW_PAID_LLM=true to permit Anthropic calls.`,
    );
    this.name = 'PaidLlmDisabledError';
  }
}

export function isPaidLlmAllowed(): boolean {
  if (process.env.VITEST === 'true') {
    return true;
  }
  if (process.env.ALLOW_PAID_LLM === 'true') {
    return true;
  }
  if (!isVercelProduction()) {
    return false;
  }
  if (isProdDefaultPipelineDryRunEnabled()) {
    return isAllowProdPaidLlmEnabled();
  }
  // Legacy production mode: real paid generation is the expected runtime path.
  return true;
}

/** Throws PaidLlmDisabledError when paid calls are not explicitly enabled. */
export function assertPaidLlmAllowed(scope: string): void {
  if (!isPaidLlmAllowed()) {
    throw new PaidLlmDisabledError(scope);
  }
}
