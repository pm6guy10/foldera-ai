import type { SupabaseClient } from '@/lib/db/client';

/**
 * Card-precision meter — the one number the $100M thesis hinges on:
 * "of cards fired, how many did the user act on?" (acted / fired).
 *
 * It joins the two halves of the loop that used to be unlinked:
 *  - the FIRED card: a `workday_presence_slack_send` row whose
 *    `execution_result.slack_ts` is the delivered Slack message ts.
 *  - the RESPONSE: a `workday_presence` row whose
 *    `execution_result.responded_to_slack_ts` (stamped by
 *    `insertPresenceReceipt`) points back at that same ts.
 *
 * Outcomes per fired card:
 *  - acted      → response status `approved` (done / break_smaller / real send)
 *  - dismissed  → response status `draft_rejected` (snooze / not now)
 *  - ignored    → no matching response at all
 *
 * Honest scope: only cards fired AFTER the join key shipped can be matched —
 * older rows have no `responded_to_slack_ts`, so they read as ignored. The
 * meter measures forward, it does not backfill history.
 */
export type CardPrecision = {
  fired: number;
  acted: number;
  dismissed: number;
  ignored: number;
  /** acted / fired; null when no cards fired (never NaN). */
  precision: number | null;
};

type ResponseStatus = 'approved' | 'draft_rejected';

export async function computeCardPrecision(
  supabase: SupabaseClient,
  opts: { userId: string; sinceIso: string },
): Promise<CardPrecision> {
  const { userId, sinceIso } = opts;

  const [{ data: firedRows }, { data: responseRows }] = await Promise.all([
    supabase
      .from('tkg_actions')
      .select('execution_result')
      .eq('user_id', userId)
      .eq('action_source', 'workday_presence_slack_send')
      .gte('generated_at', sinceIso),
    supabase
      .from('tkg_actions')
      .select('status, execution_result')
      .eq('user_id', userId)
      .eq('action_source', 'workday_presence')
      .gte('generated_at', sinceIso),
  ]);

  // Best response per card ts. A positive close (approved) is terminal — once
  // a card is acted on, a later dismiss/snooze must not downgrade it.
  const responseByTs = new Map<string, ResponseStatus>();
  for (const r of responseRows ?? []) {
    const er = (r.execution_result ?? {}) as Record<string, unknown>;
    const ts = typeof er.responded_to_slack_ts === 'string' ? er.responded_to_slack_ts : null;
    if (!ts) continue;
    if (responseByTs.get(ts) === 'approved') continue;
    responseByTs.set(ts, r.status === 'approved' ? 'approved' : 'draft_rejected');
  }

  let fired = 0;
  let acted = 0;
  let dismissed = 0;
  const seenCards = new Set<string>();
  for (const c of firedRows ?? []) {
    const er = (c.execution_result ?? {}) as Record<string, unknown>;
    if (er.slack_ok !== true) continue; // only cards the user actually saw
    const ts = typeof er.slack_ts === 'string' ? er.slack_ts : null;
    if (!ts || seenCards.has(ts)) continue; // dedup re-delivered cards by ts
    seenCards.add(ts);
    fired++;
    const resp = responseByTs.get(ts);
    if (resp === 'approved') acted++;
    else if (resp === 'draft_rejected') dismissed++;
  }

  const ignored = fired - acted - dismissed;
  const precision = fired > 0 ? acted / fired : null;
  return { fired, acted, dismissed, ignored, precision };
}
