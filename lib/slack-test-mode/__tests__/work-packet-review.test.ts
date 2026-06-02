import { describe, expect, it } from 'vitest';
import { buildDeterministicWorkPacket } from '@/lib/work-packets/generator';
import { buildSlackTestModeWorkPacketReviewCard } from '../work-packet-review';
import { workPacketFixtureSignals } from '@/tests/fixtures/work-packets/source-signals';

const state = {
  current_focus: 'Close ACME renewal decision',
  next_move: 'Prepare the final owner-confirmed renewal review note',
  why_it_matters: 'The review window is today and the decision needs one safe next move.',
  blocker: null,
  do_not_touch: 'Do not send automatically',
  waiting_on: null,
  last_completed_step: null,
  state_source: 'manual_anchor',
  snoozed_until: null,
  interaction_history: [],
  created_at: '2026-06-02T13:00:00.000Z',
  updated_at: '2026-06-02T13:10:00.000Z',
};

describe('Slack test-mode work packet review card', () => {
  it('renders Review packet, View sources, and Dismiss without send defaults', () => {
    const packet = buildDeterministicWorkPacket({
      test_mode: true,
      user_id: 'user_test_143',
      workday_state: state,
      source_signals: workPacketFixtureSignals,
      nowIso: '2026-06-02T15:00:00.000Z',
    });

    const card = buildSlackTestModeWorkPacketReviewCard(packet);
    expect(card.packet_id).toBe(packet.packet_id);
    expect(card.channel).toBe('test_dm');
    expect(card.blocks[0]).toEqual({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: expect.stringContaining(packet.packet_id),
      },
    });

    const actionsBlock = card.blocks[1];
    expect(actionsBlock.type).toBe('actions');
    if (actionsBlock.type === 'actions') {
      const labels = actionsBlock.elements.map((element) => element.text.text);
      expect(labels).toEqual(['Review packet', 'View sources', 'Dismiss']);
      expect(labels.join(' ')).not.toMatch(/Send|Auto-send|Reply automatically/);
      expect(actionsBlock.elements.map((element) => element.action_id)).toEqual([
        'review_packet',
        'view_sources',
        'dismiss',
      ]);
    }
  });
});
