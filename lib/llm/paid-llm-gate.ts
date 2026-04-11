/**
 * Global fail-closed gate for all Anthropic (paid) model traffic.
 *
 * When unset or not exactly the string "true", no runtime code path may call
 * `messages.create` against api.anthropic.com.
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
  return process.env.ALLOW_PAID_LLM === 'true';
}

/** Throws PaidLlmDisabledError when paid calls are not explicitly enabled. */
export function assertPaidLlmAllowed(scope: string): void {
  if (!isPaidLlmAllowed()) {
    throw new PaidLlmDisabledError(scope);
  }
}
