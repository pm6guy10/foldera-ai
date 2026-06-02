import { describe, expect, it } from 'vitest';
import { buildWorkPacketBrainReceipt } from '../receipt';
import { workPacketFixtureSignals } from '@/tests/fixtures/work-packets/source-signals';

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
});
