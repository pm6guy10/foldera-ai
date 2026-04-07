/**
 * Self-heal mail ingest cursor: when incremental sync advances `last_synced_at` but inserts
 * no mail rows and the DB graph's newest mail signal is far behind the cursor, rewind the
 * cursor to `max(occurred_at)` so the next run widens the window (dedupe via content_hash).
 */

import type { SupabaseClient } from '@/lib/db/client';
import { MAIL_CURSOR_HEAL_GAP_MS } from '@/lib/config/constants';

export type MailCursorHealResult = {
  rewound: boolean;
  oldCursor: string | null;
  newCursor: string | null;
  gapHours: number | null;
};

type HealArgs = {
  provider: 'google' | 'microsoft';
  mailSource: 'gmail' | 'outlook';
  logTag: string;
  mailSignalsInserted: number;
  isFirstSync: boolean;
};

export async function healMailCursorAfterIncrementalEmpty(
  supabase: SupabaseClient,
  userId: string,
  args: HealArgs,
): Promise<MailCursorHealResult> {
  const none = (): MailCursorHealResult => ({
    rewound: false,
    oldCursor: null,
    newCursor: null,
    gapHours: null,
  });

  if (args.isFirstSync || args.mailSignalsInserted > 0) {
    return none();
  }

  const { data: newestRow, error: newestErr } = await supabase
    .from('tkg_signals')
    .select('occurred_at')
    .eq('user_id', userId)
    .eq('source', args.mailSource)
    .order('occurred_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (newestErr) {
    console.warn(
      `${args.logTag} CURSOR_HEAL_SKIP userId=${userId} reason=max_occurred_query error=${newestErr.message}`,
    );
    return none();
  }

  const maxOccurred = newestRow?.occurred_at as string | undefined;
  if (!maxOccurred) {
    return none();
  }

  const { data: tokenRow, error: tokenErr } = await supabase
    .from('user_tokens')
    .select('last_synced_at')
    .eq('user_id', userId)
    .eq('provider', args.provider)
    .maybeSingle();

  if (tokenErr || !tokenRow?.last_synced_at) {
    console.warn(
      `${args.logTag} CURSOR_HEAL_SKIP userId=${userId} reason=token_row error=${tokenErr?.message ?? 'no_last_synced'}`,
    );
    return none();
  }

  const oldCursor = tokenRow.last_synced_at as string;
  const cursorMs = new Date(oldCursor).getTime();
  const maxMs = new Date(maxOccurred).getTime();
  if (!Number.isFinite(cursorMs) || !Number.isFinite(maxMs)) {
    return none();
  }

  const gapMs = cursorMs - maxMs;
  if (gapMs <= MAIL_CURSOR_HEAL_GAP_MS) {
    return none();
  }

  const gapHours = gapMs / 3600000;
  const { error: updErr } = await supabase
    .from('user_tokens')
    .update({ last_synced_at: maxOccurred, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('provider', args.provider);

  if (updErr) {
    console.warn(
      `${args.logTag} CURSOR_HEAL_SKIP userId=${userId} reason=update_failed error=${updErr.message}`,
    );
    return none();
  }

  console.log(
    `${args.logTag} CURSOR_REWOUND userId=${userId} old=${oldCursor} new=${maxOccurred} gap_hours=${gapHours.toFixed(2)} provider=${args.provider} source=${args.mailSource}`,
  );

  return {
    rewound: true,
    oldCursor,
    newCursor: maxOccurred,
    gapHours,
  };
}
