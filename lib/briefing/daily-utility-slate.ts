export type DailyUtilitySlateItemStatus =
  | 'primary_move'
  | 'open_loop'
  | 'changed_since_yesterday'
  | 'blocked_but_real'
  | 'watch_item';

export type DailyUtilitySlateItem = {
  title: string;
  status: DailyUtilitySlateItemStatus;
  evidence: string[];
  why_it_matters: string;
  next_action?: string;
  no_action_reason?: string;
  source_refs: string[];
};

export type DailyUtilitySlate = {
  generated_at: string;
  finished_artifact_verdict: 'strict_artifact_selected' | 'no_finished_artifact';
  primary_move: DailyUtilitySlateItem | null;
  open_loops: DailyUtilitySlateItem[];
  changed_since_yesterday: DailyUtilitySlateItem[];
  blocked_but_real: DailyUtilitySlateItem | null;
  watch_item: DailyUtilitySlateItem | null;
};

export type DailyUtilitySlateReceipt = {
  id?: unknown;
  action_type?: unknown;
  directive_text?: unknown;
  reason?: unknown;
  status?: unknown;
  generated_at?: unknown;
  execution_result?: unknown;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asEvidence(entries: Array<string | null | undefined>): string[] {
  return entries
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry) => entry.length > 0)
    .slice(0, 4);
}

const INTERNAL_TOKEN_PATTERNS = [
  /positive_winner_contract/i,
  /\bweak_[a-z_]+\b/i,
  /\bmissing_[a-z_]+\b/i,
  /\bartifact_viability\b/i,
  /\bcandidates?\b/i,
  /\bcandidate family\b/i,
  /\bpriority tier\b/i,
  /^candidate:/i,
] as const;

function containsInternalToken(value: string): boolean {
  return INTERNAL_TOKEN_PATTERNS.some((pattern) => pattern.test(value));
}

function isUtilityItem(item: DailyUtilitySlateItem | null): item is DailyUtilitySlateItem {
  if (!item) return false;
  if (!item.title.trim()) return false;
  if (!item.why_it_matters.trim()) return false;
  if (!Array.isArray(item.evidence) || item.evidence.length === 0) return false;
  if (!item.evidence.every((entry) => entry.trim().length > 0 && !containsInternalToken(entry))) {
    return false;
  }
  if (item.no_action_reason && containsInternalToken(item.no_action_reason)) return false;
  return true;
}

function humanizeBlocker(blocker: string): string {
  const clean = blocker.replace(/^positive_winner_contract:/, '').replace(/^artifact_viability:/, '');
  switch (clean) {
    case 'missing_schedule_resolution_context':
      return 'Foldera cannot confirm whether this is already handled on the calendar.';
    case 'missing_current_artifact_anchor':
      return 'Foldera does not have a current source artifact strong enough to anchor this.';
    case 'missing_role_fit_source_bundle':
      return 'The source trail is too thin to build a role-fit packet.';
    case 'missing_grounded_recipient_for_send_message':
    case 'no_grounded_recipient_for_send_message':
      return 'Foldera does not have a grounded recipient for a safe message.';
    case 'stale_status_without_current_artifact_facts':
      return 'The evidence is too stale to create a current action.';
    case 'weak_risk':
      return 'The strongest possible action did not prove a concrete consequence.';
    case 'weak_next_action':
      return 'It did not prove one safe next step.';
    case 'reminder_without_risk':
      return 'It looked like a reminder, not a risk-backed intervention.';
    default:
      return clean
        .replace(/\s+after evaluating(?: \d+)? candidates?\.?/i, '.')
        .replace(/^Selected candidate failed[^:]*:?/i, '')
        .replace(/_/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^./, (letter) => letter.toUpperCase());
  }
}

function humanizeBlockers(blockers: string[]): string[] {
  return Array.from(new Set(blockers.map(humanizeBlocker))).filter((entry) => entry.length > 0);
}

function humanizeNoSafeReason(reason: string): string {
  const afterColon = reason.includes(':') ? reason.split(':').slice(1).join(':') : reason;
  const parts = afterColon
    .split(/[;,]/)
    .map((part) => part.trim())
    .filter(Boolean);
  const translated = humanizeBlockers(parts.length > 0 ? parts : [reason]);
  return translated.join(' ');
}

function getGenerationLog(receipt: DailyUtilitySlateReceipt): Record<string, unknown> | null {
  const executionResult = asRecord(receipt.execution_result);
  return asRecord(executionResult?.generation_log);
}

function extractNoSafeReason(receipt: DailyUtilitySlateReceipt): string | null {
  const executionResult = asRecord(receipt.execution_result);
  const generationLog = getGenerationLog(receipt);
  const noSend = asRecord(executionResult?.no_send);
  const candidateDiscovery = asRecord(generationLog?.candidateDiscovery);

  const candidates = [
    readString(receipt.reason),
    readString(generationLog?.reason),
    readString(candidateDiscovery?.failureReason),
    readString(noSend?.reason),
  ];

  return candidates.find(Boolean) ?? null;
}

function hasNoSendOutcome(receipt: DailyUtilitySlateReceipt): boolean {
  const executionResult = asRecord(receipt.execution_result);
  const generationLog = getGenerationLog(receipt);
  return (
    readString(receipt.action_type) === 'do_nothing' ||
    executionResult?.outcome_type === 'no_send' ||
    generationLog?.outcome === 'no_send'
  );
}

function buildWatchItem(receipt: DailyUtilitySlateReceipt): DailyUtilitySlateItem | null {
  if (!hasNoSendOutcome(receipt)) return null;
  const noSafeReason = extractNoSafeReason(receipt);
  if (!noSafeReason) return null;
  const readableReason = humanizeNoSafeReason(noSafeReason);

  return {
    title: 'No safe finished action today',
    status: 'watch_item',
    evidence: asEvidence([
      'Latest run stopped before a finished action was safe.',
      `Why Foldera stopped: ${readableReason}`,
    ]),
    why_it_matters:
      'The safest answer is to avoid handing you a weak task that sounds useful but cannot prove its value.',
    no_action_reason: readableReason,
    source_refs: ['persisted:no_send_receipt'],
  };
}

export function buildDailyUtilitySlateFromReceipts(
  receipts: DailyUtilitySlateReceipt[],
): DailyUtilitySlate | null {
  const latestNoSend = receipts.find(hasNoSendOutcome);
  if (!latestNoSend) return null;
  const watchItem = buildWatchItem(latestNoSend);

  const slate: DailyUtilitySlate = {
    generated_at: readString(latestNoSend.generated_at) ?? new Date().toISOString(),
    finished_artifact_verdict: 'no_finished_artifact',
    primary_move: null,
    open_loops: [],
    changed_since_yesterday: [],
    blocked_but_real: null,
    watch_item: isUtilityItem(watchItem) ? watchItem : null,
  };

  const hasAnyItem =
    slate.primary_move ||
    slate.open_loops.length > 0 ||
    slate.changed_since_yesterday.length > 0 ||
    slate.blocked_but_real ||
    slate.watch_item;

  return hasAnyItem ? slate : null;
}
