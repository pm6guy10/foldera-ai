import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const OWNER = process.env.INGEST_USER_ID!;

async function main() {
  // Check tkg_actions with explicit error
  const { data: actions, error: actErr } = await sb.from('tkg_actions')
    .select('id,user_id,action_type,confidence,created_at')
    .order('created_at', { ascending: false })
    .limit(5);
  console.log('tkg_actions error:', actErr);
  console.log('tkg_actions data:', actions);

  // Check tkg_commitments with error
  const { data: comms, error: commErr } = await sb.from('tkg_commitments')
    .select('id,user_id,title,status,suppressed_at,created_at')
    .order('created_at', { ascending: false })
    .limit(5);
  console.log('\ntkg_commitments error:', commErr);
  console.log('tkg_commitments data:', comms?.map(c => ({ ...c, title: c.title?.slice(0, 60) })));

  // Check tkg_entities
  const { data: ents, error: entErr } = await sb.from('tkg_entities')
    .select('id,user_id,name,entity_type,interaction_count,last_interaction')
    .order('interaction_count', { ascending: false })
    .limit(10);
  console.log('\ntkg_entities error:', entErr);
  console.log('tkg_entities data:', ents?.map(e => ({ name: e.name, type: e.entity_type, interactions: e.interaction_count })));

  // Try signals with content sample
  const { data: sigs, error: sigErr } = await sb.from('tkg_signals')
    .select('id,source,occurred_at,processed,content_preview')
    .eq('user_id', OWNER)
    .eq('processed', true)
    .order('occurred_at', { ascending: false })
    .limit(5);
  console.log('\ntkg_signals (recent processed) error:', sigErr);
  console.log('tkg_signals data:', sigs);

  // Recent unprocessed
  const { data: unproc } = await sb.from('tkg_signals')
    .select('id,source,occurred_at,processed')
    .eq('user_id', OWNER)
    .eq('processed', false)
    .order('occurred_at', { ascending: false })
    .limit(3);
  console.log('\nRecent unprocessed signals:', unproc);

  // Generation log from last action
  const { data: genLog } = await sb.from('tkg_generation_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(3);
  console.log('\ntkg_generation_log:', genLog);
}

main().catch(console.error);
