import { describe, expect, it } from 'vitest';

function slackPost(payload: Record<string, unknown>) {
  return new Request('http://localhost/api/slack/interaction', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      payload: JSON.stringify(payload),
    }).toString(),
  });
}

describe('slack interaction route', () => {
  it('returns 200 and stays quiet when the Slack event has no actionable intervention', async () => {
    const { POST } = await import('@/app/api/slack/interaction/route');
    const response = await POST(
      slackPost({
        type: 'block_actions',
        channel: { id: 'CSELF' },
        message: { ts: '177.1' },
        user: { id: 'U12345678' },
        actionable_intervention: false,
        user_tokens: {
          access_token: 'xoxb-route-access-token',
          refresh_token: 'xoxr-route-refresh-token',
        },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      acknowledged: true,
      packet: {
        mode: 'NO_OP',
        next_move: null,
        slack: null,
      },
    });
    expect(JSON.stringify(body)).not.toContain('user_tokens');
    expect(JSON.stringify(body)).not.toContain('xoxb-route-access-token');
    expect(JSON.stringify(body)).not.toContain('xoxr-route-refresh-token');
  });

  it('returns 200 and emits native Slack Block Kit JSON when intervention is needed', async () => {
    const { POST } = await import('@/app/api/slack/interaction/route');
    const response = await POST(
      slackPost({
        type: 'block_actions',
        channel: { id: 'CSELF' },
        message: { ts: '177.1' },
        user: { id: 'U12345678' },
        actionable_intervention: true,
        next_move: 'Send one Right Now card',
        user_tokens: {
          access_token: 'xoxb-route-access-token',
          refresh_token: 'xoxr-route-refresh-token',
        },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.packet.mode).toBe('INTERVENTION');
    expect(body.packet.next_move).toBe('Send one Right Now card');
    expect(body.packet.slack).toMatchObject({
      channel: 'CSELF',
      blocks: expect.any(Array),
    });
    expect(JSON.stringify(body.packet.slack.blocks)).not.toContain('<div');
    expect(JSON.stringify(body)).not.toContain('user_tokens');
  });
});
