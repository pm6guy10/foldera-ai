/**
 * Skip a specific pending_approval row so runDailyGenerate can proceed (dev / proof only).
 * Usage: npx tsx scripts/skip-pending-for-dev-generate.ts <action_id>
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const id = process.argv[2]?.trim();
if (!id) {
  console.error('Usage: npx tsx scripts/skip-pending-for-dev-generate.ts <action_id>');
  process.exit(1);
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const sb = createClient(url, key);

  const { data: row, error: selErr } = await sb
    .from('tkg_actions')
    .select('id, user_id, status, action_type, execution_result')
    .eq('id', id)
    .maybeSingle();

  if (selErr || !row) {
    console.error(selErr?.message ?? 'row not found');
    process.exit(1);
  }

  const er =
    row.execution_result && typeof row.execution_result === 'object'
      ? { ...(row.execution_result as Record<string, unknown>) }
      : {};
  const reason =
    'Dev skip: unblock fresh paid generation (scripts/skip-pending-for-dev-generate.ts)';

  const { error: upErr } = await sb
    .from('tkg_actions')
    .update({
      status: 'skipped',
      skip_reason: reason,
      execution_result: {
        ...er,
        auto_suppressed_at: new Date().toISOString(),
        auto_suppression_reason: reason,
      },
    })
    .eq('id', id);

  if (upErr) {
    console.error(upErr.message);
    process.exit(1);
  }
  console.log('skipped', id, 'for user', row.user_id);
}

main().catch(console.error);
