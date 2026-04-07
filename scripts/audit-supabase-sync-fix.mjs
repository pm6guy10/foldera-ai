/**
 * Read-only audit: user_tokens sync cursors + tkg_signals mail freshness for owner.
 * Usage: node scripts/audit-supabase-sync-fix.mjs
 * Requires: .env.local with NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local' });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const userId = process.env.AUDIT_USER_ID || 'e40b7cd8-4925-42f7-bc99-5022969f1d22';

if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(url, key);

async function newestMailSignal() {
  const { data, error } = await supabase
    .from('tkg_signals')
    .select('id, source, type, occurred_at, created_at, processed')
    .eq('user_id', userId)
    .in('source', ['gmail', 'outlook'])
    .in('type', ['email_received', 'email_sent'])
    .order('occurred_at', { ascending: false })
    .limit(5);

  if (error) throw error;
  return data ?? [];
}

async function countSince(isoDate, field) {
  const { count, error } = await supabase
    .from('tkg_signals')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .in('source', ['gmail', 'outlook'])
    .in('type', ['email_received', 'email_sent'])
    .gte(field, isoDate);
  if (error) throw error;
  return count ?? 0;
}

async function main() {
  console.log('=== Supabase sync-fix audit ===');
  console.log('user_id:', userId);
  console.log('as_of_utc:', new Date().toISOString());
  console.log('');

  const { data: tokens, error: tokErr } = await supabase
    .from('user_tokens')
    .select('provider, email, last_synced_at, disconnected_at, updated_at')
    .eq('user_id', userId)
    .in('provider', ['google', 'microsoft'])
    .order('provider');

  if (tokErr) {
    console.error('user_tokens error:', tokErr.message);
  } else {
    console.log('--- user_tokens (google | microsoft) ---');
    for (const row of tokens ?? []) {
      console.log(JSON.stringify(row, null, 2));
    }
    if (!tokens?.length) console.log('(no rows)');
  }
  console.log('');

  const top = await newestMailSignal();
  console.log('--- newest 5 mail-shaped signals by occurred_at (gmail|outlook) ---');
  for (const r of top) {
    console.log(
      `${r.source} ${r.type} occurred=${r.occurred_at} created=${r.created_at} processed=${r.processed} id=${r.id}`,
    );
  }
  if (!top.length) console.log('(none)');

  console.log('');
  console.log('--- per-source newest 3 mail-shaped (occurred_at) ---');
  for (const src of ['gmail', 'outlook']) {
    const { data: rows, error: e2 } = await supabase
      .from('tkg_signals')
      .select('occurred_at, created_at, type')
      .eq('user_id', userId)
      .eq('source', src)
      .in('type', ['email_received', 'email_sent'])
      .order('occurred_at', { ascending: false })
      .limit(3);
    if (e2) console.log(src, 'error', e2.message);
    else console.log(src, JSON.stringify(rows ?? [], null, 0));
  }
  const { count: cg } = await supabase
    .from('tkg_signals')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('source', 'gmail')
    .in('type', ['email_received', 'email_sent']);
  const { count: co } = await supabase
    .from('tkg_signals')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('source', 'outlook')
    .in('type', ['email_received', 'email_sent']);
  console.log(`total mail-shaped rows: gmail=${cg ?? 0} outlook=${co ?? 0}`);

  const maxOcc = top[0]?.occurred_at ?? null;
  console.log('');
  console.log('--- counts (sanity) ---');
  const cAfterMar27Occ = await countSince('2026-03-27T00:00:00Z', 'occurred_at');
  const cAfterMar27Cre = await countSince('2026-03-27T00:00:00Z', 'created_at');
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const cLast24hCre = await countSince(dayAgo, 'created_at');
  console.log(`count occurred_at >= 2026-03-27 (gmail|outlook mail types): ${cAfterMar27Occ}`);
  console.log(`count created_at   >= 2026-03-27 (gmail|outlook mail types): ${cAfterMar27Cre}`);
  console.log(`count created_at   >= 24h ago (gmail|outlook mail types):     ${cLast24hCre}`);
  console.log('');
  console.log('max(occurred_at) combined top-5 sample:', maxOcc);
  console.log('');
  console.log('--- interpretation (heuristic) ---');
  const mar28 = new Date('2026-03-28T00:00:00Z').getTime();
  if (maxOcc) {
    const maxMs = new Date(maxOcc).getTime();
    if (maxMs >= mar28) {
      console.log('PASS-ish: newest mail occurred_at is on/after 2026-03-28 — graph has April-era (or later) mail dates.');
    } else {
      console.log('STALE: newest mail occurred_at is still before 2026-03-28 — rewind last_synced_at + Sync Now, or investigate empty incremental pulls.');
    }
  } else {
    console.log('NO MAIL SIGNALS: cannot assess graph freshness.');
  }
  if ((cLast24hCre ?? 0) === 0 && tokens?.some((t) => t.last_synced_at)) {
    console.log('NOTE: zero mail-shaped rows created in last 24h despite recent last_synced_at — likely duplicate-only upserts or API returned no new messages.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
