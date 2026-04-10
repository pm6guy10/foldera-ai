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
  console.log('candidates_after_last_filter type:', typeof gf.candidates_after_last_filter, Array.isArray(gf.candidates_after_last_filter) ? 'isArray' : 'notArray');
  console.log('candidate_pool type:', typeof gf.candidate_pool, Array.isArray(gf.candidate_pool) ? 'isArray' : 'notArray');
  console.log('keys in gate_funnel:', Object.keys(gf).join(', '));
  
  // Look at stakes_killed to understand decay candidates
  const stakesKilled = gf.stakes_killed as Array<{count: number; reason: string}> | undefined;
  if (stakesKilled) {
    console.log('\nstakes_killed:', JSON.stringify(stakesKilled, null, 2));
  }
  
  // Check for entities with decay patterns in DB
  const { data: entities } = await supabase
    .from('tkg_entities')
    .select('id, name, primary_email, last_interaction, total_interactions, patterns')
    .eq('user_id', 'e40b7cd8-4925-42f7-bc99-5022969f1d22')
    .order('total_interactions', { ascending: false })
    .limit(10);

  console.log('\n=== TOP ENTITIES BY INTERACTION COUNT ===');
  for (const e of entities ?? []) {
    const bxStats = ((e.patterns as Record<string, unknown>)?.bx_stats ?? {}) as Record<string, unknown>;
    const signals14d = bxStats?.signal_count_14d ?? '?';
    const silentDetected = bxStats?.silence_detected;
    const lastDate = e.last_interaction?.toString().slice(0,10) ?? 'none';
    console.log(`  ${e.name} (${e.primary_email ?? 'no email'}) - ${e.total_interactions} interactions, last: ${lastDate} | 14d_signals=${signals14d} | silence=${silentDetected}`);
  }

  // Check for discrepancy candidates in DB for this user
  const { data: discEntities } = await supabase
    .from('tkg_entities')
    .select('id, name, primary_email, total_interactions, last_interaction')
    .eq('user_id', 'e40b7cd8-4925-42f7-bc99-5022969f1d22')
    .gte('total_interactions', 5)
    .order('last_interaction', { ascending: true })
    .limit(10);

  console.log('\n=== ENTITIES WITH >=5 INTERACTIONS (sorted by OLDEST last interaction) ===');
  const now = Date.now();
  for (const e of discEntities ?? []) {
    const lastMs = e.last_interaction ? new Date(e.last_interaction).getTime() : 0;
    const daysSilent = Math.floor((now - lastMs) / 86400000);
    console.log(`  ${e.name} (${e.primary_email ?? 'no email'}) - ${e.total_interactions} interactions, last: ${e.last_interaction?.toString().slice(0,10)} | ${daysSilent}d ago`);
  }

  // Check last 5 pipeline_runs for winner trends
  const { data: runs } = await supabase
    .from('pipeline_runs')
    .select('created_at, winner_action_type, raw_extras')
    .order('created_at', { ascending: false })
    .limit(5);
  console.log('\n=== LAST 5 PIPELINE RUNS ===');
  for (const r of runs ?? []) {
    const ex = (r.raw_extras as Record<string,unknown>) ?? {};
    console.log(`  ${r.created_at?.toString().slice(0,19)} | winner=${r.winner_action_type} | candidate=${ex.winner_candidate_id}`);
  }
}

main().catch(console.error);
