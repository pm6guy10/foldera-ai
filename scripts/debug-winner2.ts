import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const OWNER = process.env.INGEST_USER_ID!;

async function main() {
  console.log('OWNER env var:', OWNER);
  console.log('SUPABASE URL:', process.env.NEXT_PUBLIC_SUPABASE_URL?.slice(0, 40));

  // Who has actions at all?
  const { data: anyActions } = await sb.from('tkg_actions')
    .select('user_id,action_type,created_at')
    .order('created_at', { ascending: false })
    .limit(5);
  console.log('\n=== ANY ACTIONS (all users) ===', anyActions);

  // Who has signals?
  const { data: sigUsers } = await sb.rpc('exec_sql' as any, {
    sql: `SELECT user_id, COUNT(*) as cnt FROM tkg_signals GROUP BY user_id ORDER BY cnt DESC LIMIT 5`
  });
  console.log('\n=== SIGNAL USER COUNTS ===', sigUsers);

  // Who has entities?
  const { data: entUsers } = await sb.rpc('exec_sql' as any, {
    sql: `SELECT user_id, COUNT(*) as cnt FROM tkg_entities GROUP BY user_id ORDER BY cnt DESC LIMIT 5`
  });
  console.log('\n=== ENTITY USER COUNTS ===', entUsers);

  // Latest actions, no filter
  const { data: latestActions } = await sb.from('tkg_actions')
    .select('id,user_id,action_type,confidence,created_at,generation_log')
    .order('created_at', { ascending: false })
    .limit(3);
  console.log('\n=== LATEST ACTIONS (ALL USERS) ===');
  for (const a of latestActions ?? []) {
    console.log({
      id: a.id,
      user_id: a.user_id,
      action_type: a.action_type,
      confidence: a.confidence,
      created_at: a.created_at,
      winner_entity: a.generation_log?.winner_entity,
      scorer_ev: a.generation_log?.scorer_ev,
      stage: a.generation_log?.stage,
      rejection_reason: a.generation_log?.rejection_reason,
    });
  }

  // Confirm OWNER actually has signals
  const { count: ownerSigs } = await sb.from('tkg_signals')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', OWNER);
  console.log('\n=== OWNER SIGNAL COUNT ===', ownerSigs);

  // Commitments without user filter
  const { data: anyCommit } = await sb.from('tkg_commitments')
    .select('id,user_id,title,status,suppressed_at')
    .is('suppressed_at', null)
    .order('created_at', { ascending: false })
    .limit(5);
  console.log('\n=== ANY COMMITMENTS ===', anyCommit?.map(c => ({ ...c, title: c.title?.slice(0, 60) })));
}

main().catch(console.error);
