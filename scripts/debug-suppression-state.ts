import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const OWNER = 'e40b7cd8-4925-42f7-bc99-5022969f1d22';

async function main() {
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();

  // All tkg_actions in last 7 days
  const { data: actions } = await sb
    .from('tkg_actions')
    .select('id,created_at,generated_at,status,action_type,meta,execution_result')
    .eq('user_id', OWNER)
    .gte('generated_at', sevenDaysAgo)
    .order('generated_at', { ascending: false })
    .limit(30);

  console.log('=== ALL tkg_actions last 7d ===');
  console.log('count:', actions?.length ?? 0);
  for (const a of actions ?? []) {
    const m = a.meta as Record<string, unknown> | null;
    const er = a.execution_result as Record<string, unknown> | null;
    const genLog = (er?.generation_log as Record<string, unknown>) ?? {};
    const lsk = er?.loop_suppression_keys;
    const lsuntil = er?.loop_suppression_until;
    const oc = er?.original_candidate as Record<string, unknown> | undefined;
    console.log(`  ${a.generated_at?.slice(0,16)} | ${a.action_type} | status=${a.status} | candidate=${m?.candidate_id} | genlog.outcome=${genLog.outcome} | lsk=${JSON.stringify(lsk)} | lsuntil=${lsuntil} | blocked_by=${oc?.blocked_by}`);
  }
  
  // Check if hunt_unreplied winner entity is real
  const winnerEntityId = '08b906c3-3e54-4981-b541-1ad868bfd43e';
  const { data: entity } = await sb
    .from('tkg_entities')
    .select('id,name,primary_email,total_interactions,last_interaction')
    .eq('id', winnerEntityId)
    .single();
  console.log('\n=== HUNT_UNREPLIED WINNER ENTITY (08b906c3) ===');
  console.log(JSON.stringify(entity, null, 2));

  // Check runner-up
  const runnerUpEntityId = '5b851583-cc47-4c89-9ca5-9accd2d36b29';
  const { data: entity2 } = await sb
    .from('tkg_entities')
    .select('id,name,primary_email,total_interactions,last_interaction')
    .eq('id', runnerUpEntityId)
    .single();
  console.log('\n=== RUNNER-UP ENTITY (5b851583) ===');
  console.log(JSON.stringify(entity2, null, 2));
}

main().catch(console.error);
