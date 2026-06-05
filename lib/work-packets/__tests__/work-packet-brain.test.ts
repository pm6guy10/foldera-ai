import { describe, expect, it } from 'vitest';
import type { PacketSourceSignal } from '../types';
import { buildWorkPacketBrainReceipt } from '../receipt';
import { buildDeterministicWorkPacket } from '../generator';
import {
  marcusApprovedEstimateSignal,
  workPacketFixtureSignals,
} from '@/tests/fixtures/work-packets/source-signals';

const beforeState = {
  current_focus: 'Close ACME renewal decision',
  next_move: 'Prepare the final owner-confirmed renewal review note',
  why_it_matters: 'The review window is today and the decision needs one safe next move.',
  blocker: 'Waiting for owner confirmation',
  do_not_touch: 'Do not send the renewal note automatically',
  waiting_on: 'Owner confirmation and final review',
  last_completed_step: null,
  state_source: 'manual_anchor',
  snoozed_until: null,
  interaction_history: [],
  created_at: '2026-06-02T13:00:00.000Z',
  updated_at: '2026-06-02T13:10:00.000Z',
};

describe('deterministic MVP Work Packet Brain proof', () => {
  it('loads the Marcus approved estimate evidence fixture with typed source-signal fields', () => {
    const signal = marcusApprovedEstimateSignal satisfies PacketSourceSignal;

    expect(signal.fixture_id).toBe('slack_marcus_estimate_approved');
    expect(signal.source_type).toBe('slack_fixture');
    expect(signal.source_id).toBe('slack-thread-marcus-estimate-approval');
    expect(signal.source_label).toContain('Marcus');
    expect(signal.observed_at).toBe('2026-06-04T16:12:00.000Z');
    expect(signal.summary).toContain('Marcus approved the estimate');
    expect(signal.summary).toContain('Redacted fixture content');
    expect(signal.relevance_reason).toContain('Actor Marcus');
    expect(signal.relevance_reason).toContain('approval action');
    expect(signal.relevance_reason).toContain('estimate subject');
    expect(signal.safe_reference).toBe('fixture:slack_marcus_estimate_approved#summary');
  });

  it('builds one source-backed work_packet from multiple fixture source signals', () => {
    const receipt = buildWorkPacketBrainReceipt({
      user_id: 'user_test_143',
      before_state: beforeState,
      fixture_signals: workPacketFixtureSignals,
      action: 'review_packet',
      nowIso: '2026-06-02T15:00:00.000Z',
    });

    expect(receipt.before_fixture_signals).toHaveLength(3);
    expect(receipt.generated_work_packet.packet_id).toBe(
      'work_packet_test_gmail_owner_reply_calendar_review_window_slack_cfo_ping',
    );
    expect(receipt.generated_work_packet.status).toBe('pending_review');
    expect(receipt.generated_work_packet.source_trail).toHaveLength(3);
    expect(receipt.generated_work_packet.normalized_signals).toHaveLength(3);
    expect(receipt.generated_work_packet.consolidated_context).toContain('Owner confirmed');
    expect(receipt.generated_work_packet.prepared_work).toContain('Prepare the final owner-confirmed renewal review note');
    expect(receipt.generated_work_packet.confidence_or_safety_reason).toContain('no raw private payload dump');
    expect(receipt.generated_work_packet.review_surface).toBe('slack');
    expect(receipt.generated_work_packet.quiet_by_default).toBe(true);
    expect(receipt.paid_model_call_required).toBe(false);
    expect(receipt.live_connector_fetch_required).toBe(false);
  });

  it('infers Approval Received and the next move Send Estimate from the Marcus approval fixture', () => {
    const packet = buildDeterministicWorkPacket({
      test_mode: true,
      user_id: 'user_test_002',
      workday_state: {
        ...beforeState,
        current_focus: 'Finalize revised estimate for Marcus',
        next_move: 'Wait for Marcus to approve the revised estimate',
        blocker: 'Waiting on Marcus',
        waiting_on: 'Marcus approval',
      },
      source_signals: [marcusApprovedEstimateSignal, workPacketFixtureSignals[1]],
      nowIso: '2026-06-04T16:30:00.000Z',
    });

    expect(packet.verdict).toBe('Approval Received');
    expect(packet.next_move).toBe('Send Estimate');
    expect(packet.triggering_reason).toContain('Waiting on Marcus');
    expect(packet.prepared_work).toContain('Send Estimate');
    expect(packet.source_trail.map((entry) => entry.fixture_id)).toContain(
      'slack_marcus_estimate_approved',
    );
  });

  it('keeps Send, Auto-send, and Reply automatically out of default actions', () => {
    const receipt = buildWorkPacketBrainReceipt({
      user_id: 'user_test_143',
      before_state: beforeState,
      fixture_signals: workPacketFixtureSignals,
      action: 'dismiss',
      nowIso: '2026-06-02T15:00:00.000Z',
    });

    const labels = receipt.generated_work_packet.allowed_actions.map((action) => action.label);
    expect(labels).toEqual(['Review packet', 'View sources', 'Dismiss']);
    expect(labels).not.toContain('Send');
    expect(labels).not.toContain('Auto-send');
    expect(labels).not.toContain('Reply automatically');
    expect(receipt.generated_work_packet.forbidden_actions).toEqual([
      'Send',
      'Auto-send',
      'Reply automatically',
      'Approve external update without human review',
    ]);
  });

  it('proves the full deterministic fixture -> packet -> review card -> state-after receipt chain', () => {
    const receipt = buildWorkPacketBrainReceipt({
      user_id: 'user_test_179',
      before_state: beforeState,
      fixture_signals: workPacketFixtureSignals,
      action: 'review_packet',
      nowIso: '2026-06-02T15:20:00.000Z',
    });

    expect(receipt.before_fixture_signals.map((signal) => signal.fixture_id)).toEqual([
      'gmail_owner_reply',
      'calendar_review_window',
      'slack_cfo_ping',
    ]);
    expect(receipt.generated_work_packet).toMatchObject({
      packet_id: 'work_packet_test_gmail_owner_reply_calendar_review_window_slack_cfo_ping',
      status: 'pending_review',
      review_surface: 'slack',
      quiet_by_default: true,
    });
    expect(receipt.slack_review_card_payload).toMatchObject({
      packet_id: receipt.generated_work_packet.packet_id,
      channel: 'test_dm',
    });
    expect(receipt.slack_review_card_payload.blocks).toHaveLength(2);
    expect(receipt.review_or_dismiss_action).toBe('review_packet');
    expect(receipt.packet_workday_state_after.packet.status).toBe('reviewed');
    expect(receipt.packet_workday_state_after.workday_state.state_source).toBe('work_packet_review');
    expect(receipt.packet_workday_state_after.workday_state.last_completed_step).toBe(
      `Reviewed work packet ${receipt.generated_work_packet.packet_id}`,
    );
    expect(receipt.packet_workday_state_after.packet.source_trail).toEqual(
      receipt.generated_work_packet.source_trail,
    );
    expect(receipt.packet_workday_state_after.packet.forbidden_actions).toEqual(
      receipt.generated_work_packet.forbidden_actions,
    );
    expect(receipt.paid_model_call_required).toBe(false);
    expect(receipt.live_connector_fetch_required).toBe(false);
  });

  it('builds a durable Marcus loop receipt with card generation, done mutation, and no-send proof', () => {
    const beforeMarcusState = {
      ...beforeState,
      current_focus: 'Finalize revised estimate for Marcus',
      next_move: 'Wait for Marcus to approve the revised estimate',
      blocker: 'Waiting on Marcus',
      waiting_on: 'Marcus approval',
    };

    const receipt = buildWorkPacketBrainReceipt({
      user_id: 'user_test_005',
      before_state: beforeMarcusState,
      fixture_signals: [marcusApprovedEstimateSignal, workPacketFixtureSignals[1]],
      action: 'done',
      nowIso: '2026-06-04T16:40:00.000Z',
    });

    expect(receipt.before_fixture_signals.map((signal) => signal.fixture_id)).toEqual([
      'slack_marcus_estimate_approved',
      'calendar_review_window',
    ]);
    expect(receipt.review_card_generated).toBe(true);
    expect(receipt.done_mutation_applied).toBe(true);
    expect(receipt.generated_work_packet.verdict).toBe('Approval Received');
    expect(receipt.generated_work_packet.next_move).toBe('Send Estimate');
    expect(receipt.packet_workday_state_after.packet.status).toBe('completed');
    expect(receipt.packet_workday_state_after.workday_state.last_completed_step).toBe(
      'Send Estimate',
    );
    expect(receipt.paid_model_call_required).toBe(false);
    expect(receipt.live_connector_fetch_required).toBe(false);
    expect(receipt.live_send_performed).toBe(false);
  });
});
