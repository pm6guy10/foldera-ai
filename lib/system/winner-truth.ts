import { OWNER_USER_ID } from '@/lib/auth/constants';
import { resolveSelfIdentity } from '@/lib/auth/self-identity';
import { createServerClient } from '@/lib/db/client';
import { scoreOpenLoops } from '@/lib/briefing/scorer';
import type { ScoredLoop } from '@/lib/briefing/scorer';
import { selectRankedCandidates } from '@/lib/briefing/generator';
import {
  auditBehavioralGraphConsistency,
  getBehavioralGraphFreshness,
  type BehavioralGraphDriftEntry,
  type BehavioralGraphFreshness,
} from '@/lib/signals/behavioral-graph';
import {
  findPollutedTrustedEntities,
  type PollutedEntityFinding,
} from '@/lib/signals/entity-trust-repair';
import { MAIL_SYNC_BODY_TEXT_MAX_CHARS } from '@/lib/config/constants';
import {
  deriveDiscrepancyPatternKeys,
  evaluateDiscrepancyCardFrame,
  type DiscrepancyCardFrame,
} from '@/lib/briefing/discrepancy-card-frame';

type FindingClass = 'current_blocker' | 'adjacent_risk' | 'future_backlog';

interface ProviderFreshness {
  provider: string;
  last_synced_at: string | null;
  age_hours: number | null;
  disconnected: boolean;
  stale: boolean;
  scoring_effect: string;
}

interface WinnerTruthFinding {
  classification: FindingClass;
  finding: string;
  evidence: string;
  smallest_next_move: string;
}

const PREVIEW_ONLY_MAIL_BODY_MAX_CHARS = 4_000;

export function shouldFlagPreviewOnlyMailSyncFinding(bodyTextMaxChars = MAIL_SYNC_BODY_TEXT_MAX_CHARS): boolean {
  return bodyTextMaxChars < PREVIEW_ONLY_MAIL_BODY_MAX_CHARS;
}

interface ThreeDayConsistencyDay {
  day: string;
  generated_at: string;
  action_type: string;
  classification: 'useful_artifact' | 'no_safe_artifact' | 'garbage_regression';
  summary: string;
}

export interface WinnerTruthReport {
  generated_at: string;
  user_id: string;
  sync_health: {
    providers: ProviderFreshness[];
    graph: BehavioralGraphFreshness;
    decrypt_sample_count: number;
    decrypt_fallback_count: number;
  };
  current_winner: {
    verdict: 'selected' | 'no_safe_artifact_today';
    title: string | null;
    tier: string | null;
    artifact_family: string | null;
    note: string | null;
    discrepancy_card: DiscrepancyCardFrame | null;
    no_safe_artifact_reason: string | null;
  };
  top_viable_candidates: Array<{
    candidate_id: string;
    title: string;
    tier: string;
    artifact_family: string;
    missing_blockers: string[];
  }>;
  blocked_candidates: Array<{
    candidate_id: string;
    title: string;
    tier: string;
    family: string;
    blockers: string[];
  }>;
  graph_drift: BehavioralGraphDriftEntry[];
  polluted_entities: PollutedEntityFinding[];
  three_day_consistency: {
    passes: boolean;
    days: ThreeDayConsistencyDay[];
  };
  action_needed: string[];
  future_findings: WinnerTruthFinding[];
}

function ageHours(iso: string | null | undefined, now = Date.now()): number | null {
  if (!iso) return null;
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return null;
  return Math.round((now - ts) / (1000 * 60 * 60));
}

function classifyProviderFreshness(row: {
  provider: string;
  last_synced_at: string | null;
  disconnected_at: string | null;
}): ProviderFreshness {
  const hours = ageHours(row.last_synced_at);
  const stale = row.disconnected_at != null || hours == null || hours > 48;
  return {
    provider: row.provider,
    last_synced_at: row.last_synced_at,
    age_hours: hours,
    disconnected: row.disconnected_at != null,
    stale,
    scoring_effect: stale
      ? 'context only; cannot create urgency or relationship-silence winners'
      : 'fresh enough for currentness support',
  };
}

function toPacificDay(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

export function classifyRecentAction(row: {
  action_type: string | null;
  directive_text: string | null;
  skip_reason: string | null;
  generated_at: string;
}): ThreeDayConsistencyDay {
  const actionType = String(row.action_type ?? '');
  const directiveText = String(row.directive_text ?? '');
  const skipReason = String(row.skip_reason ?? '');
  const lower = `${directiveText}\n${skipReason}`.toLowerCase();
  const looksNoSafe =
    lower.includes('no safe artifact today') ||
    actionType === 'do_nothing';
  const forbidden =
    /\b(?:dev\s*notes?|internal\s+homework|homework\s+assignment|generic\s+prep|prep\s+checklist|discrepancy_(?:risk|decay|dropout)|relationship(?:_|\s)(?:risk|silence|drop))\b/i.test(lower);
  const usefulAction = ['write_document', 'make_decision', 'schedule_block'].includes(actionType);

  if (looksNoSafe) {
    return {
      day: toPacificDay(row.generated_at),
      generated_at: row.generated_at,
      action_type: actionType,
      classification: 'no_safe_artifact',
      summary: 'Explicit no-safe-artifact outcome.',
    };
  }

  if (usefulAction && !forbidden && skipReason !== 'not_relevant') {
    return {
      day: toPacificDay(row.generated_at),
      generated_at: row.generated_at,
      action_type: actionType,
      classification: 'useful_artifact',
      summary: directiveText.slice(0, 140) || actionType,
    };
  }

  return {
    day: toPacificDay(row.generated_at),
    generated_at: row.generated_at,
    action_type: actionType,
    classification: 'garbage_regression',
    summary: directiveText.slice(0, 140) || skipReason.slice(0, 140) || actionType,
  };
}

export function buildWinnerTruthNextAction(
  candidate: Pick<ScoredLoop, 'title' | 'suggestedActionType' | 'content'>,
  note?: string | null,
): string {
  const cleanTitle = candidate.title
    .replace(/^Commitment due(?: in \d+d)?:\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  const target = cleanTitle || candidate.title;

  if (candidate.suggestedActionType === 'write_document') {
    return `Write a decision memo that closes "${target}" with the owner, next action, and deadline.`;
  }
  if (candidate.suggestedActionType === 'send_message') {
    return 'Send the grounded thread a concrete ask that names the decision and deadline.';
  }
  if (candidate.suggestedActionType === 'schedule') {
    return `Schedule a protected work block or resolution slot for "${target}".`;
  }
  if (candidate.suggestedActionType === 'make_decision') {
    return `Decide the next owner-backed move for "${target}" and close the open loop.`;
  }
  return note ?? candidate.content ?? candidate.title;
}

function buildWinnerDiscrepancyCard(
  selected: ReturnType<typeof selectRankedCandidates>['ranked'][number] | null,
): DiscrepancyCardFrame | null {
  if (!selected) return null;
  const candidate = selected.candidate;
  const sourceFacts = (candidate.sourceSignals ?? [])
    .map((source) =>
      [source.source, source.summary, source.occurredAt]
        .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
        .join(': '),
    )
    .filter((entry) => entry.trim().length > 0);
  const evidence = [
    ...sourceFacts,
    ...(candidate.relatedSignals ?? []),
    candidate.discrepancyEvidence ?? '',
    candidate.content ?? '',
  ].filter((entry) => typeof entry === 'string' && entry.trim().length > 0);
  const trigger = candidate.trigger;
  const contradiction = trigger
    ? [
        trigger.baseline_state ? `Expected: ${trigger.baseline_state}` : null,
        trigger.current_state ? `Current: ${trigger.current_state}` : null,
        trigger.delta ? `But changed by: ${trigger.delta}` : null,
      ].filter(Boolean).join(' ')
    : candidate.content;
  const risk =
    trigger?.why_now ??
    candidate.discrepancyEvidence ??
    candidate.content ??
    selected.note ??
    'The current evidence could not prove a safer intervention.';
  const sourceRefs = (candidate.sourceSignals ?? [])
    .map((source, index) =>
      [source.source ?? source.kind, source.id ?? `source-${index + 1}`]
        .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
        .join(':'),
    )
    .filter((entry) => entry.trim().length > 0);

  return {
    claim: candidate.title,
    contradiction,
    risk,
    evidence: evidence.slice(0, 5),
    next_action: buildWinnerTruthNextAction(candidate, selected.note),
    why_now: trigger?.why_now ?? selected.note ?? candidate.content,
    source_refs: sourceRefs.length > 0 ? sourceRefs : [`candidate:${candidate.id}`],
    confidence: Math.max(0, Math.min(1, candidate.confidence_prior / 100)),
    pattern_keys: deriveDiscrepancyPatternKeys({
      actionType: candidate.suggestedActionType,
      discrepancyClass: candidate.discrepancyClass,
      candidateType: candidate.type,
      title: candidate.title,
      content: candidate.content,
    }),
  };
}

export async function getWinnerTruthReport(userId = OWNER_USER_ID): Promise<WinnerTruthReport> {
  const supabase = createServerClient();
  const [{ data: tokenRows, error: tokenError }, { data: actionRows, error: actionError }] =
    await Promise.all([
      supabase
        .from('user_tokens')
        .select('provider, last_synced_at, disconnected_at')
        .eq('user_id', userId)
        .in('provider', ['google', 'microsoft']),
      supabase
        .from('tkg_actions')
        .select('id, status, action_type, directive_text, confidence, generated_at, skip_reason')
        .eq('user_id', userId)
        .order('generated_at', { ascending: false, nullsFirst: false })
        .limit(25),
    ]);

  if (tokenError) throw new Error(`winner_truth_tokens: ${tokenError.message}`);
  if (actionError) throw new Error(`winner_truth_actions: ${actionError.message}`);

  const providerFreshness = (tokenRows ?? []).map((row) => classifyProviderFreshness({
    provider: String(row.provider ?? ''),
    last_synced_at: (row.last_synced_at as string | null | undefined) ?? null,
    disconnected_at: (row.disconnected_at as string | null | undefined) ?? null,
  }));

  const graphFreshness = await getBehavioralGraphFreshness(userId);
  const graphDrift = await auditBehavioralGraphConsistency(userId, { limit: 10 });
  const identity = await resolveSelfIdentity(userId);
  const pollutedEntities = await findPollutedTrustedEntities(userId, {
    selfEmails: identity.selfEmails,
    limit: 50,
  });

  const originalLog = console.log;
  const originalInfo = console.info;
  const originalWarn = console.warn;
  let scored: Awaited<ReturnType<typeof scoreOpenLoops>>;
  try {
    console.log = () => {};
    console.info = () => {};
    console.warn = () => {};
    scored = await scoreOpenLoops(userId, { pipelineDryRun: true });
  } finally {
    console.log = originalLog;
    console.info = originalInfo;
    console.warn = originalWarn;
  }

  const guardrails = {
    approvedRecently: (actionRows ?? []).filter((row) =>
      ['approved', 'executed', 'sent', 'pending_approval'].includes(String(row.status)),
    ),
    skippedRecently: (actionRows ?? []).filter((row) => row.skip_reason != null),
  } as any;

  const selection = scored.outcome !== 'no_valid_action'
    ? selectRankedCandidates(scored.topCandidates ?? [scored.winner], guardrails, { now: new Date() })
    : null;
  const selected = selection?.ranked.find((entry) => !entry.disqualified) ?? null;
  const selectedDiscrepancyCard = buildWinnerDiscrepancyCard(selected);
  const selectedDiscrepancyQuality = evaluateDiscrepancyCardFrame(selectedDiscrepancyCard);
  const selectedForTruth = selectedDiscrepancyQuality.passes ? selected : null;
  const candidateArtifactability = selection?.winnerQualityTrace?.candidate_artifactability ?? [];
  const topViableCandidates = candidateArtifactability
    .filter((candidate: any) => candidate.artifactable === true && ['tier_1', 'tier_2'].includes(candidate.tier))
    .slice(0, 5)
    .map((candidate: any) => ({
      candidate_id: String(candidate.candidate_id),
      title: String(candidate.title),
      tier: String(candidate.tier),
      artifact_family: String(candidate.artifact_family),
      missing_blockers: Array.isArray(candidate.blockers) ? candidate.blockers.map(String) : [],
    }));
  const selectedArtifactability = selectedForTruth
    ? candidateArtifactability.find((candidate: any) => String(candidate.candidate_id) === String(selectedForTruth.candidate.id))
    : null;
  const currentGeneratedAt = new Date().toISOString();
  const currentNoSafeReason = selectedForTruth
    ? null
    : selected && selectedDiscrepancyCard
      ? `Selected candidate failed discrepancy-card quality: ${selectedDiscrepancyQuality.rejection_reason ?? 'quality score too low'}`
    : providerFreshness.some((provider) => provider.stale)
      ? 'Refresh stale provider sync before trusting silence or deadline pressure from that source.'
      : 'No current Tier 1 or Tier 2 candidate proved a fresh, grounded discrepancy.';
  const blockedCandidates = (selection?.winnerQualityTrace?.good_candidate_blockers ?? [])
    .slice(0, 8)
    .map((candidate) => ({
      candidate_id: candidate.candidate_id,
      title: candidate.title,
      tier: candidate.tier,
      family: candidate.family,
      blockers: candidate.blockers,
    }));

  const byPacificDay = new Map<string, ThreeDayConsistencyDay>();
  byPacificDay.set(toPacificDay(currentGeneratedAt), {
    day: toPacificDay(currentGeneratedAt),
    generated_at: currentGeneratedAt,
    action_type: selectedForTruth ? selectedForTruth.candidate.suggestedActionType : 'no_safe_artifact_today',
    classification: selectedForTruth ? 'useful_artifact' : 'no_safe_artifact',
    summary: selectedForTruth?.candidate.title ?? currentNoSafeReason ?? 'No safe artifact today',
  });
  for (const row of actionRows ?? []) {
    if (!row.generated_at) continue;
    const classified = classifyRecentAction({
      action_type: row.action_type as string | null,
      directive_text: row.directive_text as string | null,
      skip_reason: row.skip_reason as string | null,
      generated_at: row.generated_at as string,
    });
    if (!byPacificDay.has(classified.day)) {
      byPacificDay.set(classified.day, classified);
    }
    if (byPacificDay.size >= 3) break;
  }
  const threeDayDays = [...byPacificDay.values()].slice(0, 3);
  const threeDayPasses =
    threeDayDays.length === 3 &&
    threeDayDays.every((day) => day.classification !== 'garbage_regression');

  const futureFindings: WinnerTruthFinding[] = [];
  for (const provider of providerFreshness) {
    if (provider.stale) {
      futureFindings.push({
        classification: 'adjacent_risk',
        finding: `${provider.provider}_provider_stale`,
        evidence: `${provider.provider} last_synced_at=${provider.last_synced_at ?? 'null'} age_hours=${provider.age_hours ?? 'unknown'}`,
        smallest_next_move: 'Run the real sync path and verify new signals land before briefing.',
      });
    }
  }
  if (graphDrift.length > 0) {
    futureFindings.push({
      classification: 'current_blocker',
      finding: 'behavioral_graph_drift_against_db_truth',
      evidence: graphDrift
        .slice(0, 4)
        .map((entry) => `${entry.name}:${entry.stored.signal_count_90d}->${entry.actual.signal_count_90d}`)
        .join(', '),
      smallest_next_move: 'Refresh the behavioral graph from full processed-signal metadata before briefing.',
    });
  }
  if (pollutedEntities.length > 0) {
    futureFindings.push({
      classification: 'current_blocker',
      finding: 'polluted_trusted_entities',
      evidence: pollutedEntities.slice(0, 5).map((entity) => `${entity.name}:${entity.reason}`).join(', '),
      smallest_next_move: 'Downgrade polluted system senders before relationship scoring.',
    });
  }
  if (shouldFlagPreviewOnlyMailSyncFinding()) {
    futureFindings.push({
      classification: 'future_backlog',
      finding: 'mail_sync_stores_preview_not_full_raw_body',
      evidence: 'Current mail sync persists headers plus body preview text for scoring/extraction rather than full raw mailbox bodies.',
      smallest_next_move: 'Add artifact-family-specific evidence hydration where preview-only context is too thin.',
    });
  }

  const actionNeeded: string[] = [];
  if (providerFreshness.some((provider) => provider.stale)) {
    actionNeeded.push('Refresh stale provider sync before trusting silence or deadline pressure from that source.');
  }
  if (graphFreshness.graph_stale || graphDrift.length > 0) {
    actionNeeded.push('Repair the behavioral graph before briefing reads relationship state.');
  }
  if (pollutedEntities.length > 0) {
    actionNeeded.push('Downgrade system senders that are still masquerading as trusted people.');
  }
  if (!selected) {
    actionNeeded.push('No Tier 1 or Tier 2 winner is currently safe; inspect the top blockers before forcing generation.');
  }
  if (!threeDayPasses) {
    actionNeeded.push('Three-day consistency is still broken; inspect recent garbage-regression days before calling the seam dependable.');
  }

  return {
    generated_at: new Date().toISOString(),
    user_id: userId,
    sync_health: {
      providers: providerFreshness,
      graph: graphFreshness,
      decrypt_sample_count: 0,
      decrypt_fallback_count: 0,
    },
    current_winner: {
      verdict: selectedForTruth ? 'selected' : 'no_safe_artifact_today',
      title: selectedForTruth?.candidate.title ?? null,
      tier: selectedForTruth ? selection?.winnerQualityTrace?.positive_winner_contract?.selected_tier ?? null : null,
      artifact_family: selectedArtifactability ? String(selectedArtifactability.artifact_family ?? '') || null : null,
      note: selectedForTruth?.note ?? null,
      discrepancy_card: selectedForTruth ? selectedDiscrepancyCard : null,
      no_safe_artifact_reason: currentNoSafeReason,
    },
    top_viable_candidates: topViableCandidates,
    blocked_candidates: blockedCandidates,
    graph_drift: graphDrift,
    polluted_entities: pollutedEntities,
    three_day_consistency: {
      passes: threeDayPasses,
      days: threeDayDays,
    },
    action_needed: actionNeeded,
    future_findings: futureFindings,
  };
}
