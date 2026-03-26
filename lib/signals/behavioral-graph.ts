/**
 * Behavioral Graph
 * ================
 * Computes per-entity behavioral statistics from raw signal metadata.
 *
 * Key design constraints:
 *   - NO decryption. All computation is on unencrypted metadata columns:
 *     tkg_signals.extracted_entities (UUID[]), tkg_signals.occurred_at,
 *     tkg_entities.total_interactions, tkg_entities.last_interaction.
 *   - O(1) DB queries per user: fetch all entities + all recent signals in
 *     two queries, then do all math in memory.
 *   - Writes back to tkg_entities.patterns.bx_stats as a JSONB subkey.
 *     Scorer can read this without touching encrypted fields.
 *
 * Stats computed:
 *   - signal_count_14d / _30d / _90d  — interaction density windows
 *   - velocity_ratio                  — (14d rate) / (90d/6 rate). >1 = warming
 *   - silence_detected                — ≥5 total interactions, nothing in 30d
 *   - open_loop_age_days              — days since last interaction
 *   - computed_at                     — ISO timestamp of this run
 */

import { createServerClient } from '@/lib/db/client';
import { daysMs } from '@/lib/config/constants';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EntityBehavioralStats {
  signal_count_14d: number;
  signal_count_30d: number;
  signal_count_90d: number;
  /** (14d_count / 14) / (90d_count / 90). >1 means warming. null if 90d = 0. */
  velocity_ratio: number | null;
  /** True when entity has ≥5 total interactions but none in the last 30 days. */
  silence_detected: boolean;
  /** Days since last_interaction. null if never interacted. */
  open_loop_age_days: number | null;
  computed_at: string;
}

export interface BehavioralGraphResult {
  entities_evaluated: number;
  entities_updated: number;
  silent_entities: number;
  duration_ms: number;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * Compute and persist behavioral stats for all non-self entities for a user.
 * Safe to call nightly — two DB reads, one batch write per user.
 */
export async function computeBehavioralStats(userId: string): Promise<BehavioralGraphResult> {
  const start = Date.now();
  const supabase = createServerClient();

  const now = Date.now();
  const cutoff90iso = new Date(now - daysMs(90)).toISOString();
  const cutoff30iso = new Date(now - daysMs(30)).toISOString();
  const cutoff14iso = new Date(now - daysMs(14)).toISOString();

  // ── Step 1: Fetch all non-self entities ─────────────────────────────────
  const { data: entities, error: entityErr } = await supabase
    .from('tkg_entities')
    .select('id, name, total_interactions, last_interaction, patterns')
    .eq('user_id', userId)
    .neq('name', 'self')
    .eq('type', 'person');

  if (entityErr) throw new Error(`behavioral_graph_entity_fetch: ${entityErr.message}`);
  if (!entities || entities.length === 0) {
    return { entities_evaluated: 0, entities_updated: 0, silent_entities: 0, duration_ms: Date.now() - start };
  }

  const entityIds = entities.map((e) => e.id as string);

  // ── Step 2: Fetch signal metadata for last 90 days (no decryption needed) ─
  // We select only extracted_entities (UUID[]) and occurred_at.
  const { data: signals, error: signalErr } = await supabase
    .from('tkg_signals')
    .select('extracted_entities, occurred_at')
    .eq('user_id', userId)
    .eq('processed', true)
    .gte('occurred_at', cutoff90iso)
    .not('extracted_entities', 'is', null);

  if (signalErr) throw new Error(`behavioral_graph_signal_fetch: ${signalErr.message}`);

  // ── Step 3: Build per-entity signal occurrence maps ─────────────────────
  // Maps from entity_id → array of occurred_at ISO strings within 90d
  const entitySignalTimes = new Map<string, string[]>();
  for (const entityId of entityIds) {
    entitySignalTimes.set(entityId, []);
  }

  for (const signal of signals ?? []) {
    const extractedIds = signal.extracted_entities as string[] | null;
    if (!extractedIds || extractedIds.length === 0) continue;
    const occurredAt = signal.occurred_at as string | null;
    if (!occurredAt) continue;

    for (const eid of extractedIds) {
      if (entitySignalTimes.has(eid)) {
        entitySignalTimes.get(eid)!.push(occurredAt);
      }
    }
  }

  // ── Step 4: Compute stats and batch update entities ─────────────────────
  let entitiesUpdated = 0;
  let silentEntities = 0;
  const computedAt = new Date().toISOString();

  for (const entity of entities) {
    const eid = entity.id as string;
    const times = entitySignalTimes.get(eid) ?? [];
    const totalInteractions = (entity.total_interactions as number) ?? 0;
    const lastInteractionIso = entity.last_interaction as string | null;

    const count90 = times.length;
    const count30 = times.filter((t) => t >= cutoff30iso).length;
    const count14 = times.filter((t) => t >= cutoff14iso).length;

    // velocity_ratio: (14d daily rate) / (90d daily rate)
    const rate14 = count14 / 14;
    const rate90 = count90 / 90;
    const velocityRatio = rate90 > 0 ? Math.round((rate14 / rate90) * 100) / 100 : null;

    const silenceDetected = totalInteractions >= 5 && count30 === 0;
    if (silenceDetected) silentEntities++;

    let openLoopAgeDays: number | null = null;
    if (lastInteractionIso) {
      openLoopAgeDays = Math.round((now - new Date(lastInteractionIso).getTime()) / daysMs(1));
    }

    const bxStats: EntityBehavioralStats = {
      signal_count_14d: count14,
      signal_count_30d: count30,
      signal_count_90d: count90,
      velocity_ratio: velocityRatio,
      silence_detected: silenceDetected,
      open_loop_age_days: openLoopAgeDays,
      computed_at: computedAt,
    };

    const existingPatterns = (entity.patterns as Record<string, unknown>) ?? {};
    const updatedPatterns = { ...existingPatterns, bx_stats: bxStats };

    const { error: updateErr } = await supabase
      .from('tkg_entities')
      .update({ patterns: updatedPatterns, patterns_updated_at: computedAt })
      .eq('id', eid);

    if (updateErr) {
      // Non-fatal: log and continue
      console.warn(`[behavioral-graph] Failed to update entity ${eid} for user ${userId}: ${updateErr.message}`);
    } else {
      entitiesUpdated++;
    }
  }

  return {
    entities_evaluated: entities.length,
    entities_updated: entitiesUpdated,
    silent_entities: silentEntities,
    duration_ms: Date.now() - start,
  };
}

/**
 * Run behavioral graph for all provided users.
 * Called from nightly-ops after signal processing completes.
 */
export async function runBehavioralGraph(userIds: string[]): Promise<{
  ok: boolean;
  users: number;
  total_entities_updated: number;
  total_silent_entities: number;
  error?: string;
}> {
  let totalUpdated = 0;
  let totalSilent = 0;

  for (const userId of userIds) {
    try {
      const result = await computeBehavioralStats(userId);
      totalUpdated += result.entities_updated;
      totalSilent += result.silent_entities;
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
  };
}
