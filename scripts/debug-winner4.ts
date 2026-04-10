import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const OWNER = process.env.INGEST_USER_ID!;
const WINNER_ENTITY_ID = '115183eb-3f49-438c-b1cd-f5b67eb15f1f';

async function main() {
  // Get the winner entity
  const { data: winnerEntity } = await sb.from('tkg_entities')
    .select('id,name,display_name,type,company,role,primary_email,relationship_strength,last_interaction,total_interactions,patterns')
    .eq('id', WINNER_ENTITY_ID)
    .single();
  console.log('\n=== WINNER ENTITY ===');
  console.log(JSON.stringify(winnerEntity, null, 2));

  // Get recent pipeline runs with full gate_funnel
  const { data: runs } = await sb.from('pipeline_runs')
    .select('id,created_at,outcome,winner_action_type,winner_confidence,gate_funnel,raw_extras')
    .eq('user_id', OWNER)
    .order('created_at', { ascending: false })
    .limit(1);
  
  const run = runs?.[0];
  if (run) {
    console.log('\n=== LATEST PIPELINE RUN (full) ===');
    console.log('outcome:', run.outcome);
    console.log('winner_action_type:', run.winner_action_type);
    console.log('winner_confidence:', run.winner_confidence);
    console.log('gate_funnel:', JSON.stringify(run.gate_funnel, null, 2));
    console.log('raw_extras:', JSON.stringify(run.raw_extras, null, 2));
  }

  // Get commitments for winner entity
  const { data: comms } = await sb.from('tkg_commitments')
    .select('id,user_id,description,canonical_form,status,due_at,implied_due_at,risk_score,suppressed_at,source,source_id,created_at')
    .or(`promisor_id.eq.${WINNER_ENTITY_ID},promisee_id.eq.${WINNER_ENTITY_ID}`)
    .is('suppressed_at', null)
    .order('created_at', { ascending: false })
    .limit(10);
  console.log('\n=== COMMITMENTS FOR WINNER ENTITY ===');
  for (const c of comms ?? []) {
    console.log({
      id: c.id,
      desc: c.description?.slice(0, 100),
      status: c.status,
      due_at: c.due_at,
      risk: c.risk_score,
      source: c.source,
      source_id: c.source_id,
    });
  }

  // Get recent signals involving winner entity
  const { data: entitySigs } = await sb.from('tkg_signals')
    .select('id,source,type,occurred_at,extracted_entities,content')
    .eq('user_id', OWNER)
    .contains('extracted_entities', [{ entity_id: WINNER_ENTITY_ID }])
    .order('occurred_at', { ascending: false })
    .limit(5);
  console.log('\n=== SIGNALS WITH WINNER ENTITY ===');
  for (const s of entitySigs ?? []) {
    console.log({
      id: s.id,
      source: s.source,
      type: s.type,
      occurred_at: s.occurred_at,
      content_preview: (s.content as any)?.subject ?? (typeof s.content === 'string' ? s.content.slice(0, 100) : 'n/a'),
    });
  }

  // Check the actual tkg_actions table columns and data
  const { data: actions } = await sb.from('tkg_actions')
    .select('id,user_id,action_type,confidence,generated_at,status,action_source')
    .order('generated_at', { ascending: false })
    .limit(5);
  console.log('\n=== TKG ACTIONS ===', actions);

  // All pipeline_runs count and outcome distribution
  const { data: outcomes } = await sb.from('pipeline_runs')
    .select('outcome,winner_action_type,created_at')
    .eq('user_id', OWNER)
    .order('created_at', { ascending: false })
    .limit(20);
  console.log('\n=== LAST 20 PIPELINE RUN OUTCOMES ===');
  for (const o of outcomes ?? []) {
    console.log(`${o.created_at?.slice(0,16)} | ${o.outcome} | winner: ${o.winner_action_type}`);
  }
}

main().catch(console.error);
