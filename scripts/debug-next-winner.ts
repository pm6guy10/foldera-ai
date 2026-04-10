/**
 * After removing self-entity from engagement_collapse,
 * what is the next candidate? 
 * Analyze what the 9 survivors would be without the self-winner.
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const OWNER = process.env.INGEST_USER_ID!;

async function main() {
  // Get the full latest pipeline run gate_funnel with candidates detail
  const { data: runs } = await sb.from('pipeline_runs')
    .select('*')
    .eq('user_id', OWNER)
    .order('created_at', { ascending: false })
    .limit(1);
  
  const run = runs?.[0];
  console.log('Latest run raw_extras:', JSON.stringify(run?.raw_extras, null, 2));
  console.log('Gate funnel full:', JSON.stringify(run?.gate_funnel, null, 2));

  // The run shows winner_candidate_id and winner_decision_reason.
  // The decision says "stakes tie-break (5.00 vs 4.50)"
  // The runner-up was stakes=4.50. That's the next winner.
  
  // What discrepancy could score 4.5?
  // Looking at commitment data for real external entities:
  // MAS3 job offer commitment: due_at = '2026-04-01' (10 days past due!)
  const { data: overdueComms } = await sb.from('tkg_commitments')
    .select('id,description,status,due_at,implied_due_at,risk_score,promisor_id,promisee_id,source_id,source,category')
    .eq('user_id', OWNER)
    .is('suppressed_at', null)
    .not('due_at', 'is', null)
    .order('due_at', { ascending: true })
    .limit(20);
  
  console.log('\n=== COMMITMENTS WITH DUE DATES ===');
  for (const c of overdueComms ?? []) {
    const due = new Date(c.due_at);
    const isOverdue = due < new Date();
    console.log({
      desc: c.description?.slice(0, 80),
      status: c.status,
      due_at: c.due_at,
      overdue: isOverdue,
      risk: c.risk_score,
      promisor: c.promisor_id,
      promisee: c.promisee_id,
      category: c.category,
    });
  }

  // Stakes calculation for exposure discrepancy:
  // exposure = commitment due within 7 days
  // But MAS3 was due April 1 - that's 9 days ago. exposure looks at due within 7d.
  // Let's check deadline_staleness (≤3 days, no update in 3+days).
  
  // What real signals exist for MAS3 / Yadira in last 14 days?
  const { data: recentSigs } = await sb.from('tkg_signals')
    .select('id,source,type,occurred_at,author,extracted_entities,extracted_commitments')
    .eq('user_id', OWNER)
    .gte('occurred_at', new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString())
    .in('source', ['outlook', 'gmail'])
    .eq('processed', true)
    .order('occurred_at', { ascending: false })
    .limit(30);
  
  console.log('\n=== EMAIL SIGNALS LAST 30D ===');
  for (const s of recentSigs ?? []) {
    const entities = s.extracted_entities as any[];
    const author = s.author as any;
    console.log({
      source: s.source,
      occurred_at: s.occurred_at,
      from: typeof author === 'string' ? author : (author?.email ?? author?.name),
      entity_count: entities?.length ?? 0,
      entity_names: entities?.map(e => e.name ?? e.entity_name)?.slice(0, 3),
    });
  }

  // The runner-up with stakes=4.5 - what type is it?
  // Looking at the gate_funnel candidate_pool:
  // signal: 163, commitment: 35, relationship: 8, relationship_skipped_no_thread: 22
  // 9 survived all gates. 4 were evaluated.
  // The winner was discrepancy at 5.0. Runner at 4.5.
  
  // Find the MAS3 specific entity
  const { data: hcaEnt } = await sb.from('tkg_entities')
    .select('id,name,primary_email,total_interactions,last_interaction,patterns')
    .eq('user_id', OWNER)
    .or('name.ilike.%HCA%,name.ilike.%Medical Assistance%,name.ilike.%MAS%')
    .limit(5);
  console.log('\nHCA/MAS entities:', hcaEnt?.map(e => ({ id: e.id, name: e.name, total: e.total_interactions, last: e.last_interaction })));

  // Check the HRSN commitment - it has a 2001 date! That's clearly garbage.
  const { data: hrsnGarbage } = await sb.from('tkg_commitments')
    .select('id,description,due_at,source_id')
    .eq('user_id', OWNER)
    .eq('description', 'Submit HRSN Business Analyst MA5 application')
    .single();
  console.log('\nHRSN garbage date commitment:', hrsnGarbage);
}

main().catch(console.error);
