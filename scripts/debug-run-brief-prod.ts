import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
  // Check what pipeline_runs show for the most recent run with the bp_theme_deadline winner
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Get the most recent run
  const { data: run } = await supabase
    .from('pipeline_runs')
    .select('id, created_at, outcome, gate_funnel, winner_action_type, winner_confidence, raw_extras')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  console.log('Latest run winner info:');
  console.log('  candidate_id:', (run?.raw_extras as Record<string, unknown>)?.['winner_candidate_id']);
  console.log('  decision_reason:', (run?.raw_extras as Record<string, unknown>)?.['winner_decision_reason']);
  console.log('  action_type:', run?.winner_action_type);
  console.log('  confidence:', run?.winner_confidence);
  console.log('  outcome:', run?.outcome);

  // Check what specific candidates were in the gate_funnel candidate_pool 
  const gf = run?.gate_funnel as Record<string, unknown>;
  console.log('\ncandidate_pool:', JSON.stringify(gf?.['candidate_pool'], null, 2));
  console.log('survivors_count:', gf?.['survivors_count']);

  // Also check the last tkg_actions to understand what the generator actually produces
  const { data: actions } = await supabase
    .from('tkg_actions')
    .select('id, action_type, confidence, status, candidate_reason, artifact_type, generated_at')
    .eq('user_id', 'e40b7cd8-4925-42f7-bc99-5022969f1d22')
    .order('generated_at', { ascending: false })
    .limit(5);

  console.log('\nRecent tkg_actions (may be null in dry run):');
  if (actions && actions.length > 0) {
    for (const a of actions) {
      console.log(' ', JSON.stringify(a));
    }
  } else {
    console.log('  (none - expected in dry-run mode)');
  }
}

main().catch(console.error);
