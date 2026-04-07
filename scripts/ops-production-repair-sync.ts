/**
 * Production E2E repair (operator machine with .env.local):
 * 1) Rewind user_tokens.last_synced_at for gap backfill
 * 2) syncGoogle + syncMicrosoft for REPAIR_USER_ID (default owner)
 * 3) Falsifiable proof: max(occurred_at) mail signals gmail|outlook
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, .env.local
 *      GOOGLE_*, AZURE_*, ENCRYPTION_KEY (sync paths)
 *
 * Usage: npx tsx scripts/ops-production-repair-sync.ts
 */
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const OWNER = process.env.REPAIR_USER_ID || 'e40b7cd8-4925-42f7-bc99-5022969f1d22';
/** End of 2026-03-27 UTC — Gmail list uses after:yyyy/mm/dd from this instant */
const REWIND_ISO = process.env.REPAIR_REWIND_ISO || '2026-03-27T23:59:59.999Z';

async function main() {
  const { createClient } = await import('@supabase/supabase-js');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  const supabase = createClient(url, key);
  const stamp = new Date().toISOString();
  console.log('[repair] start', stamp, 'user', OWNER, 'rewind', REWIND_ISO);

  const rewindMs = new Date(REWIND_ISO).getTime();
  if (Number.isFinite(rewindMs)) {
    console.log('[repair] STEP 0 — Gmail A/B: same q as sync vs previous UTC day (console + debug ingest)');
    const { repairCompareGmailAfterClauses } = await import('../lib/sync/google-sync');
    try {
      const ab = await repairCompareGmailAfterClauses(OWNER, rewindMs);
      console.log('[repair] STEP 0 result', JSON.stringify(ab));
    } catch (e) {
      console.warn('[repair] STEP 0 skipped:', e instanceof Error ? e.message : e);
    }
  }

  console.log('[repair] STEP 1 — UPDATE user_tokens last_synced_at');
  const { data: rewound, error: e1 } = await supabase
    .from('user_tokens')
    .update({
      last_synced_at: REWIND_ISO,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', OWNER)
    .in('provider', ['google', 'microsoft'])
    .is('disconnected_at', null)
    .select('provider, last_synced_at, email');

  if (e1) {
    console.error('[repair] UPDATE failed:', e1.message, e1);
    process.exit(1);
  }
  console.log('[repair] rewound rows:', JSON.stringify(rewound, null, 2));

  const { syncGoogle } = await import('../lib/sync/google-sync');
  const { syncMicrosoft } = await import('../lib/sync/microsoft-sync');

  console.log('[repair] STEP 2 — syncGoogle()');
  let g: Awaited<ReturnType<typeof syncGoogle>>;
  try {
    g = await syncGoogle(OWNER);
    console.log('[repair] syncGoogle result:', JSON.stringify(g));
  } catch (err) {
    console.error('[repair] syncGoogle threw:', err instanceof Error ? err.message : err);
    process.exit(1);
  }

  console.log('[repair] STEP 3 — syncMicrosoft()');
  let m: Awaited<ReturnType<typeof syncMicrosoft>>;
  try {
    m = await syncMicrosoft(OWNER);
    console.log('[repair] syncMicrosoft result:', JSON.stringify(m));
  } catch (err) {
    console.error('[repair] syncMicrosoft threw:', err instanceof Error ? err.message : err);
    process.exit(1);
  }

  console.log('[repair] STEP 4 — PROOF QUERY max(occurred_at) per source (mail-shaped)');
  for (const src of ['gmail', 'outlook'] as const) {
    const { data: row, error: e2 } = await supabase
      .from('tkg_signals')
      .select('occurred_at, created_at, type, source')
      .eq('user_id', OWNER)
      .eq('source', src)
      .in('type', ['email_received', 'email_sent'])
      .order('occurred_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (e2) {
      console.error('[repair] proof query error', src, e2.message);
    } else {
      console.log('[repair] PROOF', src, row ? JSON.stringify(row) : 'no rows');
    }
  }

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: n24, error: e3 } = await supabase
    .from('tkg_signals')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', OWNER)
    .in('source', ['gmail', 'outlook'])
    .in('type', ['email_received', 'email_sent'])
    .gte('created_at', dayAgo);
  console.log('[repair] PROOF count mail-shaped created_at >= 24h:', e3?.message ?? n24 ?? 0);

  console.log('[repair] done', new Date().toISOString());
  console.log(
    '[repair] PASS if max gmail occurred_at >= 2026-03-28T00:00:00Z (or outlook same) after real inbox activity; FAIL if still max 2026-03-26/27 only and zero new created_at.',
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
