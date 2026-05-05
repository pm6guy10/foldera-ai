import { OWNER_USER_ID } from '@/lib/auth/constants';
import { resolveSelfIdentity } from '@/lib/auth/self-identity';
import { createServerClient } from '@/lib/db/client';
import { decryptWithStatus } from '@/lib/encryption';
import { scoreOpenLoops } from '@/lib/briefing/scorer';
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

function classifyRecentAction(row: {
  action_type: string | null;
  directive_text: string | null;
  skip_reason: string | null;
  execution_result: unknown;
  generated_at: string;
}): ThreeDayConsistencyDay {
  const actionType = String(row.action_type ?? '');
  const directiveText = String(row.directive_text ?? '');
  const skipReason = String(row.skip_reason ?? '');
  const lower = `${directiveText}\n${skipReason}`.toLowerCase();
  let executionText = '';
  if (typeof row.execution_result === 'string') executionText = row.execution_result.toLowerCase();
  else if (row.execution_result && typeof row.execution_result === 'object') executionText = JSON.stringify(row.execution_result).toLowerCase();

  const looksNoSafe = lower.includes('no safe artifact today') || executionText.includes('no_safe_artifact_today');
  const forbidden =
    /\b(?:dev\s*notes?|internal\s+homework|homework\s+assignment|generic\s+prep|prep\s+checklist)\b/i.test(lower) ||
    /\bdiscrepancy_(?:risk|decay|dropout)|relationship(?:_|\s)(?:risk|silence|drop)/i.test(executionText);
  const usefulAction = ['write_document', 'make_decision', 'schedule_block'].includes(actionType);

  if (looksNoSafe) {
    return {
      day: toPacificDay(row.generated_at),
      generated_at: row.generated_at,
      action_type: actionType,
      classification: 'no_safe_artifact',
      summary: 'Explicit no-safe-artifact outcome with blockers.',
    };
  }

  if (usefulAction && !forbidden) {
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

export async function getWinnerTruthReport(userId = OWNER_USER_ID): Promise<WinnerTruthReport> {
  const supabase = createServerClient();
  const [{ data: tokenRows, error: tokenError }, { data: signalRows, error: signalError }, { data: actionRows, error: actionError }] =
    await Promise.all([
      supabase
        .from('user_tokens')
        .select('provider, last_synced_at, disconnected_at')
        .eq('user_id', userId)
        .in('provider', ['google', 'microsoft']),
      supabase
        .from('tkg_signals')
        .select('id, source, type, content, occurred_at')
        .eq('user_id', userId)
        .gte('occurred_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())
        .order('occurred_at', { ascending: false, nullsFirst: false })
        .limit(250),
      supabase
        .from('tkg_actions')
        .select('id, status, action_type, directive_text, confidence, generated_at, execution_result, skip_reason')
        .eq('user_id', userId)
        .order('generated_at', { ascending: false, nullsFirst: false })
        .limit(25),
    ]);

  if (tokenError) throw new Error(`winner_truth_tokens: ${tokenError.message}`);
  if (signalError) throw new Error(`winner_truth_signals: ${signalError.message}`);
  if (actionError) throw new Error(`winner_truth_actions: ${actionError.message}`);

  const decryptSamples = (signalRows ?? []).map((row) => {
    const decrypted = decryptWithStatus(String(row.content ?? ''));
    return {
      id: String(row.id),
      source: String(row.source ?? ''),
      type: String(row.type ?? ''),
      used_fallback: decrypted.usedFallback,
    };
  });
  const decryptFallbackRows = decryptSamples.filter((sample) => sample.used_fallback);
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
  const candidateArtifactability = selection?.winnerQualityTrace?.candidate_artifactability ?? [];
  const topViableCandidates = candidateArtifactability
    .filter((candidate: any) => candidate.viable === true && ['tier_1', 'tier_2'].includes(candidate.tier))
    .slice(0, 5)
    .map((candidate: any) => ({
      candidate_id: String(candidate.candidate_id),
      title: String(candidate.title),
      tier: String(candidate.tier),
      artifact_family: String(candidate.artifact_family),
      missing_blockers: Array.isArray(candidate.missing_blockers) ? candidate.missing_blockers.map(String) : [],
    }));
  const selectedArtifactability = selected
    ? candidateArtifactability.find((candidate: any) => String(candidate.candidate_id) === String(selected.candidate.id))
    : null;
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
  for (const row of actionRows ?? []) {
    if (!row.generated_at) continue;
    const classified = classifyRecentAction({
      action_type: row.action_type as string | null,
      directive_text: row.directive_text as string | null,
      skip_reason: row.skip_reason as string | null,
      execution_result: row.execution_result,
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
  if (decryptFallbackRows.length > 0) {
    futureFindings.push({
      classification: 'current_blocker',
      finding: 'decrypt_fallback_rows_at_candidate_input',
      evidence: decryptFallbackRows.slice(0, 5).map((row) => `${row.id}:${row.source}:${row.type}`).join(', '),
      smallest_next_move: 'Quarantine or recover fallback rows before candidate scoring.',
    });
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
  futureFindings.push({
    classification: 'future_backlog',
    finding: 'mail_sync_stores_preview_not_full_raw_body',
    evidence: 'Current mail sync persists headers plus body preview text for scoring/extraction rather than full raw mailbox bodies.',
    smallest_next_move: 'Add artifact-family-specific evidence hydration where preview-only context is too thin.',
  });

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
      decrypt_sample_count: decryptSamples.length,
      decrypt_fallback_count: decryptFallbackRows.length,
    },
    current_winner: {
      verdict: selected ? 'selected' : 'no_safe_artifact_today',
      title: selected?.candidate.title ?? null,
      tier: selection?.winnerQualityTrace?.positive_winner_contract?.selected_tier ?? null,
      artifact_family: selectedArtifactability ? String(selectedArtifactability.artifact_family ?? '') || null : null,
      note: selected?.note ?? null,
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
