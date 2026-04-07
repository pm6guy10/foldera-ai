import type { SupabaseClient } from '@/lib/db/client';

/** Minimum time between full per-user generation cycles (signal processing + downstream). */
export const BRIEF_FULL_CYCLE_COOLDOWN_MS = 20 * 60 * 60 * 1000;

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
    throw error;
  }
}
