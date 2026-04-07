/**
 * CI: fail if no daily_brief cron_complete row in the last 3 hours (UTC).
 * Schedule after 11:10 UTC daily-brief. Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const WINDOW_MS = 3 * 60 * 60 * 1000;

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const supabase = createClient(url, key);

  const { count, error } = await supabase
    .from('pipeline_runs')
    .select('id', { count: 'exact', head: true })
    .eq('phase', 'cron_complete')
    .eq('invocation_source', 'daily_brief')
    .gte('created_at', since);

  if (error) {
    console.error('heartbeat query failed:', error.message);
    process.exit(1);
  }

  if (!count || count < 1) {
    console.error(
      `PIPELINE HEARTBEAT FAIL: no daily_brief cron_complete in last ${WINDOW_MS / 3600000}h (since ${since})`,
    );
    process.exit(1);
  }

  console.log(`OK: daily_brief cron_complete count=${count} in window`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
