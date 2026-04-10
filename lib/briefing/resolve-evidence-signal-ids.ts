import type { SupabaseClient } from '@/lib/db/client';
import type { ScoredLoop } from './scorer';

/**
 * Map winner.sourceSignals to `tkg_signals.id` values for evidence loading.
 * - `kind === 'signal'` → id is already a signal row id.
 * - `kind === 'commitment'` → id is `tkg_commitments.id`; use `source_id` (originating signal).
 * Other kinds (e.g. relationship uses entity id; emergent often has no id) are skipped.
 * For `winner.type === 'commitment'`, `winner.id` is the commitment PK; its `source_id` is listed first.
 */
export async function resolveEvidenceSignalIdsForWinner(
  supabase: SupabaseClient,
  userId: string,
  winner: ScoredLoop,
): Promise<string[]> {
  const signalIds = new Set<string>();
  const commitmentIds = new Set<string>();

  for (const s of winner.sourceSignals ?? []) {
    if (!s.id) continue;
    if (s.kind === 'signal') {
      signalIds.add(s.id);
    } else if (s.kind === 'commitment') {
      commitmentIds.add(s.id);
    }
  }

  if (winner.type === 'commitment' && typeof winner.id === 'string') {
    commitmentIds.add(winner.id);
  }

  let primarySignalId: string | null = null;

  if (commitmentIds.size > 0) {
    const { data: rows } = await supabase
      .from('tkg_commitments')
      .select('id, source_id')
      .eq('user_id', userId)
      .in('id', [...commitmentIds]);

    for (const row of rows ?? []) {
      const sid = typeof row.source_id === 'string' ? row.source_id.trim() : '';
      if (!sid) continue;
      signalIds.add(sid);
      if (winner.type === 'commitment' && row.id === winner.id) {
        primarySignalId = sid;
      }
    }
  }

  if (primarySignalId) {
    const rest = [...signalIds].filter((id) => id !== primarySignalId);
    return [primarySignalId, ...rest];
  }
  return [...signalIds];
}
