import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockReserveAnthropicBudgetSlot = vi.fn();

vi.mock('@/lib/cron/api-budget', () => ({
  ANTHROPIC_BUDGET_RESERVE_ESTIMATE_CENTS: 10,
  reserveAnthropicBudgetSlot: mockReserveAnthropicBudgetSlot,
}));

describe('anthropic budget governor', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('bypasses the governor under Vitest by default', async () => {
    const { ensureAnthropicBudget } = await import('../anthropic-budget-governor');

    const result = await ensureAnthropicBudget('test.scope');

    expect(result).toEqual({
      allowed: true,
      raw: { bypassed: 'vitest' },
    });
    expect(mockReserveAnthropicBudgetSlot).not.toHaveBeenCalled();
  });

  it('calls the reserve RPC when the Vitest bypass is explicitly disabled', async () => {
    mockReserveAnthropicBudgetSlot.mockResolvedValue({
      allowed: true,
      raw: { allowed: true, spent_cents: 25 },
    });
    const { ensureAnthropicBudget } = await import('../anthropic-budget-governor');

    const result = await ensureAnthropicBudget('test.scope', {
      estimatedCents: 35,
      skipVitestBypass: true,
    });

    expect(mockReserveAnthropicBudgetSlot).toHaveBeenCalledWith(35);
    expect(result).toEqual({
      allowed: true,
      raw: { allowed: true, spent_cents: 25 },
    });
  });

  it('throws AnthropicBudgetExceededError when the reserve RPC disallows the call', async () => {
    mockReserveAnthropicBudgetSlot.mockResolvedValue({
      allowed: false,
      raw: { allowed: false, cap_cents: 3000 },
      errorMessage: 'budget cap reached',
    });
    const {
      AnthropicBudgetExceededError,
      ensureAnthropicBudget,
      isAnthropicBudgetExceededError,
    } = await import('../anthropic-budget-governor');

    await expect(
      ensureAnthropicBudget('test.scope', { skipVitestBypass: true }),
    ).rejects.toBeInstanceOf(AnthropicBudgetExceededError);

    try {
      await ensureAnthropicBudget('test.scope', { skipVitestBypass: true });
      throw new Error('expected governor to throw');
    } catch (error) {
      expect(isAnthropicBudgetExceededError(error)).toBe(true);
      expect(error).toBeInstanceOf(AnthropicBudgetExceededError);
      expect((error as InstanceType<typeof AnthropicBudgetExceededError>).scope).toBe('test.scope');
      expect((error as InstanceType<typeof AnthropicBudgetExceededError>).raw).toEqual({
        allowed: false,
        cap_cents: 3000,
      });
      expect((error as InstanceType<typeof AnthropicBudgetExceededError>).rpcErrorMessage).toBe('budget cap reached');
    }
  });
});
