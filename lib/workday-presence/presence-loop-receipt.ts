import { buildSlackTestModeRightNowMessage, type SlackTestModeMessage } from '@/lib/slack-test-mode/right-now';
import { applyWorkdayPresenceAction } from './actions';
import { buildRightNowMessagePayload, type RightNowMessageActionId, type RightNowMessagePayload } from './message';
import { normalizeWorkdayPresenceState, type WorkdayPresenceState } from './model';

export type PresenceLoopButtonAction = {
  action_id: RightNowMessageActionId;
  blocker?: string;
  nowIso?: string;
};

export type PresenceLoopReceipt = {
  before_state: WorkdayPresenceState;
  card_payload: RightNowMessagePayload;
  slack_test_mode: SlackTestModeMessage;
  button_action: {
    action_id: RightNowMessageActionId;
    blocker: string | null;
  };
  after_state: WorkdayPresenceState;
  paid_model_call_required: false;
  inline_full_state_recompute: false;
};

export function buildPresenceLoopReceipt(
  stateInput: unknown,
  action: PresenceLoopButtonAction,
): PresenceLoopReceipt {
  const beforeState = normalizeWorkdayPresenceState(stateInput);
  if (!beforeState) throw new Error('No active workday presence state');

  const cardPayload = buildRightNowMessagePayload(beforeState);
  const applied = applyWorkdayPresenceAction(beforeState, action.action_id, {
    blocker: action.blocker,
    nowIso: action.nowIso,
  });
  if (!applied.ok) throw new Error(applied.error);

  return {
    before_state: beforeState,
    card_payload: cardPayload,
    slack_test_mode: buildSlackTestModeRightNowMessage(cardPayload),
    button_action: {
      action_id: action.action_id,
      blocker: action.blocker?.trim() || null,
    },
    after_state: applied.nextState,
    paid_model_call_required: false,
    inline_full_state_recompute: false,
  };
}
