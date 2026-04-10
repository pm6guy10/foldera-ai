import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await supabase
    .from('pipeline_runs')
    .select('created_at, outcome, winner_action_type, winner_confidence, blocked_gate, raw_extras')
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) { console.error(error); return; }
  if (!data || !data[0]) { console.log('no runs'); return; }

  const run = data[0];
  console.log('=== Latest pipeline run ===');
  console.log('time:', run.created_at);
  console.log('outcome:', run.outcome);
  console.log('winner_action:', run.winner_action_type, 'conf:', run.winner_confidence);

  const e = run.raw_extras as Record<string, unknown>;
  if (!e) { console.log('no extras'); return; }

  console.log('winner_candidate_id:', e.winner_candidate_id);
  console.log('winner_scorer_ev:', e.winner_scorer_ev);
  console.log('\n=== Candidate scores (all survivors) ===');
  const scores = e.candidate_scores as Array<{ id: string; ev: number; action_type: string }> | undefined;
  if (scores) {
    scores.sort((a, b) => (b.ev || 0) - (a.ev || 0));
    scores.slice(0, 10).forEach(s => console.log(`  ${s.id?.slice(0, 60)} | EV: ${s.ev} | ${s.action_type}`));
  } else {
    console.log('  (no candidate_scores in extras)');
  }

  console.log('\n=== Block log (blocked candidates) ===');
  const blockLog = e.candidate_block_log as Array<{ title: string; reasons: string[] }> | undefined;
  if (blockLog) {
    blockLog.slice(0, 10).forEach(b => console.log(`  [${b.title}] => ${b.reasons?.join('; ')}`));
  } else {
    console.log('  (no candidate_block_log in extras)');
  }

  console.log('\n=== Gate funnel ===');
  console.log(JSON.stringify(run.blocked_gate, null, 2));
}

main().catch(console.error);
