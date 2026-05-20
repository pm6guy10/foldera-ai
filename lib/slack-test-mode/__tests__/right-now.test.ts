import { describe, expect, it } from 'vitest';
import { buildSlackTestModeRightNowMessage } from '../right-now';
import type { RightNowMessagePayload } from '@/lib/workday-presence/message';

describe('slack test-mode right-now message', () => {
  it('renders payload into a section + actions block', () => {
    const payload: RightNowMessagePayload = {
      kind: 'right_now',
      mode: 'active',
      text: 'Right now.\nNext move: Do the thing.',
      actions: [
        { id: 'done', label: 'Done' },
        { id: 'stuck', label: 'Stuck' },
        { id: 'break_smaller', label: 'Break smaller' },
        { id: 'snooze', label: 'Snooze' },
      ],
    };

    const message = buildSlackTestModeRightNowMessage(payload);
    expect(message.channel).toBe('test_dm');
    expect(message.blocks[0]).toEqual({
      type: 'section',
      text: { type: 'mrkdwn', text: payload.text },
    });

    const actionsBlock = message.blocks[1];
    expect(actionsBlock.type).toBe('actions');
    if (actionsBlock.type === 'actions') {
      expect(actionsBlock.elements.map((e) => e.action_id)).toEqual([
        'done',
        'stuck',
        'break_smaller',
        'snooze',
      ]);
    }
  });
});

