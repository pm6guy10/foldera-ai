import type { SupabaseClient } from '@/lib/db/client';

/** Minimum time between full per-user generation cycles (signal processing + downstream). */
export const BRIEF_FULL_CYCLE_COOLDOWN_MS = 20 * 60 * 60 * 1000;

/**
 * PostgREST returns 404 / PGRST205 when the relation is not in the schema cache
 * (migration not applied to remote Postgres). Degrade gracefully until ops runs
 * `20260407000001_user_brief_cycle_gates.sql`.
 */
export function isUserBriefCycleGatesTableMissingError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: string; message?: string };
  const msg = String(e.message ?? '');
  if (e.code === 'PGRST205') return true;
  if (msg.includes('user_brief_cycle_gates') && msg.includes('schema cache')) return true;
  const lower = msg.toLowerCase();
  if (lower.includes('could not find the table') && msg.includes('user_brief_cycle_gates')) {
    return true;
  }
  return false;
}

export async function fetchBriefCycleLastAtMap(
  supabase: SupabaseClient,
  userIds: string[],
): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>();
  for (const id of userIds) {
    map.set(id, null);
  }
  if (userIds.length === 0) {
    return map;
  }

  const { data, error } = await supabase
    .from('user_brief_cycle_gates')
    .select('user_id, last_cycle_at')
    .in('user_id', userIds);

  if (error) {
    if (isUserBriefCycleGatesTableMissingError(error)) {
      console.warn(
        JSON.stringify({
          event: 'user_brief_cycle_gates_unavailable',
          reason: 'table_missing_or_not_in_schema_cache',
          hint: 'Apply supabase/migrations/20260407000001_user_brief_cycle_gates.sql to production',
          user_id_count: userIds.length,
        }),
      );
      return map;
    }
    throw error;
  }

  for (const row of data ?? []) {
    const uid = (row as { user_id: string }).user_id;
    const at = (row as { last_cycle_at: string | null }).last_cycle_at;
    if (uid) {
      map.set(uid, at ?? null);
    }
  }
  return map;
}

export async function recordBriefCycleCheckpoint(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  const iso = new Date().toISOString();
  const { error } = await supabase.from('user_brief_cycle_gates').upsert(
    { user_id: userId, last_cycle_at: iso },
    { onConflict: 'user_id' },
  );
  if (error) {
    if (isUserBriefCycleGatesTableMissingError(error)) {
      console.warn(
        JSON.stringify({
          event: 'user_brief_cycle_gates_unavailable',
          reason: 'table_missing_or_not_in_schema_cache',
          hint: 'Apply supabase/migrations/20260407000001_user_brief_cycle_gates.sql to production',
          user_id: userId,
        }),
      );
      return;
    }
    throw error;
  }
}
