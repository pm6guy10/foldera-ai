import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const OWNER = 'e40b7cd8-4925-42f7-bc99-5022969f1d22';

async function main() {
  // Get last 3 pipeline runs 
  const { data: runs } = await sb.from('pipeline_runs')
    .select('id,created_at,outcome,winner_action_type,winner_confidence,raw_extras,gate_funnel')
    .eq('user_id', OWNER)
    .order('created_at', { ascending: false })
    .limit(3);
  
  console.log('=== LATEST 3 PIPELINE RUNS ===');
  for (const r of runs ?? []) {
    const re = r.raw_extras as Record<string, unknown> | null;
    const gf = r.gate_funnel as Record<string, unknown> | null;
    const fsStage = (gf?.filter_stages as Array<{stage:string,before:number,after:number,dropped_count:number}> | undefined)
      ?.find(s => s.stage === 'failure_suppression');
    const huntDropped = (gf?.filter_stages as Array<{stage:string,before:number,after:number,dropped_count:number}> | undefined);
    const winnerId = re?.winner_candidate_id as string | undefined;
    const isNoreplyWinner = winnerId?.includes('08b906c3') || winnerId?.includes('5b851583');
    console.log(`\n--- ${r.created_at?.slice(0,19)} ---`);
    console.log('outcome:', r.outcome);
    console.log('winner_candidate_id:', winnerId);
    console.log('is_noreply_winner:', isNoreplyWinner);
    console.log('winner_action_type:', r.winner_action_type);
    console.log('winner_confidence:', r.winner_confidence);
    console.log('winner_decision_reason:', re?.winner_decision_reason);
    console.log('failure_suppression_dropped:', fsStage?.dropped_count ?? 0);
  }
}

main().catch(console.error);
