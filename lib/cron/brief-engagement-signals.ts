/**
 * Records when a daily brief was not opened 24h+ after send (engagement signal for the scorer).
 */

import { createHash } from 'crypto';
import { createServerClient } from '@/lib/db/client';
import { encrypt } from '@/lib/encryption';

function hash(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

const MS_DAY = 24 * 60 * 60 * 1000;

export async function recordUnopenedDailyBriefSignals(): Promise<{ checked: number; inserted: number }> {
  const supabase = createServerClient();
  const now = Date.now();
  const windowStart = new Date(now - 14 * MS_DAY).toISOString();

  const { data: rows, error } = await supabase
    .from('tkg_actions')
    .select('id, user_id, execution_result')
    .gte('generated_at', windowStart)
    .order('generated_at', { ascending: false })
    .limit(500);

  if (error || !rows?.length) {
    return { checked: 0, inserted: 0 };
  }

  let inserted = 0;
  let checked = 0;

  for (const row of rows) {
    const er = row.execution_result as Record<string, unknown> | null;
    if (!er) continue;
    const sentAtRaw = er['daily_brief_sent_at'];
    if (typeof sentAtRaw !== 'string') continue;
    const sentMs = new Date(sentAtRaw).getTime();
    if (!Number.isFinite(sentMs)) continue;

    const age = now - sentMs;
    if (age < MS_DAY) continue;
    if (age > 14 * MS_DAY) continue;

    checked++;

    const userId = row.user_id as string;
    const actionId = row.id as string;

    const { data: openRow } = await supabase
      .from('tkg_signals')
      .select('id')
      .eq('user_id', userId)
      .eq('type', 'daily_brief_opened')
      .gte('occurred_at', sentAtRaw)
      .limit(1)
      .maybeSingle();

    if (openRow) continue;

    const dateStr = new Date(sentMs).toISOString().slice(0, 10);
    const content = `User did not open daily brief for ${dateStr} (sent ${new Date(sentMs).toISOString()}).`;
    const contentHash = hash(`daily_brief_unopened|${userId}|${actionId}`);

    const { error: insErr } = await supabase.from('tkg_signals').insert({
      user_id: userId,
      source: 'resend_webhook',
      source_id: `unopened:${actionId}`,
      type: 'daily_brief_unopened',
      content: encrypt(content),
      content_hash: contentHash,
      author: 'foldera-system',
      occurred_at: new Date().toISOString(),
      processed: true,
    });

    if (!insErr) inserted++;
  }

  return { checked, inserted };
}
