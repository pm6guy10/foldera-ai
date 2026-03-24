import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const from = vi.fn();
const sendResendEmail = vi.fn();
const logStructuredEvent = vi.fn();
const anthropicCreate = vi.fn();

vi.mock('@/lib/db/client', () => ({
  createServerClient: () => ({
    rpc,
    from,
  }),
}));

vi.mock('@/lib/email/resend', () => ({
  renderPlaintextEmailHtml: vi.fn((body: string) => `<p>${body}</p>`),
  sendResendEmail,
}));

vi.mock('@/lib/utils/structured-logger', () => ({
  logStructuredEvent,
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = {
      create: anthropicCreate,
    };
  },
}));

function tableResponse(table: string) {
  switch (table) {
    case 'user_tokens':
      return {
        select: () => ({
          not: () => ({
            lt: () => Promise.resolve({ data: [], error: null }),
          }),
          limit: () => Promise.resolve({ data: [{ provider: 'google', user_id: 'user-1' }], error: null }),
        }),
      };
    case 'tkg_signals':
      return {
        select: () => ({
          eq: () => Promise.resolve({ count: 0, error: null }),
        }),
      };
    case 'tkg_commitments':
      return {
        select: () => ({
          is: () => Promise.resolve({ data: [], error: null }),
        }),
      };
    case 'tkg_actions':
      return {
        select: () => ({
          gte: () => ({
            limit: () => Promise.resolve({
              data: [{ id: 'action-1', user_id: 'user-1', action_type: 'send_message', status: 'executed' }],
              error: null,
            }),
            in: () => Promise.resolve({
              data: [{ id: 'action-1', user_id: 'user-1', status: 'executed', execution_result: { resend_id: 'resend-1' } }],
              error: null,
            }),
          }),
        }),
      };
    default:
      return {
        select: () => Promise.resolve({ data: [], error: null }),
      };
  }
}

describe('runAcceptanceGate', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    rpc.mockResolvedValue({ data: 'user-1', error: null });
    from.mockImplementation((table: string) => tableResponse(table));
    anthropicCreate.mockResolvedValue({ id: 'msg-1' });
    sendResendEmail.mockResolvedValue({ data: { id: 'email-1' }, error: null });
  });

  it('records a failed api_credit_canary and sends the credit alert on 402', async () => {
    anthropicCreate.mockRejectedValue({ status: 402, message: 'credit balance is too low' });

    const { runAcceptanceGate } = await import('../acceptance-gate');
    const result = await runAcceptanceGate();

    expect(result.ok).toBe(false);
    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          check: 'api_credit_canary',
          pass: false,
        }),
      ]),
    );
    expect(sendResendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'Foldera: API credits may be exhausted',
      }),
    );
  });
});
