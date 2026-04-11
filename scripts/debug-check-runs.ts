import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const OWNER = process.env.INGEST_USER_ID!;
const SINCE = '2026-04-10T14:05:00Z'; // after deploy

async function main() {
  const { data: runs } = await sb.from('pipeline_runs')
    .select('id,created_at,outcome,winner_action_type,winner_confidence,raw_extras')
    .eq('user_id', OWNER)
    .gte('created_at', SINCE)
    .order('created_at', { ascending: false })
    .limit(5);
  
  console.log('Runs since deploy:', runs?.length ?? 0);
  for (const r of runs ?? []) {
    console.log({
      created_at: r.created_at,
      outcome: r.outcome,
      winner_action_type: r.winner_action_type,
      winner_confidence: r.winner_confidence,
      winner_candidate_id: r.raw_extras?.winner_candidate_id,
      winner_decision_reason: r.raw_extras?.winner_decision_reason,
    });
  }
  
  // Also look at last 3 to understand trend
  const { data: last3 } = await sb.from('pipeline_runs')
    .select('id,created_at,outcome,winner_action_type,winner_confidence,raw_extras')
    .eq('user_id', OWNER)
    .order('created_at', { ascending: false })
    .limit(3);
  
  console.log('\nLast 3 runs overall:');
  for (const r of last3 ?? []) {
    console.log({
      created_at: r.created_at,
      outcome: r.outcome,
      winner_candidate_id: r.raw_extras?.winner_candidate_id,
      winner_confidence: r.winner_confidence,
    });
  }
}

main().catch(console.error);
