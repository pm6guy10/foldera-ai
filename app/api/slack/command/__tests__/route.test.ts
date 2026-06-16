import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const mockVerifySignature = vi.fn();
const mockHandleCommand = vi.fn();
const mockApiErrorForRoute = vi.fn();
const mockBadRequest = vi.fn((message: string) =>
  NextResponse.json({ error: message }, { status: 400 }),
);

vi.mock('@/lib/slack/right-now', () => ({
  verifySlackRequestSignature: mockVerifySignature,
}));

vi.mock('@/lib/slack/command', () => ({
  handleSlackCommand: mockHandleCommand,
}));

vi.mock('@/lib/utils/api-error', () => ({
  apiErrorForRoute: mockApiErrorForRoute,
  badRequest: mockBadRequest,
}));

describe('POST /api/slack/command', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv('SLACK_SIGNING_SECRET', 'test-secret');
    mockVerifySignature.mockReturnValue(true);
    mockHandleCommand.mockResolvedValue('Command handled response');
    mockApiErrorForRoute.mockImplementation((error: unknown) =>
      NextResponse.json(
        { error: error instanceof Error ? error.message : String(error) },
        { status: 500 },
      ),
    );
  });

  it('rejects requests with invalid signature', async () => {
    mockVerifySignature.mockReturnValue(false);

    const { POST } = await import('../route');
    const response = await POST(
      new Request('http://localhost/api/slack/command', {
        method: 'POST',
        headers: {
          'x-slack-request-timestamp': '123456789',
          'x-slack-signature': 'invalid-sig',
        },
        body: 'command=%2Ffoldera&text=status',
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('Invalid Slack signature');
  });

  it('returns 400 for unknown commands', async () => {
    const { POST } = await import('../route');
    const response = await POST(
      new Request('http://localhost/api/slack/command', {
        method: 'POST',
        body: 'command=%2Funknown&text=status',
      }),
    );

    expect(response.status).toBe(400);
    expect(mockBadRequest).toHaveBeenCalledWith('Unknown command');
  });

  it('handles /foldera command and returns ephemeral response', async () => {
    const { POST } = await import('../route');
    const response = await POST(
      new Request('http://localhost/api/slack/command', {
        method: 'POST',
        body: 'command=%2Ffoldera&text=status',
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockHandleCommand).toHaveBeenCalledWith('status');
    expect(body.response_type).toBe('ephemeral');
    expect(body.text).toBe('Command handled response');
  });
});
