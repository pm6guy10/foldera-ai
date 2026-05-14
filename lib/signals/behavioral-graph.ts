/**
 * Behavioral Graph
 * ================
 * Computes per-entity behavioral statistics from processed signal metadata.
 *
 * Design constraints:
 *   - No decryption, no re-extraction, no model calls.
 *   - Reads only processed signal metadata: extracted_entities + occurred_at.
 *   - Paginates through all matching rows so stats reflect DB truth instead of
 *     a single default PostgREST page.
 *   - Persists stats back into tkg_entities.patterns.bx_stats.
 */

import { createServerClient } from '@/lib/db/client';
import { daysMs } from '@/lib/config/constants';

export const BEHAVIORAL_GRAPH_PAGE_SIZE = 1000;

export interface EntityBehavioralStats {
  signal_count_14d: number;
  signal_count_30d: number;
  signal_count_90d: number;
  velocity_ratio: number | null;
  silence_detected: boolean;
  open_loop_age_days: number | null;
  computed_at: string;
}

export interface BehavioralGraphFreshness {
  user_id: string;
  latest_processed_signal_at: string | null;
  latest_processed_signal_data_at: string | null;
  oldest_patterns_updated_at: string | null;
  newest_patterns_updated_at: string | null;
  stale_entity_count: number;
  graph_stale: boolean;
}

export interface BehavioralGraphDriftEntry {
  entity_id: string;
  name: string;
  patterns_updated_at: string | null;
  latest_signal_at: string | null;
  stored: {
    signal_count_14d: number;
    signal_count_30d: number;
    signal_count_90d: number;
  };
  actual: {
    signal_count_14d: number;
    signal_count_30d: number;
    signal_count_90d: number;
  };
}

export interface BehavioralGraphResult {
  entities_evaluated: number;
  entities_updated: number;
  silent_entities: number;
  duration_ms: number;
  signals_scanned: number;
  pages_fetched: number;
  skipped_as_fresh?: boolean;
}

interface EntityRow {
  id: string;
  name: string | null;
  total_interactions: number | null;
  last_interaction: string | null;
  patterns: Record<string, unknown> | null;
  patterns_updated_at?: string | null;
}

interface SignalWindowCounts {
  count14: number;
  count30: number;
  count90: number;
  latestSignalAt: string | null;
}

interface SignalAggregationResult {
  countsByEntityId: Map<string, SignalWindowCounts>;
  signalsScanned: number;
  pagesFetched: number;
}

function toMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function isRollingWindowBoundaryDrift(entry: BehavioralGraphDriftEntry): boolean {
  const latestSignalMs = toMs(entry.latest_signal_at);
  const patternsUpdatedMs = toMs(entry.patterns_updated_at);
  if (latestSignalMs == null || patternsUpdatedMs == null || latestSignalMs > patternsUpdatedMs) {
    return false;
  }

  const delta14 = Math.abs(entry.stored.signal_count_14d - entry.actual.signal_count_14d);
  const delta30 = Math.abs(entry.stored.signal_count_30d - entry.actual.signal_count_30d);
  const delta90 = Math.abs(entry.stored.signal_count_90d - entry.actual.signal_count_90d);
  const countsOnlyAgedOut =
    entry.actual.signal_count_14d <= entry.stored.signal_count_14d &&
    entry.actual.signal_count_30d <= entry.stored.signal_count_30d &&
    entry.actual.signal_count_90d <= entry.stored.signal_count_90d &&
    (delta14 > 0 || delta30 > 0 || delta90 > 0);
  return countsOnlyAgedOut || (delta14 <= 1 && delta30 <= 1 && delta90 <= 2);
}

function buildEmptyCounts(): SignalWindowCounts {
  return {
    count14: 0,
    count30: 0,
    count90: 0,
    latestSignalAt: null,
  };
}

async function loadEntityRows(userId: string): Promise<EntityRow[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('tkg_entities')
    .select('id, name, total_interactions, last_interaction, patterns, patterns_updated_at')
    .eq('user_id', userId)
    .neq('name', 'self')
    .eq('type', 'person');

  if (error) throw new Error(`behavioral_graph_entity_fetch: ${error.message}`);
  return (data ?? []) as unknown as EntityRow[];
}

async function aggregateSignalCounts(
  userId: string,
  entityIds: string[],
): Promise<SignalAggregationResult> {
  if (entityIds.length === 0) {
    return {
      countsByEntityId: new Map(),
      signalsScanned: 0,
      pagesFetched: 0,
    };
  }

  const supabase = createServerClient();
  const now = Date.now();
  const cutoff90ms = now - daysMs(90);
  const cutoff30ms = now - daysMs(30);
  const cutoff14ms = now - daysMs(14);
  const cutoff90iso = new Date(cutoff90ms).toISOString();
  const trackedIds = new Set(entityIds);
  const countsByEntityId = new Map<string, SignalWindowCounts>();
  for (const entityId of entityIds) countsByEntityId.set(entityId, buildEmptyCounts());

  let offset = 0;
  let signalsScanned = 0;
  let pagesFetched = 0;

  while (true) {
    const { data, error } = await supabase
      .from('tkg_signals')
      .select('extracted_entities, occurred_at')
      .eq('user_id', userId)
      .eq('processed', true)
      .gte('occurred_at', cutoff90iso)
      .not('extracted_entities', 'is', null)
      .order('occurred_at', { ascending: false, nullsFirst: false })
      .range(offset, offset + BEHAVIORAL_GRAPH_PAGE_SIZE - 1);

    if (error) throw new Error(`behavioral_graph_signal_fetch: ${error.message}`);

    const rows = data ?? [];
    if (rows.length === 0) break;

    pagesFetched += 1;
    signalsScanned += rows.length;

    for (const row of rows as Array<{ extracted_entities?: string[] | null; occurred_at?: string | null }>) {
      if (!row.occurred_at) continue;
      const occurredAtMs = toMs(row.occurred_at);
      if (occurredAtMs == null || occurredAtMs < cutoff90ms) continue;
      const extractedIds = row.extracted_entities ?? [];
      for (const entityId of extractedIds) {
        if (!trackedIds.has(entityId)) continue;
        const bucket = countsByEntityId.get(entityId) ?? buildEmptyCounts();
        bucket.count90 += 1;
        if (occurredAtMs >= cutoff30ms) bucket.count30 += 1;
        if (occurredAtMs >= cutoff14ms) bucket.count14 += 1;
        if (!bucket.latestSignalAt || occurredAtMs > (toMs(bucket.latestSignalAt) ?? 0)) {
          bucket.latestSignalAt = row.occurred_at;
        }
        countsByEntityId.set(entityId, bucket);
      }
    }

    if (rows.length < BEHAVIORAL_GRAPH_PAGE_SIZE) break;
    offset += BEHAVIORAL_GRAPH_PAGE_SIZE;
  }

  return {
    countsByEntityId,
    signalsScanned,
    pagesFetched,
  };
}

export async function getBehavioralGraphFreshness(
  userId: string,
): Promise<BehavioralGraphFreshness> {
  const supabase = createServerClient();
  const [entitiesResult, latestSignalResult] = await Promise.all([
    supabase
      .from('tkg_entities')
      .select('patterns_updated_at')
      .eq('user_id', userId)
      .neq('name', 'self')
      .eq('type', 'person'),
    supabase
      .from('tkg_signals')
      .select('occurred_at, created_at')
      .eq('user_id', userId)
      .eq('processed', true)
      .order('created_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (entitiesResult.error) {
    throw new Error(`behavioral_graph_freshness_entities: ${entitiesResult.error.message}`);
  }
  if (latestSignalResult.error) {
    throw new Error(`behavioral_graph_freshness_signals: ${latestSignalResult.error.message}`);
  }

  const entityRows = entitiesResult.data ?? [];
  const latestProcessedSignalAt = (latestSignalResult.data?.occurred_at as string | null | undefined) ?? null;
  const latestProcessedSignalDataAt =
    (latestSignalResult.data?.created_at as string | null | undefined) ??
    latestProcessedSignalAt;
  let oldestPatternsUpdatedAt: string | null = null;
  let newestPatternsUpdatedAt: string | null = null;
  let staleEntityCount = 0;

  for (const row of entityRows) {
    const updatedAt = (row.patterns_updated_at as string | null | undefined) ?? null;
    if (!updatedAt) {
      staleEntityCount += 1;
      continue;
    }
    if (!oldestPatternsUpdatedAt || (toMs(updatedAt) ?? 0) < (toMs(oldestPatternsUpdatedAt) ?? Number.MAX_SAFE_INTEGER)) {
      oldestPatternsUpdatedAt = updatedAt;
    }
    if (!newestPatternsUpdatedAt || (toMs(updatedAt) ?? 0) > (toMs(newestPatternsUpdatedAt) ?? 0)) {
      newestPatternsUpdatedAt = updatedAt;
    }
    if ((toMs(latestProcessedSignalDataAt) ?? 0) > (toMs(updatedAt) ?? 0)) {
      staleEntityCount += 1;
    }
  }

  return {
    user_id: userId,
    latest_processed_signal_at: latestProcessedSignalAt,
    latest_processed_signal_data_at: latestProcessedSignalDataAt,
    oldest_patterns_updated_at: oldestPatternsUpdatedAt,
    newest_patterns_updated_at: newestPatternsUpdatedAt,
    stale_entity_count: staleEntityCount,
    graph_stale: staleEntityCount > 0,
  };
}

export async function needsBehavioralGraphRefresh(userId: string): Promise<boolean> {
  const freshness = await getBehavioralGraphFreshness(userId);
  return freshness.graph_stale;
}

export async function computeBehavioralStats(
  userId: string,
): Promise<BehavioralGraphResult> {
  const start = Date.now();
  const supabase = createServerClient();
  const now = Date.now();
  const computedAt = new Date(now).toISOString();

  const entities = await loadEntityRows(userId);
  if (entities.length === 0) {
    return {
      entities_evaluated: 0,
      entities_updated: 0,
      silent_entities: 0,
      duration_ms: Date.now() - start,
      signals_scanned: 0,
      pages_fetched: 0,
    };
  }

  const aggregation = await aggregateSignalCounts(
    userId,
    entities.map((entity) => entity.id),
  );

  let entitiesUpdated = 0;
  let silentEntities = 0;

  for (const entity of entities) {
    const counts = aggregation.countsByEntityId.get(entity.id) ?? buildEmptyCounts();
    const totalInteractions = entity.total_interactions ?? 0;
    const lastInteractionMs = toMs(entity.last_interaction);
    const rate14 = counts.count14 / 14;
    const rate90 = counts.count90 / 90;
    const velocityRatio = rate90 > 0 ? Math.round((rate14 / rate90) * 100) / 100 : null;
    const silenceDetected = totalInteractions >= 5 && counts.count30 === 0;
    if (silenceDetected) silentEntities++;

    const openLoopAgeDays = lastInteractionMs == null
      ? null
      : Math.round((now - lastInteractionMs) / daysMs(1));

    const bxStats: EntityBehavioralStats = {
      signal_count_14d: counts.count14,
      signal_count_30d: counts.count30,
      signal_count_90d: counts.count90,
      velocity_ratio: velocityRatio,
      silence_detected: silenceDetected,
      open_loop_age_days: openLoopAgeDays,
      computed_at: computedAt,
    };

    const existingPatterns = entity.patterns ?? {};
    const updatedPatterns = { ...existingPatterns, bx_stats: bxStats };

    const { error } = await supabase
      .from('tkg_entities')
      .update({ patterns: updatedPatterns, patterns_updated_at: computedAt })
      .eq('id', entity.id);

    if (error) {
      console.warn(`[behavioral-graph] Failed to update entity ${entity.id} for user ${userId}: ${error.message}`);
      continue;
    }

    entitiesUpdated++;
  }

  return {
    entities_evaluated: entities.length,
    entities_updated: entitiesUpdated,
    silent_entities: silentEntities,
    duration_ms: Date.now() - start,
    signals_scanned: aggregation.signalsScanned,
    pages_fetched: aggregation.pagesFetched,
  };
}

export async function auditBehavioralGraphConsistency(
  userId: string,
  options: { limit?: number } = {},
): Promise<BehavioralGraphDriftEntry[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('tkg_entities')
    .select('id, name, display_name, patterns, patterns_updated_at, total_interactions')
    .eq('user_id', userId)
    .neq('name', 'self')
    .eq('type', 'person')
    .order('total_interactions', { ascending: false })
    .limit(options.limit ?? 12);

  if (error) throw new Error(`behavioral_graph_drift_entities: ${error.message}`);

  const entities = (data ?? []) as Array<{
    id: string;
    name: string | null;
    display_name?: string | null;
    patterns: Record<string, unknown> | null;
    patterns_updated_at?: string | null;
  }>;

  const aggregation = await aggregateSignalCounts(
    userId,
    entities.map((entity) => entity.id),
  );

  return entities
    .map((entity) => {
      const storedBx = (entity.patterns as { bx_stats?: Partial<EntityBehavioralStats> } | null)?.bx_stats ?? {};
      const actual = aggregation.countsByEntityId.get(entity.id) ?? buildEmptyCounts();
      const drift: BehavioralGraphDriftEntry = {
        entity_id: entity.id,
        name: entity.display_name ?? entity.name ?? entity.id,
        patterns_updated_at: entity.patterns_updated_at ?? null,
        latest_signal_at: actual.latestSignalAt,
        stored: {
          signal_count_14d: Number(storedBx.signal_count_14d ?? 0),
          signal_count_30d: Number(storedBx.signal_count_30d ?? 0),
          signal_count_90d: Number(storedBx.signal_count_90d ?? 0),
        },
        actual: {
          signal_count_14d: actual.count14,
          signal_count_30d: actual.count30,
          signal_count_90d: actual.count90,
        },
      };
      return drift;
    })
    .filter((entry) => {
      const delta14 = Math.abs(entry.stored.signal_count_14d - entry.actual.signal_count_14d);
      const delta30 = Math.abs(entry.stored.signal_count_30d - entry.actual.signal_count_30d);
      const delta90 = Math.abs(entry.stored.signal_count_90d - entry.actual.signal_count_90d);
      const boundaryOnly14dDrift = delta14 <= 1 && delta30 === 0 && delta90 === 0;
      return !boundaryOnly14dDrift && !isRollingWindowBoundaryDrift(entry) && (delta14 > 0 || delta30 > 0 || delta90 > 0);
    });
}

export async function runBehavioralGraph(
  userIds: string[],
  options: { onlyIfStale?: boolean } = {},
): Promise<{
  ok: boolean;
  users: number;
  total_entities_updated: number;
  total_silent_entities: number;
  total_signals_scanned: number;
  total_pages_fetched: number;
  skipped_users: number;
  freshness: BehavioralGraphFreshness[];
  error?: string;
}> {
  let totalUpdated = 0;
  let totalSilent = 0;
  let totalSignalsScanned = 0;
  let totalPagesFetched = 0;
  let skippedUsers = 0;
  const freshness: BehavioralGraphFreshness[] = [];

  for (const userId of userIds) {
    try {
      const currentFreshness = await getBehavioralGraphFreshness(userId);
      freshness.push(currentFreshness);

      if (options.onlyIfStale && !currentFreshness.graph_stale) {
        skippedUsers++;
        continue;
      }

      const result = await computeBehavioralStats(userId);
      totalUpdated += result.entities_updated;
      totalSilent += result.silent_entities;
      totalSignalsScanned += result.signals_scanned;
      totalPagesFetched += result.pages_fetched;
    } catch (err: unknown) {
      console.warn(
        `[behavioral-graph] Failed for user ${userId}:`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  return {
    ok: true,
    users: userIds.length,
    total_entities_updated: totalUpdated,
    total_silent_entities: totalSilent,
    total_signals_scanned: totalSignalsScanned,
    total_pages_fetched: totalPagesFetched,
    skipped_users: skippedUsers,
    freshness,
  };
}
