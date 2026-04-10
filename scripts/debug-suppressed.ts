import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const userId = 'e40b7cd8-4925-42f7-bc99-5022969f1d22';

  // Check recently suppressed/used candidates (last 7 days)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  
  const { data: actions } = await supabase
    .from('tkg_actions')
    .select('id, action_type, confidence, status, created_at, meta')
    .eq('user_id', userId)
    .gte('created_at', sevenDaysAgo)
    .order('created_at', { ascending: false })
    .limit(20);

  console.log('=== Recent tkg_actions (7d) ===');
  actions?.forEach(a => {
    const candidateId = (a.meta as Record<string, unknown>)?.candidate_id;
    console.log(`${a.created_at?.slice(0,16)} | ${a.action_type} | status=${a.status} | conf=${a.confidence} | candidate=${candidateId}`);
  });

  // Check specifically for the decay candidate suppression
  // getSuppressedCandidateKeys looks for recent tkg_actions with certain candidate IDs
  const { data: decayActions } = await supabase
    .from('tkg_actions')
    .select('id, action_type, confidence, status, created_at, meta')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(5);

  console.log('\n=== Latest 5 tkg_actions (all time) ===');
  decayActions?.forEach(a => {
    const meta = a.meta as Record<string, unknown>;
    console.log(`${a.created_at?.slice(0,16)} | ${a.action_type} | status=${a.status} | meta.candidate_id=${meta?.candidate_id}`);
  });
  
  // Look at tkg_actions for how decay suppression works
  // The scorer's getSuppressedCandidateKeys extracts entity keys from candidate IDs
  // discrepancy_decay_aa7733d9 -> entityKey = aa7733d9
  // If there's an action with candidate_id containing aa7733d9, it's suppressed
  
  // Check for any keri-related action
  const keriEntityId = 'aa7733d9-a098-47a0-9acf-57977320ecc8';
  const { data: keriActions } = await supabase
    .from('tkg_actions')
    .select('*')
    .eq('user_id', userId)
    .contains('meta', { candidate_id: `discrepancy_decay_${keriEntityId}` });

  console.log('\n=== Keri decay actions ===');
  console.log(JSON.stringify(keriActions, null, 2));
  
  // Also check if the entity is in tkg_goals suppression
  const { data: doNothingActions } = await supabase
    .from('tkg_actions')
    .select('id, created_at, action_type, status, meta')
    .eq('user_id', userId)
    .eq('action_type', 'do_nothing')
    .order('created_at', { ascending: false })
    .limit(5);

  console.log('\n=== Recent do_nothing actions ===');
  doNothingActions?.forEach(a => {
    console.log(`${a.created_at?.slice(0,16)} | ${JSON.stringify((a.meta as Record<string, unknown>)?.candidate_id)}`);
  });
}

main().catch(console.error);
