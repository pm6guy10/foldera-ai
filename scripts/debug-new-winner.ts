import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const OWNER = process.env.INGEST_USER_ID!;
const NEW_WINNER_ENTITY_ID = '2d576b3c-db81-4e7c-9622-c3478a8a5c2c';

async function main() {
  // Get the new winner entity
  const { data: entity } = await sb.from('tkg_entities')
    .select('id,name,display_name,type,company,role,primary_email,relationship_strength,last_interaction,total_interactions,patterns')
    .eq('id', NEW_WINNER_ENTITY_ID)
    .single();
  
  console.log('=== NEW WINNER ENTITY ===');
  console.log(JSON.stringify(entity, null, 2));

  // Get commitments for this entity
  const { data: comms } = await sb.from('tkg_commitments')
    .select('id,description,status,due_at,implied_due_at,risk_score,category,source,created_at')
    .eq('user_id', OWNER)
    .is('suppressed_at', null)
    .or(`promisor_id.eq.${NEW_WINNER_ENTITY_ID},promisee_id.eq.${NEW_WINNER_ENTITY_ID}`)
    .limit(10);
  console.log('\n=== COMMITMENTS FOR NEW WINNER ===');
  for (const c of comms ?? []) {
    console.log({ desc: c.description?.slice(0, 100), status: c.status, due_at: c.due_at, risk: c.risk_score, category: c.category });
  }

  // Get signals involving this entity
  const { data: sigs } = await sb.from('tkg_signals')
    .select('id,source,type,occurred_at,author,content')
    .eq('user_id', OWNER)
    .contains('extracted_entities', JSON.stringify([{ entity_id: NEW_WINNER_ENTITY_ID }]))
    .order('occurred_at', { ascending: false })
    .limit(5);
  console.log('\n=== SIGNALS FOR NEW WINNER ===');
  for (const s of sigs ?? []) {
    const content = s.content as any;
    console.log({
      source: s.source,
      occurred_at: s.occurred_at,
      subject: content?.subject,
    });
  }

  // Check recent pipeline run with full candidate list
  const { data: runs } = await sb.from('pipeline_runs')
    .select('*')
    .eq('user_id', OWNER)
    .eq('winner_confidence', 74)
    .order('created_at', { ascending: false })
    .limit(1);
  
  const run = runs?.[0];
  if (run?.gate_funnel) {
    console.log('\n=== GATE FUNNEL FOR LATEST WINNER RUN ===');
    console.log('winner candidate id:', run.raw_extras?.winner_candidate_id);
    console.log('winner decision reason:', run.raw_extras?.winner_decision_reason);
    console.log('stakes_killed:', run.gate_funnel?.stakes_killed);
    console.log('survivors_count:', run.gate_funnel?.survivors_count);
  }
  
  // Also look at whether there's an "in progress" run (outcome: null)
  const { data: inProgress } = await sb.from('pipeline_runs')
    .select('id,created_at,outcome,winner_action_type,winner_confidence,raw_extras')
    .eq('user_id', OWNER)
    .is('outcome', null)
    .order('created_at', { ascending: false })
    .limit(1);
  
  if (inProgress?.length) {
    console.log('\n=== IN-PROGRESS RUN (latest from nightly trigger) ===');
    console.log(inProgress[0]);
  }
  
  // Once nightly completes, check:
  await new Promise(r => setTimeout(r, 30000));
  const { data: inProgress2 } = await sb.from('pipeline_runs')
    .select('id,created_at,outcome,winner_action_type,winner_confidence,raw_extras')
    .eq('user_id', OWNER)
    .order('created_at', { ascending: false })
    .limit(2);
  console.log('\n=== LATEST RUNS AFTER 30s WAIT ===');
  for (const r of inProgress2 ?? []) {
    console.log({ created_at: r.created_at, outcome: r.outcome, winner: r.winner_action_type, candidate: r.raw_extras?.winner_candidate_id, confidence: r.winner_confidence });
  }
}

main().catch(console.error);
