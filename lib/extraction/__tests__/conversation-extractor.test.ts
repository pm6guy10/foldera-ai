import { beforeEach, describe, expect, it, vi } from 'vitest';

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

const testState = vi.hoisted(() => ({
  insertedSignals: [] as Array<Record<string, unknown>>,
  maybeSingleCalls: 0,
}));

const mockEnsureAnthropicBudget = vi.fn().mockResolvedValue({
  allowed: true,
  raw: { bypassed: 'test' },
});
const mockAnthropicCreate = vi.fn();
const mockTrackApiCall = vi.fn().mockResolvedValue(undefined);
const mockAssertPaidLlmAllowed = vi.fn();
const mockIsOverDailyLimit = vi.fn().mockResolvedValue(false);

vi.mock('@/lib/db/client', () => ({
  createServerClient: () => ({
    from(table: string) {
      if (table !== 'tkg_signals') {
        throw new Error(`Unexpected table ${table}`);
      }
      return {
        select() {
          return {
            eq() {
              return this;
            },
            maybeSingle() {
              testState.maybeSingleCalls += 1;
              return Promise.resolve({ data: null, error: null });
            },
          };
        },
        insert(row: Record<string, unknown>) {
          testState.insertedSignals.push({ ...row });
          return {
            select() {
              return {
                single() {
                  return Promise.resolve({ data: { id: 'signal-1' }, error: null });
                },
              };
            },
          };
        },
      };
    },
  }),
}));

vi.mock('@/lib/llm/anthropic-budget-governor', () => ({
  ensureAnthropicBudget: (...args: unknown[]) => mockEnsureAnthropicBudget(...args),
  AnthropicBudgetExceededError: MockAnthropicBudgetExceededError,
}));

vi.mock('@/lib/llm/paid-llm-gate', () => ({
  assertPaidLlmAllowed: (...args: unknown[]) => mockAssertPaidLlmAllowed(...args),
}));

vi.mock('@/lib/utils/api-tracker', () => ({
  isOverDailyLimit: (...args: unknown[]) => mockIsOverDailyLimit(...args),
  trackApiCall: (...args: unknown[]) => mockTrackApiCall(...args),
}));

vi.mock('@/lib/encryption', () => ({
  encrypt: vi.fn((value: string) => `encrypted:${value}`),
}));

vi.mock('@/lib/utils/prompt-sanitization', () => ({
  sanitizeForPrompt: vi.fn((value: string) => value),
}));

vi.mock('@/lib/utils/signal-egress', () => ({
  truncateSignalContent: vi.fn((value: string) => value),
}));

vi.mock('@/lib/signals/signal-processor', () => ({
  isNonCommitment: vi.fn(() => false),
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: (...args: unknown[]) => mockAnthropicCreate(...args),
    },
  })),
}));

describe('extractFromConversation budget governor', () => {
  beforeEach(() => {
    testState.insertedSignals.length = 0;
    testState.maybeSingleCalls = 0;
    mockEnsureAnthropicBudget.mockReset();
    mockEnsureAnthropicBudget.mockResolvedValue({
      allowed: true,
      raw: { bypassed: 'test' },
    });
    mockAnthropicCreate.mockReset();
    mockTrackApiCall.mockClear();
    mockAssertPaidLlmAllowed.mockClear();
    mockIsOverDailyLimit.mockReset();
    mockIsOverDailyLimit.mockResolvedValue(false);
  });

  it('blocks before writing a raw signal or calling Anthropic when the governor is closed', async () => {
    mockEnsureAnthropicBudget.mockRejectedValue(
      new MockAnthropicBudgetExceededError(
        'conversation-extractor.extractFromConversation',
        { allowed: false },
        'cap reached',
      ),
    );

    const { extractFromConversation } = await import('../conversation-extractor');

    await expect(
      extractFromConversation('A conversation transcript about job search decisions.', 'user-1'),
    ).rejects.toThrow('Anthropic budget governor blocked conversation-extractor.extractFromConversation');

    expect(testState.maybeSingleCalls).toBe(1);
    expect(testState.insertedSignals).toHaveLength(0);
    expect(mockAnthropicCreate).not.toHaveBeenCalled();
    expect(mockTrackApiCall).not.toHaveBeenCalled();
    expect(mockAssertPaidLlmAllowed).toHaveBeenCalledWith(
      'conversation-extractor.extractFromConversation',
    );
  });
});
