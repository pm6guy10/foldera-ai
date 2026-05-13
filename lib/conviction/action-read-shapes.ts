import {
  buildDiscrepancyFrameFromActionPayload,
  evaluateDiscrepancyCardFrame,
} from '@/lib/briefing/discrepancy-card-frame';

export const ACTION_DETAIL_SELECT =
  'id, action_type, directive_text, reason, confidence, evidence, status, generated_at, approved_at, executed_at, execution_result, artifact';
export const ACTION_RANKING_SELECT = 'id, confidence, generated_at, status, brief_origin';
export const ACTION_SUMMARY_SELECT =
  'id, status, action_type, confidence, generated_at, approved_at, executed_at, directive_text, reason, skip_reason, outcome_closed, artifact_type, artifact_title, brief_origin, artifact_preview, discrepancy_claim, discrepancy_contradiction, discrepancy_risk, discrepancy_evidence, discrepancy_next_action, discrepancy_why_now, discrepancy_source_refs, discrepancy_confidence, is_no_send, no_send_reason, generation_outcome, outcome_type';
export const ACTION_HISTORY_SELECT =
  'id, status, action_type, confidence, generated_at, directive_text, artifact_preview, is_no_send, no_send_reason';
export const ACTION_SLATE_SELECT =
  'id, action_type, directive_text, reason, status, generated_at, is_no_send, no_send_reason, generation_outcome, outcome_type';

export type ActionSummaryRow = {
  id?: unknown;
  status?: unknown;
  action_type?: unknown;
  confidence?: unknown;
  generated_at?: unknown;
  approved_at?: unknown;
  executed_at?: unknown;
  directive_text?: unknown;
  reason?: unknown;
  skip_reason?: unknown;
  outcome_closed?: unknown;
  artifact_type?: unknown;
  artifact_title?: unknown;
  brief_origin?: unknown;
  artifact_preview?: unknown;
  discrepancy_claim?: unknown;
  discrepancy_contradiction?: unknown;
  discrepancy_risk?: unknown;
  discrepancy_evidence?: unknown;
  discrepancy_next_action?: unknown;
  discrepancy_why_now?: unknown;
  discrepancy_source_refs?: unknown;
  discrepancy_confidence?: unknown;
  is_no_send?: unknown;
  no_send_reason?: unknown;
  generation_outcome?: unknown;
  outcome_type?: unknown;
};

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : null))
    .filter((entry): entry is string => Boolean(entry));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function extractArtifact(action: Record<string, unknown>): Record<string, unknown> | undefined {
  const executionResult =
    action.execution_result && typeof action.execution_result === 'object'
      ? (action.execution_result as Record<string, unknown>)
      : null;

  const executionArtifact =
    executionResult?.artifact && typeof executionResult.artifact === 'object'
      ? (executionResult.artifact as Record<string, unknown>)
      : {};
  const columnArtifact =
    action.artifact && typeof action.artifact === 'object'
      ? (action.artifact as Record<string, unknown>)
      : {};

  const merged = { ...executionArtifact, ...columnArtifact };
  return Object.keys(merged).length > 0 ? merged : undefined;
}

export function buildDiscrepancyCardFromSummary(
  action: ActionSummaryRow,
) {
  return buildDiscrepancyFrameFromActionPayload({
    directive_text: action.directive_text,
    action_type: action.action_type,
    confidence: action.confidence,
    reason: action.reason,
    artifact: {
      type: asString(action.artifact_type),
      title: asString(action.artifact_title),
    },
    discrepancy_card: {
      claim:
        asString(action.discrepancy_claim) ??
        asString(action.directive_text) ??
        asString(action.artifact_title) ??
        '',
      contradiction: asString(action.discrepancy_contradiction) ?? '',
      risk: asString(action.discrepancy_risk) ?? '',
      evidence: asStringArray(action.discrepancy_evidence),
      next_action: asString(action.discrepancy_next_action) ?? '',
      why_now: asString(action.discrepancy_why_now) ?? asString(action.reason) ?? '',
      source_refs: asStringArray(action.discrepancy_source_refs),
      confidence:
        typeof action.discrepancy_confidence === 'number'
          ? action.discrepancy_confidence
          : action.confidence,
      pattern_keys: [],
    },
  });
}

export function buildDashboardActionPayload(
  action: Record<string, unknown>,
  userId: string,
) {
  const artifact = extractArtifact(action);
  const discrepancyCard = buildDiscrepancyFrameFromActionPayload({
    ...action,
    artifact,
    executionResult: action.execution_result,
  });
  const discrepancyQuality = evaluateDiscrepancyCardFrame(discrepancyCard);

  return {
    id: action.id,
    userId,
    directive: action.directive_text,
    action_type: action.action_type,
    confidence: action.confidence,
    reason: action.reason,
    evidence: Array.isArray(action.evidence) ? action.evidence : [],
    status: action.status,
    generatedAt: action.generated_at,
    approvedAt: action.approved_at ?? undefined,
    executedAt: action.executed_at ?? undefined,
    executionResult: asRecord(action.execution_result) ?? undefined,
    artifact,
    discrepancy_card: discrepancyCard,
    discrepancy_quality: discrepancyQuality,
  };
}
