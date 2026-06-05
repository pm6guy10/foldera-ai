import type { PacketSourceSignal, WorkPacket, WorkPacketAction } from './types';
import type { WorkdayPresenceState } from '@/lib/workday-presence/model';

const ALLOWED_ACTIONS: WorkPacketAction[] = [
  { id: 'review_packet', label: 'Review packet' },
  { id: 'view_sources', label: 'View sources' },
  { id: 'dismiss', label: 'Dismiss' },
];

const FORBIDDEN_ACTIONS = [
  'Send',
  'Auto-send',
  'Reply automatically',
  'Approve external update without human review',
] as const;

function sortSignals(signals: PacketSourceSignal[]): PacketSourceSignal[] {
  return [...signals].sort((a, b) => {
    if (a.observed_at === b.observed_at) return a.fixture_id.localeCompare(b.fixture_id);
    return a.observed_at.localeCompare(b.observed_at);
  });
}

function inferVerdict(input: {
  workday_state: WorkdayPresenceState;
  source_signals: PacketSourceSignal[];
}) {
  const waitingOnMarcus =
    input.workday_state.blocker?.includes('Waiting on Marcus') ||
    input.workday_state.waiting_on?.includes('Marcus');
  const marcusApproved = input.source_signals.some(
    (signal) =>
      signal.fixture_id === 'slack_marcus_estimate_approved' &&
      signal.summary.includes('Marcus approved the estimate'),
  );
  const marcusDeferred = input.source_signals.some(
    (signal) =>
      signal.fixture_id === 'slack_marcus_estimate_deferred' &&
      signal.summary.includes('defer the estimate'),
  );

  if (waitingOnMarcus && !marcusApproved) {
    return {
      verdict: 'Review Required',
      nextMove: input.workday_state.next_move,
      triggeringReason:
        'Marcus approval evidence is absent, so stay quiet and keep the current next move.',
    };
  }

  if (waitingOnMarcus && marcusApproved) {
    return {
      verdict: 'Approval Received',
      nextMove: 'Send Estimate',
      triggeringReason: marcusDeferred
        ? 'Waiting on Marcus is resolved because deterministic fixture evidence shows Marcus approved the estimate, and the deferred alternative is ignored.'
        : 'Waiting on Marcus is resolved because deterministic fixture evidence shows Marcus approved the estimate.',
    };
  }

  return {
    verdict: 'Review Required',
    nextMove: input.workday_state.next_move,
    triggeringReason: `Multiple consented fixture signals indicate "${input.workday_state.current_focus}" needs one reviewable next move.`,
  };
}

export function buildDeterministicWorkPacket(input: {
  test_mode: true;
  user_id: string;
  workday_state: WorkdayPresenceState;
  source_signals: PacketSourceSignal[];
  nowIso?: string;
}): WorkPacket {
  if (!input.test_mode) throw new Error('work_packet fixture generation requires TEST_MODE');
  if (input.source_signals.length < 2) {
    throw new Error('work_packet proof requires multiple fixture source signals');
  }

  const signals = sortSignals(input.source_signals);
  const first = signals[0];
  const nowIso = input.nowIso ?? '2026-06-02T15:00:00.000Z';
  const packetId = `work_packet_test_${signals.map((signal) => signal.fixture_id).join('_')}`;
  const inference = inferVerdict({
    workday_state: input.workday_state,
    source_signals: signals,
  });

  return {
    packet_id: packetId,
    user_id: input.user_id,
    verdict: inference.verdict,
    next_move: inference.nextMove,
    triggering_reason: inference.triggeringReason,
    workday_state_snapshot: input.workday_state,
    source_trail: signals.map((signal) => ({
      source_type: signal.source_type,
      source_id: signal.source_id,
      fixture_id: signal.fixture_id,
      source_label: signal.source_label,
      observed_at: signal.observed_at,
      relevance_reason: signal.relevance_reason,
      excerpt_or_summary: signal.summary,
      safe_reference: signal.safe_reference,
    })),
    normalized_signals: signals.map((signal) => ({
      signal_id: `normalized_${signal.fixture_id}`,
      source_type: signal.source_type,
      observed_at: signal.observed_at,
      summary: signal.summary,
      relevance_reason: signal.relevance_reason,
    })),
    consolidated_context: signals.map((signal) => signal.summary).join(' '),
    prepared_work: `Review "${input.workday_state.current_focus}" using ${signals.length} source-backed signals, then move forward with: ${inference.nextMove}`,
    confidence_or_safety_reason: `TEST_MODE deterministic packet. Safe for review because it uses ${signals.length} fixture signals, safe references only, and no raw private payload dump.`,
    allowed_actions: ALLOWED_ACTIONS,
    forbidden_actions: [...FORBIDDEN_ACTIONS],
    review_surface: 'slack',
    created_at: nowIso,
    status: 'pending_review',
    audit_trail: [
      {
        event: 'packet_generated',
        actor: 'system',
        at: nowIso,
        reason: `Generated from first observed fixture ${first.fixture_id} plus ${signals.length - 1} corroborating signal(s).`,
      },
    ],
    quiet_by_default: true,
  };
}
