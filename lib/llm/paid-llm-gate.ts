/**
 * Global fail-closed gate for all Anthropic (paid) model traffic.
 *
 * When unset or not exactly the string "true", no production code path may call
 * `messages.create`. Vitest sets ALLOW_PAID_LLM=true in vitest.config.ts so the
 * offline SDK stub can still exercise call sites.
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
  return process.env.ALLOW_PAID_LLM === 'true';
}

/** Throws PaidLlmDisabledError when paid calls are not explicitly enabled. */
export function assertPaidLlmAllowed(scope: string): void {
  if (!isPaidLlmAllowed()) {
    throw new PaidLlmDisabledError(scope);
  }
}
