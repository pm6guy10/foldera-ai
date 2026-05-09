import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

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

const mockEnsureAnthropicBudget = vi.fn().mockResolvedValue({
  allowed: true,
  raw: { bypassed: 'test' },
});
const mockRateLimit = vi.fn();
const mockMessagesCreate = vi.fn();

vi.mock('@/lib/llm/anthropic-budget-governor', () => ({
  ensureAnthropicBudget: (...args: unknown[]) => mockEnsureAnthropicBudget(...args),
  isAnthropicBudgetExceededError: (error: unknown) => error instanceof MockAnthropicBudgetExceededError,
  AnthropicBudgetExceededError: MockAnthropicBudgetExceededError,
}));

vi.mock('@/lib/utils/rate-limit', () => ({
  rateLimit: (...args: unknown[]) => mockRateLimit(...args),
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = {
      create: mockMessagesCreate,
    };
  },
}));

describe('POST /api/try/analyze budget governor', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = 'test-key';
    mockRateLimit.mockResolvedValue({
      success: true,
      remaining: 4,
      resetAt: new Date(Date.now() + 60_000),
    });
    mockEnsureAnthropicBudget.mockResolvedValue({
      allowed: true,
      raw: { bypassed: 'test' },
    });
    mockMessagesCreate.mockResolvedValue({
      content: [{
        type: 'text',
        text: JSON.stringify({
          directive: 'You are not blocked on the task; you are blocked on the conversation you have not started.',
          action_type: 'send_message',
          reason: 'The text centers on repeated avoidance around one named conversation.',
          artifact_type: 'drafted_email',
          artifact: {
            to: 'manager@example.com',
            subject: 'Need to align on the stuck decision',
            body: 'Hi...',
          },
        }),
      }],
      usage: { input_tokens: 10, output_tokens: 20 },
    });
  });

  it('returns 503 and never calls Anthropic when the governor blocks the route', async () => {
    mockEnsureAnthropicBudget.mockRejectedValue(
      new MockAnthropicBudgetExceededError('try-analyze.route', { allowed: false }, 'cap reached'),
    );
    const { POST } = await import('../route');

    const response = await POST(
      new NextRequest('http://localhost:3000/api/try/analyze', {
        method: 'POST',
        body: JSON.stringify({
          text: 'I keep putting off the conversation with my manager even though it is clearly the real blocker.',
        }),
      }),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: 'Anthropic budget exhausted. Try again later.',
    });
    expect(mockMessagesCreate).not.toHaveBeenCalled();
  });
});
