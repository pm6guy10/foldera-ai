import { buildSlackTestModeWorkPacketReviewCard } from '@/lib/slack-test-mode/work-packet-review';
import { buildDeterministicWorkPacket } from './generator';
import { applyWorkPacketReviewTransition } from './transitions';
import type { PacketSourceSignal, WorkPacketTransitionAction } from './types';
import type { WorkdayPresenceState } from '@/lib/workday-presence/model';

export function buildWorkPacketBrainReceipt(input: {
  user_id: string;
  before_state: WorkdayPresenceState;
  fixture_signals: PacketSourceSignal[];
  action: WorkPacketTransitionAction;
  nowIso?: string;
}) {
  const workPacket = buildDeterministicWorkPacket({
    test_mode: true,
    user_id: input.user_id,
    workday_state: input.before_state,
    source_signals: input.fixture_signals,
    nowIso: input.nowIso,
  });
  const slackReviewCard = buildSlackTestModeWorkPacketReviewCard(workPacket);
  const transition = applyWorkPacketReviewTransition({
    packet: workPacket,
    workday_state: input.before_state,
    action: input.action,
    nowIso: input.nowIso,
  });

  return {
    before_fixture_signals: input.fixture_signals,
    generated_work_packet: workPacket,
    slack_review_card_payload: slackReviewCard,
    review_or_dismiss_action: input.action,
    packet_workday_state_after: transition,
    paid_model_call_required: false,
    live_connector_fetch_required: false,
    quiet_by_default: true,
  };
}
