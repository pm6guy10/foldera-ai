import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const OWNER = 'e40b7cd8-4925-42f7-bc99-5022969f1d22';

async function main() {
  // Get the latest pipeline run with FULL gate funnel and raw_extras
  const { data: runs } = await sb
    .from('pipeline_runs')
    .select('*')
    .eq('user_id', OWNER)
    .order('created_at', { ascending: false })
    .limit(1);

  const run = runs?.[0];
  if (!run) { console.log('No runs found'); return; }
  
  console.log('=== LATEST PIPELINE RUN ===');
  console.log('created_at:', run.created_at);
  console.log('outcome:', run.outcome);
  console.log('winner_action_type:', run.winner_action_type);
  console.log('winner_confidence:', run.winner_confidence);
  
  const re = run.raw_extras as Record<string, unknown> | null;
  console.log('\nraw_extras keys:', re ? Object.keys(re) : 'null');
  console.log('winner_candidate_id:', re?.winner_candidate_id);
  console.log('winner_decision_reason:', re?.winner_decision_reason);
  
  // Show full raw_extras
  console.log('\n=== FULL raw_extras ===');
  console.log(JSON.stringify(re, null, 2));
}

main().catch(console.error);
