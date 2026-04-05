/**
 * DB-backed attention salience: resolve entities from actions, reinforce, decay, small bumps.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  applyAttentionDecay,
  type AttentionReinforceOutcome,
  clampSalience,
  defaultAttention,
  ENTITY_ATTENTION_VERSION,
  isUuid,
  mergeAttentionIntoPatterns,
  parseAttentionFromPatterns,
  reinforceAttentionState,
} from '@/lib/signals/entity-attention';
import { createServerClient } from '@/lib/db/client';

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

export function extractEmailsFromText(text: string | null | undefined): string[] {
  if (!text || typeof text !== 'string') return [];
  const found = text.match(EMAIL_RE) ?? [];
  const out = new Set<string>();
  for (const raw of found) {
    const e = raw.toLowerCase();
    if (e && !e.endsWith('@foldera.ai')) out.add(e);
  }
  return [...out];
}

function getSelectedCandidate(exec: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!exec) return null;
  const genLog = exec.generation_log as Record<string, unknown> | undefined;
  const discovery = genLog?.candidateDiscovery as Record<string, unknown> | undefined;
  const topCandidates = discovery?.topCandidates as Array<Record<string, unknown>> | undefined;
  if (!topCandidates?.length) return null;
  return topCandidates.find((c) => c.decision === 'selected') ?? topCandidates[0] ?? null;
}

async function tryEntityIdByUuid(
  supabase: SupabaseClient,
  userId: string,
  id: string,
): Promise<string | null> {
  if (!isUuid(id)) return null;
  const { data } = await supabase
    .from('tkg_entities')
    .select('id')
    .eq('user_id', userId)
    .eq('id', id)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

async function findSingleEntityIdByEmail(
  supabase: SupabaseClient,
  userId: string,
  emailLower: string,
): Promise<string | null> {
  const { data: byPrimary } = await supabase
    .from('tkg_entities')
    .select('id')
    .eq('user_id', userId)
    .ilike('primary_email', emailLower)
    .limit(2);
  if (byPrimary?.length === 1) return byPrimary[0].id as string;

  const { data: byArr } = await supabase
    .from('tkg_entities')
    .select('id')
    .eq('user_id', userId)
    .contains('emails', [emailLower])
    .limit(2);
  if (byArr?.length === 1) return byArr[0].id as string;

  return null;
}

/**
 * Resolve entity UUIDs tied to a directive action (email-first, then selected candidate id).
 */
export async function resolveEntityIdsForAttention(
  supabase: SupabaseClient,
  userId: string,
  action: Record<string, unknown>,
): Promise<string[]> {
  const exec = (action.execution_result as Record<string, unknown> | null) ?? null;
  const ids = new Set<string>();

  const artifact = exec?.artifact as Record<string, unknown> | undefined;
  const to =
    (artifact?.to as string | undefined) ??
    (artifact?.recipient as string | undefined) ??
    (exec?.to as string | undefined);
  for (const e of extractEmailsFromText(to)) {
    const id = await findSingleEntityIdByEmail(supabase, userId, e);
    if (id) ids.add(id);
  }

  const selected = getSelectedCandidate(exec);
  if (selected && typeof selected.id === 'string') {
    const id = await tryEntityIdByUuid(supabase, userId, selected.id);
    if (id) ids.add(id);
    const sourceSignals = selected.sourceSignals as Array<Record<string, unknown>> | undefined;
    for (const s of sourceSignals ?? []) {
      const sum = typeof s.summary === 'string' ? s.summary : '';
      for (const e of extractEmailsFromText(sum)) {
        const found = await findSingleEntityIdByEmail(supabase, userId, e);
        if (found) ids.add(found);
      }
    }
  }

  const directive = typeof action.directive_text === 'string' ? action.directive_text : '';
  const reason = typeof action.reason === 'string' ? action.reason : '';
  for (const e of extractEmailsFromText(`${directive}\n${reason}`)) {
    const found = await findSingleEntityIdByEmail(supabase, userId, e);
    if (found) ids.add(found);
  }

  return [...ids];
}

export async function reinforceAttentionForAction(
  supabase: SupabaseClient,
  userId: string,
  actionId: string,
  action: Record<string, unknown>,
  outcome: AttentionReinforceOutcome,
): Promise<void> {
  let entityIds: string[] = [];
  try {
    entityIds = await resolveEntityIdsForAttention(supabase, userId, action);
  } catch (err: unknown) {
    console.warn(
      '[entity-attention] resolveEntityIdsForAttention failed:',
      err instanceof Error ? err.message : String(err),
    );
    return;
  }
  if (entityIds.length === 0) return;

  const nowIso = new Date().toISOString();

  const { data: rows, error: fetchErr } = await supabase
    .from('tkg_entities')
    .select('id, patterns')
    .eq('user_id', userId)
    .in('id', entityIds);

  if (fetchErr) {
    console.warn('[entity-attention] entity fetch failed:', fetchErr.message);
    return;
  }

  for (const row of rows ?? []) {
    const eid = row.id as string;
    const patterns = (row.patterns as Record<string, unknown> | null) ?? {};
    const prev = parseAttentionFromPatterns(patterns);
    const nextAttention = reinforceAttentionState(prev, outcome, actionId, nowIso);
    const merged = mergeAttentionIntoPatterns(patterns, nextAttention);

    const { error: upErr } = await supabase
      .from('tkg_entities')
      .update({ patterns: merged, patterns_updated_at: nowIso })
      .eq('id', eid)
      .eq('user_id', userId);

    if (upErr) {
      console.warn(`[entity-attention] update failed for entity ${eid}:`, upErr.message);
    }
  }
}

/**
 * Nightly decay: all person entities (non-self) with existing attention blob.
 */
export async function decayAttentionForUser(userId: string): Promise<{
  entities_evaluated: number;
  entities_updated: number;
}> {
  const supabase = createServerClient();
  const nowIso = new Date().toISOString();

  const { data: entities, error } = await supabase
    .from('tkg_entities')
    .select('id, patterns')
    .eq('user_id', userId)
    .neq('name', 'self')
    .eq('type', 'person');

  if (error) throw new Error(`attention_decay_entity_fetch: ${error.message}`);
  if (!entities?.length) return { entities_evaluated: 0, entities_updated: 0 };

  let updated = 0;
  for (const entity of entities) {
    const patterns = (entity.patterns as Record<string, unknown> | null) ?? {};
    const prev = parseAttentionFromPatterns(patterns);
    if (!prev) continue;

    const next = applyAttentionDecay(prev, nowIso);
    const merged = mergeAttentionIntoPatterns(patterns, next);
    const { error: upErr } = await supabase
      .from('tkg_entities')
      .update({ patterns: merged, patterns_updated_at: nowIso })
      .eq('id', entity.id as string);

    if (!upErr) updated++;
    else console.warn(`[entity-attention] decay update failed ${entity.id}:`, upErr.message);
  }

  return { entities_evaluated: entities.length, entities_updated: updated };
}

export async function runAttentionDecay(userIds: string[]): Promise<{
  ok: boolean;
  users: number;
  total_entities_updated: number;
  error?: string;
}> {
  let total = 0;
  for (const userId of userIds) {
    try {
      const r = await decayAttentionForUser(userId);
      total += r.entities_updated;
    } catch (err: unknown) {
      console.warn(
        `[entity-attention] decay failed for ${userId}:`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }
  return { ok: true, users: userIds.length, total_entities_updated: total };
}

/**
 * Small capped bump (e.g. fast reply pattern, brief open).
 * Delta stacks until salience hits maxSalience; trust_class caps still apply at score time.
 */
export async function bumpAttentionSalienceForEmails(
  supabase: SupabaseClient,
  userId: string,
  emails: string[],
  delta: number,
  maxSalience = 0.72,
): Promise<void> {
  const nowIso = new Date().toISOString();
  const uniq = [...new Set(emails.map((e) => e.toLowerCase()).filter(Boolean))];
  if (uniq.length === 0) return;

  for (const emailLower of uniq) {
    const entityId = await findSingleEntityIdByEmail(supabase, userId, emailLower);
    if (!entityId) continue;

    const { data: row, error: fetchErr } = await supabase
      .from('tkg_entities')
      .select('id, patterns')
      .eq('user_id', userId)
      .eq('id', entityId)
      .maybeSingle();

    if (fetchErr || !row) continue;

    const patterns = (row.patterns as Record<string, unknown> | null) ?? {};
    const prev = parseAttentionFromPatterns(patterns) ?? defaultAttention(nowIso);
    const salience = clampSalience(Math.min(prev.salience + delta, maxSalience));
    if (salience <= prev.salience) continue;

    const nextAttention = {
      ...prev,
      version: ENTITY_ATTENTION_VERSION,
      salience,
      last_reinforced_at: nowIso,
    };
    const merged = mergeAttentionIntoPatterns(patterns, nextAttention);

    await supabase
      .from('tkg_entities')
      .update({ patterns: merged, patterns_updated_at: nowIso })
      .eq('id', entityId)
      .eq('user_id', userId);
  }
}

/** Capped salience bump by entity id (e.g. daily brief open → resolved directive entities). */
export async function bumpAttentionSalienceForEntityIds(
  supabase: SupabaseClient,
  userId: string,
  entityIds: string[],
  delta: number,
  maxSalience = 0.72,
): Promise<void> {
  const nowIso = new Date().toISOString();
  for (const entityId of [...new Set(entityIds)]) {
    const { data: row, error: fetchErr } = await supabase
      .from('tkg_entities')
      .select('id, patterns')
      .eq('user_id', userId)
      .eq('id', entityId)
      .maybeSingle();

    if (fetchErr || !row) continue;

    const patterns = (row.patterns as Record<string, unknown> | null) ?? {};
    const prev = parseAttentionFromPatterns(patterns) ?? defaultAttention(nowIso);
    const salience = clampSalience(Math.min(prev.salience + delta, maxSalience));
    if (salience <= prev.salience) continue;

    const nextAttention = {
      ...prev,
      version: ENTITY_ATTENTION_VERSION,
      salience,
      last_reinforced_at: nowIso,
    };
    const merged = mergeAttentionIntoPatterns(patterns, nextAttention);

    await supabase
      .from('tkg_entities')
      .update({ patterns: merged, patterns_updated_at: nowIso })
      .eq('id', entityId)
      .eq('user_id', userId);
  }
}
