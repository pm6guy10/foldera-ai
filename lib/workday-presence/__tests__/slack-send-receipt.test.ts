import { describe, expect, it, vi } from 'vitest';
import { insertSlackSendReceipt } from '../slack-send-receipt';
import type { SlackSendResult } from '@/lib/slack/right-now';

const liveResult: SlackSendResult = {
  ok: true,
  mode: 'live',
  channel: 'C0123456',
  message_ts: '1719234567.123456',
  response: {},
};

describe('insertSlackSendReceipt', () => {
  it('inserts a tkg_actions row with the expected shape', async () => {
    const mockInsert = vi.fn().mockResolvedValue({ error: null });
    const mockSupabase = { from: vi.fn().mockReturnValue({ insert: mockInsert }) } as any;

    await insertSlackSendReceipt({
      supabase: mockSupabase,
      userId: 'user-abc',
      slackResult: liveResult,
      triggerType: 'mention_reply_needed',
      label: 'reply to Darlene about ESB Technician',
    });

    expect(mockSupabase.from).toHaveBeenCalledWith('tkg_actions');
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-abc',
        action_type: 'presence_action',
        action_source: 'workday_presence_slack_send',
        status: 'executed',
        confidence: 100,
      }),
    );
    const row = mockInsert.mock.calls[0][0] as Record<string, unknown>;
    const exec = row['execution_result'] as Record<string, unknown>;
    expect(exec['slack_ok']).toBe(true);
    expect(exec['slack_channel']).toBe('C0123456');
    expect(exec['slack_ts']).toBe('1719234567.123456');
    expect(exec['trigger_type']).toBe('mention_reply_needed');
  });

  it('propagates DB errors', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnValue({ insert: vi.fn().mockResolvedValue({ error: new Error('db error') }) }),
    } as any;

    await expect(
      insertSlackSendReceipt({
        supabase: mockSupabase,
        userId: 'user-abc',
        slackResult: liveResult,
        triggerType: null,
        label: 'test',
      }),
    ).rejects.toThrow('db error');
  });
});
