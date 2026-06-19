import { describe, expect, it } from 'vitest';

const mockSlackEvent = {
  type: 'block_actions',
  channel: { id: 'CSELF' },
  message: { ts: '177.1' },
  user: { id: 'U12345678' },
  text: 'Mock Slack event for the bounded self-loop',
  user_tokens: {
    access_token: 'xoxb-mock-user-access-token',
    refresh_token: 'xoxr-mock-user-refresh-token',
  },
};

describe('slack self-loop deterministic red gate', () => {
  it('Constraint 1: stays quiet and derives a safe NO_OP state when the mock Slack event has no actionable intervention', async () => {
    const { deriveSlackSelfLoopWorkPacket } = await import('@/lib/work-packets/slack-self-loop');
    const result = deriveSlackSelfLoopWorkPacket({
      ...mockSlackEvent,
      actionable_intervention: false,
    });

    expect(result.mode).toBe('NO_OP');
    expect(result.next_move).toBeNull();
    expect(result.slack).toBeNull();
  });

  it('Constraint 2: formats the intervention path as native Slack Block Kit JSON only', async () => {
    const { deriveSlackSelfLoopWorkPacket } = await import('@/lib/work-packets/slack-self-loop');
    const result = deriveSlackSelfLoopWorkPacket({
      ...mockSlackEvent,
      actionable_intervention: true,
      next_move: 'Send one Right Now card',
    });

    expect(result.mode).toBe('INTERVENTION');
    expect(result.slack).toMatchObject({
      channel: 'CSELF',
      blocks: expect.any(Array),
    });
    expect(JSON.stringify(result.slack!.blocks)).not.toContain('<');
    expect(JSON.stringify(result.slack!.blocks)).not.toContain('<div');
    expect(JSON.stringify(result.slack!.blocks)).not.toContain('custom HTML');
  });

  it('Constraint 3: does not leak user_tokens while deriving the payload', async () => {
    const { deriveSlackSelfLoopWorkPacket } = await import('@/lib/work-packets/slack-self-loop');
    const result = deriveSlackSelfLoopWorkPacket({
      ...mockSlackEvent,
      actionable_intervention: true,
      next_move: 'Send one Right Now card',
    });
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain('user_tokens');
    expect(serialized).not.toContain(mockSlackEvent.user_tokens.access_token);
    expect(serialized).not.toContain(mockSlackEvent.user_tokens.refresh_token);
    expect(result).not.toHaveProperty('user_tokens');
  });
});
