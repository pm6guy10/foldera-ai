import type {
  WorkPacket,
  WorkPacketTransitionAction,
  WorkPacketTransitionResult,
} from './types';
import type { WorkdayPresenceState } from '@/lib/workday-presence/model';

export function applyWorkPacketReviewTransition(input: {
  packet: WorkPacket;
  workday_state: WorkdayPresenceState;
  action: WorkPacketTransitionAction;
  actor?: 'human';
  nowIso?: string;
  reason?: string;
}): WorkPacketTransitionResult {
  const nowIso = input.nowIso ?? new Date().toISOString();
  const actor = input.actor ?? 'human';

  if (input.action !== 'done' && input.packet.status !== 'pending_review') {
    throw new Error('work_packet transition requires pending_review status');
  }

  if (input.action === 'review_packet') {
    const packet: WorkPacket = {
      ...input.packet,
      status: 'reviewed',
      audit_trail: [
        ...input.packet.audit_trail,
        {
          event: 'packet_reviewed',
          actor,
          at: nowIso,
          reason: input.reason ?? 'Human reviewed packet before any external update.',
        },
      ],
    };
    return {
      packet,
      workday_state: {
        ...input.workday_state,
        blocker: null,
        snoozed_until: null,
        waiting_on: 'Human reviewed the source-backed work packet.',
        last_completed_step: `Reviewed work packet ${input.packet.packet_id}`,
        next_move: `Use reviewed packet ${input.packet.packet_id} to take one source-backed next move.`,
        state_source: 'work_packet_review',
        updated_at: nowIso,
      },
    };
  }

  if (input.action === 'dismiss') {
    const packet: WorkPacket = {
      ...input.packet,
      status: 'dismissed',
      audit_trail: [
        ...input.packet.audit_trail,
        {
          event: 'packet_dismissed',
          actor,
          at: nowIso,
          reason: input.reason ?? 'Human dismissed packet; source trail preserved for audit.',
        },
      ],
    };
    return {
      packet,
      workday_state: {
        ...input.workday_state,
        blocker: null,
        waiting_on: 'Dismissed source-backed packet; stay quiet unless a new signal earns review.',
        last_completed_step: `Dismissed work packet ${input.packet.packet_id}`,
        next_move: input.workday_state.next_move,
        state_source: 'work_packet_dismiss',
        updated_at: nowIso,
      },
    };
  }

  if (input.action === 'done') {
    if (input.packet.status === 'completed') {
      return {
        packet: input.packet,
        workday_state: input.workday_state,
      };
    }

    if (input.packet.status !== 'pending_review') {
      throw new Error('work_packet done transition requires pending_review or completed status');
    }

    const packet: WorkPacket = {
      ...input.packet,
      status: 'completed',
      audit_trail: [
        ...input.packet.audit_trail,
        {
          event: 'packet_completed',
          actor,
          at: nowIso,
          reason: input.reason ?? 'Human marked the packet done after completing the next move.',
        },
      ],
    };
    return {
      packet,
      workday_state: {
        ...input.workday_state,
        blocker: null,
        snoozed_until: null,
        waiting_on: null,
        last_completed_step: input.packet.next_move,
        next_move: 'Stay quiet until a new source-backed trigger appears.',
        state_source: 'work_packet_done',
        updated_at: nowIso,
      },
    };
  }

  throw new Error('Invalid work_packet transition action');
}
