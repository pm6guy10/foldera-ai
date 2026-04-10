import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: run } = await supabase
    .from('pipeline_runs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  const gf = (run?.gate_funnel ?? {}) as Record<string, unknown>;
  const extras = (run?.raw_extras ?? {}) as Record<string, unknown>;

  console.log('=== LATEST PIPELINE RUN ===');
  console.log('Run created:', run?.created_at);
  console.log('winner_candidate_id:', extras.winner_candidate_id);
  console.log('winner_action_type:', run?.winner_action_type);
  console.log('winner_confidence:', run?.winner_confidence);
  console.log('winner_decision_reason:', extras.winner_decision_reason);
  console.log('\nKeys in raw_extras:', Object.keys(extras).join(', '));
  console.log('Keys in gate_funnel:', Object.keys(gf).join(', '));

  if (gf.discrepancies) {
    console.log('\n=== DISCREPANCIES ===');
    console.log(JSON.stringify(gf.discrepancies, null, 2));
  }

  if (extras.top_candidates) {
    console.log('\n=== TOP CANDIDATES ===');
    console.log(JSON.stringify(extras.top_candidates, null, 2));
  }

  if (extras.survivors) {
    console.log('\n=== SURVIVORS ===');
    console.log(JSON.stringify(extras.survivors, null, 2));
  }

  // Show filter stages
  if (gf.filter_stages) {
    console.log('\n=== FILTER STAGES ===');
    console.log(JSON.stringify(gf.filter_stages, null, 2));
  }

  // Check for decay candidates in the discrepancy list
  const discrepancies = (gf.discrepancies ?? []) as Array<{id: string; class: string; entityName?: string; score: number; stakes: number}>;
  const decayCandidates = discrepancies.filter(d => d.class === 'decay' || d.class === 'risk');
  console.log('\n=== DECAY/RISK CANDIDATES ===');
  console.log(JSON.stringify(decayCandidates, null, 2));
}

main().catch(console.error);
