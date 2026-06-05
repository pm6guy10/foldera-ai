import type { WorkdayPresenceState } from '@/lib/workday-presence/model';

export type PacketSourceSignal = {
  fixture_id: string;
  source_type: 'gmail_fixture' | 'calendar_fixture' | 'slack_fixture';
  source_id: string;
  source_label: string;
  observed_at: string;
  summary: string;
  relevance_reason: string;
  safe_reference: string;
};

export type SourceTrailEntry = {
  source_type: string;
  source_id?: string;
  fixture_id?: string;
  source_label: string;
  observed_at: string;
  relevance_reason: string;
  excerpt_or_summary: string;
  safe_reference: string;
};

export type NormalizedPacketSignal = {
  signal_id: string;
  source_type: string;
  observed_at: string;
  summary: string;
  relevance_reason: string;
};

export type WorkPacketActionId = 'review_packet' | 'view_sources' | 'dismiss';

export type WorkPacketAction = {
  id: WorkPacketActionId;
  label: 'Review packet' | 'View sources' | 'Dismiss';
};

export type WorkPacketForbiddenAction =
  | 'Send'
  | 'Auto-send'
  | 'Reply automatically'
  | 'Approve external update without human review';

export type WorkPacketAuditEntry = {
  event: 'packet_generated' | 'packet_reviewed' | 'packet_dismissed';
  actor: 'system' | 'human';
  at: string;
  reason: string;
};

export type WorkPacket = {
  packet_id: string;
  user_id: string;
  verdict: string;
  next_move: string;
  triggering_reason: string;
  workday_state_snapshot: WorkdayPresenceState;
  source_trail: SourceTrailEntry[];
  normalized_signals: NormalizedPacketSignal[];
  consolidated_context: string;
  prepared_work: string;
  confidence_or_safety_reason: string;
  allowed_actions: WorkPacketAction[];
  forbidden_actions: WorkPacketForbiddenAction[];
  review_surface: 'slack';
  created_at: string;
  status: 'pending_review' | 'reviewed' | 'dismissed';
  audit_trail: WorkPacketAuditEntry[];
  quiet_by_default: true;
};

export type WorkPacketTransitionAction = Extract<WorkPacketActionId, 'review_packet' | 'dismiss'>;

export type WorkPacketTransitionResult = {
  packet: WorkPacket;
  workday_state: WorkdayPresenceState;
};
