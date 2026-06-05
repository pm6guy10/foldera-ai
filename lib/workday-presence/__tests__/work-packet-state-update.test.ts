import { describe, expect, it } from 'vitest';
import { buildDeterministicWorkPacket } from '@/lib/work-packets/generator';
import { applyWorkPacketReviewTransition } from '@/lib/work-packets/transitions';
import {
  marcusApprovedEstimateSignal,
  workPacketFixtureSignals,
} from '@/tests/fixtures/work-packets/source-signals';

const state = {
  current_focus: 'Close ACME renewal decision',
  next_move: 'Prepare the final owner-confirmed renewal review note',
  why_it_matters: 'The review window is today and the decision needs one safe next move.',
  blocker: 'Waiting for owner confirmation',
  do_not_touch: 'Do not send automatically',
  waiting_on: 'Owner confirmation',
  last_completed_step: null,
  state_source: 'manual_anchor',
  snoozed_until: null,
  interaction_history: [],
  created_at: '2026-06-02T13:00:00.000Z',
  updated_at: '2026-06-02T13:10:00.000Z',
};

const packet = buildDeterministicWorkPacket({
  test_mode: true,
  user_id: 'user_test_143',
  workday_state: state,
  source_signals: workPacketFixtureSignals,
  nowIso: '2026-06-02T15:00:00.000Z',
});

const marcusPacket = buildDeterministicWorkPacket({
  test_mode: true,
  user_id: 'user_test_004',
  workday_state: {
    ...state,
    current_focus: 'Finalize revised estimate for Marcus',
    next_move: 'Wait for Marcus to approve the revised estimate',
    blocker: 'Waiting on Marcus',
    waiting_on: 'Marcus approval',
  },
  source_signals: [marcusApprovedEstimateSignal, workPacketFixtureSignals[1]],
  nowIso: '2026-06-04T16:30:00.000Z',
});

describe('work packet review/dismiss state updates', () => {
  it('marks a reviewed packet and updates workday state after human review', () => {
    const result = applyWorkPacketReviewTransition({
      packet,
      workday_state: state,
      action: 'review_packet',
      nowIso: '2026-06-02T15:10:00.000Z',
    });

    expect(result.packet.status).toBe('reviewed');
    expect(result.packet.audit_trail.map((entry) => entry.event)).toEqual([
      'packet_generated',
      'packet_reviewed',
    ]);
    expect(result.workday_state.state_source).toBe('work_packet_review');
    expect(result.workday_state.last_completed_step).toContain(packet.packet_id);
    expect(result.workday_state.updated_at).toBe('2026-06-02T15:10:00.000Z');
  });

  it('preserves source trail and audit trail when dismissed', () => {
    const result = applyWorkPacketReviewTransition({
      packet,
      workday_state: state,
      action: 'dismiss',
      nowIso: '2026-06-02T15:15:00.000Z',
      reason: 'Not the right moment.',
    });

    expect(result.packet.status).toBe('dismissed');
    expect(result.packet.source_trail).toEqual(packet.source_trail);
    expect(result.packet.audit_trail).toHaveLength(2);
    expect(result.packet.audit_trail[1]).toEqual({
      event: 'packet_dismissed',
      actor: 'human',
      at: '2026-06-02T15:15:00.000Z',
      reason: 'Not the right moment.',
    });
    expect(result.workday_state.state_source).toBe('work_packet_dismiss');
    expect(result.workday_state.waiting_on).toContain('stay quiet');
  });

  it('marks the Marcus packet done and records Send Estimate as the completed step', () => {
    const result = applyWorkPacketReviewTransition({
      packet: marcusPacket,
      workday_state: marcusPacket.workday_state_snapshot,
      action: 'done',
      nowIso: '2026-06-04T16:35:00.000Z',
      reason: 'Done click completed the Marcus estimate loop.',
    });

    expect(result.packet.status).toBe('completed');
    expect(result.packet.audit_trail.at(-1)).toEqual({
      event: 'packet_completed',
      actor: 'human',
      at: '2026-06-04T16:35:00.000Z',
      reason: 'Done click completed the Marcus estimate loop.',
    });
    expect(result.workday_state.last_completed_step).toBe('Send Estimate');
    expect(result.workday_state.next_move).toBe('Stay quiet until a new source-backed trigger appears.');
    expect(result.workday_state.waiting_on).toBe(null);
    expect(result.workday_state.state_source).toBe('work_packet_done');
  });
});
