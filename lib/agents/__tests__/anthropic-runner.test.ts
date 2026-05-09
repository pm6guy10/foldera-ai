import { beforeEach, describe, expect, it, vi } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';

class MockAnthropicBudgetExceededError extends Error {
  constructor(
    public readonly scope: string,
    public readonly raw: unknown,
    public readonly rpcErrorMessage?: string,
  ) {
    super(`Anthropic budget governor blocked ${scope}`);
    this.name = 'AnthropicBudgetExceededError';
  }
}

const mockMessagesCreate = vi.fn();
const mockEnsureAnthropicBudget = vi.fn().mockResolvedValue({
  allowed: true,
  raw: { bypassed: 'test' },
});
const mockTrackApiCall = vi.fn().mockResolvedValue(undefined);

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = {
      create: mockMessagesCreate,
    };
  },
}));

vi.mock('@/lib/llm/anthropic-budget-governor', () => ({
  ensureAnthropicBudget: (...args: unknown[]) => mockEnsureAnthropicBudget(...args),
  isAnthropicBudgetExceededError: (error: unknown) => error instanceof MockAnthropicBudgetExceededError,
  AnthropicBudgetExceededError: MockAnthropicBudgetExceededError,
}));

vi.mock('@/lib/utils/api-tracker', () => ({
  trackApiCall: (...args: unknown[]) => mockTrackApiCall(...args),
}));

describe('anthropic-runner budget governor', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = 'test-key';
    mockEnsureAnthropicBudget.mockResolvedValue({
      allowed: true,
      raw: { bypassed: 'test' },
    });
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'hello from the agent' }],
      usage: { input_tokens: 12, output_tokens: 18 },
    });
  });

  it('returns a budget error before Anthropic is called', async () => {
    mockEnsureAnthropicBudget.mockRejectedValue(
      new MockAnthropicBudgetExceededError('agent-runner.gtm_strategist', { allowed: false }, 'cap reached'),
    );
    const { runAgentSonnet } = await import('../anthropic-runner');

    const result = await runAgentSonnet({
      job: 'gtm_strategist',
      system: 'system prompt',
      messages: [{ role: 'user', content: 'hello' }] as Anthropic.MessageParam[],
    });

    expect(result).toEqual({ error: 'Anthropic budget exhausted' });
    expect(mockMessagesCreate).not.toHaveBeenCalled();
    expect(mockTrackApiCall).not.toHaveBeenCalled();
  });

  it('still runs and tracks usage when budget is available', async () => {
    const { runAgentSonnet } = await import('../anthropic-runner');

    const result = await runAgentSonnet({
      job: 'gtm_strategist',
      system: 'system prompt',
      messages: [{ role: 'user', content: 'hello' }] as Anthropic.MessageParam[],
    });

    expect(result).toEqual({
      text: 'hello from the agent',
      inputTokens: 12,
      outputTokens: 18,
    });
    expect(mockEnsureAnthropicBudget).toHaveBeenCalledWith('agent-runner.gtm_strategist');
    expect(mockMessagesCreate).toHaveBeenCalledTimes(1);
    expect(mockTrackApiCall).toHaveBeenCalledWith(expect.objectContaining({
      callType: 'agent:gtm_strategist',
    }));
  });
});
