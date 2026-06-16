import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Bridges real extracted commitments (tkg_commitments, populated by
 * lib/signals/signal-processor.ts from real Gmail/Outlook/Calendar content)
 * into the trigger-runner's signal pipeline. The trigger-runner only reads
 * boolean flags off raw signal rows (commitment_lapsing, reply_needed, etc.)
 * — flags that real ingestion never sets. This synthesizes a signal-shaped
 * row from a real commitment so it flows through the existing, already-
 * tested 'calendar' / commitment_lapsing evaluation path unchanged.
 */

const LAPSING_WINDOW_HOURS = 24;

type LapsingCommitmentRow = {
  id: string;
  description: string | null;
  canonical_form: string | null;
  due_at: string | null;
  implied_due_at: string | null;
};

export type SynthesizedCommitmentSignal = {
  id: string;
  source: 'calendar';
  title: string;
  starts_at_iso: string;
  due_at_iso: string;
  commitment_lapsing: true;
};

/**
 * Finds the user's single most urgent active, non-suppressed commitment with
 * a due date within the next LAPSING_WINDOW_HOURS (or already overdue), and
 * returns it as a FreshSignalRow-shaped pseudo-signal. Returns null when
 * nothing is due soon — the runner stays quiet, same as today.
 */
export async function findLapsingCommitmentSignal(
  supabase: SupabaseClient,
  userId: string,
  nowIso: string,
): Promise<SynthesizedCommitmentSignal | null> {
  const windowEnd = new Date(Date.parse(nowIso) + LAPSING_WINDOW_HOURS * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('tkg_commitments')
    .select('id, description, canonical_form, due_at, implied_due_at')
    .eq('user_id', userId)
    .eq('status', 'active')
    .is('suppressed_at', null)
    .or(`due_at.lte.${windowEnd},implied_due_at.lte.${windowEnd}`)
    .order('due_at', { ascending: true, nullsFirst: false })
    .limit(1);

  if (error) throw error;
  const row = (data ?? [])[0] as LapsingCommitmentRow | undefined;
  if (!row) return null;

  const dueAtIso = row.due_at ?? row.implied_due_at;
  if (!dueAtIso) return null;

  const title = row.canonical_form?.trim() || row.description?.trim();
  if (!title) return null;

  return {
    id: row.id,
    source: 'calendar',
    title,
    starts_at_iso: dueAtIso,
    due_at_iso: dueAtIso,
    commitment_lapsing: true,
  };
}
