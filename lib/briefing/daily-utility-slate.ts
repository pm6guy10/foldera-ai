import type { WinnerTruthReport } from '@/lib/system/winner-truth';

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
        .replace(/_/g, ' ')
        .replace(/\s+/g, ' ')
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

function displayProviderName(provider: string): string {
  const normalized = provider.trim().toLowerCase();
  if (normalized === 'azure_ad' || normalized === 'microsoft') return 'Microsoft';
  if (normalized === 'google') return 'Google';
  if (!normalized) return 'Connected source';
  return normalized.replace(/(^|[_\s-])(\w)/g, (_match, prefix: string, letter: string) =>
    `${prefix === '_' ? ' ' : prefix}${letter.toUpperCase()}`,
  );
}

function buildPrimaryMove(report: WinnerTruthReport): DailyUtilitySlateItem | null {
  const card = report.current_winner.discrepancy_card;
  if (!card || report.current_winner.verdict !== 'selected') return null;

  return {
    title: report.current_winner.title ?? card.claim,
    status: 'primary_move',
    evidence: asEvidence(card.evidence),
    why_it_matters: card.risk,
    next_action: card.next_action,
    source_refs: card.source_refs,
  };
}

function buildOpenLoop(report: WinnerTruthReport): DailyUtilitySlateItem | null {
  const candidate = report.top_viable_candidates[0];
  if (!candidate?.title) return null;
  const blockers = humanizeBlockers(candidate.missing_blockers);
  const evidence = asEvidence([
    `Possible useful work: ${candidate.title}`,
  ]);

  return {
    title: candidate.title,
    status: 'open_loop',
    evidence,
    why_it_matters:
      candidate.missing_blockers.length > 0
        ? 'This looks like useful work, but the missing fields still decide whether Foldera can safely finish it.'
        : 'This remains a viable current candidate if the finished-artifact layer can prove the full discrepancy frame.',
    no_action_reason:
      blockers.length > 0
        ? blockers.join(' ')
        : 'Waiting for finished-artifact validation.',
    source_refs: [`candidate:${candidate.candidate_id}`],
  };
}

const COMMAND_CENTER_FAMILIES = new Set([
  'admin_deadline_packet',
  'calendar_conflict_brief',
  'deadline_decision_packet',
  'grounded_followup_draft',
  'interview_role_fit_packet',
  'job_admin_payment_deadline_decision_packet',
]);

function blockedCandidateScore(candidate: WinnerTruthReport['blocked_candidates'][number]): number {
  let score = 0;
  if (COMMAND_CENTER_FAMILIES.has(candidate.family)) score += 40;
  if (candidate.tier === 'tier_1') score += 20;
  if (candidate.tier === 'tier_2') score += 8;
  if (candidate.blockers.length > 0) score += 4;
  if (/^goal drift:/i.test(candidate.title)) score -= 30;
  if (candidate.family === 'other_grounded_artifact') score -= 12;
  if (candidate.blockers.includes('missing_current_artifact_anchor')) score -= 10;
  return score;
}

const THIN_BLOCKED_CANDIDATE_REASONS = new Set([
  'missing_current_artifact_anchor',
  'missing_grounded_recipient_for_send_message',
  'missing_role_fit_source_bundle',
  'missing_schedule_resolution_context',
  'no_grounded_recipient_for_send_message',
  'stale_status_without_current_artifact_facts',
]);

function shouldSurfaceBlockedCandidate(
  candidate: WinnerTruthReport['blocked_candidates'][number],
): boolean {
  if (/^goal drift:/i.test(candidate.title)) return false;
  return !candidate.blockers.some((blocker) =>
    THIN_BLOCKED_CANDIDATE_REASONS.has(
      blocker.replace(/^positive_winner_contract:/, '').replace(/^artifact_viability:/, ''),
    ),
  );
}

function selectBlockedUtilityCandidate(report: WinnerTruthReport) {
  return [...report.blocked_candidates]
    .filter(shouldSurfaceBlockedCandidate)
    .sort((left, right) => blockedCandidateScore(right) - blockedCandidateScore(left))[0];
}

function buildBlockedButReal(report: WinnerTruthReport): DailyUtilitySlateItem | null {
  const candidate = selectBlockedUtilityCandidate(report);
  if (!candidate?.title) return null;
  const blockers = humanizeBlockers(candidate.blockers);
  const evidence = asEvidence([
    `Possible mismatch: ${candidate.title}`,
  ]);

  return {
    title: candidate.title,
    status: 'blocked_but_real',
    evidence,
    why_it_matters:
      'This may matter, but Foldera does not have enough proof to turn it into a safe finished action.',
    no_action_reason: blockers.join(' ') || 'Finished-artifact proof was incomplete.',
    source_refs: [`candidate:${candidate.candidate_id}`],
  };
}

function buildWatchItem(report: WinnerTruthReport): DailyUtilitySlateItem | null {
  const provider = report.sync_health.providers.find((entry) => entry.stale || entry.disconnected);
  if (provider) {
    const ageLabel =
      typeof provider.age_hours === 'number'
        ? `${provider.age_hours}h ago`
        : 'unknown freshness';
    return {
      title: `${displayProviderName(provider.provider)} source freshness needs attention`,
      status: 'watch_item',
      evidence: asEvidence([
        `${displayProviderName(provider.provider)} last synced ${ageLabel}`,
        provider.scoring_effect,
      ]),
      why_it_matters:
        'Stale source data can hide current work and can also make old signals look more important than they are.',
      no_action_reason:
        'Stale source data can support context, but it cannot safely manufacture urgency.',
      source_refs: [`provider:${provider.provider}`],
    };
  }

  const noSafeReason = report.current_winner.no_safe_artifact_reason;
  if (!noSafeReason) return null;
  const readableReason = humanizeNoSafeReason(noSafeReason);
  const freshProviders = report.sync_health.providers.filter(
    (provider) => !provider.stale && !provider.disconnected,
  );
  const sourceHealth =
    freshProviders.length > 0
      ? `Sources are current enough to trust this no-action verdict.`
      : null;
  return {
    title: 'No safe finished action today',
    status: 'watch_item',
    evidence: asEvidence([sourceHealth, `Why Foldera stopped: ${readableReason}`]),
    why_it_matters:
      'The safest answer is to avoid handing you a weak task that sounds useful but cannot prove its value.',
    no_action_reason: readableReason,
    source_refs: ['winner_truth:no_safe_artifact'],
  };
}

export function buildDailyUtilitySlateFromWinnerTruth(
  report: WinnerTruthReport,
): DailyUtilitySlate | null {
  const primaryMove = buildPrimaryMove(report);
  const openLoop = buildOpenLoop(report);
  const blockedButReal = buildBlockedButReal(report);
  const watchItem = buildWatchItem(report);

  const slate: DailyUtilitySlate = {
    generated_at: report.generated_at,
    finished_artifact_verdict:
      report.current_winner.verdict === 'selected'
        ? 'strict_artifact_selected'
        : 'no_finished_artifact',
    primary_move: isUtilityItem(primaryMove) ? primaryMove : null,
    open_loops: isUtilityItem(openLoop) ? [openLoop] : [],
    changed_since_yesterday: [],
    blocked_but_real: isUtilityItem(blockedButReal) ? blockedButReal : null,
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
