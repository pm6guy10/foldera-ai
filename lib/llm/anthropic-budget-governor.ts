import {
  ANTHROPIC_BUDGET_RESERVE_ESTIMATE_CENTS,
  reserveAnthropicBudgetSlot,
  type BudgetReserveResult,
} from '@/lib/cron/api-budget';

export class AnthropicBudgetExceededError extends Error {
  constructor(
    public readonly scope: string,
    public readonly raw: unknown,
    public readonly rpcErrorMessage?: string,
  ) {
    super(
      rpcErrorMessage
        ? `Anthropic budget governor blocked ${scope} (${rpcErrorMessage})`
        : `Anthropic budget governor blocked ${scope}`,
    );
    this.name = 'AnthropicBudgetExceededError';
  }
}

export function isAnthropicBudgetExceededError(
  error: unknown,
): error is AnthropicBudgetExceededError {
  return error instanceof AnthropicBudgetExceededError;
}

export async function ensureAnthropicBudget(
  scope: string,
  options: {
    estimatedCents?: number;
    skipVitestBypass?: boolean;
  } = {},
): Promise<BudgetReserveResult> {
  // Vitest replaces the Anthropic SDK with an offline stub. Default-bypass the
  // governor there so existing deterministic tests stay free; dedicated
  // governor tests can opt back in with skipVitestBypass=true.
  if (process.env.VITEST === 'true' && options.skipVitestBypass !== true) {
    return { allowed: true, raw: { bypassed: 'vitest' } };
  }

  const budget = await reserveAnthropicBudgetSlot(
    options.estimatedCents ?? ANTHROPIC_BUDGET_RESERVE_ESTIMATE_CENTS,
  );

  if (!budget.allowed) {
    throw new AnthropicBudgetExceededError(scope, budget.raw, budget.errorMessage);
  }

  return budget;
}
