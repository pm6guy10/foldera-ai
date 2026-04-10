import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const OWNER = process.env.INGEST_USER_ID!;

async function main() {
  // Get actual columns for key tables
  for (const table of ['tkg_actions', 'tkg_commitments', 'tkg_entities', 'tkg_signals', 'tkg_goals']) {
    const { data, error } = await sb.from(table).select('*').limit(1);
    if (error) {
      console.log(`\n${table} ERROR:`, error.message);
    } else if (data && data.length > 0) {
      console.log(`\n${table} COLUMNS:`, Object.keys(data[0]));
      console.log(`${table} SAMPLE:`, JSON.stringify(data[0]).slice(0, 300));
    } else {
      console.log(`\n${table}: empty table (no error)`);
    }
  }

  // Get signals with basic fields
  const { data: sigs } = await sb.from('tkg_signals')
    .select('id,source,occurred_at,processed')
    .eq('user_id', OWNER)
    .order('occurred_at', { ascending: false })
    .limit(5);
  console.log('\nRECENT SIGNALS:', sigs);

  // Check pipeline_runs table
  const { data: runs, error: runsErr } = await sb.from('pipeline_runs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(3);
  console.log('\npipeline_runs error:', runsErr?.message);
  console.log('pipeline_runs:', runs);
}

main().catch(console.error);
