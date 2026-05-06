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

function isUtilityItem(item: DailyUtilitySlateItem | null): item is DailyUtilitySlateItem {
  if (!item) return false;
  if (!item.title.trim()) return false;
  if (!item.why_it_matters.trim()) return false;
  if (!Array.isArray(item.evidence) || item.evidence.length === 0) return false;
  return item.evidence.every((entry) => entry.trim().length > 0);
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
  const blockers = asEvidence(candidate.missing_blockers.map((blocker) => `Still missing: ${blocker}`));
  const evidence = asEvidence([
    `Candidate family: ${candidate.artifact_family}`,
    `Priority tier: ${candidate.tier}`,
    ...blockers,
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
      candidate.missing_blockers.length > 0
        ? candidate.missing_blockers.join('; ')
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

function selectBlockedUtilityCandidate(report: WinnerTruthReport) {
  return [...report.blocked_candidates].sort(
    (left, right) => blockedCandidateScore(right) - blockedCandidateScore(left),
  )[0];
}

function buildBlockedButReal(report: WinnerTruthReport): DailyUtilitySlateItem | null {
  const candidate = selectBlockedUtilityCandidate(report);
  if (!candidate?.title) return null;
  const blockers = asEvidence(candidate.blockers);
  const evidence = asEvidence([
    `Candidate: ${candidate.title}`,
    candidate.family ? `Candidate family: ${candidate.family}` : null,
    candidate.tier ? `Priority tier: ${candidate.tier}` : null,
    ...blockers.map((blocker) => `Blocked because: ${blocker}`),
  ]);

  return {
    title: candidate.title,
    status: 'blocked_but_real',
    evidence,
    why_it_matters:
      'Foldera saw this as real, but it is not safe to turn into a finished artifact yet.',
    no_action_reason: blockers.join('; ') || 'Finished-artifact proof was incomplete.',
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
  return {
    title: 'No finished artifact cleared the bar',
    status: 'watch_item',
    evidence: asEvidence([`Finished-artifact verdict: ${noSafeReason}`]),
    why_it_matters:
      'The strict artifact layer refused to show weak work, so this is awareness only.',
    no_action_reason: noSafeReason,
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
