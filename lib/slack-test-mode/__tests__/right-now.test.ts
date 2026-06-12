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
        { id: 'view_draft', label: 'View Draft' },
        { id: 'dismiss', label: 'Dismiss' },
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
        'view_draft',
        'dismiss',
      ]);
    }
  });

  it('omits the actions block when the payload has no actions', () => {
    const message = buildSlackTestModeRightNowMessage({
      kind: 'right_now',
      mode: 'dismissed',
      text: 'Dismissed. Staying quiet until something new matters.',
      actions: [],
    });
    expect(message.blocks).toHaveLength(1);
    expect(message.blocks[0].type).toBe('section');
  });
});

