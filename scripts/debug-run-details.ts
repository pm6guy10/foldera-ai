import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Get both recent runs
  const { data: runs } = await supabase
    .from('pipeline_runs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(4);

  for (const run of runs ?? []) {
    const re = run.raw_extras as Record<string, unknown>;
    console.log(`\n=== Run ${run.created_at} ===`);
    console.log(`  phase: ${run.phase}`);
    console.log(`  source: ${run.invocation_source}`);
    console.log(`  outcome: ${run.outcome}`);
    console.log(`  winner_candidate_id: ${re?.winner_candidate_id}`);
    console.log(`  winner_action_type: ${run.winner_action_type}`);
    console.log(`  winner_confidence: ${run.winner_confidence}`);
    console.log(`  pipeline_dry_run: ${re?.pipeline_dry_run}`);
    console.log(`  decision_reason: ${re?.winner_decision_reason}`);
    console.log(`  blocked_gate: ${run.blocked_gate}`);
  }
}

main().catch(console.error);
