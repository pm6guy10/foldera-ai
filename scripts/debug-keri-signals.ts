import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const userId = 'e40b7cd8-4925-42f7-bc99-5022969f1d22';
  const keriId = 'aa7733d9-a098-47a0-9acf-57977320ecc8';
  const keriId2 = 'c7740f58-e9fd-491e-896e-1ec9d6e31d6f'; // "Nopens, Keri L (DSHS/HCLA/WCF)"

  // Check all signals for all keri entity IDs
  for (const eid of [keriId, keriId2]) {
    const { data: signals, error } = await supabase
      .from('tkg_signals')
      .select('id, type, source, occurred_at, processed, entity_id')
      .eq('user_id', userId)
      .eq('entity_id', eid)
      .order('occurred_at', { ascending: false })
      .limit(5);
    
    if (error) console.log(`Entity ${eid} error:`, error.message);
    else console.log(`Entity ${eid} (${signals?.length ?? 0} signals):`, JSON.stringify(signals?.map(s => ({ type: s.type, occurred: s.occurred_at, processed: s.processed })), null, 2));
  }

  // Count unprocessed signals for user
  const { count } = await supabase
    .from('tkg_signals')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('processed', false);
  console.log('\nUnprocessed signals for user:', count);

  // Check discrepancy detector: what passes entity_reality_gate?
  // The detector checks: has_email, is_proper_name, not_calendar
  // keri nopens aa7733d9 has primary_email = keri.nopens@dshs.wa.gov → should pass
  
  // Look at the discrepancy_decay candidates from recent runs
  const { data: runs } = await supabase
    .from('pipeline_runs')
    .select('created_at, outcome, winner_action_type, blocked_gate, raw_extras')
    .order('created_at', { ascending: false })
    .limit(20);
  
  console.log('\n=== Decay candidates in pipeline runs ===');
  runs?.forEach(r => {
    const e = r.raw_extras as Record<string, unknown>;
    const winnerId = e?.winner_candidate_id as string | undefined;
    if (winnerId?.includes('decay') || winnerId?.includes('aa7733') || r.blocked_gate?.toString().includes('decay')) {
      console.log(`${r.created_at.slice(0, 16)}: outcome=${r.outcome} winner=${winnerId} blocked=${r.blocked_gate?.toString().slice(0, 120)}`);
    }
  });

  // Check what gate funnel looks like in latest run
  const latestRun = runs?.[0];
  if (latestRun?.raw_extras) {
    const e = latestRun.raw_extras as Record<string, unknown>;
    console.log('\nLatest run gate funnel:', JSON.stringify(e.gate_funnel, null, 2));
    console.log('Latest run top candidates:', JSON.stringify((e.candidateDiscovery as Record<string, unknown>)?.topCandidates, null, 2));
  }
}

main().catch(console.error);
