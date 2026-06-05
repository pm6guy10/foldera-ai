import type { WorkPacket } from '@/lib/work-packets/types';
import type { SlackTestModeBlock, SlackTestModeMessage } from './right-now';

export type WorkPacketReviewCardPayload = SlackTestModeMessage & {
  packet_id: string;
};

export function buildSlackTestModeWorkPacketReviewCard(packet: WorkPacket): WorkPacketReviewCardPayload {
  const leadSource = packet.source_trail[packet.source_trail.length - 1];
  const text = [
    `*${packet.verdict}*`,
    `Next move: ${packet.next_move}`,
    packet.prepared_work,
    `Evidence: ${leadSource.excerpt_or_summary}`,
    `Source trail: ${packet.source_trail.length} safe references`,
    packet.confidence_or_safety_reason,
  ].join('\n');

  const actionsBlock: SlackTestModeBlock = {
    type: 'actions',
    elements: packet.allowed_actions.map((action) => ({
      type: 'button',
      text: { type: 'plain_text', text: action.label },
      action_id: action.id,
    })),
  };

  return {
    packet_id: packet.packet_id,
    channel: 'test_dm',
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text } },
      actionsBlock,
    ],
  };
}
