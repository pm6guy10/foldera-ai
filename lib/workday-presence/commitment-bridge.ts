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
// A commitment overdue beyond this is not "nearing lapse" — it lapsed long ago.
// Surfacing year-old obligations (e.g. a 2025 court filing in mid-2026) as fresh
// lapses is exactly the stale-date noise the guardian must not produce. Bound the
// lookback so only genuinely near-term or recently-lapsed items qualify.
const LAPSING_STALE_FLOOR_DAYS = 30;

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
 * Human-readable commitment title for the guardian card. `canonical_form` is a
 * dedup KEY (`SYNC:<category>:<slug>`, see signal-processor.ts) — never a display
 * title. Prefer the real extracted `description`; only if it is missing fall back
 * to the canonical key with its machine prefix stripped and underscores restored,
 * so the card never shows raw `SYNC:payment_financial:...` to the user.
 */
export function humanCommitmentTitle(
  description: string | null | undefined,
  canonicalForm: string | null | undefined,
): string | null {
  const desc = description?.trim();
  if (desc) return desc;
  const canon = canonicalForm?.trim();
  if (!canon) return null;
  const cleaned = canon
    .replace(/^sync:[^:]*:/i, '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length > 0 ? cleaned : null;
}

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
  const nowMs = Date.parse(nowIso);
  const windowEnd = new Date(nowMs + LAPSING_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
  const staleFloor = new Date(nowMs - LAPSING_STALE_FLOOR_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // Bound BOTH ends of the window: due within [now - 30d, now + 24h]. Anything
  // older than the floor lapsed long ago and is excluded. Order soonest-first
  // (descending) so the item actually nearing lapse wins, not the most ancient.
  const { data, error } = await supabase
    .from('tkg_commitments')
    .select('id, description, canonical_form, due_at, implied_due_at')
    .eq('user_id', userId)
    .eq('status', 'active')
    .is('suppressed_at', null)
    .or(
      `and(due_at.gte.${staleFloor},due_at.lte.${windowEnd}),` +
        `and(implied_due_at.gte.${staleFloor},implied_due_at.lte.${windowEnd})`,
    )
    .order('due_at', { ascending: false, nullsFirst: false })
    .limit(1);

  if (error) throw error;
  const row = (data ?? [])[0] as LapsingCommitmentRow | undefined;
  if (!row) return null;

  const dueAtIso = row.due_at ?? row.implied_due_at;
  if (!dueAtIso) return null;

  const title = humanCommitmentTitle(row.description, row.canonical_form);
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
